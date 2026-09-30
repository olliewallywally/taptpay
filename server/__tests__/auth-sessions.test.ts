import "./support/test-env";
import { ADMIN_TEST_PASSWORD } from "./support/admin-sign-in-test-env";

import crypto from "crypto";
import fs from "fs";
import path from "path";
import request from "supertest";
import { config } from "../config";
import { newHandoffCode } from "../google-sign-in";
import { sseBroker } from "../sse-broker";
import {
  ADMIN_SESSION_IDLE_MS,
  ADMIN_SESSION_MAX_MS,
  BUSINESS_SESSION_IDLE_MS,
  BUSINESS_SESSION_MAX_MS,
  SESSION_REPLACED_GRACE_MS,
  SESSION_ROTATE_AFTER_MS,
} from "../auth-sessions";
import {
  VALID_PASSWORD,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  openEventStream,
  resetTestStorage,
  storage,
  storageSnapshot,
  useFakeClock,
} from "./support/http-harness";

/**
 * R1-T4 phase E (owner decisions 2026-09-29 and 2026-09-30,
 * docs/PLAN-2026-09-29-r1-t4-phase-e-sessions.md). A sign-in was a one-hour JWT that the page kept in
 * localStorage, where any script on the page could read it, and that nothing could end early one device
 * at a time. Now each sign-in is a session the server keeps: the browser holds `<id>.<secret>` in an
 * HttpOnly `__Host-` cookie (only the secret's SHA-256 is stored), a change needs the page's CSRF token,
 * a business sign-in lasts 1 day unused and 7 days at most (the admin's 30 minutes and 12 hours), the
 * secret is swapped daily, and a replaced secret used after the swap ends the session.
 */

type App = Awaited<ReturnType<typeof createTestApp>>["app"];

const BUSINESS = "__Host-taptpay-session";
const ADMIN = "__Host-taptpay-admin-session";
const COOKIE_VALUE = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;
const CSRF_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const SECURITY_LOG = path.join(process.cwd(), "logs", "security-audit.log");

jest.setTimeout(30_000);
beforeEach(() => {
  resetTestStorage();
  sseBroker.clear();
});

/** Every Set-Cookie line of a response, by cookie name. */
function setCookies(res: request.Response): Map<string, string> {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  return new Map((raw ?? []).map((line) => [line.split("=")[0], line]));
}
const valueOf = (line: string | undefined) => line?.split(";")[0].split("=").slice(1).join("=") ?? "";
const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const idOf = (cookieValue: string) => cookieValue.split(".")[0];
const secretOf = (cookieValue: string) => cookieValue.split(".")[1];
const cleared = (line: string | undefined) => /Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(line ?? "");

/** A browser's view of one sign-in: its cookie, which a response may replace, and the page's CSRF token. */
interface Browser {
  name: string;
  cookie: string;
  csrf: string;
}

function follow(browser: Browser, res: request.Response): request.Response {
  const next = setCookies(res).get(browser.name);
  if (next && !cleared(next)) browser.cookie = valueOf(next);
  return res;
}

async function send(
  app: App,
  browser: Browser,
  method: "get" | "post" | "put" | "patch" | "delete",
  url: string,
  options: { csrf?: string | null; body?: unknown } = {},
) {
  let call = request(app)[method](url).set("Cookie", `${browser.name}=${browser.cookie}`);
  const csrf = options.csrf === undefined ? browser.csrf : options.csrf;
  if (method !== "get" && csrf !== null) call = call.set("X-CSRF-Token", csrf);
  if (options.body !== undefined) call = call.send(options.body as object);
  return follow(browser, await call);
}

async function signIn(app: App, email: string, password = VALID_PASSWORD, userAgent = MAC_CHROME): Promise<Browser> {
  const res = await request(app).post("/api/auth/login").set("User-Agent", userAgent).send({ email, password });
  expect(res.status).toBe(200);
  const line = setCookies(res).get(BUSINESS);
  expect(line).toBeDefined();
  const browser: Browser = { name: BUSINESS, cookie: valueOf(line), csrf: "" };
  const started = await send(app, browser, "get", "/api/auth/session");
  expect(started.body.signedIn).toBe(true);
  browser.csrf = started.body.csrfToken;
  expect(browser.csrf).toBe(res.body.csrfToken);
  return browser;
}

