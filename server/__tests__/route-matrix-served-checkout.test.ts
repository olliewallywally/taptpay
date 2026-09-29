import "./support/test-env";

// The provider is never reached (R1-T1): its sessions, their outcomes and Google Pay's submission are stubbed.
jest.mock("../windcave", () => {
  const actual = jest.requireActual("../windcave");
  let sessions = 0;
  return {
    ...actual,
    isWindcaveConfigured: () => true,
    createWindcaveSession: jest.fn(async () => {
      sessions += 1;
      return {
        success: true,
        sessionId: `matrix-session-${sessions}`,
        ajaxSubmitCardUrl: `https://uat.windcave.com/api/v1/sessions/matrix-${sessions}/card`,
        ajaxSubmitApplePayUrl: `https://uat.windcave.com/api/v1/sessions/matrix-${sessions}/applepay`,
        ajaxSubmitGooglePayUrl: `https://uat.windcave.com/api/v1/sessions/matrix-${sessions}/googlepay`,
      };
    }),
    queryWindcaveSession: jest.fn(async (sessionId: string) => ({
      success: true, approved: true, windcaveTransactionId: `provider-${sessionId}`,
    })),
    submitGooglePayToken: jest.fn(async () => ({ success: true, approved: true, windcaveTransactionId: "provider-google-pay" })),
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
import { resetTestStorage, storage } from "./support/http-harness";
import {
  expectOwnServed,
  familyRows,
  ownServedBy,
  ownServedPairs,
  type OwnServedCaller,
  type OwnServedRecipe,
  type ServedCtx,
  type ServedRequest,
} from "./support/matrix-served";
import { INVOICE, SCHEDULE, TENANT, fakeProperty, seedProperty, type PropertyFake } from "./support/property-fake";
import { CLIENT, INVOICE as JOB_INVOICE, QUOTE, fakeTrades, inDays, seedTrades, type TradesFake } from "./support/trades-fake";

// Each case starts its own app with three logins (the first start is the slow one).
jest.setTimeout(30_000);

/**
 * R1-T3 (plan C10): the allowed callers succeed — an invoice's payer and a quote's customer, routes with
 * their own gates. Each is served to the holder of the link it was sent: an invoice's checkout token
 * (rent or trades) or a quote's token. Each case sends a real request and checks the route's success
 * status and what the success did or returned: the invoice read, split or paid (the provider asked for
 * what is owed, the invoice pinned to its session, marked paid, the payer's GST invoice or paid invoice
 * sent), the quote read, viewed, accepted (its deposit invoice issued and sent). The refusals:
 * route-matrix-own-gates.test.ts.
 *
 * The in-memory storage keeps no property or trades data: the records live in the shared fakes
 * (support/property-fake.ts, support/trades-fake.ts), with the reads by link token added here. Sending
 * a trades invoice is stubbed as delivered (the delivery module is tested on its own).
 */

const ORIGIN = "https://harness.test";
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("matrix checkout document")]);

let property: PropertyFake;
let trades: TradesFake;
const createSession = windcave.createWindcaveSession as jest.Mock;
const submitGooglePay = windcave.submitGooglePayToken as jest.Mock;
const sendGstInvoices = gst.sendGstInvoices as unknown as jest.Mock;

// The per-token rate limiter lives for the whole app, so every case has a token of its own.
const newToken = () => crypto.randomBytes(20).toString("base64url");
const get = (path: string): ServedRequest => ({ method: "get", path });
const post = (path: string, body: Record<string, unknown> = {}): ServedRequest => ({ method: "post", path, body });
const rent = () => property.invoices.get(INVOICE);
const job = () => trades.invoices.get(JOB_INVOICE);

/** The fakes, with the reads by link token the checkout and the quote link make. */
function fakeRecords(ctx: ServedCtx) {
  property = fakeProperty();
  trades = fakeTrades();
  seedTrades(trades, ctx.merchantId, { quote: { token: newToken(), status: "sent" }, invoice: { token: newToken() } });
  seedProperty(property, ctx.merchantId, { invoice: { token: newToken(), scheduleId: SCHEDULE, splitEnabled: false, splitCount: null, splitPaidCount: 0 } });
  const find = (rows: Map<string, any>, token: string) => [...rows.values()].find((row) => row.token === token);
  jest.spyOn(storage, "getInvoiceRentRequestByToken").mockImplementation(async (token: string) => find(property.invoices, token));
  jest.spyOn(storage, "getJobInvoiceByToken").mockImplementation(async (token: string) => find(trades.invoices, token));
  jest.spyOn(storage, "getQuoteByToken").mockImplementation(async (token: string) => find(trades.quotes, token));
  jest.spyOn(storage, "updateQuote").mockImplementation(async (id: string, updates: any) => Object.assign(trades.quotes.get(id), updates));
  jest.spyOn(storage, "getJobInvoicesByQuote").mockImplementation(async (quoteId: string) =>
    [...trades.invoices.values()].filter((row) => row.quoteId === quoteId));
}

/** A trades invoice whose payer has opened a session on the checkout page (the provider's addresses cached). */
async function jobInPayment(ctx: ServedCtx) {
  const token = job().token;
  const opened = await request(ctx.app).post(`/api/checkout/${token}/session`).send({});
  if (opened.status !== 200) throw new Error(`fixture: session failed ${opened.status}`);
  return { token, sessionId: opened.body.sessionId as string };
}

const RECIPES: Record<string, OwnServedRecipe> = {
  // ── An invoice's checkout (rent here; the trades invoice pays by Google Pay below) ──
  "GET /api/checkout/resolve/:token": (ctx) => {
    fakeRecords(ctx);
    return {
      req: get(`/api/checkout/resolve/${rent().token}`), status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({
          vertical: "property", invoiceId: INVOICE, amountCents: 50_000, status: "dispatched", merchantId: ctx.merchantId,
          merchantName: "Harness Merchant Ltd", tenantName: "Tess Tenant", propertyAddress: "1 Test Road", kind: "rent",
          frequency: "weekly", quote: null, documentUrl: null, splitEnabled: false, splitCount: null, splitPaidCount: 0,
        });
        // The payer's contact details stay with the business.
        expect(JSON.stringify(res.body)).not.toContain("tess@example.test");
      },
    };
  },
  "GET /api/checkout/document/:token": async (ctx) => {
    fakeRecords(ctx);
    // Named as the upload route names an invoice document (upload-policy.ts).
    const name = `invoice-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.pdf`;
    await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", PDF, ctx.merchantId);
    Object.assign(rent(), { documentUrl: `/uploads/invoices/${name}`, documentName: "bill.pdf" });
    return {
      req: { ...get(`/api/checkout/document/${rent().token}`), binary: true }, status: 200,
      check: (res) => {
        expect(res.headers["content-type"]).toBe("application/pdf");
        expect(res.headers["cache-control"]).toBe("private, no-store");
        expect((res.body as Buffer).equals(PDF)).toBe(true);
      },
    };
  },
  "POST /api/checkout/:token/split": (ctx) => {
    fakeRecords(ctx);
    Object.assign(rent(), { splitEnabled: true });
    return {
      req: post(`/api/checkout/${rent().token}/split`, { count: 4 }), status: 200,
      check: (res) => {
        expect(res.body).toEqual({ splitCount: 4, splitPaidCount: 0, shareCents: 12_500 });
        expect(rent().splitCount).toBe(4);
      },
    };
  },
  "POST /api/checkout/:token/session": (ctx) => {
    fakeRecords(ctx);
    return {
      req: post(`/api/checkout/${rent().token}/session`), status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ sessionId: expect.stringMatching(/^matrix-session-/), amountStr: "500.00" });
        // The provider is asked for what is owed, with the rent's notification; the invoice is pinned to the session.
        const [, amount, , email, , , , urls] = createSession.mock.calls[0];
        expect([amount, email]).toEqual(["500.00", "tess@example.test"]);
        expect(urls).toEqual({
          callbackBase: `${ORIGIN}/api/checkout/callback?token=${rent().token}`,
          notificationUrl: `${ORIGIN}/api/windcave/rent-notification`,
        });
        expect(rent().windcaveSessionId).toBe(res.body.sessionId);
      },
    };
  },
  "POST /api/checkout/:token/hosted-fields-complete": (ctx) => {
    fakeRecords(ctx);
    Object.assign(rent(), { windcaveSessionId: "matrix-pinned-session" });
    return {
      req: post(`/api/checkout/${rent().token}/hosted-fields-complete`, { sessionId: "matrix-pinned-session" }), status: 200,
      check: (res) => {
        expect(res.body).toEqual({ approved: true, status: "paid", splitCount: null, splitPaidCount: 0 });
        expect(rent()).toMatchObject({ status: "paid", windcaveTransactionId: "provider-matrix-pinned-session" });
        expect(property.events.map((row) => row.eventType)).toContain("Payment_Received");
        // The tenant's GST invoice.
        expect(sendGstInvoices.mock.calls).toEqual([[expect.objectContaining({ recipients: ["tess@example.test"], amountCents: 50_000 })]]);
      },
    };
  },
  "POST /api/checkout/:token/googlepay-complete": async (ctx) => {
    fakeRecords(ctx);
    const paying = await jobInPayment(ctx);
    return {
      req: post(`/api/checkout/${paying.token}/googlepay-complete`, { sessionId: paying.sessionId, googlePayToken: { signature: "synthetic" } }),
      status: 200,
      check: () => {
        // The wallet's token goes to the provider's own submit address for this session, and nowhere else.
        expect(submitGooglePay.mock.calls).toEqual([[expect.stringMatching(/^https:\/\/uat\.windcave\.com\/.*\/googlepay$/), { signature: "synthetic" }]]);
        expect(job()).toMatchObject({ status: "paid", windcaveTransactionId: "provider-google-pay" });
        // The client is sent the paid invoice.
        expect(delivery.sendTradePaymentInvoice).toHaveBeenCalledWith(expect.objectContaining({ id: JOB_INVOICE, status: "paid" }));
      },
    };
  },
  "GET /api/checkout/callback": (ctx) => {
    fakeRecords(ctx);
    Object.assign(rent(), { windcaveSessionId: "matrix-pinned-session" });
    return {
      // The provider sends the browser back: the outcome is read from the provider, then the invoice's page shown.
      req: get(`/api/checkout/callback?token=${rent().token}&result=approved`), status: 302,
      check: (res) => {
        expect(res.headers.location).toBe(`/r/${rent().token}`);
        expect(rent()).toMatchObject({ status: "paid", windcaveTransactionId: "provider-matrix-pinned-session" });
      },
    };
  },
  // ── The customer's quote ──
  "GET /api/trades/quotes/token/:token": (ctx) => {
    fakeRecords(ctx);
    const quote = trades.quotes.get(QUOTE);
    return {
      req: get(`/api/trades/quotes/token/${quote.token}`), status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({
          quote: { id: QUOTE, totalCents: 100_000, status: "viewed" },
          client: { firstName: "Cal", lastName: "Client", siteAddress: "1 Site Road" },
          merchant: { businessName: "Harness Merchant Ltd" },
          invoice: null,
          previouslyViewed: false,
        });
        expect(Object.keys(res.body.client).sort()).toEqual(["firstName", "lastName", "siteAddress"]);
        // The first view is recorded.
        expect(quote).toMatchObject({ status: "viewed", viewedAt: expect.any(Date) });
        expect(trades.events.map((row) => row.eventType)).toEqual(["quote_viewed"]);
      },
    };
  },
  "GET /api/trades/quotes/token/:token/pdf": (ctx) => {
    fakeRecords(ctx);
    const quote = trades.quotes.get(QUOTE);
    return {
      req: { ...get(`/api/trades/quotes/token/${quote.token}/pdf`), binary: true }, status: 200,
      check: (res) => {
        expect(res.headers["content-type"]).toBe("application/pdf");
        expect(res.headers["content-disposition"]).toBe(`attachment; filename="quote-harness-merchant-ltd-${String(quote.token).slice(0, 8).toUpperCase()}.pdf"`);
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
      },
    };
  },
  "POST /api/trades/quotes/token/:token/respond": (ctx) => {
    fakeRecords(ctx);
    const quote = trades.quotes.get(QUOTE);
    Object.assign(quote, { validUntil: inDays(14) });
    return {
      req: post(`/api/trades/quotes/token/${quote.token}/respond`, { accept: true }), status: 200,
      check: (res) => {
        // Accepted: the 20% deposit invoice is issued for the quote's client and sent, and the customer taken to pay it.
        const deposit = [...trades.invoices.values()].find((row) => row.quoteId === QUOTE)!;
        expect(deposit).toMatchObject({ kind: "deposit", amountCents: 20_000, clientProfileId: CLIENT, merchantId: ctx.merchantId });
        expect(res.body).toMatchObject({
          quote: { id: QUOTE, status: "accepted" }, depositInvoice: { kind: "deposit", amountCents: 20_000 },
          paymentUrl: `${ORIGIN}/r/${deposit.token}`, delivered: true,
        });
        expect(quote).toMatchObject({ status: "accepted", acceptedAt: expect.any(Date) });
        expect(trades.events.map((row) => row.eventType)).toEqual(["quote_accepted"]);
        expect(delivery.resendTradeInvoice).toHaveBeenCalledWith(deposit.id, ORIGIN);
      },
    };
  },
};

const ROWS = familyRows("checkout");
const SERVED = ownServedPairs(ROWS);

/**
 * Who each route serves, stated by hand. The matrix derives it from the reviews; the two must agree, so
 * a review that stopped naming a caller (or started naming one) cannot quietly drop or add a case here.
 */
const LINK: OwnServedCaller[] = ["link-holder"];
const SERVED_BY: Record<string, OwnServedCaller[]> = Object.fromEntries(Object.keys(RECIPES).map((key) => [key, LINK]));

beforeEach(() => {
  resetTestStorage();
  createSession.mockClear();
  submitGooglePay.mockClear();
  sendGstInvoices.mockClear();
});
afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — an invoice's payer and a quote's customer (a link's holder): every allowed caller is served", () => {
  it("has a request for every route of the family", () => {
    expect(ROWS.map(([key]) => key).sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it("serves each route to the callers stated", () => {
    expect(ownServedBy(ROWS)).toEqual(SERVED_BY);
  });

  // A loop, not it.each: a matrix serving no one here is the first test's failure, not a file that cannot load.
  for (const [key, caller] of SERVED) it(`${key}, by the ${caller}`, () => expectOwnServed(RECIPES, key, caller));
});
