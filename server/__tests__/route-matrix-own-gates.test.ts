import "./support/test-env";

// The ecommerce API is shut (404) unless its flag is on, which needs enforce mode (config.ts).
process.env.FEATURE_ECOMMERCE_API = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

import request from "supertest";
import { ROUTE_MATRIX, type MatrixCaller } from "../route-matrix";
import {
  VALID_PASSWORD,
  createDisabledMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  mintPaymentCredential,
  resetTestStorage,
  storage,
  storageSnapshot,
} from "./support/http-harness";

/**
 * R1-T3 (plan C10): the refusals of the routes with their own gates — the scheduler, the ecommerce
 * API, the links (payment, checkout, quote, reset, invite, the sign-in handoff), the numbered sales
 * and the WhatsApp webhook — each checked for the matrix's status and for nothing changed.
 *
 * The API key store is a spy here, as in api-v1-order-and-disclosure.test.ts: a live key's "last
 * used" time is recorded by the gate before its permission is checked (the one write a refused key
 * makes; the spy keeps it out of the snapshot).
 */

type Request = { method: "get" | "post" | "all"; path: string; body?: Record<string, unknown>; headers?: Record<string, string> };

const NO_ONES_LINK = "A".repeat(43); // shaped like a payment link's token, and no one's
const NO_ONES_TOKEN = "0".repeat(64); // shaped like a reset, confirmation or invite token, and no one's
const ATTEMPT = "4a3b2c1d-0000-4000-8000-00000000abcd"; // an idempotency key for a payment request
/** A well-formed completion: the body is checked before the link (400 for a malformed one). */
const COMPLETION = { idempotencyKey: ATTEMPT, sessionId: "no-ones-session", shareIndex: 0 };

/** How each link route is asked with a token, state or code that is no one's. */
const UNKNOWN_LINK: Record<string, Request & { message?: RegExp; bodyEquals?: unknown }> = {
  "POST /api/auth/google/session": { method: "post", path: "/api/auth/google/session", body: {} },
  "POST /api/auth/reset-password": {
    method: "post", path: "/api/auth/reset-password",
    body: { token: NO_ONES_TOKEN, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD },
    message: /Invalid or expired reset token/,
  },
  "GET /api/auth/validate-reset-token/:token": {
    method: "get", path: `/api/auth/validate-reset-token/${NO_ONES_TOKEN}`, bodyEquals: { valid: false },
  },
  "POST /api/auth/confirm-email": {
    method: "post", path: "/api/auth/confirm-email", body: { token: NO_ONES_TOKEN, password: VALID_PASSWORD },
    message: /Invalid or expired verification token/,
  },
  "POST /api/team/accept-invite": {
    method: "post", path: "/api/team/accept-invite",
    body: { token: NO_ONES_TOKEN, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD },
    message: /no longer valid/,
  },
  "GET /api/pay/t/:token": { method: "get", path: `/api/pay/t/${NO_ONES_LINK}` },
  "GET /api/pay/t/:token/qr": { method: "get", path: `/api/pay/t/${NO_ONES_LINK}/qr` },
  "POST /api/pay/t/:token/split": { method: "post", path: `/api/pay/t/${NO_ONES_LINK}/split`, body: { totalSplits: 2 } },
  "GET /api/pay/t/:token/receipt": { method: "get", path: `/api/pay/t/${NO_ONES_LINK}/receipt` },
  "POST /api/pay/t/:token/receipt-pdf": { method: "post", path: `/api/pay/t/${NO_ONES_LINK}/receipt-pdf`, body: {} },
  "GET /api/pay/t/:token/receipt-qr": { method: "get", path: `/api/pay/t/${NO_ONES_LINK}/receipt-qr` },
  "POST /api/pay/t/:token/session": { method: "post", path: `/api/pay/t/${NO_ONES_LINK}/session`, body: { idempotencyKey: ATTEMPT } },
  "POST /api/pay/t/:token/hosted-fields-complete": {
    method: "post", path: `/api/pay/t/${NO_ONES_LINK}/hosted-fields-complete`, body: COMPLETION,
  },
  "POST /api/pay/t/:token/googlepay-complete": {
    method: "post", path: `/api/pay/t/${NO_ONES_LINK}/googlepay-complete`, body: COMPLETION,
  },
  "GET /api/pay/return/:state": { method: "get", path: "/api/pay/return/no-ones-return-state" },
  "GET /api/checkout/resolve/:token": { method: "get", path: "/api/checkout/resolve/no-ones-checkout-token" },
  "GET /api/checkout/document/:token": { method: "get", path: "/api/checkout/document/no-ones-checkout-token" },
  "POST /api/checkout/:token/split": { method: "post", path: "/api/checkout/no-ones-checkout-token/split", body: { count: 2 } },
  "POST /api/checkout/:token/session": { method: "post", path: "/api/checkout/no-ones-checkout-token/session", body: {} },
  "POST /api/checkout/:token/hosted-fields-complete": {
    method: "post", path: "/api/checkout/no-ones-checkout-token/hosted-fields-complete", body: { sessionId: "no-ones-session" },
  },
  "POST /api/checkout/:token/googlepay-complete": {
    method: "post", path: "/api/checkout/no-ones-checkout-token/googlepay-complete", body: { sessionId: "no-ones-session", googlePayToken: "{}" },
  },
  "GET /api/checkout/callback": { method: "get", path: "/api/checkout/callback?token=no-ones-checkout-token" },
  "GET /api/trades/quotes/token/:token/pdf": { method: "get", path: "/api/trades/quotes/token/no-ones-quote-token/pdf" },
  "GET /api/trades/quotes/token/:token": { method: "get", path: "/api/trades/quotes/token/no-ones-quote-token" },
  "POST /api/trades/quotes/token/:token/respond": {
    method: "post", path: "/api/trades/quotes/token/no-ones-quote-token/respond", body: { accept: true },
  },
};

