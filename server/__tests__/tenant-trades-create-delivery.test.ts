import "./support/test-env";
import { storage } from "../storage";
import * as delivery from "../trades-delivery";
import * as billing from "../billing-card";
import * as email from "../email-service";
import * as whatsapp from "../whatsapp-service";
import * as sms from "../sms-service";
const quoteId = "33333333-3333-4333-8333-333333333333";
const invoiceId = "44444444-4444-4444-8444-444444444444";
const parentId = "22222222-2222-4222-8222-222222222222";
const BASE = "https://pay.example.test";
const client = { id: parentId, merchantId: 11, firstName: "Synthetic", lastName: "Client", siteAddress: "Test address", email: "owned@example.test", phone: "+64210000000", preferredChannel: "email" };
const quote = { id: quoteId, merchantId: 11, clientProfileId: parentId, token: "synthetic-quote-token", status: "sent", deliveryChannel: "email", totalCents: 11500, subtotalCents: 10000, gstCents: 1500,
  lineItems: [{ description: "Synthetic", qty: 1, unitPriceCents: 10000, lineTotalCents: 10000 }], depositEnabled: false, createdAt: new Date("2026-10-03T00:00:00Z") };
const invoice = { id: invoiceId, merchantId: 11, clientProfileId: parentId, kind: "full", status: "pending_dispatch", deliveryChannel: "email", amountCents: 5000, token: "synthetic-token", dueAt: new Date("2026-10-10T00:00:00Z") };
const GLOBAL = ["getQuote", "getJobInvoice", "getClientProfile", "updateJobInvoice", "createJobEvent"] as const;
let quoteSnapshot: jest.Mock; let invoiceSnapshot: jest.Mock; let quoteRecord: jest.Mock; let invoiceRecord: jest.Mock;
const sendQuote = () => (delivery as any).sendTradeQuoteForMerchant(quoteId, 11, BASE);
const sendInvoice = () => (delivery as any).resendTradeInvoiceForMerchant(invoiceId, 11, BASE);
beforeEach(() => {
  quoteSnapshot = jest.fn().mockResolvedValue({ quote: { ...quote }, client: { ...client } });
  invoiceSnapshot = jest.fn().mockResolvedValue({ invoice: { ...invoice }, client: { ...client } });
  quoteRecord = jest.fn().mockResolvedValue(true);
  invoiceRecord = jest.fn().mockResolvedValue({ kind: "ok", invoice: { ...invoice, status: "dispatched" } });
  for (const [name, mock] of [["getQuoteDeliveryForMerchant", quoteSnapshot], ["getJobInvoiceDeliveryForMerchant", invoiceSnapshot],
    ["recordQuoteDeliveryForMerchant", quoteRecord], ["recordJobInvoiceDeliveryForMerchant", invoiceRecord]] as const) {
    if (typeof (storage as any)[name] === "function") jest.spyOn(storage as any, name).mockImplementation(mock);
  }
  jest.spyOn(storage, "getMerchant").mockResolvedValue({ id: 11, name: "Synthetic business", businessName: "Synthetic Trades", gstRegistered: true } as any);
  jest.spyOn(storage, "getSubscription").mockResolvedValue({} as any);
  jest.spyOn(billing, "billingCardIsReady").mockReturnValue(true);
  jest.spyOn(email, "sendEmail").mockResolvedValue(true);
  jest.spyOn(whatsapp, "isWhatsAppConfigured").mockReturnValue(false);
  jest.spyOn(whatsapp, "sendWhatsApp").mockResolvedValue({ ok: true, messageId: "synthetic-message" } as any);
  jest.spyOn(sms, "isSmsConfigured").mockReturnValue(false);
  jest.spyOn(sms, "sendSms").mockResolvedValue({ ok: true, messageId: "synthetic-message" } as any);
  for (const name of GLOBAL) jest.spyOn(storage, name).mockImplementation(async () => { throw new Error("Global management escape hatch"); });
});
afterEach(() => jest.restoreAllMocks());
const noMessage = () => {
  expect(email.sendEmail).not.toHaveBeenCalled(); expect(whatsapp.sendWhatsApp).not.toHaveBeenCalled(); expect(sms.sendSms).not.toHaveBeenCalled();
};
const noGlobal = () => { for (const name of GLOBAL) expect(storage[name]).not.toHaveBeenCalled(); };

