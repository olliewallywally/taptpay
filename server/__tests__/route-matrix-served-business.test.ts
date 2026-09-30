import "./support/test-env";

// The capabilities these routes check before serving anyone (a flag needs enforce mode, config.ts):
// a sale without a board has its own link; Tap to Pay; refunds.
process.env.FEATURE_NEW_RETAIL_PAYMENTS = "true";
process.env.FEATURE_TAP_TO_PAY = "true";
process.env.FEATURE_REFUND_INITIATION = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

import { memberMerchantSettingsDto, ownerMerchantDto } from "../http-contracts";
import * as windcave from "../windcave";
import { resetTestStorage, storage, VALID_PASSWORD } from "./support/http-harness";
import {
  as,
  expectServed,
  familyRows,
  paidMonth,
  sendServed,
  servedPairs,
  servedTo,
  type ServedCtx,
  type ServedRecipe,
} from "./support/matrix-served";

// Each case starts its own app with three logins (the first start is the slow one).
jest.setTimeout(30_000);

/**
 * R1-T3 (plan C10): the allowed callers succeed — the business family (its settings, its boards and
 * stock, its sales, refunds and report). For every route of the family and every caller the matrix
 * answers "allowed" (the owner; a teammate where the route's review admits one; the platform admin,
 * acting on the business it names, where it is admitted), a real request is served: the route's
 * success status, and what the success did or returned. The refusals are route-matrix.test.ts (the
 * gate), route-matrix-roles.test.ts and route-matrix-records.test.ts.
 *
 * The provider is never reached (R1-T1): its answers for Tap to Pay and refunds are stubbed.
 */

const ONBOARDING = {
  director: "Dee Rector", nzbn: "9429041234567", gstNumber: "123-456-789", websiteUrl: "https://matrix.example",
  estimatedAnnualTurnover: "$50k–$150k", businessDescription: "Coffee cart at the Saturday market",
};
const DETAILS = { businessName: "Matrix Ltd", contactEmail: "matrix@harness.test", contactPhone: "021 555 0100", businessAddress: "1 Matrix Road" };
// A whole 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const LOGO = { field: "logo", bytes: PNG, filename: "logo.png", contentType: "image/png" };

/** A JSON round trip: what a response body holds for a value (dates as strings, no undefined). */
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value));
const url = (ctx: ServedCtx, rest = "") => `/api/merchants/${ctx.merchantId}${rest}`;

async function sale(ctx: ServedCtx, status: "pending" | "completed", provider?: string): Promise<number> {
  const made = await storage.createTransaction({
    merchantId: ctx.merchantId, itemName: "Flat white", price: "5.50", status, paymentMethod: "qr_code", splitEnabled: false,
  } as any);
  // The provider's reference, as a completed card payment records it.
  if (provider) await storage.updateTransactionStatus(made.id, status, provider);
  return made.id;
}
async function board(ctx: ServedCtx): Promise<number> {
  const res = await as(ctx, ctx.owner).post(url(ctx, "/tapt-stones"), { name: "Front till" });
  if (res.status !== 200) throw new Error(`fixture: board failed ${res.status}`);
  return res.body.id;
}
async function item(ctx: ServedCtx): Promise<number> {
  const res = await as(ctx, ctx.owner).post(url(ctx, "/stock-items"), { name: "Seed", cost: "1.00" });
  if (res.status !== 201) throw new Error(`fixture: stock item failed ${res.status}`);
  return res.body.id;
}
async function refund(ctx: ServedCtx, transactionId: number) {
  return storage.createRefund({
    transactionId, merchantId: ctx.merchantId, refundAmount: "1.00", refundReason: "Changed their mind",
    refundMethod: "original_payment_method", status: "completed", windcaveRefundId: "matrix-refund", completedAt: new Date(),
  } as any);
}
const ids = (rows: Array<{ id: number }>) => rows.map((row) => row.id);
const merchant = async (ctx: ServedCtx) => (await storage.getMerchant(ctx.merchantId))!;
const signedIn = async (ctx: ServedCtx, token: string) => (await as(ctx, { token } as any).get("/api/auth/me")).status;

