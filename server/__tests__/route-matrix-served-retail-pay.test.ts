import "./support/durable-payments-env";

import crypto from "crypto";
import QRCode from "qrcode";
import request from "supertest";
import * as windcave from "../windcave";
import { mintPaymentCredential, resetTestStorage, storage, createTestApp } from "./support/http-harness";
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

// Each case starts its own app with three logins (the first start is the slow one).
jest.setTimeout(30_000);

/**
 * R1-T3 (plan C10): the allowed callers succeed — a retail sale's customer, routes with their own gates.
 * A sale with its own payment link is served to the link's holder (its token, or the return state its
 * payment attempt was given); a board sale is served to anyone with its number (the board's customer:
 * numbers are guessable, the gap-12 memo's adjacent surface, R3). Each case sends a real request and
 * checks the route's success status and what the success did or returned: the sale read, split or paid,
 * its receipt, the provider asked for exactly what is owed. The refusals: route-matrix-own-gates.test.ts.
 */

const ORIGIN = "https://harness.test";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PUBLIC_BUSINESS_FIELDS = ["businessAddress", "businessName", "contactPhone", "customLogoUrl", "gstNumber", "nzbn", "themeId"];
/** A link's reply never carries a sale's, a business's or a board's number (the token is the whole address). */
const LINK_SALE_FIELDS = [
  "completedSplits", "createdAt", "isSplit", "itemName", "merchant", "paymentMethod", "price", "splitAmount", "splitEnabled",
  "status", "totalSplits",
];

import {PaymentAttemptService} from '../payment-attempt-service';
import {syntheticRetailRuntime} from './support/retail-runtime';
let port:ReturnType<typeof syntheticRetailRuntime>;
async function runtime(ctx:ServedCtx){port=syntheticRetailRuntime(storage,new PaymentAttemptService(storage));ctx.app=(await createTestApp({paymentRuntime:port.runtime})).app;}
let submitGooglePay:jest.SpyInstance;
const get = (path: string): ServedRequest => ({ method: "get", path });
const post = (path: string, body: Record<string, unknown> = {}): ServedRequest => ({ method: "post", path, body });
const download = (path: string, method: "get" | "post" = "get"): ServedRequest => ({ method, path, binary: true, ...(method === "post" ? { body: {} } : {}) });
const sale = async (id: number) => (await storage.getTransaction(id))!;
/** The keys of an object that a JSON reply holds (no undefined). */
const keysOf = (value: Record<string, unknown>) => Object.keys(value).filter((key) => value[key] !== undefined).sort();

/** A sale with its own payment link: only the link's hash is kept. */
async function linkSale(ctx: ServedCtx, fields: Record<string, unknown> = {}) {
  await runtime(ctx);
  const link = mintPaymentCredential();
  const made = await storage.createTransaction({
    merchantId: ctx.merchantId, itemName: "Flat white", price: "5.50", status: "pending", paymentMethod: "qr_code",
    splitEnabled: true, paymentTokenHash: link.tokenHash, ...fields,
  } as any);
  return { token: link.rawToken, id: made.id };
}

/** A board sale, as the terminal leaves one for the board's customer. */
async function boardSale(ctx: ServedCtx, fields: Record<string, unknown> = {}) {
  await runtime(ctx);
  const board = await storage.createNextTaptStone(ctx.merchantId, "Front till");
  const made = await storage.createTransaction({
    merchantId: ctx.merchantId, taptStoneId: board.id, itemName: "Toastie", price: "12.00", status: "pending",
    paymentMethod: "qr_code", splitEnabled: true, ...fields,
  } as any);
  return { id: made.id, stoneId: board.id };
}

/** A board sale whose customer has opened a provider session (the /pay step). */
async function boardSaleInPayment(ctx: ServedCtx) {
  const made = await boardSale(ctx);
  const intent={idempotencyKey:crypto.randomUUID(),shareIndex:0};
  const opened = await request(ctx.app).post(`/api/transactions/${made.id}/pay`).send(intent);
  if (opened.status !== 200) throw new Error(`fixture: pay failed ${opened.status}`);
  port.setObservation('approved');return { ...made,...intent, sessionId: opened.body.sessionId as string,returnState:opened.body.returnState as string };
}

