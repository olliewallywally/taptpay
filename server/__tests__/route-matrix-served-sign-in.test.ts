import "./support/test-env";
// The email a success sends goes through the mocked provider below, so its recipient and link are read.
import "./support/resend-capture-env";
import "./support/google-oauth-test-env";
import { ADMIN_TEST_PASSWORD } from "./support/admin-sign-in-test-env";

import bcrypt from "bcrypt";
import crypto from "crypto";
import request from "supertest";

type Sent = { to: string | string[]; subject: string; html?: string; text?: string };
const mockSent: Sent[] = [];
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn(async (message: Sent) => {
        mockSent.push(message);
        return { data: { id: "captured" }, error: null };
      }),
    },
  })),
}));

import { VALID_PASSWORD, bearer, resetTestStorage, storage } from "./support/http-harness";
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

// Sign-up, the confirmation resend and forgot-password answer after a fixed wait (1 to 1.5 s), by design.
jest.setTimeout(30_000);

/**
 * R1-T3 (plan C10): the allowed callers succeed — sign-in and account opening, routes with their own
 * gates. Each is served to the caller its review names: anyone with no sign-in (starting Google sign-in,
 * Google's return, signing in, the admin's sign-in, forgot-password, the confirmation resend, sign-up),
 * or the holder of the one credential it was sent (the Google handoff code, a reset link, a confirmation
 * link, an invite). Each case sends a real request and checks the route's success status and what the
 * success did or returned: the session it opened, the email it sent (caught at the provider), the login
 * or business it made or changed. Their refusals: route-matrix-own-gates.test.ts and the R1-T4 tests.
 *
 * Google is never reached (R1-T1): its token and profile answers are stubbed.
 */

const OAUTH_COOKIE = "__Host-taptpay-google-oauth";
const HANDOFF_COOKIE = "__Host-taptpay-google-handoff";
const DEVICE_COOKIE = "__Secure-taptpay-signin-device";
const ADMIN_DEVICE_COOKIE = "__Secure-taptpay-admin-signin-device";
const CONFIRM_SUBJECT = "Confirm your TaptPay email address";
const NEW_PASSWORD = "NewHarness456";

const email = (who: string) => `${who}.${crypto.randomBytes(4).toString("hex")}@harness.test`;
const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const get = (path: string): ServedRequest => ({ method: "get", path });
const post = (path: string, body: Record<string, unknown>, headers?: Record<string, string>): ServedRequest =>
  ({ method: "post", path, body, headers });
const sentTo = (address: string) => mockSent.filter((message) => [message.to].flat()[0] === address);

/** Every Set-Cookie header of a response, by cookie name. */
function setCookies(res: request.Response): Map<string, string> {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  return new Map((raw ?? []).map((line) => [line.split("=")[0], line]));
}
const cookieValue = (line: string | undefined) => line?.split(";")[0].split("=").slice(1).join("=") ?? "";

const signIn = (ctx: ServedCtx, address: string, password: string) =>
  request(ctx.app).post("/api/auth/login").send({ email: address, password });
const me = (ctx: ServedCtx, token: string) => request(ctx.app).get("/api/auth/me").set(bearer({ token }));

/** Google's answers: its token exchange and the profile of the account that signed in. */
let google: { id: string; email: string; name: string; verified_email: boolean };
function stubGoogle() {
  jest.spyOn(global, "fetch").mockImplementation(async (input: any) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "synthetic-google-access-token" }), { status: 200 });
    }
    if (url === "https://www.googleapis.com/oauth2/v2/userinfo") return new Response(JSON.stringify(google), { status: 200 });
    throw new Error(`unexpected outbound request in test: ${url}`);
  });
}

