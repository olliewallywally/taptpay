import "./support/test-env";

import crypto from "crypto";

// The verification email is the one thing resending does outside this server: it is caught here.
jest.mock("../email-service-multi", () => ({
  ...jest.requireActual("../email-service-multi"),
  sendMerchantVerificationEmail: jest.fn(async () => true),
}));
import * as emailService from "../email-service-multi";
import { resetTestStorage, storage } from "./support/http-harness";
import {
  expectServed,
  familyRows,
  servedPairs,
  servedTo,
  type ServedCtx,
  type ServedRecipe,
} from "./support/matrix-served";

// Each case starts its own app with three logins (the first start is the slow one).
jest.setTimeout(30_000);

/**
 * R1-T3 (plan C10): the allowed callers succeed — the admin area. Every route behind authenticateAdmin
 * serves the validated platform admin and no one else (the refusals: route-matrix.test.ts); each is
 * served here with a real request: the route's success status, and what the success did or returned.
 * The admin's sign-in, with its own gate, is the own-gate family's.
 */

const sendMerchantVerificationEmail = emailService.sendMerchantVerificationEmail as unknown as jest.Mock;

async function waitingApplication(state: { passwordHash?: string } = {}) {
  return storage.createMerchantWithSignup({
    name: "Waiting Owner", businessName: "Waiting Ltd", businessType: "retail",
    email: `waiting.${crypto.randomBytes(4).toString("hex")}@harness.test`,
    phone: "021 555 0100", address: "1 Waiting Street, Auckland",
    verificationToken: crypto.randomBytes(32).toString("hex"), ...state,
  } as any);
}
async function cashSale(ctx: ServedCtx) {
  return storage.createTransaction({
    merchantId: ctx.merchantId, itemName: "Flat white", price: "5.50", status: "completed", paymentMethod: "cash", splitEnabled: false,
  } as any);
}
const merchant = async (id: number) => (await storage.getMerchant(id))!;

