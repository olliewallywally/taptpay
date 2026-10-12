import "./support/test-env";
import crypto from "crypto";
import request from "supertest";
import * as windcave from "../windcave";
import { sseBroker } from "../sse-broker";
import * as push from "../push";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";

/**
 * R2-T5 (plan v2.2 §9.5; owner direction 2026-10-12): every completion path of the
 * numbered sales and the property/trades invoices asks for the provider's outcome with
 * what that payment expected — its session, amount in cents, currency, merchant
 * reference and provider environment — and settles only on a verified approval or
 * decline. A pending, unverifiable or mismatched outcome (success:false from the
 * verified query) changes nothing; it used to be recorded as a decline on several
 * paths. The browser's cancel and a Google Pay submit's own reply no longer settle,
 * and neither does a duplicate-request reply when a session is created.
 *
 * The verifier itself is windcave-verify.test.ts; the wrapper's handling of it,
 * windcave-session-wrappers.test.ts. Here the routes' use of it.
 */

const SESSION = "0000120000000000a1b2c3d4e5f60718";
const UNVERIFIED = { success: false, error: "integrity_mismatch:amount" };

let query: jest.SpyInstance;
let submitGooglePay: jest.SpyInstance;

beforeEach(() => {
  resetTestStorage();
  jest.spyOn(windcave, "isWindcaveConfigured").mockReturnValue(true);
  query = jest.spyOn(windcave, "queryWindcaveSession").mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "provider-verified" });
  submitGooglePay = jest.spyOn(windcave, "submitGooglePayToken").mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "provider-submit-reply" });
  jest.spyOn(sseBroker, "broadcast").mockImplementation(() => {});
  jest.spyOn(push, "sendPushToMerchant").mockResolvedValue({ eligibleSubscriptions: 0, attempted: 0, delivered: 0, failed: 0 });
});

const expected = (over: Record<string, unknown>) => ({
  sessionId: SESSION,
  currency: "NZD",
  providerEnvironment: windcave.currentProviderEnvironment(),
  ...over,
});

