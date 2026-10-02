import "./support/test-env";
// The messaging provider's key is set, so the WhatsApp webhook believes a call that presents it.
import { HARNESS_EVOLUTION_KEY } from "./support/whatsapp-test-env";

// The ecommerce API is shut (404) unless its flag is on, which needs enforce mode (config.ts).
process.env.FEATURE_ECOMMERCE_API = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

import { observeRefusalEffects } from "./support/refusal-effects";
import request from "supertest";
import { ROUTE_MATRIX, type MatrixCaller } from "../route-matrix";
import {
  VALID_PASSWORD,
  createAdminPrincipal,
  createDisabledMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  mintPaymentCredential,
  resetTestStorage,
  signedIn,
  storage,
  storageSnapshot,
} from "./support/http-harness";
import { oldAccountToken, oldAdminToken, oldBearer } from "./support/old-account-token";
import { BUSINESS_COOKIE } from "./support/session-browser";

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
    const effects = observeRefusalEffects();
    const res = await send(app, CALLER_REQUEST[caller]!(key));
    expect(res.status).toBe(status);
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
    effects.restore();
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
    const effects = observeRefusalEffects();
    const res = await send(app, req);
    expect(res.status).toBe(status);
    if (req.message) expect(JSON.stringify(res.body)).toMatch(req.message);
    if (req.bodyEquals) expect(res.body).toEqual(req.bodyEquals);
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
    effects.restore();
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
    const effects = observeRefusalEffects();
    const theirs = await send(app, ask(linkSaleId));
    const missing = await send(app, ask(999_999));
    expect(theirs.status).toBe(status);
    expect(missing.status).toBe(status);
    expect(theirs.body).toEqual(missing.body);
    expect(theirs.headers.location).toEqual(missing.headers.location);
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
    effects.restore();
  });
});

