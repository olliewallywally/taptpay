import "./support/test-env";
import "./support/google-oauth-test-env";
import "./support/trusted-proxy-env";
import { ADMIN_TEST_PASSWORD } from "./support/admin-sign-in-test-env";

import crypto from "crypto";
import request from "supertest";
import { config } from "../config";
import {
  VALID_PASSWORD, bearer, createAdminPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage,
} from "./support/http-harness";

/**
 * R1-T4 phase B, with the setting on (TRUST_PROXY_HOPS=1: one proxy in front).
 *
 * Before: no `trust proxy` anywhere, so behind a proxy `req.ip` is the proxy for every
 * visitor. The only address limit was one in-memory block for everyone, and phase C
 * removed it. Now, once the deployment says how many proxies stand in front, the app
 * takes the visitor's address from the last entry that trusted proxy appended, never
 * from anything the visitor wrote, and limits sign-in, forgot-password and the Google
 * callback per address.
 */

// Up to ~55 sign-in attempts, each spending one cost-12 check (~0.27 s).
jest.setTimeout(120_000);

type App = Awaited<ReturnType<typeof createTestApp>>["app"];
const WRONG = "Wrong-password-1";
const DEVICE_COOKIE = "__Secure-taptpay-signin-device";
const OAUTH_COOKIE = "__Host-taptpay-google-oauth";

let tokenRequests: number;
let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  resetTestStorage();
  tokenRequests = 0;
  // Google refuses every code: each callback that gets that far is a failed attempt.
  fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input: any) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      tokenRequests += 1;
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    }
    throw new Error(`unexpected outbound request in test: ${url}`);
  });
});
afterEach(() => fetchSpy.mockRestore());

const nobody = () => `nobody.${crypto.randomBytes(4).toString("hex")}@harness.test`;
/** As the proxy would forward a visitor at `visitor`, after whatever the visitor itself wrote. */
const via = (visitor: string, written?: string) => ({ "X-Forwarded-For": written ? `${written}, ${visitor}` : visitor });

function signIn(app: App, from: Record<string, string>, email: string, password: string, cookie?: string) {
  const req = request(app).post("/api/auth/login").set(from).send({ email, password });
  return cookie ? req.set("Cookie", cookie) : req;
}
const adminSignIn = (app: App, from: Record<string, string>, email: string, password: string) =>
  request(app).post("/api/admin/auth/login").set(from).send({ email, password });
const forgot = (app: App, from: Record<string, string>, email: string) =>
  request(app).post("/api/auth/forgot-password").set(from).send({ email });

function cookieFrom(res: request.Response, name: string): string {
  const header = ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith(`${name}=`));
  if (!header) throw new Error(`the response set no ${name} cookie`);
  return header.split(";")[0];
}

async function googleCallback(app: App, from: Record<string, string>) {
  const started = await request(app).get("/api/auth/google").set(from);
  const state = new URL(started.headers.location).searchParams.get("state") ?? "";
  return request(app).get(`/api/auth/google/callback?code=synthetic-code&state=${encodeURIComponent(state)}`)
    .set(from).set("Cookie", cookieFrom(started, OAUTH_COOKIE));
}

describe("the address the app takes as the visitor's", () => {
  it("is the one the trusted proxy appended: whatever the visitor wrote before it is ignored", async () => {
    const { app } = await createTestApp();
    const admin = createAdminPrincipal();

    const seen = await request(app).get("/api/admin/request-origin").set(bearer(admin))
      .set(via("203.0.113.9", "198.51.100.7")).set("X-Forwarded-Proto", "https");

    expect(seen.status).toBe(200);
    expect(seen.headers["cache-control"]).toBe("no-store");
    expect(seen.body).toEqual(expect.objectContaining({
      trustProxyHops: 1,
      addressLimits: "on",
      clientAddress: "203.0.113.9",
      protocol: "https",
      forwardedFor: ["198.51.100.7", "203.0.113.9"],
    }));
    // What each setting would take: the owner's live check reads their own address off this.
    expect(seen.body.candidates.map((c: { hops: number; clientAddress: string }) => [c.hops, c.clientAddress]))
      .toEqual([[0, seen.body.connectionAddress], [1, "203.0.113.9"], [2, "198.51.100.7"]]);
  });

  it("is shown only to the admin", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    expect((await request(app).get("/api/admin/request-origin")).status).toBe(401);
    expect((await request(app).get("/api/admin/request-origin").set(bearer(owner))).status).toBe(403);
  });
});

