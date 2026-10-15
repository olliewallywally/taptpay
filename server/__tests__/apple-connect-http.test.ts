import "./support/test-env";
import { APPLE_TEST_SERVICES_ID } from "./support/apple-sign-in-test-env";

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as auth from "../auth";
import { config } from "../config";
import {
  VALID_PASSWORD, createAdminPrincipal, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, signedIn, storage, useFakeClock,
  type Principal,
} from "./support/http-harness";
import { businessSessionBegunBy } from "./support/session-browser";

/**
 * R1-T5c: a signed-in owner connects Apple to the login they already have, and disconnects it,
 * against a stand-in Apple. Apple's return is a cross-site post with no session cookie on it, so the
 * login and session that asked ride in the starting cookie under the server's signature, and the
 * session must still be live when Apple returns. Nothing leaves the machine: fetch is replaced.
 */
jest.setTimeout(60_000); // every start checks the password with a real bcrypt compare

const ISSUER = "https://appleid.apple.com";
const OAUTH_COOKIE = "__Host-taptpay-apple-oauth";
const HANDOFF_COOKIE = "__Host-taptpay-apple-handoff";
const SESSION_COOKIE = "__Host-taptpay-session";
const WRONG = "Wrong-password-1";
const OWNER_ONLY = { message: "Only the account owner can do this." };

const apple = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const stranger = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const held = storage as any;
const seconds = () => Math.floor(Date.now() / 1000);
const newSubject = () => `001234.${crypto.randomBytes(16).toString("hex")}.0123`;
const newEmail = (who = "person") => `${who}.${crypto.randomBytes(4).toString("hex")}@example.test`;

type TokenAnswer = { status?: number; body?: unknown; fail?: boolean };
let tokenAnswer: TokenAnswer;
let whileAppleIsAsked: (() => Promise<unknown>) | undefined;
let appleRequests: Array<{ url: string; form: URLSearchParams }>;
let fetchSpy: jest.SpyInstance;
let securityLog: jest.SpyInstance;

beforeEach(() => {
  resetTestStorage();
  appleRequests = [];
  tokenAnswer = {};
  whileAppleIsAsked = undefined;
  securityLog = jest.spyOn(auth, "logSecurityEvent").mockImplementation(() => undefined);
  fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    appleRequests.push({ url, form: new URLSearchParams(String(init?.body ?? "")) });
    if (url === "https://appleid.apple.com/auth/keys") {
      return new Response(JSON.stringify({ keys: [{ ...apple.publicKey.export({ format: "jwk" }), kid: "apple-key-1", use: "sig", alg: "RS256" }] }), { status: 200 });
    }
    if (url === "https://appleid.apple.com/auth/token") {
      await whileAppleIsAsked?.();
      if (tokenAnswer.fail) throw new Error("synthetic network failure");
      return new Response(JSON.stringify(tokenAnswer.body ?? {}), { status: tokenAnswer.status ?? 200 });
    }
    throw new Error(`unexpected outbound request in test: ${url}`);
  });
});
afterEach(() => { fetchSpy.mockRestore(); jest.restoreAllMocks(); });

const exchanges = () => appleRequests.filter((made) => made.url === "https://appleid.apple.com/auth/token");
function setCookies(res: request.Response): Map<string, string> {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  return new Map((raw ?? []).map((line) => [line.split("=")[0], line]));
}
const cookieValue = (line: string | undefined) => line?.split(";")[0].split("=").slice(1).join("=") ?? "";
/** Where a return sends the browser: always Settings, with one fixed word. */
function outcome(res: request.Response): string | null {
  const target = new URL(res.headers.location, "https://harness.test");
  expect([res.status, target.pathname, [...target.searchParams.keys()]]).toEqual([303, "/settings", ["apple"]]);
  return target.searchParams.get("apple");
}
const loginError = (res: request.Response) => new URL(res.headers.location, "https://harness.test").searchParams.get("error");

type Person = { sub: string; email?: string; relay?: boolean; verified?: unknown };
function identityToken(nonce: string, person: Person, change: Record<string, unknown> = {}, key = apple.privateKey) {
  const claims: Record<string, unknown> = {
    iss: ISSUER, aud: APPLE_TEST_SERVICES_ID, sub: person.sub, nonce, iat: seconds() - 5, exp: seconds() + 600,
    ...(person.email ? { email: person.email, email_verified: person.verified ?? "true", is_private_email: person.relay ? "true" : "false" } : {}),
    ...change,
  };
  return jwt.sign(claims, key, { algorithm: "RS256", header: { alg: "RS256", kid: "apple-key-1" } as any });
}

const connect = (app: any, who: Pick<Principal, "cookie" | "csrf">, body: unknown = { currentPassword: VALID_PASSWORD }) =>
  request(app).post("/api/auth/apple/connect").set(signedIn(who)).send(body as object);