/** An application as the sign-up form leaves it: pending, complete, with its chosen password's hash. */
async function application() {
  const token = crypto.randomBytes(32).toString("hex");
  const created = await storage.createMerchantWithSignup({
    name: "Jamie Smith", businessName: "Kauri Studio", businessType: "sole-trader", email: email("applicant"),
    phone: "021 555 0100", address: "1 Kauri Road, Auckland", businessAddress: "1 Kauri Road, Auckland",
    director: "Jamie Smith", businessDescription: "Independent design studio", estimatedAnnualTurnover: "Under $50k",
    verificationToken: token, passwordHash: await bcrypt.hash(VALID_PASSWORD, 4),
  } as any);
  return { id: created.id, email: created.email, token };
}

/** A live reset link for the owner's login, as forgot-password leaves it (only its hash is kept). */
async function resetLink(ctx: ServedCtx) {
  const raw = crypto.randomBytes(32).toString("hex");
  await storage.setUserResetToken(ctx.owner.user.id, sha256(raw), new Date(Date.now() + 60 * 60 * 1000));
  return raw;
}

const RECIPES: Record<string, OwnServedRecipe> = {
  // Google sign-in: the start, Google's return, and the browser redeeming its one-time code.
  "GET /api/auth/google": () => ({
    req: get("/api/auth/google"), status: 302,
    check: (res) => {
      const target = new URL(res.headers.location);
      expect(target.origin + target.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(target.searchParams.get("code_challenge_method")).toBe("S256");
      // The state it sends Google is bound to this browser by an HttpOnly cookie.
      const cookie = setCookies(res).get(OAUTH_COOKIE);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookieValue(cookie).split(".")[0]).toBe(target.searchParams.get("state"));
    },
  }),
  "GET /api/auth/google/callback": async (ctx) => {
    // The business's owner signs in with the Google account of the same, verified, address.
    google = { id: "google-subject-matrix", email: ctx.owner.user.email, name: "Harness Owner", verified_email: true };
    stubGoogle();
    const started = await request(ctx.app).get("/api/auth/google");
    const state = new URL(started.headers.location).searchParams.get("state")!;
    const cookie = `${OAUTH_COOKIE}=${cookieValue(setCookies(started).get(OAUTH_COOKIE))}`;
    return {
      req: { ...get(`/api/auth/google/callback?code=synthetic-code&state=${encodeURIComponent(state)}`), headers: { Cookie: cookie } },
      status: 302,
      check: async (res) => {
        expect(res.headers.location).toBe("/login?google=complete");
        // The browser holds a one-time code for the owner's login, never a token in an address.
        const code = cookieValue(setCookies(res).get(HANDOFF_COOKIE));
        expect(await storage.consumeAuthHandoffCode(sha256(code), new Date()))
          .toEqual({ userId: ctx.owner.user.id, newUser: false });
        // The business now remembers the Google account.
        expect((await storage.getMerchant(ctx.merchantId))?.googleId).toBe("google-subject-matrix");
      },
    };
  },
  "POST /api/auth/google/session": async (ctx) => {
    const code = crypto.randomBytes(32).toString("base64url");
    await storage.createAuthHandoffCode({
      codeHash: sha256(code), userId: ctx.owner.user.id, newUser: false, expiresAt: new Date(Date.now() + 60_000),
    });
    return {
      req: post("/api/auth/google/session", {}, { Cookie: `${HANDOFF_COOKIE}=${code}` }), status: 200,
      check: async (res) => {
        expect(res.headers["cache-control"]).toMatch(/no-store/);
        expect(res.body).toEqual({ token: expect.any(String), merchantId: ctx.merchantId, newUser: false });
        expect((await me(ctx, res.body.token)).body.user).toMatchObject({ id: ctx.owner.user.id, merchantId: ctx.merchantId });
        // The code is spent.
        expect(await storage.consumeAuthHandoffCode(sha256(code), new Date())).toBeUndefined();
      },
    };
  },
  // Signing in with a password: a business's login, and the platform admin.
  "POST /api/auth/login": (ctx) => ({
    req: post("/api/auth/login", { email: ctx.owner.user.email, password: VALID_PASSWORD }), status: 200,
    check: async (res) => {
      expect(res.body.user).toEqual({ id: ctx.owner.user.id, email: ctx.owner.user.email, merchantId: ctx.merchantId, role: "owner" });
      expect((await me(ctx, res.body.token)).status).toBe(200);
      // This browser is now a known device for the login (its own sign-in slow-down).
      expect(setCookies(res).get(DEVICE_COOKIE)).toMatch(/HttpOnly/i);
    },
  }),
  "POST /api/admin/auth/login": (ctx) => ({
    req: post("/api/admin/auth/login", { email: "admin@harness.test", password: ADMIN_TEST_PASSWORD }), status: 200,
    check: async (res) => {
      expect(res.body.user).toEqual({ id: 1, email: "admin@harness.test", merchantId: 0, role: "admin" });
      const admin = await request(ctx.app).get("/api/admin/auth/me").set(bearer({ token: res.body.token }));
      expect(admin.status).toBe(200);
      expect(setCookies(res).get(ADMIN_DEVICE_COOKIE)).toMatch(/HttpOnly/i);
    },
  }),
  // A forgotten password: the link is emailed, checked, and used.
  "POST /api/auth/forgot-password": (ctx) => ({
    req: post("/api/auth/forgot-password", { email: ctx.owner.user.email }), status: 200,
    check: async (res) => {
      expect(res.body).toEqual({ message: expect.any(String) });
      // One email to the login's own address, with a live reset link.
      const sent = sentTo(ctx.owner.user.email);
      expect(sent).toHaveLength(1);
      const token = /reset-password\?token=([0-9a-f]{64})/.exec(String(sent[0].html))?.[1];
      expect(token).toBeDefined();
      expect((await request(ctx.app).get(`/api/auth/validate-reset-token/${token}`)).body).toEqual({ valid: true });
    },
  }),
  "GET /api/auth/validate-reset-token/:token": async (ctx) => {
    const token = await resetLink(ctx);
    return { req: get(`/api/auth/validate-reset-token/${token}`), status: 200, check: (res) => expect(res.body).toEqual({ valid: true }) };
  },
  "POST /api/auth/reset-password": async (ctx) => {
    const token = await resetLink(ctx);
    return {
      req: post("/api/auth/reset-password", { token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }), status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ message: expect.any(String) });
        // The new password signs in; every session from before is ended; the link is spent.
        expect((await signIn(ctx, ctx.owner.user.email, NEW_PASSWORD)).status).toBe(200);
        expect((await me(ctx, ctx.owner.token)).body.code).toBe("SESSION_ENDED");
        expect((await request(ctx.app).get(`/api/auth/validate-reset-token/${token}`)).body).toEqual({ valid: false });
      },
    };
  },
  // Opening an account: sign-up, the confirmation link (and its resend).
  "POST /api/merchants/signup": () => {
    const address = email("signup");
    return {
      req: post("/api/merchants/signup", {
        name: "Jamie Smith", email: address, phone: "021 555 0100", businessName: "Kauri Studio", businessType: "sole-trader",
        businessAddress: "1 Kauri Road, Auckland", director: "Jamie Smith", businessDescription: "Independent design studio",
        estimatedAnnualTurnover: "Under $50k", password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD,
      }),
      status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ message: "Check your email to continue." });
        // A pending application, and its confirmation link emailed to the address.
        const made = await storage.getMerchantByEmail(address);
        expect(made).toMatchObject({ status: "pending", businessName: "Kauri Studio" });
        const sent = sentTo(address);
        expect(sent.map((message) => message.subject)).toEqual([CONFIRM_SUBJECT]);
        expect(String(sent[0].html)).toContain(made!.verificationToken!);
      },
    };
  },
  "POST /api/auth/resend-confirmation": async () => {
    const applied = await application();
    return {
      req: post("/api/auth/resend-confirmation", { email: applied.email }), status: 200,
      check: (res) => {
        expect(res.body).toEqual({ message: "If that address is waiting to be confirmed, we've sent the link again." });
        const sent = sentTo(applied.email);
        expect(sent.map((message) => message.subject)).toEqual([CONFIRM_SUBJECT]);
        expect(String(sent[0].html)).toContain(applied.token);
      },
    };
  },
  "POST /api/auth/confirm-email": async (ctx) => {
    const applied = await application();
    return {
      req: post("/api/auth/confirm-email", { token: applied.token, password: VALID_PASSWORD }), status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ message: expect.any(String), merchantId: applied.id });
        // Confirmed: the business is verified, its owner signs in, and the application reaches the owner's inbox.
        expect((await storage.getMerchant(applied.id))?.status).toBe("verified");
        expect((await signIn(ctx, applied.email, VALID_PASSWORD)).status).toBe(200);
        expect(sentTo("oliver@taptpay.co.nz").map((message) => message.subject)).toEqual(["Verified TaptPay signup — Kauri Studio"]);
      },
    };
  },
  // A teammate's invite.
  "POST /api/team/accept-invite": async (ctx) => {
    const raw = crypto.randomBytes(24).toString("hex");
    const invitee = email("invitee");
    const invited = await storage.inviteTeamMember(ctx.merchantId, {
      email: invitee, inviteTokenHash: sha256(raw), inviteExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    if (!invited.ok) throw new Error(`fixture: invite failed ${invited.reason}`);
    return {
      req: post("/api/team/accept-invite", { token: raw, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }), status: 200,
      check: async (res) => {
        expect(res.body).toEqual({ message: "Your login is ready. Please sign in." });
        // The teammate's login is active and signs in with the password chosen, on this business.
        const signedIn = await signIn(ctx, invitee, NEW_PASSWORD);
        expect(signedIn.status).toBe(200);
        expect(signedIn.body.user).toMatchObject({ id: invited.user.id, merchantId: ctx.merchantId, role: "member" });
      },
    };
  },
};

const ROWS = familyRows("sign-in");
const SERVED = ownServedPairs(ROWS);

/**
 * Who each route serves, stated by hand. The matrix derives it from the reviews; the two must agree, so
 * a review that stopped naming a caller (or started naming one) cannot quietly drop or add a case here.
 */
const SERVED_BY: Record<string, OwnServedCaller[]> = {
  "GET /api/auth/google": ["signed-out"],
  "GET /api/auth/google/callback": ["signed-out"],
  "POST /api/auth/google/session": ["link-holder"],
  "POST /api/auth/login": ["signed-out"],
  "POST /api/admin/auth/login": ["signed-out"],
  "POST /api/auth/forgot-password": ["signed-out"],
  "GET /api/auth/validate-reset-token/:token": ["link-holder"],
  "POST /api/auth/reset-password": ["link-holder"],
  "POST /api/merchants/signup": ["signed-out"],
  "POST /api/auth/resend-confirmation": ["signed-out"],
  "POST /api/auth/confirm-email": ["link-holder"],
  "POST /api/team/accept-invite": ["link-holder"],
};

beforeEach(() => {
  resetTestStorage();
  mockSent.length = 0;
});
afterEach(() => jest.restoreAllMocks());

describe("R1-T3 — sign-in and account opening: every allowed caller is served", () => {
  it("has a request for every route of the family", () => {
    expect(ROWS.map(([key]) => key).sort()).toEqual(Object.keys(RECIPES).sort());
  });

  it("serves each route to the callers stated", () => {
    expect(ownServedBy(ROWS)).toEqual(SERVED_BY);
  });

  // A loop, not it.each: a matrix serving no one here is the first test's failure, not a file that cannot load.
  for (const [key, caller] of SERVED) it(`${key}, by the ${caller}`, () => expectOwnServed(RECIPES, key, caller));
});