describe("sending a quote for the signed-in business", () => {
  test("a missing or foreign quote snapshot sends nothing and logs nothing", async () => {
    quoteSnapshot.mockResolvedValue(undefined);
    expect(await sendQuote()).toEqual({ sent: false, reason: "not_found" }); noMessage(); expect(quoteRecord).not.toHaveBeenCalled();
  });
  test("a missing business sends nothing", async () => {
    (storage.getMerchant as jest.Mock).mockResolvedValue(undefined);
    expect(await sendQuote()).toEqual({ sent: false, reason: "missing_data" }); noMessage(); expect(quoteRecord).not.toHaveBeenCalled();
  });
  test("a business that owes its billing card sends nothing, as before", async () => {
    (billing.billingCardIsReady as jest.Mock).mockReturnValue(false);
    expect(await sendQuote()).toEqual({ sent: false, reason: "billing_card_required" }); noMessage(); expect(quoteRecord).not.toHaveBeenCalled();
  });
  test("the email, with the quote as a PDF, goes to the captured owned contact and is logged with the captured client", async () => {
    (storage.getMerchant as jest.Mock).mockImplementation(async () => { expect(quoteSnapshot).not.toHaveBeenCalled(); return { id: 11, name: "Synthetic business" }; });
    expect(await sendQuote()).toMatchObject({ sent: true, channel: "email" });
    expect(quoteSnapshot).toHaveBeenCalledWith(quoteId, 11);
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: client.email, text: expect.stringContaining(`${BASE}/trades/quote/synthetic-quote-token`),
      attachments: [expect.objectContaining({ filename: "quote-SYNTHETI.pdf" })] }));
    expect(quoteRecord).toHaveBeenCalledWith(quoteId, 11, parentId, { sent: true, channel: "email", reason: undefined });
    noGlobal();
  });
  test.each(["whatsapp", "sms"])("%s uses the captured contact and logs its channel", async channel => {
    quoteSnapshot.mockResolvedValue({ quote: { ...quote, deliveryChannel: channel }, client });
    (whatsapp.isWhatsAppConfigured as jest.Mock).mockReturnValue(true); (sms.isSmsConfigured as jest.Mock).mockReturnValue(true);
    expect((await sendQuote()).sent).toBe(true);
    expect(channel === "whatsapp" ? whatsapp.sendWhatsApp : sms.sendSms).toHaveBeenCalledWith(expect.objectContaining({ toPhone: client.phone }));
    expect(email.sendEmail).not.toHaveBeenCalled();
    expect(quoteRecord).toHaveBeenCalledWith(quoteId, 11, parentId, { sent: true, channel, reason: undefined });
  });
  test("a known failed send is logged as failed and reported with its fixed reason", async () => {
    (email.sendEmail as jest.Mock).mockResolvedValue(false);
    expect(await sendQuote()).toMatchObject({ sent: false, reason: "send_failed" });
    expect(quoteRecord).toHaveBeenCalledWith(quoteId, 11, parentId, { sent: false, channel: "email", reason: "send_failed" });
  });
  test("a client with nothing to send to is logged as failed, as before", async () => {
    quoteSnapshot.mockResolvedValue({ quote, client: { ...client, email: null, phone: null } });
    expect(await sendQuote()).toEqual({ sent: false, reason: "no_deliverable" }); noMessage();
    expect(quoteRecord).toHaveBeenCalledWith(quoteId, 11, parentId, { sent: false, channel: undefined, reason: "no_deliverable" });
  });
  test("a provider exception reports uncertainty without another send or a success line", async () => {
    (email.sendEmail as jest.Mock).mockRejectedValue(new Error("Synthetic provider uncertainty"));
    expect(await sendQuote()).toEqual({ sent: false, reason: "reconciliation_required" });
    expect(email.sendEmail).toHaveBeenCalledTimes(1); expect(quoteRecord).not.toHaveBeenCalled();
  });
  test("a history line refused or failed after a sent quote cannot return success", async () => {
    quoteRecord.mockResolvedValue(false);
    expect(await sendQuote()).toEqual({ sent: false, reason: "reconciliation_required" });
    quoteRecord.mockRejectedValue(new Error("Synthetic history failure"));
    expect(await sendQuote()).toEqual({ sent: false, reason: "reconciliation_required" });
    noGlobal();
  });
});