/** Let a notification's work, done after its acknowledgement, finish. */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("a numbered sale", () => {
  async function boundSale(price = "12.34") {
    const owner = await createOwnerPrincipal();
    const sale = await storage.createTransaction({
      merchantId: owner.merchantId, itemName: "Verification fixture", price, status: "pending",
      paymentMethod: "qr_code", splitEnabled: false,
    } as any);
    await storage.updateTransactionWindcaveSession(sale.id, SESSION, "pending", "synthetic-x-id");
    const writes = ["updateTransactionStatus", "updateSplitPaymentStatus", "incrementTransactionCount"] as const;
    return { sale, spies: writes.map((name) => jest.spyOn(storage, name)) };
  }

  it.each(["hosted-fields-complete", "googlepay-complete"])("%s asks with the sale's price and reference", async (route) => {
    const { app } = await createTestApp();
    const { sale } = await boundSale();

    const response = await request(app).post(`/api/transactions/${sale.id}/${route}`).send({ sessionId: SESSION });

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(SESSION, expected({ amountCents: 1234, merchantReference: `TXN_${sale.id}` }));
    expect((await storage.getTransaction(sale.id))?.status).toBe("completed");
  });

  it("asks a split sale's session with the next share's amount and reference", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const sale = await storage.createTransaction({
      merchantId: owner.merchantId, itemName: "Split fixture", price: "30.00", status: "pending",
      paymentMethod: "qr_code", splitEnabled: true,
    } as any);
    expect((await request(app).post(`/api/transactions/${sale.id}/split`).send({ totalSplits: 3 })).status).toBe(200);
    const share = await storage.getNextPendingSplit(sale.id);
    await storage.updateTransactionWindcaveSession(sale.id, SESSION, "pending", "synthetic-x-id");

    await request(app).post(`/api/transactions/${sale.id}/hosted-fields-complete`).send({ sessionId: SESSION });

    expect(query).toHaveBeenCalledWith(SESSION, expected({ amountCents: 1000, merchantReference: `SPLIT_${share.id}_TXN_${sale.id}` }));
  });

  it.each(["hosted-fields-complete", "googlepay-complete"])("%s settles nothing on an unverified outcome (it used to decline)", async (route) => {
    const { app } = await createTestApp();
    const { sale, spies } = await boundSale();
    query.mockResolvedValue(UNVERIFIED);

    const response = await request(app).post(`/api/transactions/${sale.id}/${route}`).send({ sessionId: SESSION });

    expect(response.status).toBe(503);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(await storage.getTransaction(sale.id)).toMatchObject({ status: "pending", windcaveSessionState: "pending" });
    expect(push.sendPushToMerchant).not.toHaveBeenCalled();
  });

  it("settles Google Pay from the verified query, never from the submit's reply", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const sale = await storage.createTransaction({
      merchantId: owner.merchantId, itemName: "Wallet fixture", price: "12.34", status: "pending",
      paymentMethod: "qr_code", splitEnabled: false,
    } as any);
    jest.spyOn(windcave, "createWindcaveSession").mockResolvedValue({
      success: true, sessionId: SESSION,
      ajaxSubmitGooglePayUrl: `https://uat.windcave.com/api/v1/sessions/${SESSION}/googlepay`,
    } as any);
    expect((await request(app).post(`/api/transactions/${sale.id}/pay`).send({})).status).toBe(200);

    // The submit says approved; the verified query cannot confirm it.
    query.mockResolvedValue(UNVERIFIED);
    const unverified = await request(app).post(`/api/transactions/${sale.id}/googlepay-complete`).send({ sessionId: SESSION, googlePayToken: { signature: "synthetic" } });
    expect(submitGooglePay).toHaveBeenCalledTimes(1);
    expect(unverified.status).toBe(503);
    expect((await storage.getTransaction(sale.id))?.status).toBe("pending");

    // Once verified, the query's own transaction is the one recorded.
    query.mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "provider-verified" });
    const verified = await request(app).post(`/api/transactions/${sale.id}/googlepay-complete`).send({ sessionId: SESSION });
    expect(verified.status).toBe(200);
    expect(await storage.getTransaction(sale.id)).toMatchObject({ status: "completed", windcaveTransactionId: "provider-verified" });
  });

  it("the browser callback asks with the sale's expected values", async () => {
    const { app } = await createTestApp();
    const { sale } = await boundSale();

    const response = await request(app).get("/api/windcave/callback").query({ transactionId: sale.id });

    expect(response.headers.location).toBe(`/receipt/${sale.id}`);
    expect(query).toHaveBeenCalledWith(SESSION, expected({ amountCents: 1234, merchantReference: `TXN_${sale.id}` }));
  });

  it.each([
    ["with the bound session", SESSION, "cancelled"],
    ["with another session", "0000120000000000ffffffffffffffff", "pending"],
  ])("a browser cancel %s settles nothing and asks nothing (it used to fail the sale)", async (_label, sessionid, page) => {
    const { app } = await createTestApp();
    const { sale, spies } = await boundSale();
    const sessionState = jest.spyOn(storage, "updateTransactionSessionState");

    const response = await request(app).get("/api/windcave/callback").query({ transactionId: sale.id, sessionid, result: "cancelled" });

    expect(response.headers.location).toBe(`/payment/result/${sale.id}?status=${page}`);
    expect(query).not.toHaveBeenCalled();
    for (const spy of [...spies, sessionState]) expect(spy).not.toHaveBeenCalled();
    expect(await storage.getTransaction(sale.id)).toMatchObject({ status: "pending", windcaveSessionState: "pending" });
  });

  it("the provider's notification asks with the sale's expected values, and an unverified outcome leaves it reconcilable", async () => {
    const { app } = await createTestApp();
    const { sale, spies } = await boundSale();
    query.mockResolvedValue(UNVERIFIED);

    expect((await request(app).get("/api/windcave/notification").query({ sessionid: SESSION })).status).toBe(200);
    await settle();

    expect(query).toHaveBeenCalledWith(SESSION, expected({ amountCents: 1234, merchantReference: `TXN_${sale.id}` }));
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(await storage.getTransaction(sale.id)).toMatchObject({ status: "pending", windcaveSessionState: "pending" });
  });

  it("a duplicate-request reply on /pay binds its session and settles nothing (it used to settle from the reply)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const sale = await storage.createTransaction({
      merchantId: owner.merchantId, itemName: "Duplicate fixture", price: "12.34", status: "pending",
      paymentMethod: "qr_code", splitEnabled: false,
    } as any);
    jest.spyOn(windcave, "createWindcaveSession").mockResolvedValue({ success: true, sessionId: SESSION, alreadyComplete: true } as any);
    const status = jest.spyOn(storage, "updateTransactionStatus");

    const response = await request(app).post(`/api/transactions/${sale.id}/pay`).send({});

    expect(response.status).toBe(503);
    expect(status).not.toHaveBeenCalled();
    expect(push.sendPushToMerchant).not.toHaveBeenCalled();
    expect(await storage.getTransaction(sale.id)).toMatchObject({ status: "pending", windcaveSessionId: SESSION, windcaveSessionState: "pending" });
  });
});