async function adminSignIn(app: App): Promise<Browser> {
  const res = await request(app).post("/api/admin/auth/login").send({ email: config.admin.email, password: ADMIN_TEST_PASSWORD });
  expect(res.status).toBe(200);
  const line = setCookies(res).get(ADMIN);
  expect(line).toBeDefined();
  const browser: Browser = { name: ADMIN, cookie: valueOf(line), csrf: "" };
  const me = await send(app, browser, "get", "/api/admin/auth/me");
  expect(me.status).toBe(200);
  browser.csrf = me.body.csrfToken;
  return browser;
}

const me = (app: App, browser: Browser) => send(app, browser, "get", "/api/auth/me");

function securityLogLinesAbout(sessionId: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(SECURITY_LOG)) return [];
  return fs.readFileSync(SECURITY_LOG, "utf8").split("\n")
    .filter((line) => line.includes(sessionId))
    .map((line) => JSON.parse(line));
}

describe("signing in starts a session the server keeps", () => {
  it("a password sign-in sets an HttpOnly, Secure, SameSite=Lax, host-only cookie that lasts 7 days", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const res = await request(app).post("/api/auth/login").send({ email: owner.user.email, password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    const line = setCookies(res).get(BUSINESS)!;
    expect(valueOf(line)).toMatch(COOKIE_VALUE);
    expect(line).toMatch(/;\s*HttpOnly/i);
    expect(line).toMatch(/;\s*Secure/i);
    expect(line).toMatch(/;\s*SameSite=Lax/i);
    expect(line).toMatch(/;\s*Path=\/(;|$)/);
    expect(line).not.toMatch(/Domain=/i);
    expect(line).toMatch(new RegExp(`Max-Age=${BUSINESS_SESSION_MAX_MS / 1000}(;|$)`));
    expect(JSON.stringify(res.body)).not.toContain(secretOf(valueOf(line)));
  });

  it("keeps only the secret's digest, the login, its session version and a device label — no address", async () => {
    const clock = useFakeClock(new Date("2026-10-01T09:00:00.000Z"));
    try {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const browser = await signIn(app, owner.user.email);
      const row = await storage.getAuthSession(idOf(browser.cookie));
      const login = await storage.getUserById(owner.user.id);

      expect(row).toMatchObject({
        principal: "business",
        userId: owner.user.id,
        sessionVersion: login!.sessionVersion,
        adminTag: null,
        secretHash: sha256(secretOf(browser.cookie)),
        deviceLabel: "Chrome on macOS",
        revokedAt: null,
        revokedReason: null,
      });
      expect(row!.idleExpiresAt.getTime()).toBe(Date.parse("2026-10-01T09:00:00.000Z") + BUSINESS_SESSION_IDLE_MS);
      expect(row!.absoluteExpiresAt.getTime()).toBe(Date.parse("2026-10-01T09:00:00.000Z") + BUSINESS_SESSION_MAX_MS);
      const stored = JSON.stringify(row);
      expect(stored).not.toContain(secretOf(browser.cookie));
      expect(stored).not.toMatch(/127\.0\.0\.1|::1|::ffff/);
    } finally {
      clock.restore();
    }
  });

  it("a refused sign-in starts no session", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const res = await request(app).post("/api/auth/login").send({ email: owner.user.email, password: "Wrong-password-1" });

    expect(res.status).toBe(401);
    expect(setCookies(res).get(BUSINESS)).toBeUndefined();
  });

  it("redeeming Google sign-in's one-time code starts a session too", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const handoff = newHandoffCode();
    await storage.createAuthHandoffCode({
      codeHash: handoff.codeHash, userId: owner.user.id, newUser: false, expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await request(app).post("/api/auth/google/session").set("Cookie", `__Host-taptpay-google-handoff=${handoff.code}`);

    expect(res.status).toBe(200);
    const browser: Browser = { name: BUSINESS, cookie: valueOf(setCookies(res).get(BUSINESS)), csrf: "" };
    expect(browser.cookie).toMatch(COOKIE_VALUE);
    expect((await me(app, browser)).body.user.email).toBe(owner.user.email);
  });

  it("the admin's sign-in sets the admin's own cookie, for 12 hours", async () => {
    const { app } = await createTestApp();
    const res = await request(app).post("/api/admin/auth/login").send({ email: config.admin.email, password: ADMIN_TEST_PASSWORD });

    expect(res.status).toBe(200);
    const line = setCookies(res).get(ADMIN)!;
    expect(valueOf(line)).toMatch(COOKIE_VALUE);
    expect(line).toMatch(/;\s*HttpOnly/i);
    expect(line).toMatch(/;\s*Secure/i);
    expect(line).toMatch(/;\s*SameSite=Lax/i);
    expect(line).toMatch(new RegExp(`Max-Age=${ADMIN_SESSION_MAX_MS / 1000}(;|$)`));
    expect(setCookies(res).get(BUSINESS)).toBeUndefined();
    const row = await storage.getAuthSession(idOf(valueOf(line)));
    expect(row).toMatchObject({ principal: "admin", userId: null, sessionVersion: null });
    expect(row!.adminTag).toEqual(expect.any(String));
  });
});

describe("the cookie is the sign-in", () => {
  it("the start-up check answers the cookie alone, with the page's CSRF token, never cached", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const browser = await signIn(app, owner.user.email);

    const res = await send(app, browser, "get", "/api/auth/session");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      signedIn: true,
      user: expect.objectContaining({ email: owner.user.email, merchantId: owner.merchantId, role: "owner" }),
      csrfToken: expect.stringMatching(CSRF_TOKEN),
    });
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    // The same login as the token check reads it.
    expect(res.body.user).toEqual((await me(app, browser)).body.user);
  });

  it("the start-up check answers a visitor who is not signed in with an ordinary 200, and clears a dead cookie", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const browser = await signIn(app, owner.user.email);
    const admin = await adminSignIn(app);

    const anonymous = await request(app).get("/api/auth/session");
    expect(anonymous.status).toBe(200);
    expect(anonymous.body).toEqual({ signedIn: false });
    expect(anonymous.headers["cache-control"]).toMatch(/no-store/);
    expect(setCookies(anonymous).get(BUSINESS)).toBeUndefined();

    const dead = await request(app).get("/api/auth/session").set("Cookie", `${BUSINESS}=${idOf(browser.cookie)}.${"x".repeat(43)}`);
    expect(dead.status).toBe(200);
    expect(dead.body).toEqual({ signedIn: false });
    expect(cleared(setCookies(dead).get(BUSINESS))).toBe(true);

    // The admin's cookie is not a business sign-in here.
    const adminOnly = await request(app).get("/api/auth/session").set("Cookie", `${ADMIN}=${admin.cookie}`);
    expect(adminOnly.body).toEqual({ signedIn: false });
    expect(adminOnly.headers["set-cookie"]).toBeUndefined();
  });

  it("business routes answer the cookie", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const browser = await signIn(app, owner.user.email);

    expect((await send(app, browser, "get", "/api/team")).status).toBe(200);
  });

  it("the admin cookie opens the admin area; a business cookie does not", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const business = await signIn(app, owner.user.email);
    const admin = await adminSignIn(app);

    const res = await send(app, admin, "get", "/api/admin/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.csrfToken).toMatch(CSRF_TOKEN);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect((await send(app, business, "get", "/api/admin/auth/me")).status).toBe(401);
  });

  it("on a business route the admin cookie is the platform admin, as the admin's token was (403)", async () => {
    const { app } = await createTestApp();
    const admin = await adminSignIn(app);

    expect((await send(app, admin, "get", "/api/team")).status).toBe(403);
  });

  it("with both cookies, a business route acts as the business and the admin area as the admin", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const business = await signIn(app, owner.user.email);
    const admin = await adminSignIn(app);
    const both = `${BUSINESS}=${business.cookie}; ${ADMIN}=${admin.cookie}`;

    const asBusiness = await request(app).get("/api/auth/me").set("Cookie", both);
    expect(asBusiness.body.user).toMatchObject({ email: owner.user.email, role: "owner" });
    const asAdmin = await request(app).get("/api/admin/auth/me").set("Cookie", both);
    expect(asAdmin.body.user).toMatchObject({ role: "admin", merchantId: 0 });
  });

  it("a malformed, unknown or wrong cookie is refused and cleared, and a wrong secret leaves the real session alone", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const browser = await signIn(app, owner.user.email);
    const wrongSecret = `${idOf(browser.cookie)}.${crypto.randomBytes(32).toString("base64url")}`;
    const unknownId = `${crypto.randomBytes(16).toString("base64url")}.${secretOf(browser.cookie)}`;

    for (const value of ["not-a-session", `${browser.cookie}x`, unknownId, wrongSecret]) {
      const res = await request(app).get("/api/auth/me").set("Cookie", `${BUSINESS}=${value}`);
      expect({ value, status: res.status }).toEqual({ value, status: 401 });
      expect({ value, cleared: cleared(setCookies(res).get(BUSINESS)) }).toEqual({ value, cleared: true });
    }
    expect((await me(app, browser)).status).toBe(200);
  });
});

