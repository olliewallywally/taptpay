import "./support/test-env";
import "./support/push-test-env";

import crypto from "crypto";
import request from "supertest";

// Each case starts its own app with three logins (the first start is the slow one).
jest.setTimeout(30_000);

// The print inbox's email is the one thing Send to Print does outside this server: it is caught here.
jest.mock("../email-service-multi", () => ({
  ...jest.requireActual("../email-service-multi"),
  sendBoardBuilderEmail: jest.fn(async () => true),
}));
import * as emailService from "../email-service-multi";
import { subscriptionCardSessionState } from "../storage";
import * as windcave from "../windcave";
import { TUTORIAL_PAGE_KEYS } from "@shared/tutorial";
import { bearer, resetTestStorage, storage, type Principal } from "./support/http-harness";
import {
  CARD,
  as,
  expectServed,
  familyRows,
  paidMonth,
  servedPairs,
  servedTo,
  type ServedCtx as Ctx,
  type ServedRecipe as Recipe,
  type ServedRequest as Req,
} from "./support/matrix-served";

/**
 * R1-T3 (plan C10): the allowed callers succeed — the account family (the session, the tutorials,
 * notifications, the plan, the team, the payment card, Send to Print, invoice documents). For every
 * route of the family and every caller the matrix answers "allowed" (the owner; a teammate where the
 * route's review admits one; the platform admin where it is admitted), a real request is served: the
 * route's success status, and what the success did or returned (its review's success DTO, the record
 * made or changed). The refusals of the same routes are route-matrix.test.ts (the gate) and
 * route-matrix-roles.test.ts (the role and the business).
 *
 * The provider is never reached (R1-T1): its answers for the card routes are stubbed.
 */

