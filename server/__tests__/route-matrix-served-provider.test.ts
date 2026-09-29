import "./support/test-env";
import { HARNESS_EVOLUTION_KEY } from "./support/whatsapp-test-env";

// The ecommerce API is shut (404) unless its flag is on, which needs enforce mode (config.ts); it makes
// sales with their own payment links, which are off (503) unless per-payment links are on.
process.env.FEATURE_ECOMMERCE_API = "true";
process.env.FEATURE_NEW_RETAIL_PAYMENTS = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

// The provider is never reached (R1-T1): its sessions, their outcomes and a stored card's charge are stubbed.
jest.mock("../windcave", () => {
  const actual = jest.requireActual("../windcave");
  let sessions = 0;
  return {
    ...actual,
    isWindcaveConfigured: () => true,
    createWindcaveSession: jest.fn(async () => {
      sessions += 1;
      return { success: true, sessionId: `matrix-session-${sessions}`, hppUrl: `https://uat.windcave.com/hpp/matrix-${sessions}` };
    }),
    queryWindcaveSession: jest.fn(async (sessionId: string) => ({
      success: true, approved: true, windcaveTransactionId: `provider-${sessionId}`,
    })),
    chargeStoredCard: jest.fn(async () => ({ success: true, approved: true, windcaveTransactionId: "provider-renewal" })),
  };
});
// A paid rent invoice's GST invoice is emailed: caught here.
jest.mock("../gst-invoice", () => ({
  ...jest.requireActual("../gst-invoice"),
  sendGstInvoices: jest.fn(async () => true),
}));

import crypto from "crypto";
import request from "supertest";
import * as delivery from "../trades-delivery";
import * as gst from "../gst-invoice";
import * as windcave from "../windcave";
import { cronHeader, mintPaymentCredential, resetTestStorage, storage, storageSnapshot } from "./support/http-harness";
import {
  expectOwnServed,
  ownServedBy,
  ownServedPairs,
  ownServedRows,
  paidMonth,
  type OwnServedCaller,
  type OwnServedRecipe,
  type ServedCtx,
  type ServedRequest,
} from "./support/matrix-served";
import { INVOICE, fakeProperty, seedProperty, type PropertyFake } from "./support/property-fake";
import { INVOICE as JOB_INVOICE, fakeTrades, seedTrades, type TradesFake } from "./support/trades-fake";

// Each case starts its own app with three logins (the first start is the slow one).
jest.setTimeout(30_000);

/**
 * R1-T3 (plan C10): the allowed callers succeed — the provider's calls, the scheduler and the ecommerce
 * API, routes with their own gates. Each is served to the caller its review names: the payment or
 * messaging provider (naming its own session, return state or message), the scheduler (with its
 * secret), an ecommerce key with the route's permission. Each case sends a real request and checks the
 * route's success status and what the success did or returned. A provider's call is answered at once
 * and worked on after, so its effect is awaited. The refusals: route-matrix-own-gates.test.ts.
 *
 * The provider is never reached (R1-T1). The in-memory storage keeps no property or trades data: those
 * records live in the shared fakes, with the reads by provider session and message added here.
 */

const ORIGIN = "https://harness.test";
const KEY = "matrix-ecommerce-key";
let property: PropertyFake;
let trades: TradesFake;
const sendGstInvoices = gst.sendGstInvoices as unknown as jest.Mock;
const chargeStoredCard = windcave.chargeStoredCard as jest.Mock;

const get = (path: string, headers?: Record<string, string>): ServedRequest => ({ method: "get", path, headers });
const post = (path: string, body: Record<string, unknown>, headers?: Record<string, string>): ServedRequest =>
  ({ method: "post", path, body, headers });
const sale = async (id: number) => (await storage.getTransaction(id))!;