describe("a change needs the page's CSRF token", () => {
  const change = (app: App, browser: Browser, csrf: string | null) =>
    send(app, browser, "patch", "/api/tutorial/pages/retail-terminal", { csrf, body: { generation: 1, status: "completed" } });

  it("without it, or with a wrong or another session's token, a change is refused 403 and changes nothing", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const browser = await signIn(app, owner.user.email);
    const other = await signIn(app, owner.user.email);

    for (const csrf of [null, "", "x".repeat(43), other.csrf]) {
      const before = storageSnapshot();
      const res = await change(app, browser, csrf);
      expect({ csrf, status: res.status, code: res.body.code }).toEqual({ csrf, status: 403, code: "CSRF_REJECTED" });
      expect(storageSnapshot()).toBe(before);
    }
  });

  it("with the page's own token the same change succeeds", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const browser = await signIn(app, owner.user.email);

    const res = await change(app, browser, browser.csrf);
    expect(res.status).toBe(200);
  });

  it("the admin area's changes need the admin session's token", async () => {
    const { app } = await createTestApp();
    const admin = await adminSignIn(app);

    const refused = await send(app, admin, "post", "/api/admin/auth/logout", { csrf: null });
    expect(refused.status).toBe(403);
    expect((await send(app, admin, "get", "/api/admin/auth/me")).status).toBe(200);
  });
});

