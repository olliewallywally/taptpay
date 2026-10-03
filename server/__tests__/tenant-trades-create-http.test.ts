import "./support/test-env";
import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, signedIn } from "./support/http-harness";
import * as delivery from "../trades-delivery";
import { fakeTrades, seedTrades, inDays, CLIENT, INVOICE, QUOTE, MADE_CLIENT, MADE_INVOICE, MADE_QUOTE } from "./support/trades-fake";
import { observeRefusalEffects } from "./support/refusal-effects";
beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

const LINES = [{ description: "Replace the switchboard", qty: 1, unitPriceCents: 40_000, lineTotalCents: 40_000 }];
const QUOTE_BODY = { clientProfileId: CLIENT, deliveryChannel: "email", lineItems: LINES };
const INVOICE_BODY = () => ({ clientProfileId: CLIENT, amountCents: 30_000, deliveryChannel: "email", dueAt: inDays(14).toISOString(), kind: "full" });
const PAID_DEPOSIT = { invoice: { kind: "deposit", status: "paid", quoteId: QUOTE, amountCents: 20_000 } };
const QUOTE_503 = { message: "Quote delivery requires reconciliation", code: "TRADES_QUOTE_DELIVERY_RECONCILIATION_REQUIRED" };
const INVOICE_503 = { message: "Invoice delivery requires reconciliation", code: "TRADES_INVOICE_DELIVERY_RECONCILIATION_REQUIRED" };
const spyIfPresent = (target: any, name: string, implementation: (...args: any[]) => any) => {
  if (typeof target[name] === "function") jest.spyOn(target, name).mockImplementation(implementation);
};

async function arranged(state?: Parameters<typeof seedTrades>[2]) {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal(); const other = await createOwnerPrincipal();
  const fake = fakeTrades(); seedTrades(fake, owner.merchantId, state);
  const snapshot = () => JSON.stringify({ clients: [...fake.clients], quotes: [...fake.quotes], invoices: [...fake.invoices], events: fake.events });
  return { app, owner, other, fake, snapshot };
}

test.each([
  ["quote", "/api/trades/quotes", () => QUOTE_BODY],
  ["invoice", "/api/trades/invoices", INVOICE_BODY],
] as const)("%s create refuses a client moved after lookup without a row, history or message", async (_label, path, body) => {
  const { app, owner, other, fake, snapshot } = await arranged();
  let after: string | undefined;
  const lookup = async () => {
    const stale = { ...fake.clients.get(CLIENT) }; fake.clients.get(CLIENT).merchantId = other.merchantId;
    after = snapshot(); return stale;
  };
  jest.spyOn(storage, "getClientProfile").mockImplementation(lookup);
  jest.spyOn(storage, "getClientProfileForMerchant").mockImplementation(lookup);
  const effects = observeRefusalEffects();
  try {
    const res = await request(app).post(path).set(signedIn(owner)).send(body());
    expect(res.status).toBe(404); expect(res.body).toEqual({ message: "Client not found" });
    expect(after).toBeDefined(); expect(snapshot()).toBe(after); expect(fake.writes).toEqual([]); effects.assertNone();
  } finally { effects.restore(); }
});

test.each(["moved to another business", "moved to another client"])("a deposit's quote %s after lookup is refused without an invoice, history or message", async change => {
  const { app, owner, other, fake, snapshot } = await arranged();
  const OTHER_CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  fake.clients.set(OTHER_CLIENT, { ...fake.clients.get(CLIENT), id: OTHER_CLIENT });
  let after: string | undefined;
  const race = () => {
    const stale = { ...fake.quotes.get(QUOTE) };
    if (change === "moved to another business") fake.quotes.get(QUOTE).merchantId = other.merchantId; else fake.quotes.get(QUOTE).clientProfileId = OTHER_CLIENT;
    after = snapshot(); return stale;
  };
  jest.spyOn(storage, "getQuote").mockImplementation(async () => race());
  spyIfPresent(storage, "getQuoteDeliveryForMerchant", async () => { const quote = race(); return { quote, client: { ...fake.clients.get(CLIENT) } }; });
  const effects = observeRefusalEffects();
  try {
    const res = await request(app).post("/api/trades/invoices").set(signedIn(owner)).send({ ...INVOICE_BODY(), kind: "deposit", quoteId: QUOTE });
    expect(res.status).toBe(404); expect(res.body).toEqual({ message: "Quote not found" });
    expect(after).toBeDefined(); expect(snapshot()).toBe(after); expect(fake.writes).toEqual([]); effects.assertNone();
  } finally { effects.restore(); }
});