const disconnect = (app: any, who: Pick<Principal, "cookie" | "csrf">, body: unknown = { currentPassword: VALID_PASSWORD }) =>
  request(app).post("/api/auth/apple/disconnect").set(signedIn(who)).send(body as object);
const connection = (app: any, who: Pick<Principal, "cookie" | "csrf">) => request(app).get("/api/auth/apple/connection").set("Cookie", who.cookie);

/** The signed-in owner starts: Apple's address for the page to go to, and the cookie that names who asked. */
async function begin(app: any, owner: Principal) {
  const res = await connect(app, owner);
  if (res.status !== 200) throw new Error(`fixture: the connect start answered ${res.status} ${JSON.stringify(res.body)}`);
  const target = new URL(res.body.url);
  const line = setCookies(res).get(OAUTH_COOKIE) ?? "";
  return { res, target, line, state: target.searchParams.get("state")!, nonce: target.searchParams.get("nonce")!, cookie: `${OAUTH_COOKIE}=${cookieValue(line)}` };
}
/** Apple's form post back to us, from Apple's own origin, carrying this browser's starting cookie and no session cookie. */
function appleReturns(app: any, started: { state: string; cookie: string }, form: Record<string, string> = {}, headers: Record<string, string> = {}) {
  return request(app).post("/api/auth/apple/callback").type("form")
    .set({ Origin: "https://appleid.apple.com", Cookie: started.cookie, ...headers })
    .send({ state: started.state, code: "apple-code-1", ...form });
}
async function connectAs(app: any, owner: Principal, person: Person, change: Record<string, unknown> = {}) {
  const started = await begin(app, owner);
  tokenAnswer = { body: { id_token: identityToken(started.nonce, person, change) } };
  return { started, res: await appleReturns(app, started) };
}
/** A sign-in with Apple by someone who is not signed in (R1-T5b), to see who an identity signs in. */
async function signInWithApple(app: any, person: Person) {
  const start = await request(app).get("/api/auth/apple");
  const target = new URL(start.headers.location);
  tokenAnswer = { body: { id_token: identityToken(target.searchParams.get("nonce")!, person) } };
  const back = await appleReturns(app, { state: target.searchParams.get("state")!, cookie: `${OAUTH_COOKIE}=${cookieValue(setCookies(start).get(OAUTH_COOKIE))}` });
  if (back.headers.location !== "/login?apple=complete") return { back, session: undefined };
  const session = await request(app).post("/api/auth/apple/session").set("Cookie", `${HANDOFF_COOKIE}=${cookieValue(setCookies(back).get(HANDOFF_COOKIE))}`);
  return { back, session };
}
const identityOf = (sub: string) => held.getAppleIdentity({ issuer: ISSUER, clientId: APPLE_TEST_SERVICES_ID, subject: sub });
const everything = () => JSON.stringify([[...held.merchants.values()], [...held.users.values()], [...held.appleIdentities.values()]]);
/** The connect cookie's own signature, as the server makes it: to build a cookie no start would. */
const connectSignature = (payload: string) =>
  crypto.createHmac("sha256", Buffer.from(crypto.hkdfSync("sha256", config.jwtSecret, Buffer.alloc(0), "taptpay apple-connect v1", 32))).update(payload, "utf8").digest("base64url");
const logged = () => securityLog.mock.calls.filter(([event]) => String(event).startsWith("APPLE_"));