describe("how long a sign-in lasts", () => {
  const T0 = new Date("2026-10-05T08:00:00.000Z");
  const HOUR = 60 * 60_000;

  it("a business session ends after 24 hours unused; each use moves that forward", async () => {
    const clock = useFakeClock(T0);
    try {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const unused = await signIn(app, owner.user.email);
      const used = await signIn(app, owner.user.email);

      clock.advance(23 * HOUR);
      expect((await me(app, used)).status).toBe(200);
      clock.advance(BUSINESS_SESSION_IDLE_MS - 23 * HOUR + 1_000);
      const ended = await me(app, unused);
      expect(ended.status).toBe(401);
      expect(ended.body.code).toBe("SESSION_ENDED");
      expect(cleared(setCookies(ended).get(BUSINESS))).toBe(true);
      expect((await me(app, used)).status).toBe(200);
    } finally {
      clock.restore();
    }
  });

  it("and after 7 days, however often it is used", async () => {
    const clock = useFakeClock(T0);
    try {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const browser = await signIn(app, owner.user.email);

      let elapsed = 0;
      while (elapsed + 20 * HOUR < BUSINESS_SESSION_MAX_MS) {
        clock.advance(20 * HOUR);
        elapsed += 20 * HOUR;
        expect({ elapsed, status: (await me(app, browser)).status }).toEqual({ elapsed, status: 200 });
      }
      clock.advance(BUSINESS_SESSION_MAX_MS - elapsed + 1_000);
      const ended = await me(app, browser);
      expect(ended.status).toBe(401);
      expect(ended.body.code).toBe("SESSION_ENDED");
    } finally {
      clock.restore();
    }
  });

  it("the 7-day limit holds on its own, even where the unused limit would allow more", async () => {
    const clock = useFakeClock(T0);
    try {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const browser = await signIn(app, owner.user.email);
      const row = (await storage.getAuthSession(idOf(browser.cookie)))!;
      const secret = crypto.randomBytes(32).toString("base64url");
      const id = crypto.randomBytes(16).toString("base64url");
      await storage.createAuthSession({
        ...row, id, secretHash: sha256(secret),
        absoluteExpiresAt: new Date(T0.getTime() + HOUR), idleExpiresAt: new Date(T0.getTime() + 20 * HOUR),
      }, new Date());

      clock.advance(HOUR + 1_000);
      const ended = await request(app).get("/api/auth/me").set("Cookie", `${BUSINESS}=${id}.${secret}`);
      expect(ended.status).toBe(401);
      expect(ended.body.code).toBe("SESSION_ENDED");
    } finally {
      clock.restore();
    }
  });

  it("a use never moves the unused limit past the 7-day one", async () => {
    const clock = useFakeClock(T0);
    try {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const browser = await signIn(app, owner.user.email);
      let elapsed = 0;
      while (elapsed + 20 * HOUR < BUSINESS_SESSION_MAX_MS - 2 * HOUR) {
        clock.advance(20 * HOUR);
        elapsed += 20 * HOUR;
        await me(app, browser);
      }
      clock.advance(BUSINESS_SESSION_MAX_MS - 2 * HOUR - elapsed);
      expect((await me(app, browser)).status).toBe(200);
      const row = (await storage.getAuthSession(idOf(browser.cookie)))!;
      expect(row.lastUsedAt.getTime()).toBe(T0.getTime() + BUSINESS_SESSION_MAX_MS - 2 * HOUR);
      expect(row.idleExpiresAt.getTime()).toBe(row.absoluteExpiresAt.getTime());
    } finally {
      clock.restore();
    }
  });

  it("the admin's session ends after 30 minutes unused, and after 12 hours however often it is used", async () => {
    const clock = useFakeClock(T0);
    try {
      const { app } = await createTestApp();
      const unused = await adminSignIn(app);
      const used = await adminSignIn(app);
      const adminMe = (browser: Browser) => send(app, browser, "get", "/api/admin/auth/me");

      clock.advance(ADMIN_SESSION_IDLE_MS - 60_000);
      expect((await adminMe(used)).status).toBe(200);
      clock.advance(60_000 + 1_000);
      expect((await adminMe(unused)).status).toBe(401);
      expect((await adminMe(used)).status).toBe(200);

      let elapsed = ADMIN_SESSION_IDLE_MS + 1_000;
      while (elapsed + 25 * 60_000 < ADMIN_SESSION_MAX_MS) {
        clock.advance(25 * 60_000);
        elapsed += 25 * 60_000;
        expect({ elapsed, status: (await adminMe(used)).status }).toEqual({ elapsed, status: 200 });
      }
      clock.advance(ADMIN_SESSION_MAX_MS - elapsed + 1_000);
      expect((await adminMe(used)).status).toBe(401);
    } finally {
      clock.restore();
    }
  });

  it("a use is written at most once a minute", async () => {
    const clock = useFakeClock(T0);
    try {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const browser = await signIn(app, owner.user.email);
      const lastUsed = async () => (await storage.getAuthSession(idOf(browser.cookie)))!.lastUsedAt.getTime();

      clock.advance(30_000);
      await me(app, browser);
      expect(await lastUsed()).toBe(T0.getTime());
      clock.advance(31_000);
      await me(app, browser);
      expect(await lastUsed()).toBe(T0.getTime() + 61_000);
    } finally {
      clock.restore();
    }
  });
});