describe("sending an invoice for the signed-in business", () => {
  test("a missing or foreign invoice snapshot sends nothing and records nothing", async () => {
    invoiceSnapshot.mockResolvedValue(undefined);
    expect(await sendInvoice()).toEqual({ sent: false, reason: "not_found" }); noMessage(); expect(invoiceRecord).not.toHaveBeenCalled();
  });
  test.each(["paid", "paid_external", "voided"])("a %s invoice is refused before delivery", async status => {
    invoiceSnapshot.mockResolvedValue({ invoice: { ...invoice, status }, client });
    expect(await sendInvoice()).toEqual({ sent: false, reason: "not_payable" }); noMessage(); expect(invoiceRecord).not.toHaveBeenCalled();
  });
  test("a missing business sends nothing", async () => {
    (storage.getMerchant as jest.Mock).mockResolvedValue(undefined);
    expect(await sendInvoice()).toEqual({ sent: false, reason: "missing_data" }); noMessage(); expect(invoiceRecord).not.toHaveBeenCalled();
  });
  test("the email goes to the captured owned contact, then the delivery is recorded with the captured client", async () => {
    (storage.getMerchant as jest.Mock).mockImplementation(async () => { expect(invoiceSnapshot).not.toHaveBeenCalled(); return { id: 11, name: "Synthetic business" }; });
    expect(await sendInvoice()).toMatchObject({ sent: true, channel: "email", invoice: { id: invoiceId, status: "dispatched" } });
    expect(invoiceSnapshot).toHaveBeenCalledWith(invoiceId, 11);
    expect(email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: client.email, text: expect.stringContaining(`${BASE}/r/synthetic-token`) }));
    expect(invoiceRecord).toHaveBeenCalledWith(invoiceId, 11, parentId, { channel: "email", messageId: undefined });
    noGlobal();
  });
  test.each(["whatsapp", "sms"])("%s uses the captured contact and records its channel and message id", async channel => {
    invoiceSnapshot.mockResolvedValue({ invoice: { ...invoice, deliveryChannel: channel }, client });
    (whatsapp.isWhatsAppConfigured as jest.Mock).mockReturnValue(true); (sms.isSmsConfigured as jest.Mock).mockReturnValue(true);
    expect((await sendInvoice()).sent).toBe(true);
    expect(channel === "whatsapp" ? whatsapp.sendWhatsApp : sms.sendSms).toHaveBeenCalledWith(expect.objectContaining({ toPhone: client.phone }));
    expect(email.sendEmail).not.toHaveBeenCalled();
    expect(invoiceRecord).toHaveBeenCalledWith(invoiceId, 11, parentId, { channel, messageId: "synthetic-message" });
  });
  test.each([[false, "send_failed"], [null, "no_deliverable"]] as const)("a known failed send (%s) records nothing and keeps its fixed reason", async (sent, reason) => {
    if (sent === null) invoiceSnapshot.mockResolvedValue({ invoice, client: { ...client, email: null, phone: null } });
    else (email.sendEmail as jest.Mock).mockResolvedValue(sent);
    expect(await sendInvoice()).toMatchObject({ sent: false, reason }); expect(invoiceRecord).not.toHaveBeenCalled();
  });
  test("a provider exception reports uncertainty without another send or a record", async () => {
    (email.sendEmail as jest.Mock).mockRejectedValue(new Error("Synthetic provider uncertainty"));
    expect(await sendInvoice()).toEqual({ sent: false, reason: "reconciliation_required" });
    expect(email.sendEmail).toHaveBeenCalledTimes(1); expect(invoiceRecord).not.toHaveBeenCalled();
  });
  test.each([{ kind: "not-found" }, { kind: "conflict", reason: "paid" }, { kind: "conflict", reason: "voided" }])("post-send refusal %j cannot return success or invoice data", async result => {
    invoiceRecord.mockResolvedValue(result);
    expect(await sendInvoice()).toEqual({ sent: false, reason: "reconciliation_required" });
    expect(email.sendEmail).toHaveBeenCalledTimes(1); expect(invoiceRecord).toHaveBeenCalledTimes(1);
  });
  test("a post-send record failure reports uncertainty without an invoice", async () => {
    invoiceRecord.mockRejectedValue(new Error("Synthetic history failure"));
    expect(await sendInvoice()).toEqual({ sent: false, reason: "reconciliation_required" });
    expect(email.sendEmail).toHaveBeenCalledTimes(1); noGlobal();
  });
});

test("the unscoped quote sender is retired; the payment and cron lanes keep theirs", () => {
  expect((delivery as any).sendTradeQuote).toBeUndefined();
  expect(typeof delivery.resendTradeInvoice).toBe("function");
  expect(typeof delivery.sendTradePaymentInvoice).toBe("function");
});