describe("R1-T3 — the two reads a business also makes signed in check the sign-in and the business themselves", () => {
  // A board's page reads its open sale and its live updates with no sign-in. The business's own screens
  // read the same two routes signed in: with a session cookie and no board named, the handler runs the
  // sign-in gate (authenticateToken) and the business check (checkMerchantOwnership) itself.
  const READS: Record<string, string> = {
    "GET /api/merchants/:id/active-transaction": "/api/merchants/{id}/active-transaction",
    "GET /api/merchants/:id/events": "/api/merchants/{id}/events",
  };
  const REFUSED: MatrixCaller[] = ["invalid-session", "disabled-login", "suspended-business", "link-as-sign-in", "other-owner"];
  const CASES = Object.keys(READS).flatMap((key) => REFUSED.map((caller): [string, MatrixCaller] => [key, caller]));
  const callers = {} as Record<MatrixCaller, Record<string, string>>;
  let merchantId: number;
  let boardId: number;

  beforeAll(async () => {
    const owner = await createOwnerPrincipal();
    merchantId = owner.merchantId;
    callers.owner = signedIn(owner);
    callers["invalid-session"] = signedIn({ cookie: `${BUSINESS_COOKIE}=${owner.sessionId}.${"A".repeat(43)}`, csrf: owner.csrf });
    callers["disabled-login"] = signedIn(await createDisabledMemberPrincipal(owner.merchantId));
    const suspended = await createOwnerPrincipal();
    await storage.updateMerchant(suspended.merchantId, { status: "suspended" } as any);
    callers["suspended-business"] = signedIn(suspended);
    const link = mintPaymentCredential();
    await storage.createTransaction({
      merchantId: owner.merchantId, itemName: "Linked sale", price: "5.50", status: "pending",
      paymentMethod: "qr_code", splitEnabled: false, paymentTokenHash: link.tokenHash,
    } as any);
    callers["link-as-sign-in"] = { Cookie: `${BUSINESS_COOKIE}=${link.rawToken}`, ...oldBearer(link.rawToken) };
    callers["other-owner"] = signedIn(await createOwnerPrincipal());
    // The tokens the owner and the platform admin held before sessions (R1-T4 phase E3 retired them).
    callers["old-token"] = oldBearer(oldAccountToken(owner));
    callers["old-admin-token"] = oldBearer(oldAdminToken());
    callers["platform-admin"] = signedIn(await createAdminPrincipal());
    // A board of the business with a sale open on it: what a board's page, and anyone, may read.
    boardId = (await storage.createNextTaptStone(owner.merchantId, "Front till")).id;
    await storage.createTransaction({
      merchantId: owner.merchantId, taptStoneId: boardId, itemName: "Board sale", price: "7.00", status: "pending",
      paymentMethod: "qr_code", splitEnabled: false,
    } as any);
  });

  it("refuses a sign-in the server refuses (401) and another business's owner (403)", () => {
    expect(CASES.map(([key, caller]) => [key, caller, ROUTE_MATRIX[key].answers[caller]]))
      .toEqual(CASES.map(([key, caller]) => [key, caller, caller === "other-owner" ? 403 : 401]));
  });

  it.each(CASES)("%s refuses %s, and changes nothing", async (key, caller) => {
    const before = storageSnapshot();
    const effects = observeRefusalEffects();
    const res = await request(app).get(READS[key].replace("{id}", String(merchantId))).set(callers[caller]);
    expect(res.status).toBe(ROUTE_MATRIX[key].answers[caller]);
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
    effects.restore();
  });

  // R1-T4 phase E3: an Authorization header is not looked at. The account token the app once held,
  // correctly signed and unexpired, is no sign-in here either: its request is answered as anyone's is.
  const OLD_TOKENS: MatrixCaller[] = ["old-token", "old-admin-token"];
  const OLD_CASES = Object.keys(READS).flatMap((key) => OLD_TOKENS.map((caller): [string, MatrixCaller] => [key, caller]));

  it("records no answer of its own for an old token on these reads: it is anyone", () => {
    for (const [key, caller] of OLD_CASES) expect(ROUTE_MATRIX[key].answers[caller]).toBeUndefined();
  });

  it.each(OLD_CASES)("%s answers %s with no board as the retired no-board address (410), as for anyone, and changes nothing", async (key, caller) => {
    const address = READS[key].replace("{id}", String(merchantId));
    const before = storageSnapshot();
    const effects = observeRefusalEffects();
    const res = await request(app).get(address).set(callers[caller]);
    const anyone = await request(app).get(address);
    expect(res.status).toBe(410);
    expect(res.body).toEqual(anyone.body);
    expect(res.body.code).toBe("NO_BOARD_ADDRESS_RETIRED");
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
    effects.restore();
  });

  it.each(OLD_TOKENS)("the open sale of a board is read with %s as any customer reads it, not as the business does", async (caller) => {
    const address = `/api/merchants/${merchantId}/active-transaction?stoneId=${boardId}`;
    const customers = await request(app).get(address);
    const withOldToken = await request(app).get(address).set(callers[caller]);
    expect(customers.status).toBe(200);
    expect(withOldToken.status).toBe(200);
    expect(withOldToken.body).toEqual(customers.body);
    // The business's own view of the same sale (its terminal names no board) holds more than a customer's.
    const business = await request(app).get(`/api/merchants/${merchantId}/active-transaction`).set(callers.owner);
    expect(business.status).toBe(200);
    expect(Object.keys(business.body).length).toBeGreaterThan(Object.keys(customers.body).length);
    expect(Object.keys(withOldToken.body).sort()).not.toEqual(Object.keys(business.body).sort());
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

  let removedBoard: number;

  beforeAll(async () => {
    merchantId = (await createOwnerPrincipal()).merchantId;
    const other = await createOwnerPrincipal();
    theirBoard = (await storage.createNextTaptStone(other.merchantId, "Their till")).id;
    // A board the business has removed, with a sale left open on it.
    removedBoard = (await storage.createNextTaptStone(merchantId, "Old till")).id;
    await storage.createTransaction({
      merchantId, taptStoneId: removedBoard, itemName: "Left open", price: "4.00", status: "pending",
      paymentMethod: "qr_code", splitEnabled: false,
    } as any);
    await storage.deleteTaptStone(removedBoard);
  });

  it("has a request for every board route", () => {
    expect(refusalsOf("unknown-board").map(([key]) => key).sort()).toEqual(Object.keys(BOARD_ROUTES).sort());
  });

  it.each(Object.keys(BOARD_ROUTES))("%s answers another business's board 404, the same as a missing one, and changes nothing", async (key) => {
    const ask = (stoneId: number) => BOARD_ROUTES[key].replace("{m}", String(merchantId)).replace("{s}", String(stoneId));
    const before = storageSnapshot();
    const effects = observeRefusalEffects();
    const theirs = await request(app).get(ask(theirBoard));
    const missing = await request(app).get(ask(999_999));
    expect([theirs.status, missing.status]).toEqual([404, 404]);
    expect(theirs.body).toEqual(missing.body);
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
    effects.restore();
    expect(ROUTE_MATRIX[key].answers["unknown-board"]).toBe(404);
  });

  // Owner decision 2026-09-29: a removed board's page no longer shows the sale left open on it. The board's
  // QR image is still drawn for any of the business's boards (it only encodes the page's address).
  const IN_USE_ONLY = ["GET /api/merchants/:id/active-transaction", "GET /api/merchants/:id/events", "GET /api/merchants/:id/stone/:stoneId/brand"];

  it("has a request for every board route that serves only boards still in use", () => {
    expect(refusalsOf("removed-board").map(([key]) => key).sort()).toEqual([...IN_USE_ONLY].sort());
  });

  it.each(IN_USE_ONLY)("%s answers a removed board 404, the same as a missing one, and changes nothing", async (key) => {
    const ask = (stoneId: number) => BOARD_ROUTES[key].replace("{m}", String(merchantId)).replace("{s}", String(stoneId));
    const before = storageSnapshot();
    const effects = observeRefusalEffects();
    const removed = await request(app).get(ask(removedBoard));
    const missing = await request(app).get(ask(999_999));
    expect([removed.status, missing.status]).toEqual([404, 404]);
    expect(removed.body).toEqual(missing.body);
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
    effects.restore();
    expect(ROUTE_MATRIX[key].answers["removed-board"]).toBe(404);
  });
});

describe("R1-T3 — a provider's call naming what is no one's is acknowledged, and changes nothing", () => {
  // A provider's notification carries no credential: what it names (a session, a payment attempt's return
  // state, a message) selects the resource, and the provider is then asked for the truth. One that is no
  // one's is acknowledged at once (200 "OK", so the provider stops retrying) and nothing is done.
  const NO_ONES: Record<string, Request> = {
    "ALL /api/pay/notification/:state": { method: "get", path: "/api/pay/notification/no-ones-return-state" },
    "ALL /api/windcave/notification": { method: "get", path: "/api/windcave/notification?sessionid=no-ones-session" },
    "ALL /api/windcave/rent-notification": { method: "get", path: "/api/windcave/rent-notification?sessionid=no-ones-session" },
    "ALL /api/windcave/trades-notification": { method: "get", path: "/api/windcave/trades-notification?sessionid=no-ones-session" },
    "POST /api/webhooks/whatsapp": {
      method: "post", path: "/api/webhooks/whatsapp", headers: { apikey: HARNESS_EVOLUTION_KEY! },
      body: { event: "messages.update", data: { key: { id: "no-ones-message" }, update: { status: "READ" } } },
    },
  };
  const CASES = refusalsOf("unknown-reference");

  beforeAll(async () => {
    // A board sale waiting on someone's own session: a call naming another must leave it alone.
    const owner = await createOwnerPrincipal();
    const sale = await storage.createTransaction({
      merchantId: owner.merchantId, itemName: "Waiting sale", price: "8.00", status: "pending", paymentMethod: "qr_code", splitEnabled: false,
    } as any);
    await storage.updateTransactionWindcaveSession(sale.id, "someones-session", "pending", "someones-x-id");
  });

  it("has a request for every provider route that names its resource", () => {
    expect(CASES.map(([key]) => key).sort()).toEqual(Object.keys(NO_ONES).sort());
  });

  it.each(CASES)("%s acknowledges a call naming what is no one's with %s, and changes nothing", async (key, status) => {
    const before = storageSnapshot();
    const effects = observeRefusalEffects();
    const res = await send(app, NO_ONES[key]);
    expect(res.status).toBe(status);
    expect(res.text).toBe("OK");
    // The call is answered first and worked on after: let that work finish.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
    effects.restore();
  });
});

describe("R1-T3 — the WhatsApp webhook believes only the provider's key", () => {
  it("acknowledges a call with a wrong key (200) and changes nothing", async () => {
    expect(ROUTE_MATRIX["POST /api/webhooks/whatsapp"].answers["wrong-webhook-key"]).toBe(200);
    const before = storageSnapshot();
    const effects = observeRefusalEffects();
    const res = await send(app, {
      method: "post", path: "/api/webhooks/whatsapp", headers: { apikey: "not-the-providers-key" },
      body: { event: "messages.update", data: { key: { id: "no-ones-message" }, update: { status: "READ" } } },
    });
    expect(res.status).toBe(200);
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
    effects.restore();
  });
});