describe("R1-T5c — starting a connect", () => {
  test("the owner's password starts it: Apple's address for the page, and a cookie naming the login and session that asked", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const { res, target, line, state, nonce } = await begin(app, owner);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.body).toEqual({ url: expect.any(String) });
    expect(target.origin + target.pathname).toBe("https://appleid.apple.com/auth/authorize");
    expect(Object.fromEntries(target.searchParams)).toEqual({
      client_id: APPLE_TEST_SERVICES_ID, redirect_uri: "https://harness.test/api/auth/apple/callback",
      response_type: "code", response_mode: "form_post", scope: "name email", state, nonce,
    });
    expect(line).toMatch(/HttpOnly/i); expect(line).toMatch(/Secure/i); expect(line).toMatch(/SameSite=None/i);
    expect(line).toMatch(/Path=\//); expect(line).toMatch(/Max-Age=600/);
    const parts = cookieValue(line).split(".");
    expect(parts).toHaveLength(6);
    expect(parts.slice(0, 2)).toEqual([state, nonce]);
    expect(parts.slice(3, 5)).toEqual([String(owner.user.userId), owner.sessionId]);
    // Starting asks Apple nothing, writes nothing and begins no session.
    expect(appleRequests).toEqual([]);
    expect(held.appleIdentities.size).toBe(0);
    expect(setCookies(res).has(SESSION_COOKIE)).toBe(false);
    expect(logged()).toEqual([]);
  });

  test.each([
    ["nobody signed in", async () => ({ who: { cookie: "", csrf: "" }, status: 401, body: expect.objectContaining({ code: "INVALID_SESSION" }) })],
    ["a page without the CSRF token", async () => ({ who: { cookie: (await createOwnerPrincipal()).cookie, csrf: "" }, status: 403, body: expect.objectContaining({ code: "CSRF_REJECTED" }) })],
    ["a teammate", async () => ({ who: await createMemberPrincipal((await createOwnerPrincipal()).merchantId), status: 403, body: OWNER_ONLY })],
    ["the platform admin", async () => ({ who: await createAdminPrincipal(), status: 403, body: OWNER_ONLY })],
  ])("%s cannot start one, or disconnect, or read the connection", async (_who, make) => {
    const { app } = await createTestApp();
    const { who, status, body } = await make();
    const before = everything();
    // With the password and with none: who is asking is settled before the body is read.
    for (const res of [await connect(app, who), await disconnect(app, who), await connect(app, who, {}), await disconnect(app, who, {})]) {
      expect({ status: res.status, body: res.body }).toEqual({ status, body });
      expect(setCookies(res).has(OAUTH_COOKIE)).toBe(false);
    }
    const read = await connection(app, who);
    // A read needs no CSRF token: the owner's page without one still reads its own connection.
    if (_who !== "a page without the CSRF token") expect({ status: read.status, body: read.body }).toEqual({ status, body });
    expect(everything()).toBe(before);
    expect(appleRequests).toEqual([]);
  });

  test("a wrong or missing password starts nothing", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const wrong = await connect(app, owner, { currentPassword: WRONG });
    expect({ status: wrong.status, body: wrong.body }).toEqual({ status: 400, body: { message: "Current password is incorrect" } });
    expect(setCookies(wrong).has(OAUTH_COOKIE)).toBe(false);
    for (const body of [{}, { currentPassword: "" }, { currentPassword: 41 }, { currentPassword: ["Harness123"] }, { password: VALID_PASSWORD }]) {
      const res = await connect(app, owner, body);
      expect({ body, status: res.status, message: res.body.message }).toEqual({ body, status: 400, message: "Current password is required" });
      expect(setCookies(res).has(OAUTH_COOKIE)).toBe(false);
    }
    expect(appleRequests).toEqual([]);
  });

  test("the password check is counted with change-password's: five wrong between them, then every attempt waits", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const clock = useFakeClock(new Date("2026-10-04T12:00:00.000Z"));
    try {
      const changePassword = () => request(app).put(`/api/merchants/${owner.merchantId}/change-password`).set(signedIn(owner))
        .send({ currentPassword: WRONG, newPassword: "Changed-password-3", confirmPassword: "Changed-password-3" });
      expect([(await changePassword()).status, (await changePassword()).status]).toEqual([400, 400]);
      expect([(await connect(app, owner, { currentPassword: WRONG })).status, (await disconnect(app, owner, { currentPassword: WRONG })).status]).toEqual([400, 400]);
      expect((await connect(app, owner, { currentPassword: WRONG })).status).toBe(400);
      // The sixth waits, even with the right password, on all three.
      for (const slowed of [await connect(app, owner), await disconnect(app, owner), await changePassword()]) {
        expect(slowed.status).toBe(429);
        expect(slowed.body).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
        expect(setCookies(slowed).has(OAUTH_COOKIE)).toBe(false);
      }
      expect(securityLog).toHaveBeenCalledWith("PASSWORD_CHECK_SLOWED", { userId: owner.user.userId });
      clock.advance(16 * 60_000);
      // The right password clears the count: five more wrong ones are free again.
      expect((await connect(app, owner)).status).toBe(200);
      for (let attempt = 0; attempt < 5; attempt += 1) expect((await connect(app, owner, { currentPassword: WRONG })).status).toBe(400);
      expect((await connect(app, owner)).status).toBe(429);
    } finally { clock.restore(); }
  });

  test("a login that already has Apple connected is told so before anything else", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    expect(outcome((await connectAs(app, owner, { sub: newSubject(), email: newEmail() })).res)).toBe("connected");
    // Even a wrong password is not checked, so it costs no attempt.
    for (const body of [{ currentPassword: VALID_PASSWORD }, { currentPassword: WRONG }]) {
      const res = await connect(app, owner, body);
      expect({ status: res.status, body: res.body }).toEqual({ status: 409, body: { code: "APPLE_ALREADY_CONNECTED", message: "Apple is already connected to this login." } });
      expect(setCookies(res).has(OAUTH_COOKIE)).toBe(false);
    }
  });
});