/** A link sale whose customer has opened a provider session, with its payment attempt. */
async function linkSaleInPayment(ctx: ServedCtx) {
  const made = await linkSale(ctx, { splitEnabled: false });
  const idempotencyKey = crypto.randomUUID();
  const opened = await request(ctx.app).post(`/api/pay/t/${made.token}/session`).send({ idempotencyKey,shareIndex:0 });
  if (opened.status !== 200) throw new Error(`fixture: session failed ${opened.status}`);
  port.setObservation('approved');return { ...made, idempotencyKey, sessionId: opened.body.sessionId as string, returnState: opened.body.returnState as string };
}

/** The text each QR image encodes (the real image is still made). */
function qrTexts() {
  const toBuffer = jest.spyOn(QRCode, "toBuffer");
  return () => toBuffer.mock.calls.map((call) => call[0]);
}

function expectPng(res: request.Response) {
  expect((res.body as Buffer).subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
}

const RECIPES: Record<string, OwnServedRecipe> = {
  // ── A sale with its own payment link ──
  "GET /api/pay/t/:token": async (ctx) => {
    const made = await linkSale(ctx);
    return {
      req: get(`/api/pay/t/${made.token}`), status: 200,
      check: (res) => {
        expect(res.headers["cache-control"]).toBe("private, no-store");
        expect(keysOf(res.body)).toEqual(LINK_SALE_FIELDS);
        expect(res.body).toMatchObject({ itemName: "Flat white", price: "5.50", status: "pending", splitEnabled: true });
        // The business's public details, never its email or number.
        expect(res.body.merchant).toMatchObject({ businessName: "Harness Merchant Ltd" });
        expect(keysOf(res.body.merchant).every((key) => PUBLIC_BUSINESS_FIELDS.includes(key))).toBe(true);
      },
    };
  },
  "GET /api/pay/t/:token/qr": async (ctx) => {
    const made = await linkSale(ctx);
    const encoded = qrTexts();
    return {
      req: download(`/api/pay/t/${made.token}/qr`), status: 200,
      check: (res) => {
        expect(res.headers["cache-control"]).toBe("private, no-store");
        expectPng(res);
        expect(encoded()).toEqual([`${ORIGIN}/pay/t/${made.token}`]);
      },
    };
  },
  "POST /api/pay/t/:token/split": async (ctx) => {
    const made = await linkSale(ctx, { price: "10.00" });
    return {
      req: post(`/api/pay/t/${made.token}/split`, { totalSplits: 2 }), status: 200,
      check: async (res) => {
        expect(keysOf(res.body)).toEqual(LINK_SALE_FIELDS);
        expect(res.body).toMatchObject({ isSplit: true, totalSplits: 2, completedSplits: 0, splitAmount: "5.00" });
        expect(await sale(made.id)).toMatchObject({ isSplit: true, totalSplits: 2 });
        expect((await storage.getSplitPaymentsByTransaction(made.id)).map((share) => share.amount)).toEqual(["5.00", "5.00"]);
      },
    };
  },
  "GET /api/pay/t/:token/receipt": async (ctx) => {
    const made = await linkSale(ctx, { status: "completed", splitEnabled: false, paymentMethod: "card" });
    return {
      req: get(`/api/pay/t/${made.token}/receipt`), status: 200,
      check: (res) => {
        expect(keysOf(res.body)).toEqual(["merchant", "share", "transaction"]);
        expect(res.body.transaction).toMatchObject({ itemName: "Flat white", price: "5.50", status: "completed", paymentMethod: "card" });
        expect(keysOf(res.body.transaction)).not.toContain("id");
        expect(res.body.share).toBeNull();
      },
    };
  },
  "POST /api/pay/t/:token/receipt-pdf": async (ctx) => {
    const made = await linkSale(ctx, { status: "completed", splitEnabled: false });
    return {
      req: download(`/api/pay/t/${made.token}/receipt-pdf`, "post"), status: 200,
      check: (res) => {
        expect(res.headers["content-type"]).toBe("application/pdf");
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
      },
    };
  },
  "GET /api/pay/t/:token/receipt-qr": async (ctx) => {
    const made = await linkSale(ctx, { status: "completed", splitEnabled: false });
    const encoded = qrTexts();
    return {
      req: download(`/api/pay/t/${made.token}/receipt-qr`), status: 200,
      check: (res) => {
        expectPng(res);
        expect(encoded()).toEqual([`${ORIGIN}/receipt/t/${made.token}`]);
      },
    };
  },
  "POST /api/pay/t/:token/session": async (ctx) => {
    const made = await linkSale(ctx, { splitEnabled: false });
    const idempotencyKey = crypto.randomUUID();
    return {
      req: post(`/api/pay/t/${made.token}/session`, { idempotencyKey,shareIndex:0 }), status: 200,
      check: async (res) => {
        expect(res.body).toMatchObject({ sessionId: expect.stringMatching(/^synthetic-session-/), attemptState: "ready", shareIndex: 0 });
        // The provider is asked for the price, and told where to send the browser and its notification.
        expect(port.client.createSession.mock.calls[0][0]).toMatchObject({amount:'5.50',
          callbackBase:`${ORIGIN}/api/pay/return/${res.body.returnState}?source=hpp`,notificationUrl:`${ORIGIN}/api/windcave/notification`});
        expect((await sale(made.id)).status).toBe("pending");
      },
    };
  },
  "POST /api/pay/t/:token/hosted-fields-complete": async (ctx) => {
    const paying = await linkSaleInPayment(ctx);
    return {
      req: post(`/api/pay/t/${paying.token}/hosted-fields-complete`, {
        idempotencyKey: paying.idempotencyKey, sessionId: paying.sessionId, shareIndex: 0,
      }),
      status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ approved: true, outcome: "approved", receiptShare: null });
        expect(await sale(paying.id)).toMatchObject({
          status: "completed", paymentMethod: "card", windcaveTransactionId: `provider-${paying.sessionId}`,
        });
      },
    };
  },
  "POST /api/pay/t/:token/googlepay-complete": async (ctx) => {
    const paying = await linkSaleInPayment(ctx);
    const query=port.client.querySession.getMockImplementation()!;port.setObservation('pending');const pending=await query(paying.sessionId);port.setObservation('approved');port.client.querySession.mockResolvedValueOnce(pending);
    return {
      req: post(`/api/pay/t/${paying.token}/googlepay-complete`, {
        idempotencyKey: paying.idempotencyKey, sessionId: paying.sessionId, shareIndex: 0, googlePayToken: { signature: "synthetic" },
      }),
      status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ approved: true, outcome: "approved", receiptShare: null });
        // The wallet's token goes to the provider's own submit address for this attempt, and nowhere else.
        expect(submitGooglePay.mock.calls).toEqual([[expect.stringMatching(/^https:\/\/uat\.windcave\.com\/.*googlepay$/), { signature: "synthetic" }]]);
        // R2-T5: the verified session query settles it, never the submit's own reply.
        expect(await sale(paying.id)).toMatchObject({ status: "completed", paymentMethod: "card", windcaveTransactionId: expect.stringMatching(/^provider-synthetic-session-/) });
      },
    };
  },
  "GET /api/pay/return/:state": async (ctx) => {
    const paying = await linkSaleInPayment(ctx);
    return {
      // The provider sends the browser back: the outcome is settled from the provider, then the page shown.
      req: get(`/api/pay/return/${paying.returnState}?source=hpp`), status: 303,
      check: async (res) => {
        expect(res.headers.location).toBe(`/pay/return/${paying.returnState}`);
        expect((await sale(paying.id)).status).toBe("completed");
        // The page then reads the outcome, and no more.
        const read = await request(ctx.app).get(`/api/pay/return/${paying.returnState}`);
        expect(read.body).toEqual({ approved:true,outcome: "approved", receiptShare: null });
      },
    };
  },
  // ── A board sale, by its number ──
  "GET /api/transactions/:id": async (ctx) => {
    const made = await boardSale(ctx);
    return {
      req: get(`/api/transactions/${made.id}`), status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({ id: made.id, taptStoneId: made.stoneId, itemName: "Toastie", price: "12.00", status: "pending" });
        expect(keysOf(res.body.merchant)).toEqual(PUBLIC_BUSINESS_FIELDS.filter((key) => res.body.merchant[key] !== undefined));
        expect(res.body.merchant.businessName).toBe("Harness Merchant Ltd");
      },
    };
  },
  "POST /api/transactions/:id/split": async (ctx) => {
    const made = await boardSale(ctx);
    return {
      req: post(`/api/transactions/${made.id}/split`, { totalSplits: 3 }), status: 200,
      check: async (res) => {
        expect(res.body).toMatchObject({
          id: made.id, isSplit: true, totalSplits: 3, splitAmount: "4.00",
          paymentUrl: `${ORIGIN}/pay/${ctx.merchantId}/stone/${made.stoneId}`,
        });
        expect((await storage.getSplitPaymentsByTransaction(made.id)).map((share) => share.amount)).toEqual(["4.00", "4.00", "4.00"]);
      },
    };
  },
  "GET /api/split-payments/:id": async (ctx) => {
    const made = await boardSale(ctx, { price: "10.00" });
    await storage.createBillSplit(made.id, 2);
    const [first] = await storage.getSplitPaymentsByTransaction(made.id);
    return {
      req: get(`/api/split-payments/${first.id}`), status: 200,
      check: (res) => {
        expect(keysOf(res.body)).toEqual(["amount", "createdAt", "id", "paidAt", "paymentMethod", "splitIndex", "status", "transactionId"]);
        expect(res.body).toMatchObject({
          id: first.id, transactionId: made.id, splitIndex: first.splitIndex, amount: "5.00", status: "pending", paidAt: null,
        });
      },
    };
  },
  "POST /api/transactions/:id/pay": async (ctx) => {
    const made = await boardSale(ctx);
    return {
      req: post(`/api/transactions/${made.id}/pay`,{idempotencyKey:crypto.randomUUID(),shareIndex:0}), status:200,
      check:async res=>{
        expect(res.body).toMatchObject({sessionId:expect.stringMatching(/^synthetic-session-/),shareIndex:0,attemptState:'ready',returnState:expect.any(String)});
        expect(port.client.createSession.mock.calls[0][0]).toMatchObject({amount:'12.00'});
        expect(port.bindings.has(res.body.sessionId)).toBe(true);expect(port.bindings.get(res.body.sessionId).paymentAttemptId).toEqual(expect.any(String));
      },
    };
  },
  "POST /api/transactions/:id/hosted-fields-complete": async (ctx) => {
    const paying = await boardSaleInPayment(ctx);
    return {
      req: post(`/api/transactions/${paying.id}/hosted-fields-complete`, { idempotencyKey:paying.idempotencyKey,shareIndex:0,sessionId: paying.sessionId }), status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ approved:true,outcome:"approved",receiptShare:null });
        expect(await sale(paying.id)).toMatchObject({ status: "completed", paymentMethod: "card", windcaveTransactionId: `provider-${paying.sessionId}` });
      },
    };
  },
  "POST /api/transactions/:id/googlepay-complete": async (ctx) => {
    const paying = await boardSaleInPayment(ctx);
    const query=port.client.querySession.getMockImplementation()!;port.setObservation('pending');const pending=await query(paying.sessionId);port.setObservation('approved');port.client.querySession.mockResolvedValueOnce(pending);
    return {
      req: post(`/api/transactions/${paying.id}/googlepay-complete`, { idempotencyKey:paying.idempotencyKey,shareIndex:0,sessionId: paying.sessionId, googlePayToken: { signature: "synthetic" } }),
      status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ approved:true,outcome:"approved",receiptShare:null });
        expect(submitGooglePay.mock.calls).toEqual([[expect.stringMatching(/^https:\/\/uat\.windcave\.com\/.*googlepay$/), { signature: "synthetic" }]]);
        // R2-T5: the verified session query settles it, never the submit's own reply.
        expect(await sale(paying.id)).toMatchObject({ status: "completed", paymentMethod: "card", windcaveTransactionId: expect.stringMatching(/^provider-synthetic-session-/) });
      },
    };
  },
  "GET /api/windcave/callback": async (ctx) => {
    const paying = await boardSaleInPayment(ctx);
    return {
      // The provider sends the browser back: the outcome is read from the provider, and the receipt shown.
      req: get(`/api/windcave/callback?transactionId=${paying.id}&state=${paying.returnState}&result=approved`), status: 303,
      check: async (res) => {
        expect(res.headers.location).toBe(`/receipt/${paying.id}`);
        expect(await sale(paying.id)).toMatchObject({ status: "completed", windcaveTransactionId: `provider-${paying.sessionId}` });
      },
    };
  },
  "POST /api/transactions/:id/receipt-pdf": async (ctx) => {
    const made = await boardSale(ctx, { status: "completed" });
    return {
      req: download(`/api/transactions/${made.id}/receipt-pdf`, "post"), status: 200,
      check: (res) => {
        expect(res.headers["content-type"]).toBe("application/pdf");
        expect(res.headers["content-disposition"]).toMatch(new RegExp(`^attachment; filename=receipt-${made.id}-`));
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
      },
    };
  },
  "GET /api/transactions/:id/receipt-qr": async (ctx) => {
    const made = await boardSale(ctx, { status: "completed" });
    const encoded = qrTexts();
    return {
      req: download(`/api/transactions/${made.id}/receipt-qr`), status: 200,
      check: (res) => {
        expect(res.headers["cache-control"]).toBe("public, max-age=604800");
        expectPng(res);
        expect(encoded()).toEqual([`${ORIGIN}/receipt/${made.id}`]);
      },
    };
  },
};

