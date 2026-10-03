import "./support/test-env";
import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, signedIn } from "./support/http-harness";
import { fakeProperty, seedProperty, TENANT, INVOICE } from "./support/property-fake";
import { observeRefusalEffects } from "./support/refusal-effects";
beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

test.each([
  ["void", "invoice", "moved", 404], ["mark-paid-external", "invoice", "moved", 404],
  ["void", "parent", "moved", 404], ["mark-paid-external", "parent", "moved", 404],
  ["void", "invoice", "paid", 409], ["mark-paid-external", "invoice", "paid", 409],
  ["mark-paid-external", "invoice", "voided", 409],
] as const)("%s refuses a %s %s after lookup without state, history or delivery", async (action, target, change, expected) => {
  const { app } = await createTestApp(); const owner = await createOwnerPrincipal(); const other = await createOwnerPrincipal();
  const fake = fakeProperty(); seedProperty(fake, owner.merchantId);
  const snapshot = () => JSON.stringify({ tenants: [...fake.tenants], invoices: [...fake.invoices], events: fake.events });
  let after: string | undefined;
  const racedLookup = async () => {
    const stale = { ...fake.invoices.get(INVOICE) };
    const row = target === "parent" ? fake.tenants.get(TENANT) : fake.invoices.get(INVOICE);
    if (change === "moved") row.merchantId = other.merchantId; else row.status = change;
    after = snapshot(); return stale;
  };
  jest.spyOn(storage, "getInvoiceRentRequest").mockImplementation(racedLookup);
  if (typeof (storage as any).getInvoiceRentRequestForMerchant === "function") jest.spyOn(storage as any, "getInvoiceRentRequestForMerchant").mockImplementation(racedLookup);
  const effects = observeRefusalEffects();
  try {
    const res = await request(app).post(`/api/property/invoices/${INVOICE}/${action}`).set(signedIn(owner)).send({ externalPaymentReference: "Synthetic" });
    expect(res.status).toBe(expected); expect(after).toBeDefined(); expect(snapshot()).toBe(after);
    expect(fake.writes).toEqual([]); effects.assertNone();
  } finally { effects.restore(); }
});