describe("R1-T5c — Apple returns to a connect", () => {
  test("an Apple identity nobody has seen becomes the owner's, and then signs that owner in", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const before = JSON.stringify([[...held.merchants.values()], [...held.users.values()]]);
    const person = { sub: newSubject(), email: newEmail("apple") };
    const { res } = await connectAs(app, owner, person);
    expect(outcome(res)).toBe("connected");
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(await identityOf(person.sub)).toMatchObject({ userId: owner.user.userId, email: person.email, isPrivateEmail: false, linkedAt: expect.any(Date) });
    // The starting cookie is spent. No session is begun and no one-time code is handed over: the owner has a session.
    expect(setCookies(res).get(OAUTH_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(setCookies(res).has(HANDOFF_COOKIE)).toBe(false);
    expect(setCookies(res).has(SESSION_COOKIE)).toBe(false);
    // No business or login was made or changed, though Apple's email is one no login uses.
    expect(JSON.stringify([[...held.merchants.values()], [...held.users.values()]])).toBe(before);
    expect(exchanges()).toHaveLength(1);
    expect(exchanges()[0].form.get("redirect_uri")).toBe("https://harness.test/api/auth/apple/callback");
    // Written to the security log by login id only.
    expect(logged()).toEqual([["APPLE_CONNECTED", { userId: owner.user.userId }]]);

    const read = await connection(app, owner);
    expect(read.headers["cache-control"]).toMatch(/no-store/);
    expect(read.body).toEqual({ available: true, connected: true, email: person.email, isPrivateEmail: false, connectedAt: expect.any(String) });

    const { session } = await signInWithApple(app, { sub: person.sub });
    expect(session!.status).toBe(200);
    expect(session!.body).toMatchObject({ merchantId: owner.merchantId, newUser: false });
    const me = await request(app).get("/api/auth/me").set(signedIn(businessSessionBegunBy(session!)));
    expect(me.body.user).toMatchObject({ merchantId: owner.merchantId, email: owner.user.email });
  });

  test("an identity that was pending becomes the owner's as the same row, whatever email it held", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const elsewhere = await createOwnerPrincipal();
    // It first tried to sign in with an email that is ANOTHER business's: recorded as pending, joined to nobody.
    const person = { sub: newSubject(), email: elsewhere.user.email };
    expect((await signInWithApple(app, person)).session).toBeUndefined();
    const pending = await identityOf(person.sub);
    expect(pending).toMatchObject({ userId: null, email: elsewhere.user.email });

    // Apple does not send the email again; the signed-in owner and Apple's token are what connect it.
    const { res } = await connectAs(app, owner, { sub: person.sub });
    expect(outcome(res)).toBe("connected");
    expect(await identityOf(person.sub)).toMatchObject({ id: pending.id, userId: owner.user.userId, email: elsewhere.user.email });
    expect(await held.getAppleIdentityForLogin(elsewhere.user.userId)).toBeUndefined();
    expect((await signInWithApple(app, { sub: person.sub })).session!.body).toMatchObject({ merchantId: owner.merchantId });
  });

  test("only a verified email in Apple's token is kept, and a relay address is marked", async () => {
    const { app } = await createTestApp();
    const relay = { sub: newSubject(), email: `${crypto.randomBytes(5).toString("hex")}@privaterelay.appleid.com`, relay: true };
    const hidden = await createOwnerPrincipal();
    expect(outcome((await connectAs(app, hidden, relay)).res)).toBe("connected");
    expect(await identityOf(relay.sub)).toMatchObject({ email: relay.email, isPrivateEmail: true });
    // The owner's Settings is told it is a relay address.
    expect((await connection(app, hidden)).body).toMatchObject({ connected: true, email: relay.email, isPrivateEmail: true });

    const unverified = { sub: newSubject(), email: `  ${newEmail("Unverified")} `, verified: "false", relay: true };
    expect(outcome((await connectAs(app, await createOwnerPrincipal(), unverified)).res)).toBe("connected");
    expect(await identityOf(unverified.sub)).toMatchObject({ email: null, isPrivateEmail: false });

    const spaced = { sub: newSubject(), email: `  ${newEmail("Spaced").toUpperCase()} ` };
    expect(outcome((await connectAs(app, await createOwnerPrincipal(), spaced)).res)).toBe("connected");
    expect((await identityOf(spaced.sub)).email).toBe(spaced.email.trim().toLowerCase());

    const silent = { sub: newSubject() };
    const last = await createOwnerPrincipal();
    expect(outcome((await connectAs(app, last, silent)).res)).toBe("connected");
    expect(await identityOf(silent.sub)).toMatchObject({ userId: last.user.userId, email: null });
    expect((await connection(app, last)).body).toEqual({ available: true, connected: true, email: null, isPrivateEmail: false, connectedAt: expect.any(String) });
  });

  test("the same identity again changes nothing; a different one is refused: a login has one", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const person = { sub: newSubject(), email: newEmail() };
    const other = { sub: newSubject(), email: newEmail("other") };
    // Three connects begun before any returns (a start is refused once Apple is connected).
    const [first, second, third] = [await begin(app, owner), await begin(app, owner), await begin(app, owner)];
    tokenAnswer = { body: { id_token: identityToken(first.nonce, person) } };
    expect(outcome(await appleReturns(app, first))).toBe("connected");
    const before = everything();
    tokenAnswer = { body: { id_token: identityToken(second.nonce, person) } };
    expect(outcome(await appleReturns(app, second))).toBe("connected");
    expect(everything()).toBe(before);
    tokenAnswer = { body: { id_token: identityToken(third.nonce, other) } };
    expect(outcome(await appleReturns(app, third))).toBe("has-another");
    expect(everything()).toBe(before);
    expect(await identityOf(other.sub)).toBeUndefined();
    expect(logged().map(([event]) => event)).toEqual(["APPLE_CONNECTED"]);
  });

  test("an identity that is another login's is never moved", async () => {
    const { app } = await createTestApp();
    const first = await createOwnerPrincipal();
    const second = await createOwnerPrincipal();
    const person = { sub: newSubject(), email: newEmail() };
    expect(outcome((await connectAs(app, first, person)).res)).toBe("connected");
    const before = everything();
    expect(outcome((await connectAs(app, second, person)).res)).toBe("taken");
    expect(everything()).toBe(before);
    expect((await connection(app, second)).body).toMatchObject({ connected: false });
    // And an identity that made its own business by signing in is that business's.
    const maker = { sub: newSubject(), email: newEmail("maker") };
    expect((await signInWithApple(app, maker)).session!.status).toBe(200);
    expect(outcome((await connectAs(app, second, { sub: maker.sub })).res)).toBe("taken");
    expect((await identityOf(maker.sub)).userId).not.toBe(second.user.userId);
  });
});

