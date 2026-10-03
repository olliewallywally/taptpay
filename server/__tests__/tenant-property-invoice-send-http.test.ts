import "./support/test-env";
import request from "supertest";
import { createTestApp, createOwnerPrincipal, resetTestStorage, signedIn, storage } from "./support/http-harness";
import { fakeProperty, seedProperty, TENANT, INVOICE, inDays } from "./support/property-fake";
import { observeRefusalEffects } from "./support/refusal-effects";
import * as cron from "../property-cron";

afterEach(() => jest.restoreAllMocks());
test("create refuses a tenant moved after lookup without invoices, history or messages", async () => {
  resetTestStorage(); const { app } = await createTestApp(); const owner = await createOwnerPrincipal();
  const fake = fakeProperty(); seedProperty(fake, owner.merchantId!); const effects = observeRefusalEffects();
  let before: string;
  const lookup = async () => {
    const stale = { ...fake.tenants.get(TENANT) };
    fake.tenants.get(TENANT).merchantId = owner.merchantId! + 100;
    before = JSON.stringify({ tenants: [...fake.tenants], invoices: [...fake.invoices], events: fake.events });
    return stale;
  };
  jest.spyOn(storage, "getTenantProfile").mockImplementation(lookup);
  jest.spyOn(storage, "getTenantProfileForMerchant").mockImplementation(lookup);
  const res = await request(app).post("/api/property/invoices").set(signedIn(owner)).send({
    tenantProfileId: TENANT, kind: "charge", amountCents: 5000, deliveryChannel: "email", dueAt: inDays(7).toISOString(),
  });
  expect(res.status).toBe(404);
  expect(JSON.stringify({ tenants: [...fake.tenants], invoices: [...fake.invoices], events: fake.events })).toBe(before!);
  expect(fake.writes).toEqual([]); effects.assertNone();
});

test.each(["invoice", "parent"])("resend refuses %s ownership moved after lookup without messages or history", async target => {
  resetTestStorage(); const { app } = await createTestApp(); const owner = await createOwnerPrincipal();
  const fake = fakeProperty(); seedProperty(fake, owner.merchantId!); const effects = observeRefusalEffects();
  let before: string;
  const lookup = async () => {
    const stale = { ...fake.invoices.get(INVOICE) };
    (target === "invoice" ? fake.invoices.get(INVOICE) : fake.tenants.get(TENANT)).merchantId = owner.merchantId! + 100;
    before = JSON.stringify({ tenants: [...fake.tenants], invoices: [...fake.invoices], events: fake.events });
    return stale;
  };
  jest.spyOn(storage, "getInvoiceRentRequest").mockImplementation(lookup);
  jest.spyOn(storage, "getInvoiceRentRequestForMerchant").mockImplementation(lookup);
  const res = await request(app).post(`/api/property/invoices/${INVOICE}/resend`).set(signedIn(owner)).send({});
  expect(res.status).toBe(404);
  expect(JSON.stringify({ tenants: [...fake.tenants], invoices: [...fake.invoices], events: fake.events })).toBe(before!);
  expect(fake.writes).toEqual([]); effects.assertNone();
});

test.each(["create", "resend"])("%s reports post-send uncertainty as 503 without an invoice DTO", async action => {
  resetTestStorage(); const { app } = await createTestApp(); const owner = await createOwnerPrincipal();
  const fake = fakeProperty(); seedProperty(fake, owner.merchantId!);
  jest.spyOn(cron, "resendInvoiceEmailForMerchant").mockResolvedValue({ ok: false, reason: "reconciliation_required" });
  const res = await request(app).post(action === "create" ? "/api/property/invoices" : `/api/property/invoices/${INVOICE}/resend`)
    .set(signedIn(owner)).send(action === "create" ? { tenantProfileId: TENANT, kind: "charge", amountCents: 5000, deliveryChannel: "email", dueAt: inDays(7).toISOString() } : {});
  expect(res.status).toBe(503);
  expect(res.body).toEqual({ message: "Invoice delivery requires reconciliation", code: "PROPERTY_INVOICE_DELIVERY_RECONCILIATION_REQUIRED" });
});

test("creation's final response refuses scope lost during a failed send", async () => {
  resetTestStorage(); const { app } = await createTestApp(); const owner = await createOwnerPrincipal();
  const fake = fakeProperty(); seedProperty(fake, owner.merchantId!);
  jest.spyOn(cron, "resendInvoiceEmailForMerchant").mockImplementation(async id => {
    fake.invoices.get(id).merchantId = owner.merchantId! + 100;
    return { ok: false, reason: "not_found" };
  });
  const res = await request(app).post("/api/property/invoices").set(signedIn(owner)).send({
    tenantProfileId: TENANT, kind: "charge", amountCents: 5000, deliveryChannel: "email", dueAt: inDays(7).toISOString(),
  });
  expect(res.status).toBe(404); expect(res.body).toEqual({ message: "Invoice not found" });
});