/** Per route: a request each allowed caller is served, and what that success looks like. */
const RECIPES: Record<string, ServedRecipe> = {
  // The business's settings.
  "POST /api/merchants/:id/onboarding": (ctx) => ({
    req: { method: "post", path: url(ctx, "/onboarding"), body: ONBOARDING }, status: 200,
    check: async (res) => {
      expect(res.body).toEqual({ message: expect.any(String) });
      expect(await merchant(ctx)).toMatchObject({ director: ONBOARDING.director, nzbn: ONBOARDING.nzbn, onboardingCompleted: true });
    },
  }),
  "GET /api/merchants/:id/profile": (ctx, _who, caller) => ({
    req: { method: "get", path: url(ctx, "/profile") }, status: 200,
    // The owner's view to the owner and the platform admin; the read-only fields to a teammate.
    check: async (res) => expect(res.body).toEqual(asJson(
      caller === "member" ? memberMerchantSettingsDto(await merchant(ctx)) : ownerMerchantDto(await merchant(ctx)),
    )),
  }),
  "PUT /api/merchants/:id/details": (ctx) => ({
    req: { method: "put", path: url(ctx, "/details"), body: DETAILS }, status: 200,
    check: async (res) => {
      expect(res.body).toMatchObject(DETAILS);
      expect(await merchant(ctx)).toMatchObject(DETAILS);
    },
  }),
  "PUT /api/merchants/:id": (ctx) => ({
    req: { method: "put", path: url(ctx), body: { businessName: "Renamed Ltd" } }, status: 200,
    check: async (res) => {
      expect(res.body).toMatchObject({ businessName: "Renamed Ltd" });
      expect((await merchant(ctx)).businessName).toBe("Renamed Ltd");
    },
  }),
  "PUT /api/merchants/:id/theme": (ctx) => ({
    req: { method: "put", path: url(ctx, "/theme"), body: { themeId: "midnight" } }, status: 200,
    check: async (res) => {
      expect(res.body).toMatchObject({ themeId: "midnight" });
      expect((await merchant(ctx)).themeId).toBe("midnight");
    },
  }),
  "PUT /api/merchants/:id/daily-goal": (ctx) => ({
    req: { method: "put", path: url(ctx, "/daily-goal"), body: { dailyGoal: "750.00" } }, status: 200,
    check: async (res) => {
      expect(res.body).toMatchObject({ dailyGoal: "750.00" });
      expect((await merchant(ctx)).dailyGoal).toBe("750.00");
    },
  }),
  "POST /api/merchants/:id/logo": (ctx) => ({
    req: { method: "post", path: url(ctx, "/logo"), attach: LOGO }, status: 200,
    check: async (res) => {
      expect(res.body).toEqual({ logoUrl: `/uploads/logos/merchant-${ctx.merchantId}.png`, message: "Logo uploaded successfully" });
      expect((await merchant(ctx)).customLogoUrl).toBe(`/uploads/logos/merchant-${ctx.merchantId}.png`);
    },
  }),
  "DELETE /api/merchants/:id/logo": async (ctx) => {
    const uploaded = await sendServed(ctx, ctx.owner, { method: "post", path: url(ctx, "/logo"), attach: LOGO });
    if (uploaded.status !== 200) throw new Error(`fixture: logo failed ${uploaded.status}`);
    return {
      req: { method: "delete", path: url(ctx, "/logo") }, status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ message: "Logo deleted successfully" });
        expect((await merchant(ctx)).customLogoUrl).toBeNull();
      },
    };
  },
  "PUT /api/merchants/:id/change-password": (ctx, who) => ({
    req: {
      method: "put", path: url(ctx, "/change-password"),
      body: { currentPassword: VALID_PASSWORD, newPassword: "NewHarness456!", confirmPassword: "NewHarness456!" },
    },
    status: 200,
    check: async (res) => {
      expect(res.body).toEqual({ message: "Password updated successfully", token: expect.any(String), csrfToken: expect.any(String) });
      // This login's other sessions end; this device carries on under the fresh token and a new session
      // (R1-T4 phase E).
      expect(await signedIn(ctx, who.token)).toBe(401);
      expect(await signedIn(ctx, res.body.token)).toBe(200);
      expect(String(res.headers["set-cookie"])).toMatch(/__Host-taptpay-session=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43};/);
    },
  }),
  // Its sales (paid access: a card on file and a paid month).
  "POST /api/transactions": async (ctx) => {
    await paidMonth(ctx);
    return {
      req: { method: "post", path: "/api/transactions", body: { merchantId: ctx.merchantId, itemName: "Flat white", price: "5.50" } },
      status: 200,
      check: async (res) => {
        // A sale without a board has its own private link, given once, here.
        expect(res.body).toMatchObject({ itemName: "Flat white", price: "5.50", status: "pending" });
        expect(res.body.paymentUrl).toMatch(/\/pay\/t\/[A-Za-z0-9_-]{43}$/);
        expect((await storage.getTransaction(res.body.id))?.merchantId).toBe(ctx.merchantId);
      },
    };
  },
  "POST /api/transactions/cash-sale": async (ctx) => {
    await paidMonth(ctx);
    return {
      req: { method: "post", path: "/api/transactions/cash-sale", body: { merchantId: ctx.merchantId, itemName: "Flat white", price: "5.50" } },
      status: 200,
      check: async (res) => {
        expect(res.body.transaction).toMatchObject({ itemName: "Flat white", price: "5.50", status: "completed", paymentMethod: "cash" });
        expect((await storage.getTransaction(res.body.transaction.id))?.merchantId).toBe(ctx.merchantId);
      },
    };
  },
  "POST /api/transactions/tap-to-pay": async (ctx) => {
    await paidMonth(ctx);
    const pending = await sale(ctx, "pending");
    jest.spyOn(windcave, "isWindcaveConfigured").mockReturnValue(true);
    jest.spyOn(windcave, "createAttendedSession").mockResolvedValue({ success: true, sessionId: "matrix-attended" } as any);
    jest.spyOn(windcave, "submitTapToPayToken")
      .mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "matrix-tap" } as any);
    return {
      req: {
        method: "post", path: "/api/transactions/tap-to-pay",
        body: { merchantId: ctx.merchantId, transactionId: pending, amount: "5.50", windcaveToken: "matrix-nfc-token" },
      },
      status: 200,
      check: async (res) => {
        expect(res.body).toMatchObject({ approved: true, transactionId: pending });
        expect(await storage.getTransaction(pending)).toMatchObject({ status: "completed", paymentMethod: "tap_to_pay" });
      },
    };
  },
  "POST /api/transactions/:id/cancel": async (ctx) => {
    const pending = await sale(ctx, "pending");
    return {
      req: { method: "post", path: `/api/transactions/${pending}/cancel` }, status: 200,
      check: async (res) => {
        expect(res.body).toMatchObject({ id: pending, status: "cancelled" });
        expect((await storage.getTransaction(pending))?.status).toBe("cancelled");
      },
    };
  },
  "GET /api/merchants/:id/transactions": async (ctx) => {
    const made = await sale(ctx, "completed");
    return {
      req: { method: "get", path: url(ctx, "/transactions") }, status: 200,
      check: (res) => expect(ids(res.body)).toEqual([made]),
    };
  },
  "GET /api/merchants/:id/export/pdf": async (ctx) => {
    await sale(ctx, "completed");
    return {
      req: { method: "get", path: url(ctx, "/export/pdf"), binary: true }, status: 200,
      check: (res) => {
        expect(res.headers["content-type"]).toMatch(/^application\/pdf/);
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
      },
    };
  },
  // Its refunds (the provider's refund stubbed).
  "POST /api/transactions/:transactionId/refunds": async (ctx) => {
    const paid = await sale(ctx, "completed", "matrix-card-payment");
    jest.spyOn(windcave, "isWindcaveConfigured").mockReturnValue(true);
    const provider = jest.spyOn(windcave, "createWindcaveRefund")
      .mockResolvedValue({ success: true, refundTransactionId: "matrix-refund" } as any);
    return {
      req: { method: "post", path: `/api/transactions/${paid}/refunds`, body: { refundAmount: "1.00", refundReason: "Changed their mind" } },
      status: 200,
      check: async (res) => {
        expect(res.body).toMatchObject({
          success: true,
          refund: { transactionId: paid, refundAmount: "1.00", status: "completed", windcaveRefundId: "matrix-refund" },
          transaction: { id: paid, status: "partially_refunded" },
        });
        expect(provider).toHaveBeenCalledWith("matrix-card-payment", "1.00", expect.any(String));
      },
    };
  },
  "GET /api/transactions/:transactionId/refunds": async (ctx) => {
    const paid = await sale(ctx, "completed");
    const made = await refund(ctx, paid);
    return {
      req: { method: "get", path: `/api/transactions/${paid}/refunds` }, status: 200,
      check: (res) => expect(ids(res.body)).toEqual([made.id]),
    };
  },
  "GET /api/merchants/:merchantId/refunds": async (ctx) => {
    const made = await refund(ctx, await sale(ctx, "completed"));
    return {
      req: { method: "get", path: url(ctx, "/refunds") }, status: 200,
      check: (res) => expect(ids(res.body)).toEqual([made.id]),
    };
  },
  // Its boards.
  "GET /api/merchants/:id/tapt-stones": async (ctx) => {
    const made = await board(ctx);
    return { req: { method: "get", path: url(ctx, "/tapt-stones") }, status: 200, check: (res) => expect(ids(res.body)).toEqual([made]) };
  },
  "POST /api/merchants/:id/tapt-stones": (ctx) => ({
    req: { method: "post", path: url(ctx, "/tapt-stones"), body: { name: "Back till" } }, status: 200,
    check: async (res) => {
      expect(res.body).toMatchObject({ name: "Back till", merchantId: ctx.merchantId, isActive: true });
      expect(ids(await storage.getTaptStonesByMerchant(ctx.merchantId))).toEqual([res.body.id]);
    },
  }),
  "PUT /api/merchants/:merchantId/tapt-stones/:stoneId": async (ctx) => {
    const made = await board(ctx);
    return {
      req: { method: "put", path: url(ctx, `/tapt-stones/${made}`), body: { name: "Renamed till" } }, status: 200,
      check: async (res) => {
        expect(res.body).toMatchObject({ id: made, name: "Renamed till" });
        expect((await storage.getTaptStone(made))?.name).toBe("Renamed till");
      },
    };
  },
  "DELETE /api/merchants/:merchantId/tapt-stones/:stoneId": async (ctx) => {
    const made = await board(ctx);
    return {
      req: { method: "delete", path: url(ctx, `/tapt-stones/${made}`) }, status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ message: expect.any(String) });
        expect(ids(await storage.getTaptStonesByMerchant(ctx.merchantId))).toEqual([]);
      },
    };
  },
  // Its stock.
  "GET /api/merchants/:merchantId/stock-items": async (ctx) => {
    const made = await item(ctx);
    return { req: { method: "get", path: url(ctx, "/stock-items") }, status: 200, check: (res) => expect(ids(res.body)).toEqual([made]) };
  },
  "POST /api/merchants/:merchantId/stock-items": (ctx) => ({
    req: { method: "post", path: url(ctx, "/stock-items"), body: { name: "Scone", cost: "4.00" } }, status: 201,
    check: async (res) => {
      expect(res.body).toMatchObject({ name: "Scone", cost: "4.00", merchantId: ctx.merchantId });
      expect(ids(await storage.getStockItemsByMerchant(ctx.merchantId))).toEqual([res.body.id]);
    },
  }),
  "PUT /api/merchants/:merchantId/stock-items/:itemId": async (ctx) => {
    const made = await item(ctx);
    return {
      req: { method: "put", path: url(ctx, `/stock-items/${made}`), body: { name: "Renamed", cost: "3.00" } }, status: 200,
      check: async (res) => {
        expect(res.body).toMatchObject({ id: made, name: "Renamed", cost: "3.00" });
        expect(await storage.getStockItem(made)).toMatchObject({ name: "Renamed", cost: "3.00" });
      },
    };
  },
  "DELETE /api/merchants/:merchantId/stock-items/:itemId": async (ctx) => {
    const made = await item(ctx);
    return {
      req: { method: "delete", path: url(ctx, `/stock-items/${made}`) }, status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ message: expect.any(String) });
        // Kept, inactive (a sale may name it), and gone from the list the screen reads.
        expect((await storage.getStockItem(made))?.isActive).toBe(false);
        expect(ids((await as(ctx, ctx.owner).get(url(ctx, "/stock-items"))).body)).toEqual([]);
      },
    };
  },
};