test.each([
  ["invoice", "moved", 404, { message: "Not found" }],
  ["parent", "moved", 404, { message: "Not found" }],
  ["invoice", "voided", 409, { message: "Deposit must be paid before sending the balance" }],
] as const)("send-balance refuses a deposit whose %s is %s after lookup without a balance, history or message", async (target, change, status, body) => {
  const { app, owner, other, fake, snapshot } = await arranged(PAID_DEPOSIT);
  let after: string | undefined;
  const lookup = async () => {
    const stale = { ...fake.invoices.get(INVOICE) };
    const row = target === "parent" ? fake.clients.get(CLIENT) : fake.invoices.get(INVOICE);
    if (change === "moved") row.merchantId = other.merchantId; else row.status = change;
    after = snapshot(); return stale;
  };
  jest.spyOn(storage, "getJobInvoice").mockImplementation(lookup);
  jest.spyOn(storage, "getJobInvoiceForMerchant").mockImplementation(lookup);
  const effects = observeRefusalEffects();
  try {
    const res = await request(app).post(`/api/trades/invoices/${INVOICE}/send-balance`).set(signedIn(owner)).send({ splitEnabled: false });
    expect(res.status).toBe(status); expect(res.body).toEqual(body);
    expect(after).toBeDefined(); expect(snapshot()).toBe(after); expect(fake.writes).toEqual([]); effects.assertNone();
  } finally { effects.restore(); }
});

test.each([
  [{ kind: "not-found" }, 404, "Not found"],
  [{ kind: "conflict", reason: "not-deposit" }, 400, "Balance can only be sent for a deposit invoice"],
  [{ kind: "conflict", reason: "unpaid" }, 409, "Deposit must be paid before sending the balance"],
  [{ kind: "conflict", reason: "no-quote" }, 400, "This deposit is not linked to a quote, so a balance can't be calculated"],
  [{ kind: "conflict", reason: "quote-not-found" }, 404, "Linked quote not found"],
  [{ kind: "conflict", reason: "exists" }, 409, "Balance invoice already exists"],
  [{ kind: "conflict", reason: "none-remaining" }, 400, "No balance remaining"],
] as const)("send-balance answers storage's refusal %j as %s '%s' and sends nothing", async (result, status, message) => {
  const { app, owner, fake } = await arranged(PAID_DEPOSIT);
  const create = jest.spyOn(storage as any, "createJobBalanceInvoiceForMerchant").mockResolvedValue(result);
  const effects = observeRefusalEffects();
  try {
    const res = await request(app).post(`/api/trades/invoices/${INVOICE}/send-balance`).set(signedIn(owner)).send({ splitEnabled: true });
    expect(res.status).toBe(status); expect(res.body).toEqual({ message });
    expect(create).toHaveBeenCalledWith(INVOICE, owner.merchantId, true);
    expect(fake.writes).toEqual([]); effects.assertNone();
  } finally { effects.restore(); }
});

test("each create is one storage call that takes the business, and no global create, client or sender", async () => {
  const { app, owner, fake } = await arranged(PAID_DEPOSIT);
  const globalInvoice = jest.spyOn(storage, "createJobInvoice");
  const prospectAlone = jest.spyOn(storage, "createClientProfileForMerchant");
  const quote = await request(app).post("/api/trades/quotes").set(signedIn(owner)).send({ recipient: { name: "Quinn Quick", email: "quinn@example.test", address: "2 Site Road" }, lineItems: LINES });
  expect(quote.status).toBe(201);
  expect(quote.body).toMatchObject({ id: MADE_QUOTE, merchantId: owner.merchantId, clientProfileId: MADE_CLIENT, status: "sent", totalCents: 40_000, delivered: true });
  expect((storage as any).createQuoteForMerchant).toHaveBeenCalledWith(owner.merchantId,
    { prospect: { firstName: "Quinn", lastName: "Quick", email: "quinn@example.test", phone: null, siteAddress: "2 Site Road", preferredChannel: "email" } },
    expect.objectContaining({ lineItems: [{ ...LINES[0], lineTotalCents: 40_000 }], subtotalCents: 40_000, totalCents: 40_000, deliveryChannel: "email" }));
  expect(fake.clients.get(MADE_CLIENT)).toMatchObject({ merchantId: owner.merchantId, status: "prospect", firstName: "Quinn" });
  expect((delivery as any).sendTradeQuoteForMerchant).toHaveBeenCalledWith(MADE_QUOTE, owner.merchantId, expect.any(String));

  const quick = await request(app).post("/api/trades/invoices").set(signedIn(owner)).send({
    recipient: { name: "Sam Smith", phone: "+64210000000", channel: "sms" }, amountCents: 12_000, deliveryChannel: "sms", dueAt: inDays(7).toISOString(), kind: "full", splitEnabled: true });
  expect(quick.status).toBe(201);
  expect((storage as any).createJobInvoiceForMerchant).toHaveBeenCalledWith(owner.merchantId,
    { prospect: { firstName: "Sam", lastName: "Smith", email: null, phone: "+64210000000", siteAddress: "", preferredChannel: "sms" } },
    expect.objectContaining({ kind: "full", amountCents: 12_000, deliveryChannel: "sms", splitEnabled: true, quoteId: null }));
  expect((delivery as any).resendTradeInvoiceForMerchant).toHaveBeenCalledWith(MADE_INVOICE, owner.merchantId, expect.any(String));

  const balance = await request(app).post(`/api/trades/invoices/${INVOICE}/send-balance`).set(signedIn(owner)).send({ splitEnabled: true });
  expect(balance.status).toBe(201);
  expect(balance.body).toMatchObject({ id: MADE_INVOICE, kind: "balance", amountCents: 80_000, quoteId: QUOTE, splitEnabled: true, delivered: true });
  expect((storage as any).createJobBalanceInvoiceForMerchant).toHaveBeenCalledWith(INVOICE, owner.merchantId, true);

  expect(globalInvoice).not.toHaveBeenCalled(); expect(prospectAlone).not.toHaveBeenCalled();
  expect((storage as any).createQuote).toBeUndefined(); expect((delivery as any).sendTradeQuote).toBeUndefined();
  expect(delivery.resendTradeInvoice).not.toHaveBeenCalled();
  expect(fake.events.map(row => row.eventType)).toEqual(["quote_sent", "invoice_sent", "balance_sent"]);
});