const RECIPES: Record<string, ServedRecipe> = {
  "GET /api/admin/auth/me": (_ctx, who) => ({
    req: { method: "get", path: "/api/admin/auth/me" }, status: 200,
    check: (res) => expect(res.body).toEqual({ user: { id: who.user.id, email: who.user.email, merchantId: 0, role: "admin" } }),
  }),
  "GET /api/admin/request-origin": () => ({
    req: { method: "get", path: "/api/admin/request-origin" }, status: 200,
    check: (res) => {
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body).toMatchObject({ protocol: "http", forwardedFor: [], candidates: expect.any(Array) });
    },
  }),
  // The businesses.
  "GET /api/admin/merchants": (ctx) => ({
    req: { method: "get", path: "/api/admin/merchants" }, status: 200,
    check: (res) => expect(res.body.map((row: { id: number }) => row.id)).toContain(ctx.merchantId),
  }),
  "GET /api/admin/merchants/:id": (ctx) => ({
    req: { method: "get", path: `/api/admin/merchants/${ctx.merchantId}` }, status: 200,
    check: (res) => {
      expect(res.body).toMatchObject({ id: ctx.merchantId, email: ctx.owner.user.email });
      // Never the password hash, tokens or bank details.
      expect(Object.keys(res.body).filter((key) => /password|token|bank/i.test(key))).toEqual([]);
    },
  }),
  "GET /api/admin/merchants/:id/transactions": async (ctx) => {
    const sale = await cashSale(ctx);
    return {
      req: { method: "get", path: `/api/admin/merchants/${ctx.merchantId}/transactions` }, status: 200,
      check: (res) => expect(res.body).toEqual([expect.objectContaining({ id: sale.id, price: "5.50", status: "completed" })]),
    };
  },
  "POST /api/admin/merchants/:id/verify": async () => {
    const waiting = await waitingApplication({ passwordHash: "synthetic-password-hash" });
    return {
      req: { method: "post", path: `/api/admin/merchants/${waiting.id}/verify` }, status: 200,
      check: async (res) => {
        expect(res.body).toEqual({
          message: "Merchant verified successfully",
          merchant: { id: waiting.id, name: "Waiting Owner", businessName: "Waiting Ltd", email: waiting.email, status: "verified" },
        });
        expect((await merchant(waiting.id)).status).toBe("verified");
      },
    };
  },
  "POST /api/admin/merchants/:id/set-active": async (ctx) => {
    await storage.updateMerchantStatus(ctx.merchantId, "verified");
    return {
      req: { method: "post", path: `/api/admin/merchants/${ctx.merchantId}/set-active` }, status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ message: "Merchant activated successfully", merchant: { id: ctx.merchantId, status: "active" } });
        expect((await merchant(ctx.merchantId)).status).toBe("active");
      },
    };
  },
  "POST /api/admin/merchants/:id/activate": async () => {
    const waiting = await waitingApplication();
    return {
      req: { method: "post", path: `/api/admin/merchants/${waiting.id}/activate`, body: { password: "Password1!" } }, status: 200,
      check: async (res) => {
        expect(res.body.merchant).toMatchObject({ id: waiting.id, status: "verified" });
        expect(await merchant(waiting.id)).toMatchObject({ status: "verified", verificationToken: null });
      },
    };
  },
  "PATCH /api/admin/merchants/:id/windcave-merchant-id": (ctx) => ({
    req: { method: "patch", path: `/api/admin/merchants/${ctx.merchantId}/windcave-merchant-id`, body: { windcaveMerchantId: "MATRIX-MID-1" } },
    status: 200,
    check: async (res) => {
      expect(res.body).toEqual({ message: "Windcave Merchant ID updated" });
      expect((await merchant(ctx.merchantId)).windcaveMerchantId).toBe("MATRIX-MID-1");
    },
  }),
  "POST /api/admin/resend-verification": async () => {
    const waiting = await waitingApplication();
    return {
      req: { method: "post", path: "/api/admin/resend-verification", body: { email: waiting.email } }, status: 200,
      check: (res) => {
        expect(res.body).toEqual({
          message: "Verification email sent successfully",
          merchant: { id: waiting.id, name: "Waiting Owner", businessName: "Waiting Ltd", email: waiting.email, status: "pending" },
        });
        // The email goes to the application, with its own confirmation link.
        expect(sendMerchantVerificationEmail.mock.calls).toEqual([[waiting.email, waiting.verificationToken, "Waiting Ltd", expect.any(String)]]);
      },
    };
  },
  // The platform's figures.
  "GET /api/admin/analytics": async (ctx) => {
    await cashSale(ctx);
    return {
      req: { method: "get", path: "/api/admin/analytics" }, status: 200,
      check: (res) => {
        expect(res.body.totalMerchants).toBeGreaterThanOrEqual(1);
        expect(res.body.recentMerchants.map((row: { id: number }) => row.id)).toContain(ctx.merchantId);
      },
    };
  },
  "GET /api/admin/revenue-over-time": async (ctx) => {
    await cashSale(ctx);
    return {
      req: { method: "get", path: "/api/admin/revenue-over-time" }, status: 200,
      check: (res) => {
        // The last 7 days, today last: today's sale counted.
        expect(res.body).toHaveLength(7);
        expect(res.body[6]).toMatchObject({ revenue: 5.5, transactions: 1 });
      },
    };
  },
  "GET /api/admin/payment-method-breakdown": async (ctx) => {
    await cashSale(ctx);
    return {
      req: { method: "get", path: "/api/admin/payment-method-breakdown" }, status: 200,
      check: (res) => expect(res.body).toEqual([{ name: "Cash", value: 1, color: expect.any(String) }]),
    };
  },
  "GET /api/admin/ga4-detailed": () => ({
    req: { method: "get", path: "/api/admin/ga4-detailed" }, status: 200,
    // Google Analytics is not set up in tests.
    check: (res) => expect(res.body).toEqual({ configured: false }),
  }),
  "GET /api/admin/ga4-metrics": () => ({
    req: { method: "get", path: "/api/admin/ga4-metrics" }, status: 200,
    check: (res) => expect(res.body).toEqual({ configured: false }),
  }),
  "GET /api/admin/email-status": () => ({
    req: { method: "get", path: "/api/admin/email-status" }, status: 200,
    // Tests send no email: the status says so.
    check: (res) => expect(res.body).toMatchObject({ provider: "simulation", willDeliver: false, nodeEnv: "test", availableProviders: [] }),
  }),
};

const ROWS = familyRows("admin");
const SERVED = servedPairs(ROWS);

beforeEach(() => {
  resetTestStorage();
  sendMerchantVerificationEmail.mockClear();
});
afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — the admin area: the platform admin is served", () => {
  it("has a request for every route behind the admin gate", () => {
    expect(ROWS.map(([key]) => key).sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it("serves the platform admin everywhere, and no business login", () => {
    expect(servedTo(ROWS, "platform-admin")).toEqual(Object.keys(RECIPES).sort());
    expect(servedTo(ROWS, "owner")).toEqual([]);
    expect(servedTo(ROWS, "member")).toEqual([]);
  });

  it.each(SERVED)("%s, by the %s", (key, caller) => expectServed(RECIPES, key, caller));
});
