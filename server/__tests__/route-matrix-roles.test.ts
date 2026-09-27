import "./support/test-env";

// Refund initiation checks its capability flag before the owner (503 first); with the flag on, the
// teammate's refusal is the one observed. A capability flag needs enforce mode (config.ts).
process.env.FEATURE_REFUND_INITIATION = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

import crypto from "crypto";
import request from "supertest";
import { ROUTE_MATRIX } from "../route-matrix";
import * as windcave from "../windcave";
import {
  VALID_PASSWORD,
  bearer,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  storage,
  storageSnapshot,
  type Principal,
} from "./support/http-harness";

/**
 * R1-T3 (plan C10): the refusals at a route's own role and tenant checks, with real requests. A
 * teammate is refused (403) on an owner-only route; another business's owner is refused (403) where the
 * request names the business, in its path or its body. Each refusal changes nothing. The owner's same
 * request is the positive control: it passes the role and tenant checks (no 401 or 403).
 *
 * Every request is well-formed, because P2.2 answers malformed input (400) before a missing role or
 * tenant (403); the bodies are the ones the C10 batch tests already sent.
 */

interface Ctx {
  app: any;
  owner: Principal;
  member: Principal;
  other: Principal;
  merchantId: number;
}
interface Req {
  method: "get" | "post" | "put" | "delete";
  path: string;
  body?: Record<string, unknown>;
  png?: boolean;
}

// A buffer that passes the logo route's PNG check (89 50 4E 47 0D 0A 1A 0A): the tests are about roles.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const DETAILS = { businessName: "Matrix Ltd", contactEmail: "matrix@harness.test", contactPhone: "021 555 0100", businessAddress: "1 Matrix Road" };
const ONBOARDING = {
  director: "Dee Rector", nzbn: "9429041234567", gstNumber: "123-456-789", websiteUrl: "https://matrix.example",
  estimatedAnnualTurnover: "$50k–$150k", businessDescription: "Coffee cart at the Saturday market",
};
const email = (who: string) => `${who}.${crypto.randomBytes(4).toString("hex")}@harness.test`;