describe("R1-T5c — the session that asked must still stand", () => {
  const person = () => ({ sub: newSubject(), email: newEmail() });
  const ended: Array<[string, (app: any, owner: Principal) => Promise<unknown>]> = [
    ["the owner signed out", (app, owner) => request(app).post("/api/auth/logout").set(signedIn(owner)).expect(204)],
    ["the owner signed out everywhere", (app, owner) => request(app).post("/api/auth/sign-out-everywhere").set(signedIn(owner)).expect(204)],
    ["the password was changed (this device carries on under a new session)", (app, owner) =>
      request(app).put(`/api/merchants/${owner.merchantId}/change-password`).set(signedIn(owner))
        .send({ currentPassword: VALID_PASSWORD, newPassword: "Changed-password-3", confirmPassword: "Changed-password-3" }).expect(200)],
    ["the business was switched off", async (_app, owner) => { held.merchants.get(owner.merchantId).status = "suspended"; }],
    ["the login was switched off", async (_app, owner) => { held.users.get(owner.user.userId).status = "disabled"; }],
    ["the login is no longer the owner", async (_app, owner) => { held.users.get(owner.user.userId).role = "member"; }],
    ["the session ran out", async (_app, owner) => { held.authSessionRows.get(owner.sessionId).idleExpiresAt = new Date(Date.now() - 1); }],
  ];

  test.each(ended)("%s before Apple returned: nothing is connected and Apple is not asked", async (_what, end) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const who = person();
    const started = await begin(app, owner);
    tokenAnswer = { body: { id_token: identityToken(started.nonce, who) } };
    await end(app, owner);
    const before = everything();
    expect(outcome(await appleReturns(app, started))).toBe("expired");
    expect(exchanges()).toEqual([]);
    expect(everything()).toBe(before);
    expect(await identityOf(who.sub)).toBeUndefined();
    expect(logged()).toEqual([]);
  });

  test.each(ended)("%s while Apple was being asked: nothing is connected", async (_what, end) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const who = person();
    const started = await begin(app, owner);
    tokenAnswer = { body: { id_token: identityToken(started.nonce, who) } };
    whileAppleIsAsked = () => end(app, owner);
    expect(outcome(await appleReturns(app, started))).toBe("expired");
    expect(exchanges()).toHaveLength(1);
    expect(await identityOf(who.sub)).toBeUndefined();
    expect(held.appleIdentities.size).toBe(0);
    expect(logged()).toEqual([]);
  });

  test("even under the server's own signature, a cookie whose login is not its session's connects nobody", async () => {
    // No start writes such a cookie and none can be forged (the signature covers both parts): this
    // holds the return to its own comparison of the session's login with the login the cookie names.
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const victim = await createOwnerPrincipal();
    const who = person();
    const before = everything();
    // Both sessions stand and both logins are active owners: only the pairing is wrong.
    for (const [userId, sessionId] of [[victim.user.userId, owner.sessionId], [owner.user.userId, victim.sessionId]]) {
      const started = await begin(app, owner);
      const [state, nonce, issued] = started.cookie.slice(`${OAUTH_COOKIE}=`.length).split(".");
      const payload = `${state}.${nonce}.${issued}.${userId}.${sessionId}`;
      tokenAnswer = { body: { id_token: identityToken(nonce, who) } };
      appleRequests = [];
      const res = await appleReturns(app, { state, cookie: `${OAUTH_COOKIE}=${payload}.${connectSignature(payload)}` });
      expect(outcome(res)).toBe("expired");
      expect(exchanges()).toEqual([]);
    }
    expect(everything()).toBe(before);
    expect(await identityOf(who.sub)).toBeUndefined();
    expect(logged()).toEqual([]);
  });

  test("another session of the same owner does not stand in for the one that asked", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const started = await begin(app, owner);
    // A second, live session of the same login, begun by signing in again.
    const again = await request(app).post("/api/auth/login").send({ email: owner.user.email, password: VALID_PASSWORD }).expect(200);
    expect(setCookies(again).has(SESSION_COOKIE)).toBe(true);
    await request(app).post("/api/auth/logout").set(signedIn(owner)).expect(204);
    tokenAnswer = { body: { id_token: identityToken(started.nonce, person()) } };
    expect(outcome(await appleReturns(app, started))).toBe("expired");
    expect(held.appleIdentities.size).toBe(0);
  });
});

