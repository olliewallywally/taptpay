import "./support/test-env";
import "./support/google-oauth-test-env";

import crypto from "crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";

/**
 * R1-T4 phase A (owner decision 2026-09-21). Google sign-in used to redirect to
 * /login?token=<account JWT> — into browser history, access logs and Google
 * Analytics — with no `state`, no PKCE, and no check that Google had verified the
 * email it used to join an existing merchant. Now: state and PKCE bound to the
 * starting browser by an HttpOnly cookie, a verified email required, and the
 * browser receives a one-time code in an HttpOnly cookie that it redeems once,
 * by POST, for the account token. No token is ever in an address.
 */

const ORIGIN = "https://harness.test";
const OAUTH_COOKIE = "__Host-taptpay-google-oauth";
const HANDOFF_COOKIE = "__Host-taptpay-google-handoff";
const b64url = (buffer: Buffer) => buffer.toString("base64url");

type GoogleProfile = { id: string; email: string; name: string; verified_email?: boolean };
let profile: GoogleProfile;
let tokenRequests: URLSearchParams[];
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  resetTestStorage();
  tokenRequests = [];
  profile = { id: "google-subject-1", email: `owner.${crypto.randomBytes(3).toString("hex")}@example.test`, name: "Harness Owner", verified_email: true };
  fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      tokenRequests.push(new URLSearchParams(String(init?.body ?? "")));
      return new Response(JSON.stringify({ access_token: "synthetic-google-access-token" }), { status: 200 });
    }
    if (url === "https://www.googleapis.com/oauth2/v2/userinfo") {
      return new Response(JSON.stringify(profile), { status: 200 });
    }
    throw new Error(`unexpected outbound request in test: ${url}`);
  });
});
afterEach(() => fetchSpy.mockRestore());

/** Every Set-Cookie header of a response, by cookie name. */
function setCookies(res: request.Response): Map<string, string> {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  return new Map((raw ?? []).map((line) => [line.split("=")[0], line]));
}
const cookieValue = (line: string | undefined) => line?.split(";")[0].split("=").slice(1).join("=") ?? "";

async function startSignIn() {
  const { app } = await createTestApp();
  const res = await request(app).get("/api/auth/google");
  expect(res.status).toBe(302);
  const target = new URL(res.headers.location);
  const cookie = setCookies(res).get(OAUTH_COOKIE);
  return { app, target, cookie: cookie ?? "", cookieValue: cookieValue(cookie) };
}

async function finishCallback(overrides: { state?: string; cookie?: string | null } = {}) {
  const started = await startSignIn();
  const state = overrides.state ?? started.target.searchParams.get("state") ?? "";
  const cookieHeader = overrides.cookie === null ? undefined : overrides.cookie ?? `${OAUTH_COOKIE}=${started.cookieValue}`;
  const call = request(started.app).get(`/api/auth/google/callback?code=synthetic-code&state=${encodeURIComponent(state)}`);
  const res = cookieHeader ? await call.set("Cookie", cookieHeader) : await call;
  return { ...started, res };
}

