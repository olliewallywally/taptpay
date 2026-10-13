import "./support/test-env";

jest.mock("../windcave", () => {
  const actual = jest.requireActual("../windcave");
  return {
    ...actual,
    isWindcaveConfigured: jest.fn(() => true),
    queryWindcaveSession: jest.fn(async () => ({ success: false, error: "pending" })),
    submitGooglePayToken: jest.fn(async () => ({ success: true })),
  };
});

import request from "supertest";
import * as windcave from "../windcave";
import { createOwnerPrincipal, createTestApp, resetTestStorage, signedIn, storage } from "./support/http-harness";
import { fakeProperty, seedProperty, INVOICE as P_INVOICE } from "./support/property-fake";
import { fakeTrades, seedTrades, INVOICE as T_INVOICE } from "./support/trades-fake";

/**
 * Owner decision OI-1 (2026-10-13, docs/decisions/2026-10-13-cancel-after-payment-attempt-owner-decision.md),
 * for invoices: voiding an invoice or marking it paid another way is allowed after someone has tried to pay.
 * A card payment already taken still refuses it; a payment window that may still be open is checked with
 * Windcave first; and a payment that completes after the change is recorded, never lost.
 */

jest.setTimeout(30_000);
const query = windcave.queryWindcaveSession as jest.Mock;
const submit = windcave.submitGooglePayToken as jest.Mock;

beforeEach(() => {
  resetTestStorage();
  query.mockReset().mockResolvedValue({ success: false, error: "pending" });
  submit.mockClear();
});
afterEach(() => jest.restoreAllMocks());

const VERTICALS = [
  {
    name: "property", base: "/api/property/invoices", id: P_INVOICE, reference: "RENT-",
    voidMethod: "voidInvoiceRentRequestForMerchant", markMethod: "markInvoiceRentRequestPaidExternalForMerchant",
    setup: (merchantId: number, invoice: object = {}) => { const fake = fakeProperty(); seedProperty(fake, merchantId, { invoice }); return fake; },
  },
  {
    name: "trades", base: "/api/trades/invoices", id: T_INVOICE, reference: "JOB-",
    voidMethod: "voidJobInvoiceForMerchant", markMethod: "markJobInvoicePaidExternalForMerchant",
    setup: (merchantId: number, invoice: object = {}) => { const fake = fakeTrades(); seedTrades(fake, merchantId, { invoice }); return fake; },
  },
] as const;
const ACTIONS = [["void", "voided"], ["mark-paid-external", "paid_external"]] as const;
const CASES = VERTICALS.flatMap(vertical => ACTIONS.map(([action, status]) => [vertical.name, action, status, vertical] as const));

async function owner() {
  const { app } = await createTestApp();
  return { app, owner: await createOwnerPrincipal() };
}
const openSessions = (sessions: Array<{ sessionId: string; amountCents: number }>) =>
  jest.spyOn(storage, "getOpenInvoiceSessionsForMerchant").mockResolvedValue(sessions);

describe.each(CASES)("%s %s after someone tried to pay", (_name, action, status, vertical) => {
  it("asks Windcave once about each open window, then goes ahead when it cannot say yet", async () => {
    const { app, owner: principal } = await owner();
    const fake = vertical.setup(principal.merchantId, { windcaveSessionId: "s-open" });
    openSessions([{ sessionId: "s-open", amountCents: 50_000 }]);

    const response = await request(app).post(`${vertical.base}/${vertical.id}/${action}`).set(signedIn(principal)).send({ externalPaymentReference: null });

    expect(response.status).toBe(200);
    expect(fake.invoices.get(vertical.id).status).toBe(status);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith("s-open", {
      sessionId: "s-open", amountCents: 50_000, currency: "NZD",
      merchantReference: vertical.reference + vertical.id.slice(0, 8).toUpperCase(),
      providerEnvironment: windcave.currentProviderEnvironment(),
    }, { singleAttempt: true });
  });

  it("refuses when Windcave says the invoice has just been paid, changing nothing", async () => {
    const { app, owner: principal } = await owner();
    const fake = vertical.setup(principal.merchantId, { windcaveSessionId: "s-open" });
    openSessions([{ sessionId: "s-open", amountCents: 50_000 }]);
    query.mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "paid-now" });

    const response = await request(app).post(`${vertical.base}/${vertical.id}/${action}`).set(signedIn(principal)).send({ externalPaymentReference: null });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "PAYMENT_COMPLETED", message: "This invoice has just been paid" });
    expect(fake.invoices.get(vertical.id).status).toBe("dispatched");
  });

  it("refuses a card payment already taken without asking anyone, changing nothing", async () => {
    const { app, owner: principal } = await owner();
    const fake = vertical.setup(principal.merchantId, { windcaveTransactionId: "taken" });
    const sessions = openSessions([]);

    const response = await request(app).post(`${vertical.base}/${vertical.id}/${action}`).set(signedIn(principal)).send({ externalPaymentReference: null });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "PAYMENT_CAPTURED", message: "A card payment has already been taken on this invoice" });
    expect(query).not.toHaveBeenCalled();
    expect(sessions).not.toHaveBeenCalled();
    expect(fake.writes).toEqual([]);
  });

  it("reports money taken that storage finds under its lock", async () => {
    const { app, owner: principal } = await owner();
    vertical.setup(principal.merchantId);
    openSessions([]);
    jest.spyOn(storage as any, action === "void" ? vertical.voidMethod : vertical.markMethod)
      .mockResolvedValue({ kind: "conflict", reason: "payment-captured" });

    const response = await request(app).post(`${vertical.base}/${vertical.id}/${action}`).set(signedIn(principal)).send({ externalPaymentReference: null });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("PAYMENT_CAPTURED");
  });
});