describe("the daily swap of the secret", () => {
  const T0 = new Date("2026-10-06T08:00:00.000Z");

  async function signedInADayAgo() {
    const clock = useFakeClock(T0);
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const browser = await signIn(app, owner.user.email);
    clock.advance(20 * 60 * 60_000);
    expect((await me(app, browser)).status).toBe(200);
    clock.advance(SESSION_ROTATE_AFTER_MS - 20 * 60 * 60_000 + 1_000);
    return { clock, app, owner, browser, first: browser.cookie };
  }

  it("after a day a response offers a new secret for the same session; the old one works until the new one is used", async () => {
    const { clock, app, browser, first } = await signedInADayAgo();
    try {
      const offered = await request(app).get("/api/auth/me").set("Cookie", `${BUSINESS}=${first}`);
      expect(offered.status).toBe(200);
      const second = valueOf(setCookies(offered).get(BUSINESS));
      expect(second).toMatch(COOKIE_VALUE);
      expect(idOf(second)).toBe(idOf(first));
      expect(secretOf(second)).not.toBe(secretOf(first));
      expect(setCookies(offered).get(BUSINESS)).toMatch(/;\s*HttpOnly/i);

      // The response was lost: the device keeps sending the old secret, and is not signed out.
      clock.advance(10 * 60_000);
      const stillOld = await request(app).get("/api/auth/me").set("Cookie", `${BUSINESS}=${first}`);
      expect(stillOld.status).toBe(200);
      const reoffered = valueOf(setCookies(stillOld).get(BUSINESS));
      expect(idOf(reoffered)).toBe(idOf(first));
      expect(secretOf(reoffered)).not.toBe(secretOf(second));
      const row = await storage.getAuthSession(idOf(first));
      expect(row!.revokedAt).toBeNull();

      browser.cookie = reoffered;
      expect((await me(app, browser)).status).toBe(200);
      expect((await storage.getAuthSession(idOf(first)))!.secretHash).toBe(sha256(secretOf(reoffered)));
    } finally {
      clock.restore();
    }
  });

  it("a replaced secret works for 60 seconds after the new one's first use (requests in flight)", async () => {
    const { clock, app, browser, first } = await signedInADayAgo();
    try {
      await me(app, browser); // offered, and followed
      expect(browser.cookie).not.toBe(first);
      await me(app, browser); // first use of the new secret
      clock.advance(SESSION_REPLACED_GRACE_MS - 5_000);
      const inFlight = await request(app).get("/api/auth/me").set("Cookie", `${BUSINESS}=${first}`);
      expect(inFlight.status).toBe(200);
    } finally {
      clock.restore();
    }
  });

  it("a replaced secret used after that ends the whole session, and is logged as reuse", async () => {
    const { clock, app, browser, first } = await signedInADayAgo();
    try {
      await me(app, browser);
      await me(app, browser);
      clock.advance(SESSION_REPLACED_GRACE_MS + 1_000);

      const copy = await request(app).get("/api/auth/me").set("Cookie", `${BUSINESS}=${first}`);
      expect(copy.status).toBe(401);
      expect(copy.body.code).toBe("SESSION_ENDED");
      expect((await me(app, browser)).status).toBe(401);
      expect(await storage.getAuthSession(idOf(first))).toMatchObject({ revokedReason: "reuse_detected" });
      const logged = securityLogLinesAbout(idOf(first));
      expect(logged.map((line) => line.event)).toContain("SESSION_REUSE_DETECTED");
      expect(JSON.stringify(logged)).not.toContain(secretOf(first));
    } finally {
      clock.restore();
    }
  });
});