/** How each numbered route is asked for one sale; {id} is the sale's number. */
const NUMBERED: Record<string, Request> = {
  "POST /api/transactions/:id/split": { method: "post", path: "/api/transactions/{id}/split", body: { totalSplits: 2 } },
  "GET /api/split-payments/:id": { method: "get", path: "/api/split-payments/{id}" },
  "POST /api/transactions/:id/pay": { method: "post", path: "/api/transactions/{id}/pay", body: {} },
  "POST /api/transactions/:id/hosted-fields-complete": {
    method: "post", path: "/api/transactions/{id}/hosted-fields-complete", body: { sessionId: "no-ones-session" },
  },
  "POST /api/transactions/:id/googlepay-complete": {
    method: "post", path: "/api/transactions/{id}/googlepay-complete", body: { sessionId: "no-ones-session", googlePayToken: "{}" },
  },
  "GET /api/transactions/:id": { method: "get", path: "/api/transactions/{id}" },
  "POST /api/transactions/:id/receipt-pdf": { method: "post", path: "/api/transactions/{id}/receipt-pdf", body: {} },
  "GET /api/transactions/:id/receipt-qr": { method: "get", path: "/api/transactions/{id}/receipt-qr" },
  "GET /api/windcave/callback": { method: "get", path: "/api/windcave/callback?transactionId={id}&result=approved" },
};

const refusalsOf = (caller: MatrixCaller) =>
  Object.entries(ROUTE_MATRIX)
    .filter(([, row]) => typeof row.answers[caller] === "number")
    .map(([key, row]): [string, number] => [key, row.answers[caller] as number]);

async function send(app: any, req: Request) {
  const method = req.method === "all" ? "get" : req.method;
  let pending = request(app)[method](req.path);
  for (const [name, value] of Object.entries(req.headers ?? {})) pending = pending.set(name, value);
  if (req.body) pending = pending.send(req.body);
  return pending;
}

let app: any;
let linkSaleId: number;
let ownerMerchantId: number;

beforeAll(async () => {
  resetTestStorage();
  ({ app } = await createTestApp());
  const owner = await createOwnerPrincipal();
  const link = mintPaymentCredential();
  const sale = await storage.createTransaction({
    merchantId: owner.merchantId, itemName: "Linked sale", price: "5.50", status: "pending",
    paymentMethod: "qr_code", splitEnabled: false, paymentTokenHash: link.tokenHash,
  } as any);
  linkSaleId = sale.id;
  ownerMerchantId = owner.merchantId;
});

beforeEach(() => {
  jest.spyOn(storage, "getApiKeyByKey").mockImplementation(async (key: string) =>
    (key === "a-live-key-without-permissions" ? { id: 41, merchantId: ownerMerchantId, status: "active", permissions: [] } : undefined) as any);
  jest.spyOn(storage, "updateApiKeyLastUsed").mockResolvedValue(undefined as any);
});

afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — the scheduler's and the ecommerce API's gates", () => {
  const CALLER_REQUEST: Partial<Record<MatrixCaller, (key: string) => Request>> = {
    "no-secret": (key) => ({ method: key.startsWith("GET") ? "get" : "post", path: key.split(" ")[1] }),
    "wrong-secret": (key) => ({ method: key.startsWith("GET") ? "get" : "post", path: key.split(" ")[1], headers: { "x-cron-secret": "not-the-scheduler" } }),
    "no-key": (key) => ({ method: key.startsWith("GET") ? "get" : "post", path: key.split(" ")[1].replace(":id", "1"), body: key.startsWith("POST") ? {} : undefined }),
    "unknown-key": (key) => ({
      method: key.startsWith("GET") ? "get" : "post", path: key.split(" ")[1].replace(":id", "1"),
      headers: { Authorization: "Bearer a-key-nobody-was-issued" }, body: key.startsWith("POST") ? {} : undefined,
    }),
    "key-without-permission": (key) => ({
      method: key.startsWith("GET") ? "get" : "post", path: key.split(" ")[1].replace(":id", "1"),
      headers: { Authorization: "Bearer a-live-key-without-permissions" }, body: key.startsWith("POST") ? {} : undefined,
    }),
  };
  const CASES = (Object.keys(CALLER_REQUEST) as MatrixCaller[]).flatMap((caller) =>
    refusalsOf(caller).map(([key, status]): [string, MatrixCaller, number] => [key, caller, status]));

  it("covers the scheduler's two routes and the API's two", () => {
    expect(new Set(CASES.map(([key]) => key))).toEqual(new Set([
      "GET /api/internal/cron/status", "POST /api/internal/cron", "POST /api/v1/transactions", "GET /api/v1/transactions/:id",
    ]));
  });

  it.each(CASES)("%s refuses %s with %s, and changes nothing", async (key, caller, status) => {
    const before = storageSnapshot();
    const res = await send(app, CALLER_REQUEST[caller]!(key));
    expect(res.status).toBe(status);
    expect(storageSnapshot()).toBe(before);
  });
});

describe("R1-T3 — a link opens only its own resource: one that is no one's is refused", () => {
  const CASES = refusalsOf("unknown-link");

  it("has a request for every link route", () => {
    expect(CASES.map(([key]) => key).sort()).toEqual(Object.keys(UNKNOWN_LINK).sort());
  });

  it.each(CASES)("%s refuses a link that is no one's with %s, and changes nothing", async (key, status) => {
    const req = UNKNOWN_LINK[key];
    const before = storageSnapshot();
    const res = await send(app, req);
    expect(res.status).toBe(status);
    if (req.message) expect(JSON.stringify(res.body)).toMatch(req.message);
    if (req.bodyEquals) expect(res.body).toEqual(req.bodyEquals);
    expect(storageSnapshot()).toBe(before);
  });
});

describe("R1-T3 — a sale with its own link is answered by number like a missing one", () => {
  const CASES = refusalsOf("sale-with-its-own-link");

  it("has a request for every numbered route", () => {
    expect(CASES.map(([key]) => key).sort()).toEqual(Object.keys(NUMBERED).sort());
  });

  it.each(CASES)("%s answers a link's sale with %s, the same as a missing sale, and changes nothing", async (key, status) => {
    const ask = (id: number) => ({ ...NUMBERED[key], path: NUMBERED[key].path.replace("{id}", String(id)) });
    const before = storageSnapshot();
    const theirs = await send(app, ask(linkSaleId));
    const missing = await send(app, ask(999_999));
    expect(theirs.status).toBe(status);
    expect(missing.status).toBe(status);
    expect(theirs.body).toEqual(missing.body);
    expect(theirs.headers.location).toEqual(missing.headers.location);
    expect(storageSnapshot()).toBe(before);
  });
});