describe("R1-T5c — what a return is refused for", () => {
  const person = () => ({ sub: newSubject(), email: newEmail() });
  const nothingConnected = async (app: any, attempt: (started: Awaited<ReturnType<typeof begin>>) => Promise<request.Response>, word: string, asked: number) => {
    const owner = await createOwnerPrincipal();
    const started = await begin(app, owner);
    const before = everything();
    appleRequests = [];
    const res = await attempt(started);
    expect(outcome(res)).toBe(word);
    expect(res.headers.location).not.toMatch(/eyJ|apple-code|id_token/);
    expect(setCookies(res).get(OAUTH_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(setCookies(res).has(HANDOFF_COOKIE)).toBe(false);
    expect(setCookies(res).has(SESSION_COOKIE)).toBe(false);
    expect(exchanges()).toHaveLength(asked);
    expect(everything()).toBe(before);
    expect(logged()).toEqual([]);
  };

  test("cancelling at Apple, or a return with no code, asks Apple nothing", async () => {
    const { app } = await createTestApp();
    await nothingConnected(app, (started) => appleReturns(app, started, { error: "user_cancelled_authorize", code: "" }), "cancelled", 0);
    await nothingConnected(app, (started) => appleReturns(app, started, { error: "access_denied" }), "cancelled", 0);
    await nothingConnected(app, (started) => request(app).post("/api/auth/apple/callback").type("form")
      .set({ Origin: "https://appleid.apple.com", Cookie: started.cookie }).send({ state: started.state }), "cancelled", 0);
  });

  test("a state that is not this start's, and a start used twice, have expired: Apple is not asked again", async () => {
    const { app } = await createTestApp();
    const other = await begin(app, await createOwnerPrincipal());
    await nothingConnected(app, (started) => appleReturns(app, started, { state: other.state }), "expired", 0);
    await nothingConnected(app, (started) => appleReturns(app, started, { state: "" }), "expired", 0);

    const owner = await createOwnerPrincipal();
    const who = person();
    const started = await begin(app, owner);
    tokenAnswer = { body: { id_token: identityToken(started.nonce, who) } };
    expect(outcome(await appleReturns(app, started))).toBe("connected");
    await request(app).post("/api/auth/apple/disconnect").set(signedIn(owner)).send({ currentPassword: VALID_PASSWORD }).expect(200);
    appleRequests = [];
    // The same return again connects nothing.
    expect(outcome(await appleReturns(app, started))).toBe("expired");
    expect(exchanges()).toEqual([]);
    expect(await identityOf(who.sub)).toBeUndefined();
  });

  test("a start older than ten minutes has expired, whatever the cookie says", async () => {
    const { app } = await createTestApp();
    const clock = useFakeClock(new Date());
    try {
      await nothingConnected(app, async (started) => { clock.advance(10 * 60_000 + 1); return appleReturns(app, started); }, "expired", 0);
    } finally { clock.restore(); }
  });

  test.each([
    ["another browser's nonce", (nonce: string) => identityToken(crypto.randomBytes(32).toString("base64url"), person())],
    ["another app's audience", (nonce: string) => identityToken(nonce, person(), { aud: "nz.taptpay.other" })],
    ["another issuer", (nonce: string) => identityToken(nonce, person(), { iss: "https://appleid.apple.com.example.test" })],
    ["an expired token", (nonce: string) => identityToken(nonce, person(), { exp: seconds() - 1 })],
    ["a token someone else signed", (nonce: string) => identityToken(nonce, person(), {}, stranger.privateKey)],
    ["no identity token at all", () => undefined],
  ])("%s connects nothing", async (_what, make) => {
    const { app } = await createTestApp();
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await nothingConnected(app, (started) => { tokenAnswer = { body: { id_token: make(started.nonce) } }; return appleReturns(app, started); }, "failed", 1);
    log.mockRestore();
  });

  test("a refused grant fails, Apple being unreachable says so, and the log carries no token or code", async () => {
    const { app } = await createTestApp();
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await nothingConnected(app, (started) => { tokenAnswer = { status: 400, body: { error: "invalid_grant" } }; return appleReturns(app, started); }, "failed", 1);
    await nothingConnected(app, (started) => { tokenAnswer = { fail: true }; return appleReturns(app, started); }, "unavailable", 1);
    await nothingConnected(app, (started) => { tokenAnswer = { status: 500, body: {} }; return appleReturns(app, started); }, "unavailable", 1);
    expect(log.mock.calls.map((call) => call.map(String).join(" ")).join("\n")).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.|apple-code-1/);
    log.mockRestore();
  });

  test("a storage fault connects nothing and says only that it failed", async () => {
    const { app } = await createTestApp();
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const fault = jest.spyOn(storage as any, "connectAppleIdentity").mockRejectedValue(new Error("synthetic storage fault naming 001234.secret.subject"));
    await nothingConnected(app, (started) => { tokenAnswer = { body: { id_token: identityToken(started.nonce, person()) } }; return appleReturns(app, started); }, "failed", 1);
    expect(log.mock.calls.map((call) => call.map(String).join(" ")).join("\n")).not.toMatch(/001234\.secret\.subject|eyJ[A-Za-z0-9_-]{10,}\./);
    fault.mockRestore(); log.mockRestore();
  });

  test("a login that stopped being an active owner between the last check and the write connects nothing", async () => {
    const { app } = await createTestApp();
    // The write re-reads the login under its row lock and says so (storage's own tests show when).
    const refused = jest.spyOn(storage as any, "connectAppleIdentity").mockResolvedValue("no-login");
    await nothingConnected(app, (started) => { tokenAnswer = { body: { id_token: identityToken(started.nonce, person()) } }; return appleReturns(app, started); }, "expired", 1);
    expect(refused).toHaveBeenCalledTimes(1);
    refused.mockRestore();
  });

  test("a post that does not come from Apple's own origin is refused before the cookie is read", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const who = person();
    for (const origin of ["https://evil.example", "https://appleid.apple.com.evil.example", "https://harness.test.evil.example", "null"]) {
      const started = await begin(app, owner);
      tokenAnswer = { body: { id_token: identityToken(started.nonce, who) } };
      const res = await appleReturns(app, started, {}, { Origin: origin });
      expect({ origin, status: res.status, code: res.body.code }).toEqual({ origin, status: 403, code: "CROSS_SITE_REJECTED" });
    }
    expect(exchanges()).toEqual([]);
    expect(held.appleIdentities.size).toBe(0);
  });
});