describe("every way a session ends", () => {
  it("the business Log Out refuses the platform admin, whose area has its own", async () => {
    const { app } = await createTestApp();
    const admin = await adminSignIn(app);

    const res = await request(app).post("/api/auth/logout").set("Cookie", `${ADMIN}=${admin.cookie}`).set("X-CSRF-Token", admin.csrf);
    expect(res.status).toBe(403);
    expect((await send(app, admin, "get", "/api/admin/auth/me")).status).toBe(200);
  });

  it("Log Out ends this session only, and clears its cookie", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const phone = await signIn(app, owner.user.email);
    const laptop = await signIn(app, owner.user.email);
    const phoneCookie = phone.cookie;

    const res = await send(app, phone, "post", "/api/auth/logout");
    expect(res.status).toBe(204);
    expect(cleared(setCookies(res).get(BUSINESS))).toBe(true);
    expect((await request(app).get("/api/auth/me").set("Cookie", `${BUSINESS}=${phoneCookie}`)).status).toBe(401);
    expect((await me(app, laptop)).status).toBe(200);
    expect(await storage.getAuthSession(idOf(phoneCookie))).toMatchObject({ revokedReason: "logout" });
    const logged = securityLogLinesAbout(idOf(phoneCookie));
    expect(logged.map((line) => line.event)).toContain("SESSION_REVOKED");
    expect(JSON.stringify(logged)).not.toContain(secretOf(phoneCookie));
  });

  it("sign out everywhere ends every session of the login, and no one else's", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const phone = await signIn(app, owner.user.email);
    const laptop = await signIn(app, owner.user.email);
    const teammate = await signIn(app, member.user.email);

    const res = await send(app, phone, "post", "/api/auth/sign-out-everywhere");
    expect(res.status).toBe(204);
    expect(cleared(setCookies(res).get(BUSINESS))).toBe(true);
    expect((await me(app, phone)).status).toBe(401);
    expect((await me(app, laptop)).status).toBe(401);
    expect((await me(app, teammate)).status).toBe(200);
    expect(await storage.getAuthSession(idOf(laptop.cookie))).toMatchObject({ revokedReason: "sign_out_everywhere" });
  });

  it("advancing the login's session version alone ends its sessions (should recording the ends fail)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const phone = await signIn(app, owner.user.email);

    expect(await storage.advanceUserSessionVersion(owner.user.id)).toBe(true);

    const res = await me(app, phone);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_ENDED");
    expect((await storage.getAuthSession(idOf(phone.cookie)))!.revokedAt).toBeNull();
  });

  it("a password reset ends every session of the login", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const phone = await signIn(app, owner.user.email);
    const resetToken = crypto.randomBytes(32).toString("hex");
    await storage.setUserResetToken(owner.user.id, sha256(resetToken), new Date(Date.now() + 60 * 60_000));

    const res = await request(app).post("/api/auth/reset-password").send({ token: resetToken, password: "New-password-2", confirmPassword: "New-password-2" });
    expect(res.status).toBe(200);
    expect((await me(app, phone)).status).toBe(401);
    expect(await storage.getAuthSession(idOf(phone.cookie))).toMatchObject({ revokedReason: "password_reset" });
  });

  it("a password change ends the login's other sessions and keeps this device signed in, under a new session", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const phone = await signIn(app, owner.user.email);
    const laptop = await signIn(app, owner.user.email);
    const oldPhoneCookie = phone.cookie;

    const res = await send(app, phone, "put", `/api/merchants/${owner.merchantId}/change-password`, {
      body: { currentPassword: VALID_PASSWORD, newPassword: "New-password-3", confirmPassword: "New-password-3" },
    });
    expect(res.status).toBe(200);
    expect(phone.cookie).not.toBe(oldPhoneCookie);
    expect(idOf(phone.cookie)).not.toBe(idOf(oldPhoneCookie));
    expect((await me(app, phone)).status).toBe(200);
    expect((await request(app).get("/api/auth/me").set("Cookie", `${BUSINESS}=${oldPhoneCookie}`)).status).toBe(401);
    expect((await me(app, laptop)).status).toBe(401);
    expect(await storage.getAuthSession(idOf(laptop.cookie))).toMatchObject({ revokedReason: "password_change" });
  });

  it("disabling a teammate ends their sessions", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const ownerBrowser = await signIn(app, owner.user.email);
    const teammate = await signIn(app, member.user.email);

    const res = await send(app, ownerBrowser, "put", `/api/team/${member.user.id}/status`, { body: { status: "disabled" } });
    expect(res.status).toBe(200);
    expect((await me(app, teammate)).status).toBe(401);
    expect(await storage.getAuthSession(idOf(teammate.cookie))).toMatchObject({ revokedReason: "login_disabled" });
    expect((await me(app, ownerBrowser)).status).toBe(200);
  });

  it("removing a teammate ends their sessions", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const ownerBrowser = await signIn(app, owner.user.email);
    const teammate = await signIn(app, member.user.email);

    const res = await send(app, ownerBrowser, "delete", `/api/team/${member.user.id}`);
    expect(res.status).toBe(200);
    expect((await me(app, teammate)).status).toBe(401);
    const row = await storage.getAuthSession(idOf(teammate.cookie));
    expect(row === undefined || row.revokedReason === "login_removed").toBe(true);
  });

  it("the admin's Log Out ends the admin's session", async () => {
    const { app } = await createTestApp();
    const admin = await adminSignIn(app);
    const cookie = admin.cookie;

    const res = await send(app, admin, "post", "/api/admin/auth/logout");
    expect(res.status).toBe(204);
    expect(cleared(setCookies(res).get(ADMIN))).toBe(true);
    expect((await request(app).get("/api/admin/auth/me").set("Cookie", `${ADMIN}=${cookie}`)).status).toBe(401);
    expect(await storage.getAuthSession(idOf(cookie))).toMatchObject({ revokedReason: "logout" });
  });

  it("an admin session started under other admin credentials is refused", async () => {
    const { app } = await createTestApp();
    const admin = await adminSignIn(app);
    const row = (await storage.getAuthSession(idOf(admin.cookie)))!;
    const secret = crypto.randomBytes(32).toString("base64url");
    const id = crypto.randomBytes(16).toString("base64url");
    await storage.createAuthSession({ ...row, id, secretHash: sha256(secret), adminTag: "a".repeat(43) }, new Date());

    expect((await request(app).get("/api/admin/auth/me").set("Cookie", `${ADMIN}=${id}.${secret}`)).status).toBe(401);
    expect((await send(app, admin, "get", "/api/admin/auth/me")).status).toBe(200);
  });
});

