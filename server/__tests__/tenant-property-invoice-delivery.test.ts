import "./support/test-env";
import { storage } from "../storage";
import * as cron from "../property-cron";
import * as billing from "../billing-card";
import * as email from "../email-service";
import * as whatsapp from "../whatsapp-service";
import * as sms from "../sms-service";
const id = "44444444-4444-4444-8444-444444444444";
const parentId = "22222222-2222-4222-8222-222222222222";
const invoice = { id, merchantId: 11, tenantProfileId: parentId, status: "pending_dispatch", deliveryChannel: "email", amountCents: 5000, token: "synthetic-token", dueAt: new Date("2026-10-10T00:00:00Z") };
const tenant = { id: parentId, merchantId: 11, firstName: "Synthetic", lastName: "Tenant", propertyAddress: "Test address", email: "owned@example.test", phone: "+64210000000" };
let snapshot: jest.Mock; let record: jest.Mock;
const resend = () => (cron as any).resendInvoiceEmailForMerchant(id, 11, "https://pay.example.test");
beforeEach(() => {
  snapshot = jest.fn().mockResolvedValue({ invoice: { ...invoice }, tenant: { ...tenant } });
  record = jest.fn().mockResolvedValue({ kind: "ok", invoice: { ...invoice, status: "dispatched" } });
  for (const [name, mock] of [["getInvoiceRentRequestDeliveryForMerchant", snapshot], ["recordInvoiceRentRequestDeliveryForMerchant", record]] as const) {
    if (typeof (storage as any)[name] === "function") jest.spyOn(storage as any, name).mockImplementation(mock);
  }
  jest.spyOn(storage, "getMerchant").mockResolvedValue({ id: 11, name: "Synthetic business" } as any);
  jest.spyOn(storage, "getSubscription").mockResolvedValue({} as any);
  jest.spyOn(billing, "billingCardIsReady").mockReturnValue(true);
  jest.spyOn(email, "sendEmail").mockResolvedValue(true);
  jest.spyOn(whatsapp, "isWhatsAppConfigured").mockReturnValue(false);
  jest.spyOn(whatsapp, "sendWhatsApp").mockResolvedValue({ ok: true, messageId: "synthetic-message" } as any);
  jest.spyOn(sms, "isSmsConfigured").mockReturnValue(false);
  jest.spyOn(sms, "sendSms").mockResolvedValue({ ok: true, messageId: "synthetic-message" } as any);
  for (const name of ["getInvoiceRentRequest", "getTenantProfile", "updateInvoiceRentRequest", "logTransactionEvent"] as const) {
    jest.spyOn(storage, name).mockImplementation(async () => { throw new Error("Global management escape hatch"); });
  }
});
afterEach(() => jest.restoreAllMocks());
const noDelivery = () => {
  expect(email.sendEmail).not.toHaveBeenCalled(); expect(whatsapp.sendWhatsApp).not.toHaveBeenCalled();
  expect(sms.sendSms).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
};
test("missing or foreign invoice snapshot refuses without any message or delivery record", async () => {
  snapshot.mockResolvedValue(undefined);
  expect(await resend()).toEqual({ ok: false, reason: "not_found" }); noDelivery();
});
test.each(["paid", "paid_external", "voided"])("%s invoice refuses before delivery", async status => {
  snapshot.mockResolvedValue({ invoice: { ...invoice, status }, tenant });
  expect(await resend()).toEqual({ ok: false, reason: "not_payable" }); noDelivery();
});
test("billing refusal makes no snapshot, message or delivery record", async () => {
  (billing.billingCardIsReady as jest.Mock).mockReturnValue(false);
  expect(await resend()).toEqual({ ok: false, reason: "billing_card_required" });
  expect(snapshot).not.toHaveBeenCalled(); noDelivery();
});
test("email uses a current scoped snapshot and the captured owned contact, then records with original parent scope", async () => {
  (storage.getMerchant as jest.Mock).mockImplementation(async () => {
    expect(snapshot).not.toHaveBeenCalled(); return { id: 11, name: "Synthetic business" };
  });
  expect(await resend()).toMatchObject({ ok: true, invoice: { id, status: "dispatched" } });
  expect(snapshot).toHaveBeenCalledWith(id, 11);
  expect(email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: tenant.email, text: expect.stringContaining("/r/synthetic-token") }));
  expect(record).toHaveBeenCalledWith(id, 11, parentId, { channel: "email", messageId: undefined });
  for (const name of ["getInvoiceRentRequest", "getTenantProfile", "updateInvoiceRentRequest", "logTransactionEvent"] as const) expect(storage[name]).not.toHaveBeenCalled();
});
test.each(["whatsapp", "sms"])("%s uses captured contact and records its channel/message metadata", async channel => {
  snapshot.mockResolvedValue({ invoice: { ...invoice, deliveryChannel: channel }, tenant });
  (whatsapp.isWhatsAppConfigured as jest.Mock).mockReturnValue(true); (sms.isSmsConfigured as jest.Mock).mockReturnValue(true);
  expect((await resend()).ok).toBe(true);
  const send = channel === "whatsapp" ? whatsapp.sendWhatsApp : sms.sendSms;
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ toPhone: tenant.phone }));
  expect(email.sendEmail).not.toHaveBeenCalled();
  expect(record).toHaveBeenCalledWith(id, 11, parentId, { channel, messageId: "synthetic-message" });
});
test("known delivery failure does not write success history", async () => {
  (email.sendEmail as jest.Mock).mockResolvedValue(false);
  expect(await resend()).toEqual({ ok: false, reason: "send_failed" }); expect(record).not.toHaveBeenCalled();
});
test("a provider exception reports uncertainty without another send or a successful record", async () => {
  (email.sendEmail as jest.Mock).mockRejectedValue(new Error("Synthetic provider uncertainty"));
  expect(await resend()).toEqual({ ok: false, reason: "reconciliation_required" });
  expect(email.sendEmail).toHaveBeenCalledTimes(1); expect(record).not.toHaveBeenCalled();
});
test.each([{ kind: "not-found" }, { kind: "conflict", reason: "paid" }])("post-send refusal %j cannot return success or invoice data", async result => {
  record.mockResolvedValue(result);
  expect(await resend()).toEqual({ ok: false, reason: "reconciliation_required" });
  expect(email.sendEmail).toHaveBeenCalledTimes(1); expect(record).toHaveBeenCalledTimes(1);
});
test("post-send history failure reports uncertainty without an invoice DTO", async () => {
  record.mockRejectedValue(new Error("Synthetic history failure"));
  expect(await resend()).toEqual({ ok: false, reason: "reconciliation_required" });
  expect(email.sendEmail).toHaveBeenCalledTimes(1);
});