/** A provider's call is answered first and worked on after: wait (briefly) for its effect. */
async function eventually(check: () => void | Promise<void>, timeoutMs = 2_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

/** The fakes, with the reads by provider session and by WhatsApp message the notifications make. */
function fakeRecords(ctx: ServedCtx) {
  property = fakeProperty();
  trades = fakeTrades();
  seedProperty(property, ctx.merchantId, { invoice: { token: crypto.randomBytes(20).toString("base64url"), splitEnabled: false } });
  seedTrades(trades, ctx.merchantId, { invoice: { token: crypto.randomBytes(20).toString("base64url"), splitEnabled: false } });
  const find = (rows: Map<string, any>, field: string, value: string) => [...rows.values()].find((row) => row[field] === value);
  jest.spyOn(storage, "getInvoiceRentRequestByWindcaveSessionId").mockImplementation(async (id: string) => find(property.invoices, "windcaveSessionId", id));
  jest.spyOn(storage, "getJobInvoiceByWindcaveSessionId").mockImplementation(async (id: string) => find(trades.invoices, "windcaveSessionId", id));
  jest.spyOn(storage, "getInvoiceRentRequestByWhatsappMessageId").mockImplementation(async (id: string) => find(property.invoices, "whatsappMessageId", id));
  jest.spyOn(storage, "getJobInvoiceByWhatsappMessageId").mockImplementation(async (id: string) => find(trades.invoices, "whatsappMessageId", id));
}

/** A live ecommerce key of the business, with the permissions given. */
function apiKey(ctx: ServedCtx, permissions: string[]) {
  jest.spyOn(storage, "getApiKeyByKey").mockImplementation(async (key: string) =>
    (key === KEY ? { id: 41, merchantId: ctx.merchantId, status: "active", permissions } : undefined) as any);
  jest.spyOn(storage, "updateApiKeyLastUsed").mockResolvedValue(undefined as any);
  return { Authorization: `Bearer ${KEY}` };
}

const RECIPES: Record<string, OwnServedRecipe> = {
  // ── The payment provider's notifications ──
  "ALL /api/pay/notification/:state": async (ctx) => {
    // A sale with its own link, its customer on the provider's page (the attempt's session opened).
    const link = mintPaymentCredential();
    const made = await storage.createTransaction({
      merchantId: ctx.merchantId, itemName: "Flat white", price: "5.50", status: "pending", paymentMethod: "qr_code",
      splitEnabled: false, paymentTokenHash: link.tokenHash,
    } as any);
    const opened = await request(ctx.app).post(`/api/pay/t/${link.rawToken}/session`).send({ idempotencyKey: crypto.randomUUID() });
    if (opened.status !== 200) throw new Error(`fixture: session failed ${opened.status}`);
    return {
      req: get(`/api/pay/notification/${opened.body.returnState}`), status: 200,
      check: async (res) => {
        expect(res.text).toBe("OK");
        // Settled from the provider's own answer for the attempt's session.
        await eventually(async () => expect(await sale(made.id)).toMatchObject({
          status: "completed", windcaveTransactionId: `provider-${opened.body.sessionId}`,
        }));
      },
    };
  },
  "ALL /api/windcave/notification": async (ctx) => {
    // A board sale, its customer on the provider's page.
    const board = await storage.createNextTaptStone(ctx.merchantId, "Front till");
    const made = await storage.createTransaction({
      merchantId: ctx.merchantId, taptStoneId: board.id, itemName: "Toastie", price: "12.00", status: "pending",
      paymentMethod: "qr_code", splitEnabled: false,
    } as any);
    const opened = await request(ctx.app).post(`/api/transactions/${made.id}/pay`).send({});
    if (opened.status !== 200) throw new Error(`fixture: pay failed ${opened.status}`);
    return {
      req: get(`/api/windcave/notification?sessionid=${opened.body.sessionId}`), status: 200,
      check: async (res) => {
        expect(res.text).toBe("OK");
        await eventually(async () => expect(await sale(made.id)).toMatchObject({
          status: "completed", windcaveSessionState: "approved", windcaveTransactionId: `provider-${opened.body.sessionId}`,
        }));
      },
    };
  },
  "ALL /api/billing/card/notification": () => {
    const before = storageSnapshot();
    return {
      // A nudge only: the card's outcome is read from the provider when the page confirms it.
      req: post("/api/billing/card/notification", { SessionId: "matrix-card-session" }), status: 200,
      check: (res) => {
        expect(res.text).toBe("OK");
        expect(storageSnapshot()).toBe(before);
      },
    };
  },
  "ALL /api/windcave/rent-notification": (ctx) => {
    fakeRecords(ctx);
    Object.assign(property.invoices.get(INVOICE), { windcaveSessionId: "matrix-rent-session" });
    return {
      req: get("/api/windcave/rent-notification?sessionid=matrix-rent-session"), status: 200,
      check: async (res) => {
        expect(res.text).toBe("OK");
        await eventually(() => expect(property.invoices.get(INVOICE)).toMatchObject({
          status: "paid", windcaveTransactionId: "provider-matrix-rent-session",
        }));
        // The tenant's GST invoice.
        await eventually(() => expect(sendGstInvoices.mock.calls).toEqual([[expect.objectContaining({ recipients: ["tess@example.test"] })]]));
      },
    };
  },
  "ALL /api/windcave/trades-notification": (ctx) => {
    fakeRecords(ctx);
    Object.assign(trades.invoices.get(JOB_INVOICE), { windcaveSessionId: "matrix-trades-session" });
    return {
      req: get("/api/windcave/trades-notification?sessionid=matrix-trades-session"), status: 200,
      check: async (res) => {
        expect(res.text).toBe("OK");
        await eventually(() => expect(trades.invoices.get(JOB_INVOICE)).toMatchObject({
          status: "paid", windcaveTransactionId: "provider-matrix-trades-session",
        }));
        // The client is sent the paid invoice.
        await eventually(() => expect(delivery.sendTradePaymentInvoice).toHaveBeenCalledWith(expect.objectContaining({ id: JOB_INVOICE, status: "paid" })));
      },
    };
  },
  // ── WhatsApp's delivery report, with the messaging provider's key ──
  "POST /api/webhooks/whatsapp": (ctx) => {
    fakeRecords(ctx);
    Object.assign(property.invoices.get(INVOICE), { whatsappMessageId: "matrix-wa-message", whatsappDeliveredAt: null });
    return {
      req: post("/api/webhooks/whatsapp",
        { event: "messages.update", data: { key: { id: "matrix-wa-message" }, update: { status: "DELIVERY_ACK" } } },
        { apikey: HARNESS_EVOLUTION_KEY! }),
      status: 200,
      check: async (res) => {
        expect(res.text).toBe("OK");
        // The invoice that sent the message is marked delivered, and the report is in its tenant's history.
        await eventually(() => expect(property.invoices.get(INVOICE).whatsappDeliveredAt).toEqual(expect.any(Date)));
        expect(property.events).toEqual([expect.objectContaining({
          invoiceId: INVOICE, eventType: "WhatsApp_Status", payload: { messageId: "matrix-wa-message", status: "DELIVERY_ACK" },
        })]);
      },
    };
  },
  // ── The scheduler ──
  "GET /api/internal/cron/status": () => ({
    req: get("/api/internal/cron/status", cronHeader()), status: 200,
    check: (res) => expect(res.body).toMatchObject({ configured: true, running: false, startedAt: null }),
  }),
  "POST /api/internal/cron": async (ctx) => {
    // A business whose paid month ended a minute ago (the in-memory row, moved back in time): the run
    // renews it on its stored card.
    await paidMonth(ctx);
    const subscription = await storage.getOrCreateSubscription(ctx.merchantId);
    const ended = new Date(Date.now() - 60_000);
    Object.assign(subscription, { currentPeriodEnd: ended, nextBillingDate: ended });
    return {
      req: post("/api/internal/cron", {}, cronHeader()), status: 200,
      check: async (res) => {
        expect(res.body).toMatchObject({ ok: true, failedPasses: [] });
        // The card on file is charged the plan's price, once, and the next month is paid.
        expect(chargeStoredCard.mock.calls).toEqual([[expect.any(String), "matrix-card", expect.stringMatching(/^\d+\.\d{2}$/), expect.any(String)]]);
        const renewed = (await storage.getSubscription(ctx.merchantId))!;
        expect(new Date(renewed.currentPeriodEnd!).getTime()).toBeGreaterThan(Date.now());
        // The run is reported to the status read.
        const status = await request(ctx.app).get("/api/internal/cron/status").set(cronHeader());
        expect(status.body.lastRun).toMatchObject({ ok: true, failedPasses: [] });
      },
    };
  },
  // ── The ecommerce API ──
  "POST /api/v1/transactions": async (ctx) => {
    await paidMonth(ctx);
    const headers = apiKey(ctx, ["create_transactions"]);
    return {
      req: post("/api/v1/transactions", { amount: "10.50", item_name: "Online order" }, headers), status: 200,
      check: async (res) => {
        expect(res.body).toEqual({
          id: expect.any(Number), amount: "10.50", currency: "NZD", item_name: "Online order", status: "pending",
          payment_url: expect.stringMatching(new RegExp(`^${ORIGIN}/pay/t/[A-Za-z0-9_-]{43}$`)),
          qr_code_url: expect.stringMatching(new RegExp(`^${ORIGIN}/api/pay/t/[A-Za-z0-9_-]{43}/qr$`)),
          created_at: expect.any(String),
        });
        // A sale of the key's business, with its own link: the link opens it.
        expect((await sale(res.body.id)).merchantId).toBe(ctx.merchantId);
        const token = String(res.body.payment_url).split("/pay/t/")[1];
        const opened = await request(ctx.app).get(`/api/pay/t/${token}`);
        expect(opened.body).toMatchObject({ itemName: "Online order", price: "10.50", status: "pending" });
      },
    };
  },
  "GET /api/v1/transactions/:id": async (ctx) => {
    const headers = apiKey(ctx, ["read_transactions"]);
    const made = await storage.createTransaction({
      merchantId: ctx.merchantId, itemName: "Online order", price: "10.50", status: "completed", paymentMethod: "api",
      splitEnabled: false,
    } as any);
    await storage.updateTransactionStatus(made.id, "completed", "provider-api-sale");
    return {
      req: get(`/api/v1/transactions/${made.id}`, headers), status: 200,
      check: (res) => expect(res.body).toEqual({
        id: made.id, amount: "10.50", currency: "NZD", item_name: "Online order", status: "completed",
        created_at: expect.any(String), windcave_transaction_id: "provider-api-sale",
      }),
    };
  },
};

const FAMILY = /^[A-Z]+ \/api\/(pay\/notification\/|windcave\/(notification|rent-notification|trades-notification)$|billing\/card\/notification$|webhooks\/|internal\/cron|v1\/)/;
const ROWS = ownServedRows(FAMILY);
const SERVED = ownServedPairs(ROWS);

/**
 * Who each route serves, stated by hand. The matrix derives it from the reviews; the two must agree, so
 * a review that stopped naming a caller (or started naming one) cannot quietly drop or add a case here.
 */
const PROVIDER: OwnServedCaller[] = ["provider"];
const SERVED_BY: Record<string, OwnServedCaller[]> = {
  "ALL /api/pay/notification/:state": PROVIDER,
  "ALL /api/windcave/notification": PROVIDER,
  "ALL /api/billing/card/notification": PROVIDER,
  "ALL /api/windcave/rent-notification": PROVIDER,
  "ALL /api/windcave/trades-notification": PROVIDER,
  "POST /api/webhooks/whatsapp": PROVIDER,
  "GET /api/internal/cron/status": ["scheduler"],
  "POST /api/internal/cron": ["scheduler"],
  "POST /api/v1/transactions": ["api-key"],
  "GET /api/v1/transactions/:id": ["api-key"],
};

beforeEach(() => {
  resetTestStorage();
  sendGstInvoices.mockClear();
  chargeStoredCard.mockClear();
});
afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — the provider's calls, the scheduler and the ecommerce API: every allowed caller is served", () => {
  it("has a request for every route of the family", () => {
    expect(ROWS.map(([key]) => key).sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it("serves each route to the callers stated", () => {
    expect(ownServedBy(ROWS)).toEqual(SERVED_BY);
  });

  // A loop, not it.each: a matrix serving no one here is the first test's failure, not a file that cannot load.
  for (const [key, caller] of SERVED) it(`${key}, by the ${caller}`, () => expectOwnServed(RECIPES, key, caller));
});