describe("R1-T5c — a connect cookie and a sign-in cookie are never each other", () => {
  test("a connect cookie altered to name another login or session, or cut down to a sign-in cookie's shape, connects nobody and signs nobody in", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const victim = await createOwnerPrincipal();
    const who = { sub: newSubject(), email: newEmail() };
    const started = await begin(app, owner);
    const parts = started.cookie.slice(`${OAUTH_COOKIE}=`.length).split(".");
    const forged: string[][] = [
      [parts[0], parts[1], parts[2], String(victim.user.userId), parts[4], parts[5]],
      [parts[0], parts[1], parts[2], parts[3], victim.sessionId, parts[5]],
      [parts[0], parts[1], parts[2], String(victim.user.userId), victim.sessionId, parts[5]],
      [parts[0], parts[1], parts[2], parts[5]],
    ];
    const before = everything();
    for (const value of forged) {
      tokenAnswer = { body: { id_token: identityToken(started.nonce, who) } };
      const res = await appleReturns(app, { state: started.state, cookie: `${OAUTH_COOKIE}=${value.join(".")}` });
      // Not a connect cookie, and not a sign-in cookie either: the sign-in path refuses it.
      expect([res.status, res.headers.location.split("?")[0], loginError(res)]).toEqual([303, "/login", "Apple sign in expired. Please try again."]);
      expect(setCookies(res).has(HANDOFF_COOKIE)).toBe(false);
    }
    expect(exchanges()).toEqual([]);
    expect(everything()).toBe(before);
  });

  test("a sign-in start never connects, even in a signed-in owner's browser", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const start = await request(app).get("/api/auth/apple").set("Cookie", owner.cookie);
    const target = new URL(start.headers.location);
    // Apple's verified email is the owner's own: still never joined by email.
    tokenAnswer = { body: { id_token: identityToken(target.searchParams.get("nonce")!, { sub: newSubject(), email: owner.user.email }) } };
    const res = await appleReturns(app, { state: target.searchParams.get("state")!, cookie: `${OAUTH_COOKIE}=${cookieValue(setCookies(start).get(OAUTH_COOKIE))}; ${owner.cookie}` });
    expect(loginError(res)).toBe("That email already has a TaptPay login. Sign in, then connect Apple in Settings.");
    expect(await held.getAppleIdentityForLogin(owner.user.userId)).toBeUndefined();
  });

  test("a connect makes no business, even when Apple's email is one nobody uses", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const count = held.merchants.size;
    const who = { sub: newSubject(), email: newEmail("unused") };
    expect(outcome((await connectAs(app, owner, who)).res)).toBe("connected");
    expect(held.merchants.size).toBe(count);
    expect(await storage.getMerchantByEmail(who.email)).toBeUndefined();
    expect(await storage.getUserByEmail(who.email)).toBeUndefined();
  });
});