async function invited(ctx: Ctx): Promise<number> {
  const res = await request(ctx.app).post("/api/team/invite").set(bearer(ctx.owner)).send({ email: email("invitee") });
  if (res.status >= 300) throw new Error(`fixture: invite failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.member.id;
}
async function board(ctx: Ctx): Promise<number> {
  const res = await request(ctx.app).post(`/api/merchants/${ctx.merchantId}/tapt-stones`).set(bearer(ctx.owner)).send({ name: "Front till" });
  if (res.status >= 300) throw new Error(`fixture: board failed ${res.status}`);
  return res.body.id;
}
async function item(ctx: Ctx): Promise<number> {
  const res = await request(ctx.app).post(`/api/merchants/${ctx.merchantId}/stock-items`).set(bearer(ctx.owner)).send({ name: "Seed", cost: "1.00" });
  if (res.status >= 300) throw new Error(`fixture: stock item failed ${res.status}`);
  return res.body.id;
}
async function paidSale(ctx: Ctx): Promise<number> {
  const sale = await storage.createTransaction({
    merchantId: ctx.merchantId, itemName: "Flat white", price: "5.50", status: "completed", paymentMethod: "cash", splitEnabled: false,
  } as any);
  return sale.id;
}

/** A request the route's allowed caller is served, per route. */
const RECIPES: Record<string, (ctx: Ctx) => Promise<Req> | Req> = {
  // The session's own business, owner-only.
  "PUT /api/subscription/plan": () => ({ method: "put", path: "/api/subscription/plan", body: { planId: "starter" } }),
  "POST /api/subscription/cancel": () => ({ method: "post", path: "/api/subscription/cancel", body: { reason: "Too dear" } }),
  "POST /api/subscription/resume": () => ({ method: "post", path: "/api/subscription/resume", body: {} }),
  "GET /api/team": () => ({ method: "get", path: "/api/team" }),
  "POST /api/team/invite": () => ({ method: "post", path: "/api/team/invite", body: { email: email("invitee") } }),
  "GET /api/subscription/billing-history": () => ({ method: "get", path: "/api/subscription/billing-history" }),
  "GET /api/billing/card": () => ({ method: "get", path: "/api/billing/card" }),
  "POST /api/billing/card/session": () => ({ method: "post", path: "/api/billing/card/session", body: {} }),
  "POST /api/billing/card/confirm": async (ctx) => {
    // A card setup session the owner's business opened (pending), so the owner's request is its own.
    await storage.getOrCreateSubscription(ctx.merchantId);
    await storage.bindSubscriptionCardSession(ctx.merchantId, "matrix-card-session");
    // The provider's answer for it: still pending (no live system is reached, R1-T1).
    jest.spyOn(windcave, "queryStoredCardSession").mockResolvedValue({ success: true, complete: false } as any);
    return { method: "post", path: "/api/billing/card/confirm", body: { sessionId: "matrix-card-session" } };
  },
  "DELETE /api/billing/card": () => ({ method: "delete", path: "/api/billing/card" }),
  "PUT /api/trades/gst-settings": () => ({ method: "put", path: "/api/trades/gst-settings", body: { gstRegistered: true } }),
  // One record of the business, owner-only.
  "POST /api/team/:userId/resend": async (ctx) => ({ method: "post", path: `/api/team/${await invited(ctx)}/resend` }),
  "DELETE /api/team/:userId/invite": async (ctx) => ({ method: "delete", path: `/api/team/${await invited(ctx)}/invite` }),
  "PUT /api/team/:userId/status": async (ctx) => ({ method: "put", path: `/api/team/${await invited(ctx)}/status`, body: { status: "disabled" } }),
  "DELETE /api/team/:userId": async (ctx) => ({ method: "delete", path: `/api/team/${await invited(ctx)}` }),
  "POST /api/transactions/:transactionId/refunds": async (ctx) => ({
    method: "post", path: `/api/transactions/${await paidSale(ctx)}/refunds`, body: { refundAmount: "1.00", refundReason: "Changed their mind" },
  }),
  // The business named in the path, owner-only.
  "POST /api/merchants/:id/onboarding": (ctx) => ({ method: "post", path: `/api/merchants/${ctx.merchantId}/onboarding`, body: ONBOARDING }),
  "PUT /api/merchants/:id/details": (ctx) => ({ method: "put", path: `/api/merchants/${ctx.merchantId}/details`, body: DETAILS }),
  "PUT /api/merchants/:id/theme": (ctx) => ({ method: "put", path: `/api/merchants/${ctx.merchantId}/theme`, body: { themeId: "midnight" } }),
  "PUT /api/merchants/:id/daily-goal": (ctx) => ({ method: "put", path: `/api/merchants/${ctx.merchantId}/daily-goal`, body: { dailyGoal: "750.00" } }),
  "PUT /api/merchants/:id": (ctx) => ({ method: "put", path: `/api/merchants/${ctx.merchantId}`, body: { businessName: "Renamed Ltd" } }),
  "POST /api/merchants/:id/logo": (ctx) => ({ method: "post", path: `/api/merchants/${ctx.merchantId}/logo`, png: true }),
  "DELETE /api/merchants/:id/logo": (ctx) => ({ method: "delete", path: `/api/merchants/${ctx.merchantId}/logo` }),
  // The business named in the path or body, served to any login of it.
  "GET /api/merchants/:id/profile": (ctx) => ({ method: "get", path: `/api/merchants/${ctx.merchantId}/profile` }),
  "GET /api/merchants/:merchantId/refunds": (ctx) => ({ method: "get", path: `/api/merchants/${ctx.merchantId}/refunds` }),
  "POST /api/transactions": (ctx) => ({ method: "post", path: "/api/transactions", body: { merchantId: ctx.merchantId, itemName: "Flat white", price: "5.50" } }),
  "POST /api/transactions/cash-sale": (ctx) => ({
    method: "post", path: "/api/transactions/cash-sale", body: { merchantId: ctx.merchantId, itemName: "Flat white", price: "5.50" },
  }),
  "POST /api/transactions/tap-to-pay": (ctx) => ({ method: "post", path: "/api/transactions/tap-to-pay", body: { merchantId: ctx.merchantId, amount: "5.50" } }),
  "GET /api/merchants/:id/export/pdf": (ctx) => ({ method: "get", path: `/api/merchants/${ctx.merchantId}/export/pdf` }),
  "PUT /api/merchants/:id/change-password": (ctx) => ({
    method: "put", path: `/api/merchants/${ctx.merchantId}/change-password`,
    body: { currentPassword: VALID_PASSWORD, newPassword: "NewHarness456!", confirmPassword: "NewHarness456!" },
  }),
  "GET /api/merchants/:id/transactions": (ctx) => ({ method: "get", path: `/api/merchants/${ctx.merchantId}/transactions` }),
  "GET /api/merchants/:id/tapt-stones": (ctx) => ({ method: "get", path: `/api/merchants/${ctx.merchantId}/tapt-stones` }),
  "POST /api/merchants/:id/tapt-stones": (ctx) => ({ method: "post", path: `/api/merchants/${ctx.merchantId}/tapt-stones`, body: { name: "Back till" } }),
  "PUT /api/merchants/:merchantId/tapt-stones/:stoneId": async (ctx) => ({
    method: "put", path: `/api/merchants/${ctx.merchantId}/tapt-stones/${await board(ctx)}`, body: { name: "Renamed till" },
  }),
  "DELETE /api/merchants/:merchantId/tapt-stones/:stoneId": async (ctx) => ({
    method: "delete", path: `/api/merchants/${ctx.merchantId}/tapt-stones/${await board(ctx)}`,
  }),
  "GET /api/merchants/:merchantId/stock-items": (ctx) => ({ method: "get", path: `/api/merchants/${ctx.merchantId}/stock-items` }),
  "POST /api/merchants/:merchantId/stock-items": (ctx) => ({
    method: "post", path: `/api/merchants/${ctx.merchantId}/stock-items`, body: { name: "Scone", cost: "4.00" },
  }),
  "PUT /api/merchants/:merchantId/stock-items/:itemId": async (ctx) => ({
    method: "put", path: `/api/merchants/${ctx.merchantId}/stock-items/${await item(ctx)}`, body: { name: "Renamed", cost: "3.00" },
  }),
  "DELETE /api/merchants/:merchantId/stock-items/:itemId": async (ctx) => ({
    method: "delete", path: `/api/merchants/${ctx.merchantId}/stock-items/${await item(ctx)}`,
  }),
};

async function send(ctx: Ctx, who: Principal, req: Req) {
  let pending = request(ctx.app)[req.method](req.path).set(bearer(who));
  if (req.png) return pending.attach("logo", PNG, { filename: "logo.png", contentType: "image/png" });
  if (req.body) pending = pending.send(req.body);
  return pending;
}

/** The gated routes with a refusal at their own role or tenant check. */
const ROWS = Object.entries(ROUTE_MATRIX).filter(([, row]) => row.gate === "session" && (row.answers.member === 403 || row.answers["other-owner"] === 403));

beforeEach(() => {
  resetTestStorage();
});

afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — a teammate on an owner-only route, and another business's owner where the business is named", () => {
  it("has a request for every such route", () => {
    expect(ROWS.map(([key]) => key).sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it.each(ROWS)("%s", async (key, row) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const other = await createOwnerPrincipal();
    const ctx: Ctx = { app, owner, member, other, merchantId: owner.merchantId };
    const req = await RECIPES[key](ctx);

    for (const [caller, who] of [["other-owner", other], ["member", member]] as const) {
      const expected = row.answers[caller];
      if (typeof expected !== "number") continue;
      const before = storageSnapshot();
      const res = await send(ctx, who, req);
      expect({ caller, status: res.status }).toEqual({ caller, status: expected });
      expect({ caller, changed: storageSnapshot() !== before }).toEqual({ caller, changed: false });
    }

    // The positive control: the owner's same request passes the role and tenant checks.
    const served = await send(ctx, owner, req);
    expect({ caller: "owner", refused: [401, 403].includes(served.status), status: served.status })
      .toEqual({ caller: "owner", refused: false, status: served.status });
  });
});
