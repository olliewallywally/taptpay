import "./support/test-env";
import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, signedIn } from "./support/http-harness";
import * as delivery from "../trades-delivery";
import { fakeTrades, seedTrades, CLIENT, INVOICE, QUOTE } from "./support/trades-fake";
import { observeRefusalEffects } from "./support/refusal-effects";
beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

test.each([
  ["void", "invoice", "moved", 404], ["mark-paid-external", "invoice", "moved", 404], ["complete", "invoice", "moved", 404],
  ["void", "parent", "moved", 404], ["mark-paid-external", "parent", "moved", 404], ["complete", "parent", "moved", 404],
  ["void", "invoice", "paid", 409], ["void", "invoice", "paid_external", 409],
  ["mark-paid-external", "invoice", "paid", 409], ["mark-paid-external", "invoice", "voided", 409],
  ["complete", "invoice", "dispatched", 409],
] as const)("%s refuses a %s %s after lookup without state, history or delivery", async (action, target, change, expected) => {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal(); const other = await createOwnerPrincipal();
  const fake = fakeTrades(); seedTrades(fake, owner.merchantId, { invoice: { status: action === "complete" ? "paid" : "dispatched" } });
  const snapshot = () => JSON.stringify({ clients: [...fake.clients], invoices: [...fake.invoices], events: fake.events });
  let after: string | undefined;
  const racedLookup = async () => {
    const stale = { ...fake.invoices.get(INVOICE) };
    const row = target === "parent" ? fake.clients.get(CLIENT) : fake.invoices.get(INVOICE);
    if (change === "moved") row.merchantId = other.merchantId; else row.status = change;
    after = snapshot(); return stale;
  };
  jest.spyOn(storage, "getJobInvoice").mockImplementation(racedLookup);
  if (typeof (storage as any).getJobInvoiceForMerchant === "function") jest.spyOn(storage as any, "getJobInvoiceForMerchant").mockImplementation(racedLookup);
  const effects = observeRefusalEffects();
  try {
    const res = await request(app).post(`/api/trades/invoices/${INVOICE}/${action}`).set(signedIn(owner)).send({ externalPaymentReference: "Synthetic" });
    expect(res.status).toBe(expected); expect(after).toBeDefined(); expect(snapshot()).toBe(after);
    expect(fake.writes).toEqual([]); effects.assertNone();
  } finally { effects.restore(); }
});

test("external payment sends its receipt through the merchant-scoped service only", async () => {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal();
  const fake = fakeTrades(); seedTrades(fake, owner.merchantId);
  const res = await request(app).post(`/api/trades/invoices/${INVOICE}/mark-paid-external`).set(signedIn(owner)).send({ externalPaymentReference: "Cash" });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ id: INVOICE, status: "paid_external", externalPaymentReference: "Cash" });
  expect((delivery as any).sendTradePaymentInvoiceForMerchant).toHaveBeenCalledWith(INVOICE, owner.merchantId);
  expect(delivery.sendTradePaymentInvoice).not.toHaveBeenCalled();
  expect(fake.events.map(row => row.eventType)).toEqual(["paid_external"]);
  expect(fake.events[0]).toMatchObject({ merchantId: owner.merchantId, clientProfileId: CLIENT, jobInvoiceId: INVOICE });
});

test("the signed-in quote PDF never prints a client the business does not own", async () => {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal(); const other = await createOwnerPrincipal();
  const fake = fakeTrades(); seedTrades(fake, owner.merchantId);
  // The quote is still stamped with the owner's business; only its client row is another's.
  Object.assign(fake.clients.get(CLIENT), { merchantId: other.merchantId, firstName: "Foreign", siteAddress: "Foreign address" });
  const missing = await request(app).get("/api/trades/quotes/99999999-9999-4999-8999-999999999999/pdf").set(signedIn(owner));
  const res = await request(app).get(`/api/trades/quotes/${QUOTE}/pdf`).set(signedIn(owner));
  expect(missing.status).toBe(404);
  expect(res.status).toBe(404); expect(res.body).toEqual(missing.body);
  expect(res.headers["content-type"]).not.toMatch(/pdf/);
});

test("the signed-in quote PDF is made from the quote read together with its owned client", async () => {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal();
  const fake = fakeTrades(); seedTrades(fake, owner.merchantId);
  const globalClient = jest.spyOn(storage, "getClientProfile").mockImplementation(async () => { throw new Error("Global client read in a signed-in lane"); });
  const globalQuote = jest.spyOn(storage, "getQuote").mockImplementation(async () => { throw new Error("Global quote read in a signed-in lane"); });
  const res = await request(app).get(`/api/trades/quotes/${QUOTE}/pdf`).set(signedIn(owner));
  expect(res.status).toBe(200); expect(res.headers["content-type"]).toMatch(/application\/pdf/);
  expect(globalClient).not.toHaveBeenCalled(); expect(globalQuote).not.toHaveBeenCalled();
});