describe("sign-in, limited per address", () => {
  it("lets one address try 50 accounts, then makes it wait; a success gives its try back; the merchant's own device and other addresses carry on", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const attacker = "203.0.113.9";

    const guesses: number[] = [];
    for (let i = 0; i < 49; i += 1) {
      guesses.push((await signIn(app, via(attacker, `198.51.100.${i}`), nobody(), WRONG)).status);
    }
    expect(guesses.every((status) => status === 401)).toBe(true);

    // The merchant, behind the same address, signs in: that try is given back.
    const merchant = await signIn(app, via(attacker), owner.user.email, VALID_PASSWORD);
    expect(merchant.status).toBe(200);
    const merchantDevice = cookieFrom(merchant, DEVICE_COOKIE);

    expect((await signIn(app, via(attacker), nobody(), WRONG)).status).toBe(401); // the 50th
    const waiting = await signIn(app, via(attacker, "198.51.100.250"), nobody(), WRONG);
    expect(waiting.status).toBe(429);
    expect(waiting.body.code).toBe("TOO_MANY_ATTEMPTS");
    expect(waiting.headers["retry-after"]).toBe("30");

    // No one else's guesses keep the merchant's own device out.
    expect((await signIn(app, via(attacker), owner.user.email, VALID_PASSWORD, merchantDevice)).status).toBe(200);
    // Another address has its own count.
    expect((await signIn(app, via("203.0.113.10"), nobody(), WRONG)).status).toBe(401);
  });

  it("does the same for admin sign-in, counted apart from merchant sign-in", async () => {
    const { app } = await createTestApp();
    const attacker = "203.0.113.20";

    for (let i = 0; i < 50; i += 1) {
      expect((await adminSignIn(app, via(attacker), nobody(), WRONG)).status).toBe(401);
    }
    expect((await adminSignIn(app, via(attacker), nobody(), WRONG)).status).toBe(429);
    // The admin's own account from that address waits too: it has no known device yet.
    expect((await adminSignIn(app, via(attacker), config.admin.email!, ADMIN_TEST_PASSWORD)).status).toBe(429);
    // Merchant sign-in from the same address is counted separately.
    expect((await signIn(app, via(attacker), nobody(), WRONG)).status).toBe(401);
  });
});

describe("forgot password, limited per address", () => {
  it("answers ten requests from one address, then makes it wait; another address carries on", async () => {
    const { app } = await createTestApp();
    const attacker = "203.0.113.30";

    for (let i = 0; i < 10; i += 1) {
      expect((await forgot(app, via(attacker, `198.51.100.${i}`), nobody())).status).toBe(200);
    }
    const waiting = await forgot(app, via(attacker), nobody());
    expect(waiting.status).toBe(429);
    // A minute from the tenth request, whose answer itself waited a second.
    expect(Number(waiting.headers["retry-after"])).toBeGreaterThanOrEqual(58);
    expect(Number(waiting.headers["retry-after"])).toBeLessThanOrEqual(60);
    expect((await forgot(app, via("203.0.113.31"), nobody())).status).toBe(200);
  });
});

describe("the Google callback, limited per address", () => {
  it("asks Google at most 20 times for one address, then makes it wait; another address carries on", async () => {
    const { app } = await createTestApp();
    const attacker = "203.0.113.40";

    for (let i = 0; i < 20; i += 1) {
      const res = await googleCallback(app, via(attacker));
      expect(res.headers.location).toMatch(/^\/login\?error=/);
    }
    expect(tokenRequests).toBe(20);

    const waiting = await googleCallback(app, via(attacker));
    expect(decodeURIComponent(waiting.headers.location)).toMatch(/Too many attempts\. Please try again in 30 seconds\./);
    expect(tokenRequests).toBe(20);

    await googleCallback(app, via("203.0.113.41"));
    expect(tokenRequests).toBe(21);
  });

  it("never counts a sign-in cancelled at Google, or one that fails its state check", async () => {
    const { app } = await createTestApp();
    const from = via("203.0.113.50");

    for (let i = 0; i < 25; i += 1) {
      await request(app).get("/api/auth/google/callback?error=access_denied").set(from);
      await request(app).get("/api/auth/google/callback?code=x&state=not-this-browsers").set(from);
    }
    await googleCallback(app, from);
    expect(tokenRequests).toBe(1);
  });
});
