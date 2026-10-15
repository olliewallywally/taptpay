import "./support/test-env";
import { storage } from "../storage";
import * as delivery from "../trades-delivery";
import * as email from "../email-service";
const id = "44444444-4444-4444-8444-444444444444";
const parentId = "22222222-2222-4222-8222-222222222222";
const invoice = { id, merchantId: 11, clientProfileId: parentId, kind: "full", status: "paid_external", amountCents: 11500, jobDetails: "Synthetic job",
  token: "synthetic-token", dueAt: new Date("2026-10-10T00:00:00Z"), paidAt: new Date("2026-10-03T00:00:00Z") };
const client = { id: parentId, merchantId: 11, firstName: "Synthetic", lastName: "Client", siteAddress: "Test address", email: "owned@example.test", phone: null };
const merchant = { id: 11, name: "Synthetic business", businessName: "Synthetic Trades", gstRegistered: true, gstNumber: "000-000-000" };
const GLOBAL = ["getJobInvoice", "getClientProfile", "updateJobInvoice", "createJobEvent"] as const;
let snapshot: jest.Mock; let record: jest.Mock;
const receipt = () => (delivery as any).sendTradePaymentInvoiceForMerchant(id, 11);
beforeEach(() => {
  snapshot = jest.fn().mockResolvedValue({ invoice: { ...invoice }, client: { ...client } });
  record = jest.fn().mockResolvedValue(true);
  for (const [name, mock] of [["getJobInvoiceDeliveryForMerchant", snapshot], ["recordJobInvoiceReceiptForMerchant", record]] as const) {
    if (typeof (storage as any)[name] === "function") jest.spyOn(storage as any, name).mockImplementation(mock);
  }
  jest.spyOn(storage, "getMerchant").mockResolvedValue({ ...merchant } as any);
  jest.spyOn(email, "sendEmail").mockResolvedValue(true);
  for (const name of GLOBAL) jest.spyOn(storage, name).mockImplementation(async () => { throw new Error("Global management escape hatch"); });
});
afterEach(() => jest.restoreAllMocks());

test("a missing or foreign invoice snapshot sends no receipt and logs nothing", async () => {
  snapshot.mockResolvedValue(undefined);
  expect(await receipt()).toBe(0);
  expect(email.sendEmail).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
});
test("a client with no email gets no receipt and nothing is logged, as before", async () => {
  snapshot.mockResolvedValue({ invoice, client: { ...client, email: null } });
  expect(await receipt()).toBe(0);
  expect(email.sendEmail).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
});
test("a missing business sends nothing", async () => {
  (storage.getMerchant as jest.Mock).mockResolvedValue(undefined);
  expect(await receipt()).toBe(0);
  expect(email.sendEmail).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
});
test("the receipt goes to the captured owned contact and is logged with the captured client, with no global read or write", async () => {
  (storage.getMerchant as jest.Mock).mockImplementation(async () => { expect(snapshot).not.toHaveBeenCalled(); return { ...merchant }; });
  expect(await receipt()).toBe(1);
  expect(snapshot).toHaveBeenCalledWith(id, 11); expect(storage.getMerchant).toHaveBeenCalledWith(11);
  expect(email.sendEmail).toHaveBeenCalledTimes(1);
  expect(email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: client.email, subject: expect.stringContaining("JOB-44444444"), text: expect.stringContaining("Test address") }));
  expect(record).toHaveBeenCalledWith(id, 11, parentId, { sent: true, reference: "JOB-44444444" });
  for (const name of GLOBAL) expect(storage[name]).not.toHaveBeenCalled();
});
test("a failed send is logged as failed", async () => {
  (email.sendEmail as jest.Mock).mockResolvedValue(false);
  expect(await receipt()).toBe(0);
  expect(record).toHaveBeenCalledWith(id, 11, parentId, { sent: false, reference: "JOB-44444444" });
});
test("a receipt whose history is refused after the send is not logged through a global key", async () => {
  record.mockResolvedValue(false);
  expect(await receipt()).toBe(1);
  expect(email.sendEmail).toHaveBeenCalledTimes(1);
  for (const name of GLOBAL) expect(storage[name]).not.toHaveBeenCalled();
});
test("the scoped receipt is the same email the payment lane sends for the same invoice, client and business", async () => {
  await receipt();
  const scoped = (email.sendEmail as jest.Mock).mock.calls[0][0];
  (email.sendEmail as jest.Mock).mockClear();
  (storage.getClientProfile as jest.Mock).mockResolvedValue({ ...client });
  (storage.createJobEvent as jest.Mock).mockResolvedValue({});
  expect(await delivery.sendTradePaymentInvoice({ ...invoice })).toBe(1);
  expect((email.sendEmail as jest.Mock).mock.calls[0][0]).toEqual(scoped);
  expect(storage.createJobEvent).toHaveBeenCalledWith({ merchantId: 11, clientProfileId: parentId, jobInvoiceId: id, eventType: "invoice_email_sent", payload: { reference: "JOB-44444444" } });
});