describe("starting Google sign-in", () => {
  it("sends a one-time state and a PKCE challenge, bound to this browser by an HttpOnly cookie", async () => {
    const { target, cookie, cookieValue: value } = await startSignIn();
    expect(target.origin + target.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(target.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/google/callback`);
    const state = target.searchParams.get("state")!;
    const challenge = target.searchParams.get("code_challenge")!;
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");

    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    const [cookieState, verifier] = value.split(".");
    expect(cookieState).toBe(state);
    expect(challenge).toBe(b64url(crypto.createHash("sha256").update(verifier).digest()));
  });

  it("gives every sign-in its own state", async () => {
    const first = await startSignIn();
    const second = await startSignIn();
    expect(first.target.searchParams.get("state")).not.toBe(second.target.searchParams.get("state"));
  });
});

describe("the Google callback", () => {
  it("refuses a callback without the starting browser's cookie, before asking Google for anything", async () => {
    const { res } = await finishCallback({ cookie: null });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login\?error=/);
    expect(tokenRequests).toHaveLength(0);
    expect(setCookies(res).get(HANDOFF_COOKIE)).toBeUndefined();
  });

  it("refuses a callback whose state does not match", async () => {
    const { res } = await finishCallback({ state: b64url(crypto.randomBytes(32)) });
    expect(res.headers.location).toMatch(/^\/login\?error=/);
    expect(tokenRequests).toHaveLength(0);
  });

  it("proves the code with the PKCE verifier from the cookie", async () => {
    const { res, cookieValue: value } = await finishCallback();
    expect(res.status).toBe(302);
    expect(tokenRequests).toHaveLength(1);
    expect(tokenRequests[0].get("code_verifier")).toBe(value.split(".")[1]);
    expect(tokenRequests[0].get("redirect_uri")).toBe(`${ORIGIN}/api/auth/google/callback`);
  });

  it("never puts an account token in the address — the browser gets a one-time code in an HttpOnly cookie", async () => {
    const { res } = await finishCallback();
    expect(res.headers.location).toBe("/login?google=complete");
    const handoff = setCookies(res).get(HANDOFF_COOKIE);
    expect(handoff).toMatch(/HttpOnly/i);
    expect(handoff).toMatch(/Secure/i);
    expect(handoff).toMatch(/SameSite=Strict/i);
    expect(cookieValue(handoff)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The starting cookie is spent.
    expect(setCookies(res).get(OAUTH_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });

  it("refuses an email Google has not verified, and creates nothing", async () => {
    profile.verified_email = false;
    const { res } = await finishCallback();
    expect(res.headers.location).toMatch(/^\/login\?error=/);
    expect(setCookies(res).get(HANDOFF_COOKIE)).toBeUndefined();
    expect(await storage.getMerchantByEmail(profile.email)).toBeUndefined();
  });

  it("does not join an existing merchant on an unverified email", async () => {
    const owner = await createOwnerPrincipal({ email: profile.email });
    profile.verified_email = false;
    const { res } = await finishCallback();
    expect(res.headers.location).toMatch(/^\/login\?error=/);
    expect((await storage.getMerchant(owner.merchantId))?.googleId ?? null).toBeNull();
  });

  it("joins an existing merchant on a verified email, and remembers the Google account", async () => {
    const owner = await createOwnerPrincipal({ email: profile.email });
    const { res } = await finishCallback();
    expect(res.headers.location).toBe("/login?google=complete");
    expect((await storage.getMerchant(owner.merchantId))?.googleId).toBe(profile.id);
  });

  it("refuses a merchant already linked to a different Google account", async () => {
    const owner = await createOwnerPrincipal({ email: profile.email });
    await storage.updateMerchant(owner.merchantId, { googleId: "google-subject-other" } as any);
    const { res } = await finishCallback();
    expect(res.headers.location).toMatch(/^\/login\?error=/);
    expect(setCookies(res).get(HANDOFF_COOKIE)).toBeUndefined();
    expect((await storage.getMerchant(owner.merchantId))?.googleId).toBe("google-subject-other");
  });
});

describe("redeeming the one-time code", () => {
  async function signedInCode() {
    const { app, res } = await finishCallback();
    return { app, code: cookieValue(setCookies(res).get(HANDOFF_COOKIE)) };
  }

  it("returns the account token once, in the response body, never cached", async () => {
    const { app, code } = await signedInCode();
    const res = await request(app).post("/api/auth/google/session").set("Cookie", `${HANDOFF_COOKIE}=${code}`);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    const merchant = await storage.getMerchantByEmail(profile.email);
    expect(res.body).toMatchObject({ merchantId: merchant!.id, newUser: true });
    const claims = jwt.verify(res.body.token, process.env.JWT_SECRET!) as any;
    expect(claims.merchantId).toBe(merchant!.id);
    expect(setCookies(res).get(HANDOFF_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
  });

  it("refuses the same code a second time", async () => {
    const { app, code } = await signedInCode();
    await request(app).post("/api/auth/google/session").set("Cookie", `${HANDOFF_COOKIE}=${code}`);
    const again = await request(app).post("/api/auth/google/session").set("Cookie", `${HANDOFF_COOKIE}=${code}`);
    expect(again.status).toBe(401);
    expect(again.body.token).toBeUndefined();
  });

  it("refuses an expired code, a made-up code and no code", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const expired = b64url(crypto.randomBytes(32));
    await storage.createAuthHandoffCode({
      codeHash: crypto.createHash("sha256").update(expired).digest("hex"),
      userId: owner.user.userId ?? owner.user.id,
      newUser: false,
      expiresAt: new Date(Date.now() - 1_000),
    });
    for (const cookie of [`${HANDOFF_COOKIE}=${expired}`, `${HANDOFF_COOKIE}=${b64url(crypto.randomBytes(32))}`, undefined]) {
      const call = request(app).post("/api/auth/google/session");
      const res = cookie ? await call.set("Cookie", cookie) : await call;
      expect(res.status).toBe(401);
      expect(res.body.token).toBeUndefined();
    }
  });
});