describe("live updates follow the session", () => {
  it("the business's event stream opens on the cookie alone", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const browser = await signIn(app, owner.user.email);

    const stream = await openEventStream(app, `/api/merchants/${owner.merchantId}/events`, { Cookie: `${BUSINESS}=${browser.cookie}` });
    try {
      expect(stream.status).toBe(200);
      expect(await stream.nextEvent()).toMatchObject({ type: "connected", audience: "merchant" });
    } finally {
      await stream.close();
    }
  });

  it("Log Out closes that session's streams and no other", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const phone = await signIn(app, owner.user.email);
    const laptop = await signIn(app, owner.user.email);
    const phoneStream = await openEventStream(app, `/api/merchants/${owner.merchantId}/events`, { Cookie: `${BUSINESS}=${phone.cookie}` });
    const laptopStream = await openEventStream(app, `/api/merchants/${owner.merchantId}/events`, { Cookie: `${BUSINESS}=${laptop.cookie}` });
    try {
      await phoneStream.nextEvent();
      await laptopStream.nextEvent();
      expect(sseBroker.subscriberCount(owner.merchantId)).toBe(2);

      expect((await send(app, phone, "post", "/api/auth/logout")).status).toBe(204);

      expect(sseBroker.subscriberCount(owner.merchantId)).toBe(1);
      sseBroker.broadcast(owner.merchantId, null, { type: "ping-after-logout" });
      expect(await laptopStream.nextEvent()).toMatchObject({ type: "ping-after-logout" });
    } finally {
      await phoneStream.close();
      await laptopStream.close();
    }
  });
});