test("an invoice with a later send date is made and not sent, as before", async () => {
  const { app, owner } = await arranged();
  const res = await request(app).post("/api/trades/invoices").set(signedIn(owner)).send({ ...INVOICE_BODY(), scheduledSendAt: inDays(3).toISOString() });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ id: MADE_INVOICE, status: "pending_dispatch", delivered: false, deliveryReason: "scheduled" });
  expect((delivery as any).resendTradeInvoiceForMerchant).not.toHaveBeenCalled();
});

test("a quote whose send is known to have failed is still made (201), and the failure is logged for its owned client", async () => {
  const { app, owner, fake } = await arranged();
  spyIfPresent(delivery, "sendTradeQuoteForMerchant", async () => ({ sent: false, reason: "no_deliverable" }));
  const record = jest.spyOn(storage as any, "recordQuoteDeliveryForMerchant");
  const res = await request(app).post("/api/trades/quotes").set(signedIn(owner)).send(QUOTE_BODY);
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ id: MADE_QUOTE, delivered: false, deliveryReason: "no_deliverable" });
  expect(record).toHaveBeenCalledWith(MADE_QUOTE, owner.merchantId, CLIENT, { sent: false, reason: "no_deliverable" });
  expect(fake.events.map(row => row.eventType)).toEqual(["quote_sent", "quote_dispatch_failed"]);
  expect(fake.events[1]).toMatchObject({ merchantId: owner.merchantId, clientProfileId: CLIENT, quoteId: MADE_QUOTE, payload: { reason: "no_deliverable" } });
});

test.each([
  ["quote", "/api/trades/quotes", () => QUOTE_BODY, "sendTradeQuoteForMerchant", QUOTE_503, undefined],
  ["invoice", "/api/trades/invoices", INVOICE_BODY, "resendTradeInvoiceForMerchant", INVOICE_503, undefined],
  ["balance", `/api/trades/invoices/${INVOICE}/send-balance`, () => ({ splitEnabled: false }), "resendTradeInvoiceForMerchant", INVOICE_503, PAID_DEPOSIT],
] as const)("%s create reports post-send uncertainty as 503 without a row", async (_label, path, body, sender, expected, state) => {
  const { app, owner } = await arranged(state);
  jest.spyOn(delivery as any, sender).mockResolvedValue({ sent: false, reason: "reconciliation_required" });
  const res = await request(app).post(path).set(signedIn(owner)).send(body());
  expect(res.status).toBe(503); expect(res.body).toEqual(expected);
});

test.each([
  ["quote", "/api/trades/quotes", () => QUOTE_BODY, "sendTradeQuoteForMerchant", "quotes", undefined],
  ["invoice", "/api/trades/invoices", INVOICE_BODY, "resendTradeInvoiceForMerchant", "invoices", undefined],
  ["balance", `/api/trades/invoices/${INVOICE}/send-balance`, () => ({ splitEnabled: false }), "resendTradeInvoiceForMerchant", "invoices", PAID_DEPOSIT],
] as const)("%s create's final response refuses a row whose scope was lost during a failed send", async (_label, path, body, sender, rows, state) => {
  const { app, owner, other, fake } = await arranged(state);
  jest.spyOn(delivery as any, sender).mockImplementation(async (...args: any[]) => {
    fake[rows].get(args[0]).merchantId = other.merchantId;
    return { sent: false, reason: "not_found" };
  });
  const res = await request(app).post(path).set(signedIn(owner)).send(body());
  expect(res.status).toBe(404); expect(res.body).toEqual({ message: "Not found" });
});