describe("a property or trades invoice", () => {
  const TENANT_ID = "22222222-2222-4222-8222-222222222222";
  const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

  function invoices(merchantId: number, over: { rent?: Record<string, unknown>; job?: Record<string, unknown> } = {}) {
    const rent: any = {
      id: "prop-inv-1", merchantId, tenantProfileId: TENANT_ID, token: crypto.randomBytes(20).toString("base64url"),
      status: "sent", amountCents: 200_000, splitEnabled: false, splitCount: null, splitPaidCount: 0, windcaveSessionId: SESSION,
      ...over.rent,
    };
    const job: any = {
      id: "job-inv-1", merchantId, clientProfileId: CLIENT_ID, token: crypto.randomBytes(20).toString("base64url"),
      status: "sent", amountCents: 90_000, splitEnabled: false, splitCount: null, splitPaidCount: 0, windcaveSessionId: SESSION,
      ...over.job,
    };
    jest.spyOn(storage, "getInvoiceRentRequestByToken").mockImplementation(async (t: string) => (t === rent.token ? rent : undefined));
    jest.spyOn(storage, "getJobInvoiceByToken").mockImplementation(async (t: string) => (t === job.token ? job : undefined));
    jest.spyOn(storage, "getInvoiceRentRequest").mockImplementation(async (id: string) => (id === rent.id ? rent : undefined));
    jest.spyOn(storage, "getJobInvoice").mockImplementation(async (id: string) => (id === job.id ? job : undefined));
    jest.spyOn(storage, "getInvoiceRentRequestByWindcaveSessionId").mockImplementation(async (id: string) => (id === rent.windcaveSessionId ? rent : undefined));
    jest.spyOn(storage, "getJobInvoiceByWindcaveSessionId").mockImplementation(async (id: string) => (id === job.windcaveSessionId ? job : undefined));
    jest.spyOn(storage, "getTenantProfile").mockResolvedValue({ id: TENANT_ID, firstName: "Tess", lastName: "Tenant", email: "tess@example.test" } as any);
    jest.spyOn(storage, "getClientProfile").mockResolvedValue({ id: CLIENT_ID, firstName: "Sam", lastName: "Smith", email: "sam@example.test" } as any);
    const writes = [
      jest.spyOn(storage, "updateInvoiceRentRequest").mockImplementation(async (_id: string, u: any) => ({ ...rent, ...u })),
      jest.spyOn(storage, "updateJobInvoice").mockImplementation(async (_id: string, u: any) => ({ ...job, ...u })),
      jest.spyOn(storage, "logTransactionEvent"),
      jest.spyOn(storage, "createJobEvent").mockResolvedValue({} as any),
    ];
    return { rent, job, writes };
  }

  const RENT_REFERENCE = "RENT-PROP-INV";
  const JOB_REFERENCE = "JOB-JOB-INV-";

  it.each([
    ["rent", "hosted-fields-complete"], ["rent", "googlepay-complete"],
    ["job", "hosted-fields-complete"], ["job", "googlepay-complete"],
  ] as const)("a %s invoice's %s asks with its amount and reference", async (kind, route) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const { rent, job } = invoices(owner.merchantId);
    const invoice = kind === "rent" ? rent : job;

    const response = await request(app).post(`/api/checkout/${invoice.token}/${route}`).send({ sessionId: SESSION });

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(SESSION, expected(kind === "rent"
      ? { amountCents: 200_000, merchantReference: RENT_REFERENCE }
      : { amountCents: 90_000, merchantReference: JOB_REFERENCE }));
  });

  it.each(["hosted-fields-complete", "googlepay-complete"])("%s settles nothing on an unverified outcome (it used to record a decline)", async (route) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const { rent, writes } = invoices(owner.merchantId);
    query.mockResolvedValue(UNVERIFIED);

    const response = await request(app).post(`/api/checkout/${rent.token}/${route}`).send({ sessionId: SESSION, googlePayToken: { signature: "synthetic" } });

    expect(response.status).toBe(503);
    for (const spy of writes) expect(spy).not.toHaveBeenCalled();
  });

  it("a split share is asked for with the amount recorded when its session opened (0030)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const { rent } = invoices(owner.merchantId, { rent: { splitEnabled: true, splitCount: 3, windcaveSessionId: null } });
    jest.spyOn(storage, "getInvoiceSplitSession").mockImplementation(async (id: string) =>
      (id === SESSION ? { sessionId: SESSION, rentInvoiceId: rent.id, jobInvoiceId: null, amountCents: 66_668 } : undefined) as any);

    await request(app).post(`/api/checkout/${rent.token}/hosted-fields-complete`).send({ sessionId: SESSION });

    expect(query).toHaveBeenCalledWith(SESSION, expected({ amountCents: 66_668, merchantReference: RENT_REFERENCE }));
  });

  it("the checkout callback asks with the invoice's expected values", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const { job } = invoices(owner.merchantId);

    const response = await request(app).get("/api/checkout/callback").query({ token: job.token });

    expect(response.headers.location).toBe(`/r/${job.token}`);
    expect(query).toHaveBeenCalledWith(SESSION, expected({ amountCents: 90_000, merchantReference: JOB_REFERENCE }));
  });

  it.each([
    ["rent", "/api/windcave/rent-notification"],
    ["job", "/api/windcave/trades-notification"],
  ] as const)("the %s notification asks with the invoice's expected values and settles nothing unverified", async (kind, path) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const { writes } = invoices(owner.merchantId);
    query.mockResolvedValue(UNVERIFIED);

    expect((await request(app).get(path).query({ sessionid: SESSION })).status).toBe(200);
    await settle();

    expect(query).toHaveBeenCalledWith(SESSION, expected(kind === "rent"
      ? { amountCents: 200_000, merchantReference: RENT_REFERENCE }
      : { amountCents: 90_000, merchantReference: JOB_REFERENCE }));
    for (const spy of writes) expect(spy).not.toHaveBeenCalled();
  });

  it("a duplicate-request reply when the session opens settles nothing (it used to settle from the reply)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    jest.spyOn(storage, "getMerchant").mockResolvedValue({ id: owner.merchantId, businessName: "Fixture" } as any);
    const { rent, writes } = invoices(owner.merchantId, { rent: { windcaveSessionId: null } });
    jest.spyOn(windcave, "createWindcaveSession").mockResolvedValue({ success: true, sessionId: SESSION, alreadyComplete: true } as any);

    const response = await request(app).post(`/api/checkout/${rent.token}/session`).send({});

    expect(response.status).toBe(503);
    // Only the single payment's session is pinned (so its notification can settle it).
    expect(writes[0].mock.calls).toEqual([[rent.id, { windcaveSessionId: SESSION }]]);
    for (const spy of writes.slice(1)) expect(spy).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