const ROWS = familyRows("business");
const SERVED = servedPairs(ROWS);

/**
 * Who besides the owner each route serves, stated by hand. The matrix derives it from the reviews; the
 * two must agree, so a review that stopped admitting a teammate or the admin (or started to) cannot
 * quietly drop or add a case here.
 */
const TEAMMATE_SERVED = [
  "GET /api/merchants/:id/profile", "PUT /api/merchants/:id/change-password",
  "POST /api/transactions", "POST /api/transactions/cash-sale", "POST /api/transactions/tap-to-pay",
  "POST /api/transactions/:id/cancel", "GET /api/merchants/:id/transactions", "GET /api/merchants/:id/export/pdf",
  "GET /api/transactions/:transactionId/refunds", "GET /api/merchants/:merchantId/refunds",
  "GET /api/merchants/:id/tapt-stones", "POST /api/merchants/:id/tapt-stones",
  "PUT /api/merchants/:merchantId/tapt-stones/:stoneId", "DELETE /api/merchants/:merchantId/tapt-stones/:stoneId",
  "GET /api/merchants/:merchantId/stock-items", "POST /api/merchants/:merchantId/stock-items",
  "PUT /api/merchants/:merchantId/stock-items/:itemId", "DELETE /api/merchants/:merchantId/stock-items/:itemId",
];
const ADMIN_SERVED = [
  "POST /api/merchants/:id/onboarding", "GET /api/merchants/:id/profile", "PUT /api/merchants/:id/details",
  "PUT /api/merchants/:id", "PUT /api/merchants/:id/theme", "PUT /api/merchants/:id/daily-goal",
  "POST /api/merchants/:id/logo", "DELETE /api/merchants/:id/logo",
  "POST /api/transactions", "POST /api/transactions/cash-sale", "POST /api/transactions/tap-to-pay",
  "POST /api/transactions/:id/cancel", "GET /api/merchants/:id/transactions", "GET /api/merchants/:id/export/pdf",
  "GET /api/merchants/:merchantId/refunds",
  "GET /api/merchants/:id/tapt-stones", "POST /api/merchants/:id/tapt-stones",
  "PUT /api/merchants/:merchantId/tapt-stones/:stoneId", "DELETE /api/merchants/:merchantId/tapt-stones/:stoneId",
  "GET /api/merchants/:merchantId/stock-items", "POST /api/merchants/:merchantId/stock-items",
  "PUT /api/merchants/:merchantId/stock-items/:itemId", "DELETE /api/merchants/:merchantId/stock-items/:itemId",
];

beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — the business family: every allowed caller is served", () => {
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