describe("R1-T3 — the two reads a business also makes signed in check the sign-in and the business themselves", () => {
  // A board's page reads its open sale and its live updates with no sign-in. The business's own screens
  // read the same two routes signed in: with an Authorization header the handler runs the sign-in gate
  // (authenticateToken) and the business check (checkMerchantOwnership) itself.
  const READS: Record<string, string> = {
    "GET /api/merchants/:id/active-transaction": "/api/merchants/{id}/active-transaction",
    "GET /api/merchants/:id/events": "/api/merchants/{id}/events",
  };
  const REFUSED: MatrixCaller[] = ["invalid-token", "disabled-login", "suspended-business", "link-as-sign-in", "other-owner"];
  const CASES = Object.keys(READS).flatMap((key) => REFUSED.map((caller): [string, MatrixCaller] => [key, caller]));
  const tokens = {} as Record<MatrixCaller, string>;
  let merchantId: number;

  beforeAll(async () => {
    const owner = await createOwnerPrincipal();
    merchantId = owner.merchantId;
    tokens["invalid-token"] = "not-a-real-token";
    tokens["disabled-login"] = (await createDisabledMemberPrincipal(owner.merchantId)).token;
    const suspended = await createOwnerPrincipal();
    await storage.updateMerchant(suspended.merchantId, { status: "suspended" } as any);
    tokens["suspended-business"] = suspended.token;
    const link = mintPaymentCredential();
    await storage.createTransaction({
      merchantId: owner.merchantId, itemName: "Linked sale", price: "5.50", status: "pending",
      paymentMethod: "qr_code", splitEnabled: false, paymentTokenHash: link.tokenHash,
    } as any);
    tokens["link-as-sign-in"] = link.rawToken;
    tokens["other-owner"] = (await createOwnerPrincipal()).token;
  });

  it("refuses a sign-in the server refuses (401) and another business's owner (403)", () => {
    expect(CASES.map(([key, caller]) => [key, caller, ROUTE_MATRIX[key].answers[caller]]))
      .toEqual(CASES.map(([key, caller]) => [key, caller, caller === "other-owner" ? 403 : 401]));
  });

  it.each(CASES)("%s refuses %s, and changes nothing", async (key, caller) => {
    const before = storageSnapshot();
    const res = await request(app).get(READS[key].replace("{id}", String(merchantId))).set("Authorization", `Bearer ${tokens[caller]}`);
    expect(res.status).toBe(ROUTE_MATRIX[key].answers[caller]);
    expect(storageSnapshot()).toBe(before);
  });
});

describe("R1-T3 — a board's public routes answer another business's board as a missing one", () => {
  // A board's page is public and names the business and the board. Another business's board and a board
  // that does not exist are answered alike: 404, P2.2's tenant-safe answer, with nothing changed.
  const BOARD_ROUTES: Record<string, string> = {
    "GET /api/merchants/:id/stone/:stoneId/qr": "/api/merchants/{m}/stone/{s}/qr",
    "GET /api/merchants/:id/stone/:stoneId/brand": "/api/merchants/{m}/stone/{s}/brand",
    "GET /api/merchants/:id/active-transaction": "/api/merchants/{m}/active-transaction?stoneId={s}",
    "GET /api/merchants/:id/events": "/api/merchants/{m}/events?stoneId={s}",
  };
  let merchantId: number;
  let theirBoard: number;

  beforeAll(async () => {
    merchantId = (await createOwnerPrincipal()).merchantId;
    const other = await createOwnerPrincipal();
    theirBoard = (await storage.createNextTaptStone(other.merchantId, "Their till")).id;
  });

  it("has a request for every board route", () => {
    expect(refusalsOf("unknown-board").map(([key]) => key).sort()).toEqual(Object.keys(BOARD_ROUTES).sort());
  });

  it.each(Object.keys(BOARD_ROUTES))("%s answers another business's board 404, the same as a missing one, and changes nothing", async (key) => {
    const ask = (stoneId: number) => BOARD_ROUTES[key].replace("{m}", String(merchantId)).replace("{s}", String(stoneId));
    const before = storageSnapshot();
    const theirs = await request(app).get(ask(theirBoard));
    const missing = await request(app).get(ask(999_999));
    expect([theirs.status, missing.status]).toEqual([404, 404]);
    expect(theirs.body).toEqual(missing.body);
    expect(storageSnapshot()).toBe(before);
    expect(ROUTE_MATRIX[key].answers["unknown-board"]).toBe(404);
  });
});

describe("R1-T3 — the WhatsApp webhook believes only the provider's key", () => {
  it("acknowledges a call with a wrong key (200) and changes nothing", async () => {
    expect(ROUTE_MATRIX["POST /api/webhooks/whatsapp"].answers["wrong-webhook-key"]).toBe(200);
    const before = storageSnapshot();
    const res = await send(app, {
      method: "post", path: "/api/webhooks/whatsapp", headers: { apikey: "not-the-providers-key" },
      body: { event: "messages.update", data: { key: { id: "no-ones-message" }, update: { status: "READ" } } },
    });
    expect(res.status).toBe(200);
    expect(storageSnapshot()).toBe(before);
  });
});