const sendBoardBuilderEmail = emailService.sendBoardBuilderEmail as unknown as jest.Mock;
const email = (who: string) => `${who}.${crypto.randomBytes(4).toString("hex")}@harness.test`;
const get = (path: string): Req => ({ method: "get", path });
const web = (name: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
  keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` },
});
const DEVICE = "matrix-device-0001";
const SWITCHES = { paymentReceived: false, dailyPayoutSummary: true, failedPaymentAlerts: false };

async function invited(ctx: Ctx): Promise<number> {
  const res = await as(ctx, ctx.owner).post("/api/team/invite", { email: email("invitee") });
  if (res.status !== 201) throw new Error(`fixture: invite failed ${res.status}`);
  return res.body.member.id;
}
async function board(ctx: Ctx): Promise<number> {
  const res = await as(ctx, ctx.owner).post(`/api/merchants/${ctx.merchantId}/tapt-stones`, { name: "Front till" });
  if (res.status !== 200) throw new Error(`fixture: board failed ${res.status}`);
  return res.body.id;
}
const PDF = Buffer.from("%PDF-1.4\n%matrix\n");
async function document(ctx: Ctx): Promise<string> {
  const res = await request(ctx.app).post("/api/property/invoices/document").set(bearer(ctx.owner))
    .attach("document", PDF, { filename: "bill.pdf", contentType: "application/pdf" });
  if (res.status >= 300) throw new Error(`fixture: upload failed ${res.status}`);
  return String(res.body.documentUrl).split("/").pop()!;
}
const pushStatus = async (ctx: Ctx, who: Principal) => (await as(ctx, who).get("/api/push/status")).body;
const signedIn = async (ctx: Ctx, who: Principal) => (await as(ctx, who).get("/api/auth/me")).status;
const teamIds = async (ctx: Ctx) => ((await as(ctx, ctx.owner).get("/api/team")).body.members as Array<{ id: number }>).map((m) => m.id);

/** Per route: a request each allowed caller is served, and what that success looks like. */
const RECIPES: Record<string, Recipe> = {
  // The session.
  "GET /api/auth/me": (ctx, who, caller) => ({
    req: get("/api/auth/me"), status: 200,
    check: async (res) => {
      if (caller === "platform-admin") {
        expect(res.body.user).toMatchObject({ email: who.user.email, role: "admin" });
        expect(res.body.user.merchantId || null).toBeNull();
      } else {
        const merchant = (await storage.getMerchant(ctx.merchantId))!;
        expect(res.body.user).toMatchObject({
          email: who.user.email, merchantId: ctx.merchantId, role: caller,
          onboardingCompleted: merchant.onboardingCompleted, merchantStatus: merchant.status,
        });
      }
    },
  }),
  // R1-T4 phase E: Log Out ends the session that signed the request in. The served callers sign in with
  // their token (until phase E3), which has no session here: served, and nothing is ended.
  "POST /api/auth/logout": (ctx, who) => ({
    req: { method: "post", path: "/api/auth/logout" }, status: 204,
    check: async (res) => {
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(await signedIn(ctx, who)).toBe(200);
    },
  }),
  "POST /api/auth/sign-out-everywhere": (ctx, who) => ({
    req: { method: "post", path: "/api/auth/sign-out-everywhere" }, status: 204,
    check: async () => {
      // Every session of this login has ended, this one's included; the other login's has not.
      expect(await signedIn(ctx, who)).toBe(401);
      expect(await signedIn(ctx, who === ctx.owner ? ctx.member : ctx.owner)).toBe(200);
    },
  }),
  // The tutorials.
  "GET /api/tutorial/state": () => ({
    req: get("/api/tutorial/state"), status: 200,
    check: (res) => expect(res.body).toEqual({
      generation: expect.any(Number), autoEnabled: expect.any(Boolean), pageCount: TUTORIAL_PAGE_KEYS.length, progress: {},
    }),
  }),
  "PATCH /api/tutorial/pages/:pageKey": async (ctx, who) => {
    const generation = (await storage.getMerchant(ctx.merchantId))!.tutorialGeneration;
    return {
      req: { method: "patch", path: "/api/tutorial/pages/retail-terminal", body: { generation, status: "started", lastStep: 2 } },
      status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ pageKey: "retail-terminal", status: "started", lastStep: 2 });
        const state = await as(ctx, who).get("/api/tutorial/state");
        expect(state.body.progress["retail-terminal"]).toMatchObject({ status: "started", lastStep: 2 });
      },
    };
  },
  "POST /api/tutorial/restart": async (ctx) => {
    const before = (await storage.getMerchant(ctx.merchantId))!.tutorialGeneration;
    return {
      req: { method: "post", path: "/api/tutorial/restart" }, status: 200,
      check: (res) => {
        expect(res.body).toEqual({ generation: before + 1, autoEnabled: true, pageCount: TUTORIAL_PAGE_KEYS.length, progress: {} });
      },
    };
  },
  // Notifications: each login's own devices and switches.
  "POST /api/push/subscribe": (ctx, who) => ({
    req: { method: "post", path: "/api/push/subscribe", body: { subscription: web("matrix") } }, status: 200,
    check: async (res) => {
      expect(res.body).toEqual({ success: true, preferences: expect.objectContaining({ paymentReceived: expect.any(Boolean) }) });
      expect(await pushStatus(ctx, who)).toMatchObject({ deviceCount: 1, webSubscribed: true });
    },
  }),
  "POST /api/push/unsubscribe": async (ctx, who) => {
    await as(ctx, who).post("/api/push/subscribe", { subscription: web("matrix") });
    return {
      req: { method: "post", path: "/api/push/unsubscribe", body: { endpoint: web("matrix").endpoint } }, status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ success: true });
        expect(await pushStatus(ctx, who)).toMatchObject({ deviceCount: 0, webSubscribed: false });
      },
    };
  },
  "POST /api/push/native-subscribe": (ctx, who) => ({
    req: { method: "post", path: "/api/push/native-subscribe", body: { deviceToken: DEVICE } }, status: 200,
    check: async (res) => {
      expect(res.body).toEqual({ success: true, preferences: expect.objectContaining({ paymentReceived: expect.any(Boolean) }) });
      expect(await pushStatus(ctx, who)).toMatchObject({ deviceCount: 1, nativeSubscribed: true });
    },
  }),
  "POST /api/push/native-unsubscribe": async (ctx, who) => {
    await as(ctx, who).post("/api/push/native-subscribe", { deviceToken: DEVICE });
    return {
      req: { method: "post", path: "/api/push/native-unsubscribe", body: { deviceToken: DEVICE } }, status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ success: true });
        expect(await pushStatus(ctx, who)).toMatchObject({ deviceCount: 0, nativeSubscribed: false });
      },
    };
  },
  "GET /api/push/status": async (ctx, who) => {
    await as(ctx, who).post("/api/push/subscribe", { subscription: web("matrix") });
    return {
      req: get("/api/push/status"), status: 200,
      check: (res) => expect(res.body).toEqual({
        subscribed: true, deviceCount: 1, webSubscribed: true, nativeSubscribed: false,
        preferences: expect.objectContaining({ paymentReceived: expect.any(Boolean) }),
      }),
    };
  },
  "GET /api/push/preferences": async (ctx, who) => {
    await as(ctx, who).post("/api/push/subscribe", { subscription: web("matrix") });
    await as(ctx, who).put("/api/push/preferences", SWITCHES);
    return { req: get("/api/push/preferences"), status: 200, check: (res) => expect(res.body).toEqual({ preferences: SWITCHES }) };
  },
  "PUT /api/push/preferences": async (ctx, who) => {
    await as(ctx, who).post("/api/push/subscribe", { subscription: web("matrix") });
    return {
      req: { method: "put", path: "/api/push/preferences", body: SWITCHES }, status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ preferences: SWITCHES });
        expect((await as(ctx, who).get("/api/push/preferences")).body).toEqual({ preferences: SWITCHES });
      },
    };
  },
  // The plan.
  "GET /api/subscription": async (ctx, _who, caller) => {
    await paidMonth(ctx);
    return {
      req: get("/api/subscription"), status: 200,
      check: (res) => {
        expect(res.body.plans.map((plan: { id: string }) => plan.id)).toEqual(["solo", "team", "crew"]);
        expect(res.body.subscription).toMatchObject({ planId: "team", status: "active", seatsInUse: 2 });
        // The card is the owner's to see.
        expect(res.body.subscription.card).toEqual(caller === "owner" ? { brand: CARD.brand, last4: CARD.last4, expiry: CARD.expiry } : null);
      },
    };
  },
  "PUT /api/subscription/plan": () => ({
    // Nothing paid yet (a new business), so the move is free and immediate.
    req: { method: "put", path: "/api/subscription/plan", body: { planId: "crew" } }, status: 200,
    check: (res) => {
      expect(res.body).toMatchObject({ applied: "immediate", message: "Your new plan is active." });
      expect(res.body.subscription).toMatchObject({ planId: "crew" });
    },
  }),
  "POST /api/subscription/cancel": async (ctx) => {
    await paidMonth(ctx);
    return {
      req: { method: "post", path: "/api/subscription/cancel", body: { reason: "Too dear" } }, status: 200,
      check: (res) => {
        // A paid month runs out first.
        expect(res.body.subscription).toMatchObject({ cancelAtPeriodEnd: true, status: "active" });
        expect(res.body.message).toMatch(/^Your subscription stays active until /);
      },
    };
  },
  "POST /api/subscription/resume": async (ctx) => {
    await paidMonth(ctx);
    const cancelled = await storage.cancelSubscription(ctx.merchantId, "Too dear");
    if (!cancelled.ok) throw new Error("fixture: cancel failed");
    return {
      req: { method: "post", path: "/api/subscription/resume" }, status: 200,
      check: (res) => {
        expect(res.body.subscription).toMatchObject({ cancelAtPeriodEnd: false, status: "active" });
        expect(res.body.message).toBe("Your subscription will renew as normal.");
      },
    };
  },
  "GET /api/subscription/billing-history": async (ctx) => {
    await paidMonth(ctx);
    return {
      req: get("/api/subscription/billing-history"), status: 200,
      check: (res) => expect(res.body.history).toEqual([expect.objectContaining({ status: "succeeded" })]),
    };
  },
  // The team.
  "GET /api/team": (ctx) => ({
    req: get("/api/team"), status: 200,
    check: (res) => {
      expect(res.body).toMatchObject({ seatLimit: 5, seatsInUse: 2 });
      expect(res.body.members.map((m: { email: string }) => m.email)).toContain(ctx.member.user.email);
    },
  }),
  "POST /api/team/invite": () => {
    const address = email("invitee");
    return {
      req: { method: "post", path: "/api/team/invite", body: { email: address } }, status: 201,
      check: (res) => expect(res.body.member).toMatchObject({ email: address, role: "member", status: "invited" }),
    };
  },
  "POST /api/team/:userId/resend": async (ctx) => {
    const id = await invited(ctx);
    return {
      req: { method: "post", path: `/api/team/${id}/resend` }, status: 200,
      check: (res) => expect(res.body.member).toMatchObject({ role: "member", status: "invited" }),
    };
  },
  "DELETE /api/team/:userId/invite": async (ctx) => {
    const id = await invited(ctx);
    return {
      req: { method: "delete", path: `/api/team/${id}/invite` }, status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ message: "Invite revoked" });
        expect(await teamIds(ctx)).not.toContain(id);
      },
    };
  },
  "PUT /api/team/:userId/status": (ctx) => ({
    req: { method: "put", path: `/api/team/${ctx.member.user.id}/status`, body: { status: "disabled" } }, status: 200,
    check: async (res) => {
      expect(res.body.member).toMatchObject({ id: ctx.member.user.id, status: "disabled" });
      expect(await signedIn(ctx, ctx.member)).toBe(401);
    },
  }),
  "DELETE /api/team/:userId": (ctx) => ({
    req: { method: "delete", path: `/api/team/${ctx.member.user.id}` }, status: 200,
    check: async (res) => {
      expect(res.body).toEqual({ message: "Login removed" });
      expect(await signedIn(ctx, ctx.member)).toBe(401);
      expect(await teamIds(ctx)).not.toContain(ctx.member.user.id);
    },
  }),
  // The payment card (the provider's answers stubbed).
  "GET /api/billing/card": async (ctx) => {
    await paidMonth(ctx);
    return {
      req: get("/api/billing/card"), status: 200,
      check: (res) => expect(res.body).toEqual({ ready: true, card: { last4: CARD.last4, brand: CARD.brand, expiry: CARD.expiry } }),
    };
  },
  "POST /api/billing/card/session": (ctx) => {
    jest.spyOn(windcave, "isWindcaveConfigured").mockReturnValue(true);
    jest.spyOn(windcave, "createCardStorageSession")
      .mockResolvedValue({ success: true, sessionId: "matrix-card-session", hppUrl: "https://uat.windcave.com/hpp/matrix" } as any);
    return {
      req: { method: "post", path: "/api/billing/card/session" }, status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ sessionId: "matrix-card-session", redirectUrl: "https://uat.windcave.com/hpp/matrix" });
        // The session is bound to this business: only it can read the result back.
        expect(subscriptionCardSessionState(await storage.getSubscription(ctx.merchantId), "matrix-card-session")).toBe("pending");
      },
    };
  },
  "POST /api/billing/card/confirm": async (ctx) => {
    await storage.getOrCreateSubscription(ctx.merchantId);
    await storage.bindSubscriptionCardSession(ctx.merchantId, "matrix-card-session");
    jest.spyOn(windcave, "queryStoredCardSession")
      .mockResolvedValue({ success: true, complete: true, approved: true, card: CARD } as any);
    jest.spyOn(windcave, "chargeStoredCard")
      .mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "matrix-first-month" } as any);
    return {
      req: { method: "post", path: "/api/billing/card/confirm", body: { sessionId: "matrix-card-session" } }, status: 200,
      check: (res) => {
        expect(res.body).toMatchObject({
          success: true, ready: true, charged: true, card: { last4: CARD.last4, brand: CARD.brand, expiry: CARD.expiry },
        });
        expect(res.body.subscription).toMatchObject({ status: "active" });
      },
    };
  },
  "DELETE /api/billing/card": async (ctx) => {
    await paidMonth(ctx);
    return {
      req: { method: "delete", path: "/api/billing/card" }, status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ success: true });
        expect((await as(ctx, ctx.owner).get("/api/billing/card")).body.card).toBeNull();
      },
    };
  },
  // Send to Print (the print inbox's email caught).
  "POST /api/board-builder/submit": async (ctx) => {
    const stoneId = await board(ctx);
    const pdf = Buffer.alloc(2_000, 0x41);
    Buffer.from("%PDF-1.3\n").copy(pdf);
    return {
      req: {
        method: "post", path: "/api/board-builder/submit",
        body: { pdf: pdf.toString("base64"), stoneId, layout: "A5 Portrait", submitterName: "Jamie", submitterEmail: "jamie@harness.test" },
      },
      status: 200,
      check: (res) => {
        expect(res.body).toEqual({ message: "Board submitted successfully" });
        expect(sendBoardBuilderEmail).toHaveBeenCalledTimes(1);
      },
    };
  },
  // An invoice's document: the business's own, or any for the platform admin (audited).
  "GET /api/invoice-documents/:name": async (ctx) => {
    const name = await document(ctx);
    return {
      req: { ...get(`/api/invoice-documents/${name}`), binary: true }, status: 200,
      check: (res) => expect((res.body as Buffer).subarray(0, 8).toString()).toBe("%PDF-1.4"),
    };
  },
};

const ROWS = familyRows("account");
const SERVED = servedPairs(ROWS);

/**
 * Who besides the owner each route serves, stated by hand. The matrix derives it from the reviews; the
 * two must agree, so a review that stopped admitting a teammate (or started admitting one) cannot
 * quietly drop or add a case here.
 */
const TEAMMATE_SERVED = [
  "GET /api/auth/me", "POST /api/auth/logout", "POST /api/auth/sign-out-everywhere",
  "GET /api/tutorial/state", "PATCH /api/tutorial/pages/:pageKey", "POST /api/tutorial/restart",
  "POST /api/push/subscribe", "POST /api/push/unsubscribe", "POST /api/push/native-subscribe",
  "POST /api/push/native-unsubscribe", "GET /api/push/status", "GET /api/push/preferences", "PUT /api/push/preferences",
  "GET /api/subscription", "POST /api/board-builder/submit", "GET /api/invoice-documents/:name",
];
const ADMIN_SERVED = ["GET /api/auth/me", "GET /api/invoice-documents/:name"];

beforeEach(() => {
  resetTestStorage();
  sendBoardBuilderEmail.mockClear();
});

afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — the account family: every allowed caller is served", () => {
  it("has a request for every route of the family", () => {
    expect(ROWS.map(([key]) => key).sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it("serves the owner everywhere, and a teammate and the platform admin where stated", () => {
    expect(servedTo(ROWS, "owner")).toEqual(Object.keys(RECIPES).sort());
    expect(servedTo(ROWS, "member")).toEqual([...TEAMMATE_SERVED].sort());
    expect(servedTo(ROWS, "platform-admin")).toEqual([...ADMIN_SERVED].sort());
  });

  it.each(SERVED)("%s, by the %s", (key, caller) => expectServed(RECIPES, key, caller));
});