describe("R1-T5c — disconnecting", () => {
  test("the owner's password removes the identity: it signs nobody in afterwards and can be connected again", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const bystander = await createOwnerPrincipal();
    const person = { sub: newSubject(), email: newEmail() };
    const theirs = { sub: newSubject(), email: newEmail("bystander") };
    await connectAs(app, owner, person);
    await connectAs(app, bystander, theirs);
    securityLog.mockClear();

    const res = await disconnect(app, owner);
    expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { connected: false } });
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(await identityOf(person.sub)).toBeUndefined();
    expect(await identityOf(theirs.sub)).toMatchObject({ userId: bystander.user.userId });
    expect((await connection(app, owner)).body).toEqual({ available: true, connected: false, email: null, isPrivateEmail: false, connectedAt: null });
    expect(logged()).toEqual([["APPLE_DISCONNECTED", { userId: owner.user.userId, removed: true }]]);
    // The owner's session carries on.
    expect((await request(app).get("/api/auth/me").set(signedIn(owner))).status).toBe(200);
    // Apple no longer signs this login in: the identity is unknown again (and, with no email in the token, makes nothing).
    expect((await signInWithApple(app, { sub: person.sub })).session).toBeUndefined();
    // Again, with nothing connected: the same answer, nothing removed.
    const again = await disconnect(app, owner);
    expect({ status: again.status, body: again.body }).toEqual({ status: 200, body: { connected: false } });
    expect(logged().at(-1)).toEqual(["APPLE_DISCONNECTED", { userId: owner.user.userId, removed: false }]);
    expect(outcome((await connectAs(app, owner, { sub: newSubject() })).res)).toBe("connected");
  });

  test("a wrong or missing password removes nothing", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    await connectAs(app, owner, { sub: newSubject(), email: newEmail() });
    const before = everything();
    const wrong = await disconnect(app, owner, { currentPassword: WRONG });
    expect({ status: wrong.status, body: wrong.body }).toEqual({ status: 400, body: { message: "Current password is incorrect" } });
    const missing = await disconnect(app, owner, {});
    expect({ status: missing.status, message: missing.body.message }).toEqual({ status: 400, message: "Current password is required" });
    expect(everything()).toBe(before);
  });

  test("a login made by Apple, which has no password anyone knows, cannot remove its only way in", async () => {
    const { app } = await createTestApp();
    const person = { sub: newSubject(), email: newEmail("made") };
    const { session } = await signInWithApple(app, person);
    const signedInByApple = businessSessionBegunBy(session!);
    for (const guess of ["", VALID_PASSWORD, person.email]) {
      expect((await disconnect(app, signedInByApple, { currentPassword: guess })).status).toBe(400);
    }
    expect(await identityOf(person.sub)).toMatchObject({ email: person.email });
    expect((await connection(app, signedInByApple)).body).toMatchObject({ connected: true, email: person.email });
  });
});

describe("R1-T5c — reading the connection", () => {
  test("it says whether Apple is connected and with which address, and nothing that identifies the Apple account", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const none = await connection(app, owner);
    expect({ status: none.status, body: none.body }).toEqual({ status: 200, body: { available: true, connected: false, email: null, isPrivateEmail: false, connectedAt: null } });
    const person = { sub: newSubject(), email: newEmail() };
    await connectAs(app, owner, person);
    const read = await connection(app, owner);
    expect(Object.keys(read.body).sort()).toEqual(["available", "connected", "connectedAt", "email", "isPrivateEmail"]);
    expect(JSON.stringify(read.body)).not.toContain(person.sub);
    expect(new Date(read.body.connectedAt).getTime()).toBe((await identityOf(person.sub)).linkedAt.getTime());
    // Another owner reads only their own.
    expect((await connection(app, await createOwnerPrincipal())).body).toMatchObject({ connected: false, email: null });
  });

  test("connected-since is when it was connected, not when the identity was first seen", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const clock = useFakeClock(new Date());
    try {
      // Seen five minutes before, pending; then connected.
      const sub = newSubject();
      await held.recordPendingAppleIdentity({ issuer: ISSUER, clientId: APPLE_TEST_SERVICES_ID, subject: sub }, { email: newEmail(), isPrivateEmail: false });
      clock.advance(5 * 60_000);
      expect(outcome((await connectAs(app, owner, { sub })).res)).toBe("connected");
      const row = await identityOf(sub);
      expect(row.linkedAt.getTime() - row.createdAt.getTime()).toBe(5 * 60_000);
      expect((await connection(app, owner)).body.connectedAt).toBe(row.linkedAt.toISOString());
    } finally { clock.restore(); }
  });
});