/** The notification answers Windcave at once and settles afterwards. */
async function settled<T>(read: () => T | undefined): Promise<T> {
  for (let i = 0; i < 200; i++) { const value = read(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error("not settled");
}

describe("a payment that completes after the invoice was closed is recorded, never lost", () => {
  it("rent: after a void, the invoice becomes paid and the late payment is flagged", async () => {
    const { app, owner: principal } = await owner();
    const fake = fakeProperty(); seedProperty(fake, principal.merchantId, { invoice: { status: "voided", windcaveSessionId: "s-late" } });
    jest.spyOn(storage, "getInvoiceRentRequestByWindcaveSessionId").mockResolvedValue(fake.invoices.get(P_INVOICE));
    query.mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "late-tx" });

    await request(app).post("/api/windcave/rent-notification?sessionId=s-late");

    const event = await settled(() => fake.events.find(e => e.eventType === "Payment_Received_After_Void"));
    expect(event.payload).toMatchObject({ windcaveTransactionId: "late-tx" });
    expect(fake.invoices.get(P_INVOICE)).toMatchObject({ status: "paid", windcaveTransactionId: "late-tx" });
  });

  it("rent: after marking it paid another way, the status stays and a refund is flagged as due", async () => {
    const { app, owner: principal } = await owner();
    const fake = fakeProperty(); seedProperty(fake, principal.merchantId, { invoice: { status: "paid_external", windcaveSessionId: "s-late" } });
    jest.spyOn(storage, "getInvoiceRentRequestByWindcaveSessionId").mockResolvedValue(fake.invoices.get(P_INVOICE));
    query.mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "late-tx" });

    await request(app).post("/api/windcave/rent-notification?sessionId=s-late");

    const event = await settled(() => fake.events.find(e => e.eventType === "Payment_Received_After_External"));
    expect(event.payload).toMatchObject({ windcaveTransactionId: "late-tx", refundDue: true });
    expect(fake.invoices.get(P_INVOICE)).toMatchObject({ status: "paid_external", windcaveTransactionId: "late-tx" });
  });

  it("trades: after a void, the invoice becomes paid and the late payment is flagged", async () => {
    const { app, owner: principal } = await owner();
    const fake = fakeTrades(); seedTrades(fake, principal.merchantId, { invoice: { status: "voided", windcaveSessionId: "s-late" } });
    jest.spyOn(storage, "getJobInvoiceByWindcaveSessionId").mockResolvedValue(fake.invoices.get(T_INVOICE));
    query.mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "late-tx" });

    await request(app).post("/api/windcave/trades-notification?sessionId=s-late");

    const event = await settled(() => fake.events.find(e => e.eventType === "payment_received_after_void"));
    expect(event.payload).toMatchObject({ windcaveTransactionId: "late-tx" });
    expect(fake.invoices.get(T_INVOICE)).toMatchObject({ status: "paid", windcaveTransactionId: "late-tx" });
  });

  it("a decline after the invoice was closed writes nothing", async () => {
    const { app, owner: principal } = await owner();
    const fake = fakeProperty(); seedProperty(fake, principal.merchantId, { invoice: { status: "voided", windcaveSessionId: "s-late" } });
    jest.spyOn(storage, "getInvoiceRentRequestByWindcaveSessionId").mockResolvedValue(fake.invoices.get(P_INVOICE));
    query.mockResolvedValue({ success: true, approved: false });

    await request(app).post("/api/windcave/rent-notification?sessionId=s-late");
    await settled(() => query.mock.calls.length > 0 || undefined);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(fake.events).toEqual([]);
    expect(fake.invoices.get(P_INVOICE).status).toBe("voided");
  });

  it("a split share paid after a void is recorded for a refund, with the true reason", async () => {
    const { app, owner: principal } = await owner();
    const fake = fakeProperty();
    seedProperty(fake, principal.merchantId, { invoice: { status: "voided", splitEnabled: true, splitCount: 2, splitPaidSessions: [] } });
    jest.spyOn(storage, "getInvoiceRentRequestByWindcaveSessionId").mockResolvedValue(undefined);
    jest.spyOn(storage, "getInvoiceSplitSession").mockResolvedValue({ windcaveSessionId: "s-share", rentInvoiceId: P_INVOICE, jobInvoiceId: null, amountCents: 25_000 } as any);
    query.mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "share-tx" });

    await request(app).post("/api/windcave/rent-notification?sessionId=s-share");

    const event = await settled(() => fake.events.find(e => e.eventType === "Split_Share_Unrecorded"));
    expect(event.payload).toMatchObject({ reason: "invoice voided", windcaveTransactionId: "share-tx" });
  });
});

describe("a closed invoice takes no new card payment", () => {
  it("Google Pay completion on a voided invoice is refused before the payer's token is submitted", async () => {
    const { app, owner: principal } = await owner();
    const fake = fakeProperty(); seedProperty(fake, principal.merchantId, { invoice: { status: "voided", windcaveSessionId: "s-gpay" } });
    jest.spyOn(storage, "getInvoiceRentRequestByToken").mockResolvedValue(fake.invoices.get(P_INVOICE));

    const response = await request(app).post("/api/checkout/checkout-token/googlepay-complete").send({ sessionId: "s-gpay", googlePayToken: { synthetic: true } });

    expect(response.status).toBe(409);
    expect(submit).not.toHaveBeenCalled();
  });
});