const ROWS = familyRows("retail-pay");
const SERVED = ownServedPairs(ROWS);

/**
 * Who each route serves, stated by hand. The matrix derives it from the reviews; the two must agree, so
 * a review that stopped naming a caller (or started naming one) cannot quietly drop or add a case here.
 */
const LINK: OwnServedCaller[] = ["link-holder"];
const BY_NUMBER: OwnServedCaller[] = ["signed-out"];
const SERVED_BY: Record<string, OwnServedCaller[]> = {
  "GET /api/pay/t/:token": LINK,
  "GET /api/pay/t/:token/qr": LINK,
  "POST /api/pay/t/:token/split": LINK,
  "GET /api/pay/t/:token/receipt": LINK,
  "POST /api/pay/t/:token/receipt-pdf": LINK,
  "GET /api/pay/t/:token/receipt-qr": LINK,
  "POST /api/pay/t/:token/session": LINK,
  "POST /api/pay/t/:token/hosted-fields-complete": LINK,
  "POST /api/pay/t/:token/googlepay-complete": LINK,
  "GET /api/pay/return/:state": LINK,
  "GET /api/transactions/:id": BY_NUMBER,
  "POST /api/transactions/:id/split": BY_NUMBER,
  "GET /api/split-payments/:id": BY_NUMBER,
  "POST /api/transactions/:id/pay": BY_NUMBER,
  "POST /api/transactions/:id/hosted-fields-complete": BY_NUMBER,
  "POST /api/transactions/:id/googlepay-complete": BY_NUMBER,
  "GET /api/windcave/callback": LINK,
  "POST /api/transactions/:id/receipt-pdf": BY_NUMBER,
  "GET /api/transactions/:id/receipt-qr": BY_NUMBER,
};

beforeEach(() => {
  resetTestStorage();
  submitGooglePay=jest.spyOn(windcave,'submitGooglePayToken').mockResolvedValue({approved:true} as any);
});
afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — a retail sale's customer (a link's holder, a board's customer): every allowed caller is served", () => {
  it("has a request for every route of the family", () => {
    expect(ROWS.map(([key]) => key).sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it("serves each route to the callers stated", () => {
    expect(ownServedBy(ROWS)).toEqual(SERVED_BY);
  });

  // A loop, not it.each: a matrix serving no one here is the first test's failure, not a file that cannot load.
  for (const [key, caller] of SERVED) it(`${key}, by the ${caller}`, () => expectOwnServed(RECIPES, key, caller));
});
