import "./support/test-env";
import { APPLE_TEST_SERVICES_ID, appleTeamKey } from "./support/apple-sign-in-test-env";

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { createDisabledMemberPrincipal, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, signedIn, storage, useFakeClock } from "./support/http-harness";
import { businessSessionBegunBy } from "./support/session-browser";

/**
 * R1-T5b: Sign in with Apple, end to end against a stand-in Apple (owner decision 2026-09-29: built
 * and tested with stand-ins). `apple` signs identity tokens with a key made here and publishes the
 * matching key set; fetch is replaced, so nothing leaves the machine.
 */
const ISSUER = "https://appleid.apple.com";
const OAUTH_COOKIE = "__Host-taptpay-apple-oauth";
const HANDOFF_COOKIE = "__Host-taptpay-apple-handoff";
const ALREADY = "That email already has a TaptPay login. Sign in, then connect Apple in Settings.";
const EXPIRED = "Apple sign in expired. Please try again.";

const apple = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const stranger = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const held = storage as any;
const seconds = () => Math.floor(Date.now() / 1000);
const newSubject = () => `001234.${crypto.randomBytes(16).toString("hex")}.0123`;
const newEmail = (who = "person") => `${who}.${crypto.randomBytes(4).toString("hex")}@example.test`;

type TokenAnswer = { status?: number; body?: unknown; fail?: boolean };
let tokenAnswer: TokenAnswer;
let appleRequests: Array<{ url: string; form: URLSearchParams }>;
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  resetTestStorage();
  appleRequests = [];
  tokenAnswer = {};
  fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    appleRequests.push({ url, form: new URLSearchParams(String(init?.body ?? "")) });
    if (url === "https://appleid.apple.com/auth/keys") {
      return new Response(JSON.stringify({ keys: [{ ...apple.publicKey.export({ format: "jwk" }), kid: "apple-key-1", use: "sig", alg: "RS256" }] }), { status: 200 });
    }
    if (url === "https://appleid.apple.com/auth/token") {
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
const loginError = (res: request.Response) => new URL(res.headers.location, "https://harness.test").searchParams.get("error");

/** The browser starts: our redirect to Apple, and the cookie that binds its state and nonce to this browser. */
async function begin(app: any) {
  const res = await request(app).get("/api/auth/apple");
  const target = new URL(res.headers.location);
  const line = setCookies(res).get(OAUTH_COOKIE);
  return { res, target, line: line ?? "", state: target.searchParams.get("state")!, nonce: target.searchParams.get("nonce")!, cookie: `${OAUTH_COOKIE}=${cookieValue(line)}` };
}
type Person = { sub: string; email?: string; relay?: boolean; verified?: unknown; name?: { firstName: string; lastName: string } };
/** A token as Apple signs one for this app and this browser's nonce. */
function identityToken(nonce: string, person: Person, change: Record<string, unknown> = {}, key = apple.privateKey) {
  const claims: Record<string, unknown> = {
    iss: ISSUER, aud: APPLE_TEST_SERVICES_ID, sub: person.sub, nonce, iat: seconds() - 5, exp: seconds() + 600,
    ...(person.email ? { email: person.email, email_verified: person.verified ?? "true", is_private_email: person.relay ? "true" : "false" } : {}),
    ...change,
  };
  return jwt.sign(claims, key, { algorithm: "RS256", header: { alg: "RS256", kid: "apple-key-1" } as any });
}
/** Apple's form post back to us, from Apple's own origin, carrying this browser's starting cookie. */
function appleReturns(app: any, started: { state: string; cookie: string }, form: Record<string, string> = {}, headers: Record<string, string> = {}) {
  return request(app).post("/api/auth/apple/callback").type("form")
    .set({ Origin: "https://appleid.apple.com", Cookie: started.cookie, ...headers })
    .send({ state: started.state, code: "apple-code-1", ...form });
}
/** One whole sign-in as a person: start, Apple's answer for them, Apple's return. */
async function signInAs(app: any, person: Person, change: Record<string, unknown> = {}) {
  const started = await begin(app);
  tokenAnswer = { body: { id_token: identityToken(started.nonce, person, change) } };
  const form: Record<string, string> = person.name ? { user: JSON.stringify({ name: person.name, email: "forged@elsewhere.test" }) } : {};
  return { started, res: await appleReturns(app, started, form) };
}
const redeem = (app: any, res: request.Response) =>
  request(app).post("/api/auth/apple/session").set("Cookie", `${HANDOFF_COOKIE}=${cookieValue(setCookies(res).get(HANDOFF_COOKIE))}`);
const identityOf = (sub: string) => held.getAppleIdentity({ issuer: ISSUER, clientId: APPLE_TEST_SERVICES_ID, subject: sub });
const businesses = () => [...held.merchants.values()];

describe("R1-T5b — starting Sign in with Apple", () => {
  test("sends the browser to Apple with a state and nonce bound to it by a cookie that survives Apple's post back", async () => {
    const { app } = await createTestApp();
    const { res, target, line, state, nonce } = await begin(app);
    expect(res.status).toBe(302);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(target.origin + target.pathname).toBe("https://appleid.apple.com/auth/authorize");
    expect(Object.fromEntries(target.searchParams)).toEqual({
      client_id: APPLE_TEST_SERVICES_ID, redirect_uri: "https://harness.test/api/auth/apple/callback",
      response_type: "code", response_mode: "form_post", scope: "name email", state, nonce,
    });
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(nonce).not.toBe(state);
    // Apple returns by a cross-site POST: only a SameSite=None cookie comes back with it.
    expect(line).toMatch(/HttpOnly/i); expect(line).toMatch(/Secure/i); expect(line).toMatch(/SameSite=None/i);
    expect(line).toMatch(/Path=\//); expect(line).toMatch(/Max-Age=600/);
    expect(cookieValue(line).split(".").slice(0, 2)).toEqual([state, nonce]);
    // Two starts never share a state or a nonce.
    const again = await begin(app);
    expect([again.state, again.nonce]).not.toEqual([state, nonce]);
    expect(appleRequests).toEqual([]);
  });
});

describe("R1-T5b — a first sign-in makes a business", () => {
  test("a new business, its owner login and its Apple identity are made, and the browser gets a one-time code, never a session in an address", async () => {
    const { app } = await createTestApp();
    const person = { sub: newSubject(), email: newEmail(), name: { firstName: "Ada", lastName: "Appleton" } };
    const { res } = await signInAs(app, person);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe("/login?apple=complete");
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    const business = await storage.getMerchantByEmail(person.email);
    expect(business).toMatchObject({ email: person.email, name: "Ada Appleton", businessName: "Ada Appleton", status: "verified", googleId: null });
    const identity = await identityOf(person.sub);
    expect(identity).toMatchObject({ issuer: ISSUER, clientId: APPLE_TEST_SERVICES_ID, subject: person.sub, email: person.email, isPrivateEmail: false });
    const login = await storage.getUserByEmail(person.email);
    expect(identity.userId).toBe(login!.id);
    expect(login).toMatchObject({ merchantId: business!.id, role: "owner", status: "active" });
    // The starting cookie is spent; the handoff is a 60-second HttpOnly code, read only by our own page.
    expect(setCookies(res).get(OAUTH_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
    const handoff = setCookies(res).get(HANDOFF_COOKIE)!;
    expect(handoff).toMatch(/HttpOnly/i); expect(handoff).toMatch(/SameSite=Strict/i); expect(handoff).toMatch(/Max-Age=60/);
    // The exchange sent Apple this app's Services ID, a secret signed by the team's key, and the exact redirect.
    expect(exchanges()).toHaveLength(1);
    const form = exchanges()[0].form;
    expect(form.get("client_id")).toBe(APPLE_TEST_SERVICES_ID);
    expect(form.get("code")).toBe("apple-code-1");
    expect(form.get("redirect_uri")).toBe("https://harness.test/api/auth/apple/callback");
    expect(jwt.verify(form.get("client_secret")!, appleTeamKey.publicKey, { algorithms: ["ES256"] })).toMatchObject({ iss: "TEAMHARNESS", sub: APPLE_TEST_SERVICES_ID, aud: ISSUER });

    const session = await redeem(app, res);
    expect(session.status).toBe(200);
    expect(session.headers["cache-control"]).toMatch(/no-store/);
    expect(session.body).toEqual({ merchantId: business!.id, newUser: true, csrfToken: expect.any(String) });
    const me = await request(app).get("/api/auth/me").set(signedIn(businessSessionBegunBy(session)));
    expect(me.body.user).toMatchObject({ merchantId: business!.id, email: person.email });
    // One-time: the same code again signs nobody in.
    const again = await redeem(app, res);
    expect({ status: again.status, body: again.body }).toEqual({ status: 401, body: { code: "APPLE_SIGN_IN_EXPIRED", message: EXPIRED } });
  });

  test("a later sign-in brings no name or email and is the same login, with no second business", async () => {
    const { app } = await createTestApp();
    const person = { sub: newSubject(), email: newEmail(), name: { firstName: "Ada", lastName: "Appleton" } };
    await signInAs(app, person);
    const count = businesses().length;
    const { res } = await signInAs(app, { sub: person.sub });
    expect(res.headers.location).toBe("/login?apple=complete");
    const session = await redeem(app, res);
    expect(session.body).toMatchObject({ merchantId: (await storage.getMerchantByEmail(person.email))!.id, newUser: false });
    expect(businesses()).toHaveLength(count);
  });

  test("a Hide My Email address is the business's address and is marked as a relay", async () => {
    const { app } = await createTestApp();
    const person = { sub: newSubject(), email: `${crypto.randomBytes(5).toString("hex")}@privaterelay.appleid.com`, relay: true };
    const { res } = await signInAs(app, person);
    expect(res.headers.location).toBe("/login?apple=complete");
    expect(await storage.getMerchantByEmail(person.email)).toMatchObject({ email: person.email, name: person.email.split("@")[0] });
    expect(await identityOf(person.sub)).toMatchObject({ email: person.email, isPrivateEmail: true });
  });

  test("the unsigned form names the business at most: its email is never used", async () => {
    const { app } = await createTestApp();
    const person = { sub: newSubject(), email: newEmail(), name: { firstName: "  Ada\u0000 ", lastName: "x".repeat(300) } };
    await signInAs(app, person);
    expect(await storage.getMerchantByEmail("forged@elsewhere.test")).toBeUndefined();
    const business = (await storage.getMerchantByEmail(person.email))!;
    expect(business.name.length).toBeLessThanOrEqual(100);
    expect(business.name).not.toMatch(/[\u0000-\u001f]/);
    expect(business.name.startsWith("Ada")).toBe(true);
    // A form that is not what Apple sends changes nothing but the name's fallback.
    const other = { sub: newSubject(), email: newEmail("plain") };
    const started = await begin(app);
    tokenAnswer = { body: { id_token: identityToken(started.nonce, other) } };
    expect((await appleReturns(app, started, { user: "{not json" })).headers.location).toBe("/login?apple=complete");
    expect((await storage.getMerchantByEmail(other.email))!.name).toBe(other.email.split("@")[0]);
  });

  test("two first sign-ins at once make one business", async () => {
    const { app } = await createTestApp();
    const person = { sub: newSubject(), email: newEmail() };
    const [first, second] = [await begin(app), await begin(app)];
    // Each browser's token carries its own nonce: answer each exchange for the start it belongs to.
    const answers = [identityToken(first.nonce, person), identityToken(second.nonce, person)];
    fetchSpy.mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/auth/keys")) return new Response(JSON.stringify({ keys: [{ ...apple.publicKey.export({ format: "jwk" }), kid: "apple-key-1", use: "sig", alg: "RS256" }] }), { status: 200 });
      return new Response(JSON.stringify({ id_token: answers.shift() }), { status: 200 });
    });
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const results = await Promise.all([appleReturns(app, first), appleReturns(app, second)]);
    log.mockRestore();
    expect(businesses().filter((business: any) => business.email === person.email)).toHaveLength(1);
    expect(results.filter((res) => res.headers.location === "/login?apple=complete").length).toBeGreaterThanOrEqual(1);
    for (const res of results) if (res.headers.location !== "/login?apple=complete") expect(loginError(res)).toBeTruthy();
  });
});

describe("R1-T5b — no joining by email", () => {
  test.each([
    ["a business's own address", async () => (await createOwnerPrincipal()).user.email],
    ["a teammate's address", async () => (await createMemberPrincipal((await createOwnerPrincipal()).merchantId)).user.email],
  ])("an Apple identity whose email is %s gets no session and changes nothing; it is recorded as pending", async (_whose, makeEmail) => {
    const { app } = await createTestApp();
    const email = await makeEmail();
    const before = JSON.stringify([businesses(), [...held.users.values()]]);
    const person = { sub: newSubject(), email, name: { firstName: "Mallory", lastName: "Match" } };
    const { res } = await signInAs(app, person);
    expect(res.status).toBe(303);
    expect(loginError(res)).toBe(ALREADY);
    expect(setCookies(res).has(HANDOFF_COOKIE)).toBe(false);
    expect(JSON.stringify([businesses(), [...held.users.values()]])).toBe(before);
    expect(await identityOf(person.sub)).toMatchObject({ userId: null, email, linkedAt: null });
    // Trying again changes nothing either, with or without the email this time.
    for (const again of [person, { sub: person.sub }]) {
      const repeat = await signInAs(app, again);
      expect(loginError(repeat.res)).toBe(ALREADY);
      expect(setCookies(repeat.res).has(HANDOFF_COOKIE)).toBe(false);
    }
    expect(JSON.stringify([businesses(), [...held.users.values()]])).toBe(before);
    expect((await identityOf(person.sub)).userId).toBeNull();
  });

  test("the address match ignores case and spaces, as sign-in does", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const { res } = await signInAs(app, { sub: newSubject(), email: `  ${owner.user.email.toUpperCase()} ` });
    expect(loginError(res)).toBe(ALREADY);
  });

  test("a pending identity becomes a business of its own only once no login uses its email", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const person = { sub: newSubject(), email: owner.user.email };
    await signInAs(app, person);
    // The other account lets go of the address.
    held.merchants.get(owner.merchantId).email = newEmail("moved");
    held.users.get(owner.user.id).email = held.merchants.get(owner.merchantId).email;
    const { res } = await signInAs(app, { sub: person.sub });
    expect(res.headers.location).toBe("/login?apple=complete");
    const business = (await storage.getMerchantByEmail(person.email))!;
    expect(business.id).not.toBe(owner.merchantId);
    expect((await identityOf(person.sub)).userId).toBe((await storage.getUserByEmail(person.email))!.id);
  });
});

describe("R1-T5b — what is refused", () => {
  const nothingMade = async (app: any, attempt: (started: Awaited<ReturnType<typeof begin>>) => Promise<request.Response>, message: string | RegExp, asked: number) => {
    const before = JSON.stringify([businesses(), [...held.users.values()], [...held.appleIdentities.values()]]);
    const started = await begin(app);
    const res = await attempt(started);
    expect(res.status).toBe(303);
    expect(loginError(res)).toMatch(message);
    expect(res.headers.location).not.toMatch(/eyJ|apple-code|id_token/);
    expect(setCookies(res).has(HANDOFF_COOKIE)).toBe(false);
    expect(exchanges()).toHaveLength(asked);
    expect(JSON.stringify([businesses(), [...held.users.values()], [...held.appleIdentities.values()]])).toBe(before);
  };
  const person = () => ({ sub: newSubject(), email: newEmail() });

  test("a return that is not this browser's sign-in: Apple is not even asked", async () => {
    const { app } = await createTestApp();
    const other = await begin(app);
    const tampered = (cookie: string) => cookie.slice(0, -2) + (cookie.endsWith("AA") ? "BB" : "AA");
    await nothingMade(app, (started) => appleReturns(app, started, { state: other.state }), EXPIRED, 0);
    await nothingMade(app, (started) => appleReturns(app, { state: started.state, cookie: "" }), EXPIRED, 0);
    await nothingMade(app, (started) => appleReturns(app, { state: started.state, cookie: tampered(started.cookie) }), EXPIRED, 0);
    await nothingMade(app, (started) => appleReturns(app, { state: started.state, cookie: started.cookie.replace(OAUTH_COOKIE, "__Host-taptpay-google-oauth") }), EXPIRED, 0);
    await nothingMade(app, (started) => appleReturns(app, started, { state: "" }), EXPIRED, 0);
  });

  test("a start older than ten minutes has expired, whatever the cookie says", async () => {
    const { app } = await createTestApp();
    const clock = useFakeClock(new Date());
    try {
      await nothingMade(app, async (started) => { clock.advance(10 * 60_000 + 1); return appleReturns(app, started); }, EXPIRED, 0);
    } finally { clock.restore(); }
  });

  test("a start is taken up once: the same return again is refused without asking Apple again", async () => {
    const { app } = await createTestApp();
    const who = person();
    const started = await begin(app);
    tokenAnswer = { body: { id_token: identityToken(started.nonce, who) } };
    expect((await appleReturns(app, started)).headers.location).toBe("/login?apple=complete");
    const replay = await appleReturns(app, started);
    expect(loginError(replay)).toBe(EXPIRED);
    expect(setCookies(replay).has(HANDOFF_COOKIE)).toBe(false);
    expect(exchanges()).toHaveLength(1);
  });

  test("cancelling at Apple, or a return with no code, asks Apple nothing", async () => {
    const { app } = await createTestApp();
    await nothingMade(app, (started) => appleReturns(app, started, { error: "user_cancelled_authorize", code: "" }), "Apple sign in was cancelled", 0);
    // An error is a cancel even when a code came with it: the code is not used.
    await nothingMade(app, (started) => appleReturns(app, started, { error: "access_denied" }), "Apple sign in was cancelled", 0);
    await nothingMade(app, (started) => request(app).post("/api/auth/apple/callback").type("form")
      .set({ Origin: "https://appleid.apple.com", Cookie: started.cookie }).send({ state: started.state }), "Apple sign in was cancelled", 0);
  });

  test.each([
    ["another browser's nonce", (nonce: string) => identityToken(crypto.randomBytes(32).toString("base64url"), person())],
    ["another app's audience", (nonce: string) => identityToken(nonce, person(), { aud: "nz.taptpay.other" })],
    ["another issuer", (nonce: string) => identityToken(nonce, person(), { iss: "https://appleid.apple.com.example.test" })],
    ["an expired token", (nonce: string) => identityToken(nonce, person(), { exp: seconds() - 1 })],
    ["a token someone else signed", (nonce: string) => identityToken(nonce, person(), {}, stranger.privateKey)],
    ["no identity token at all", () => undefined],
  ])("%s makes nothing", async (_what, make) => {
    const { app } = await createTestApp();
    await nothingMade(app, (started) => { tokenAnswer = { body: { id_token: make(started.nonce) } }; return appleReturns(app, started); }, "Apple sign in failed. Please try again.", 1);
  });

  test("a withdrawn or used grant, and Apple being unreachable, each say so and make nothing", async () => {
    const { app } = await createTestApp();
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await nothingMade(app, (started) => { tokenAnswer = { status: 400, body: { error: "invalid_grant" } }; return appleReturns(app, started); }, "Apple sign in was not completed. Please try again.", 1);
    appleRequests = [];
    await nothingMade(app, (started) => { tokenAnswer = { fail: true }; return appleReturns(app, started); }, "Apple sign in is unavailable right now. Please try again.", 1);
    appleRequests = [];
    await nothingMade(app, (started) => { tokenAnswer = { status: 500, body: {} }; return appleReturns(app, started); }, "Apple sign in is unavailable right now. Please try again.", 1);
    // Nothing about the exchange is written to the log: no token, no code, no secret.
    expect(log.mock.calls.map((call) => call.map(String).join(" ")).join("\n")).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.|apple-code-1/);
    log.mockRestore();
  });

  test("an email Apple has not verified, and a first sign-in with no email, make no business", async () => {
    const { app } = await createTestApp();
    const who = person();
    await nothingMade(app, (started) => { tokenAnswer = { body: { id_token: identityToken(started.nonce, { ...who, verified: "false" }) } }; return appleReturns(app, started); },
      "Apple hasn't verified that email address.", 1);
    appleRequests = [];
    await nothingMade(app, (started) => { tokenAnswer = { body: { id_token: identityToken(started.nonce, { sub: who.sub }) } }; return appleReturns(app, started); },
      /Apple did not share an email address/, 1);
  });

  test("a post that does not come from Apple's own origin is refused by the cross-site guard", async () => {
    const { app } = await createTestApp();
    const who = person();
    for (const origin of ["https://evil.example", "https://appleid.apple.com.evil.example", "http://appleid.apple.com", "null"]) {
      const started = await begin(app);
      tokenAnswer = { body: { id_token: identityToken(started.nonce, who) } };
      const res = await appleReturns(app, started, {}, { Origin: origin });
      expect({ origin, status: res.status, code: res.body.code }).toEqual({ origin, status: 403, code: "CROSS_SITE_REJECTED" });
    }
    // With no Origin at all, a browser that says the post is cross-site is refused too.
    const started = await begin(app);
    const res = await request(app).post("/api/auth/apple/callback").type("form")
      .set({ Cookie: started.cookie, "Sec-Fetch-Site": "cross-site" }).send({ state: started.state, code: "apple-code-1" });
    expect(res.status).toBe(403);
    expect(exchanges()).toEqual([]);
    expect(await storage.getMerchantByEmail(who.email)).toBeUndefined();
  });
});

describe("R1-T5b — redeeming the one-time code", () => {
  test.each([
    ["no cookie", ""],
    ["a code nobody issued", `${HANDOFF_COOKIE}=${crypto.randomBytes(32).toString("base64url")}`],
    ["a malformed code", `${HANDOFF_COOKIE}=short`],
    ["Google's handoff cookie", `__Host-taptpay-google-handoff=${crypto.randomBytes(32).toString("base64url")}`],
  ])("%s signs nobody in", async (_what, cookie) => {
    const { app } = await createTestApp();
    const res = await request(app).post("/api/auth/apple/session").set("Cookie", cookie);
    expect({ status: res.status, body: res.body }).toEqual({ status: 401, body: { code: "APPLE_SIGN_IN_EXPIRED", message: EXPIRED } });
    expect(setCookies(res).has("__Host-taptpay-session")).toBe(false);
  });

  test("a code older than a minute has expired", async () => {
    const { app } = await createTestApp();
    const { res } = await signInAs(app, { sub: newSubject(), email: newEmail() });
    const clock = useFakeClock(new Date());
    try {
      clock.advance(60_001);
      expect((await redeem(app, res)).status).toBe(401);
    } finally { clock.restore(); }
  });

  test("an identity whose login can no longer sign in gets no session", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const disabled = await createDisabledMemberPrincipal(owner.merchantId);
    const sub = newSubject();
    held.appleIdentities.set(`${ISSUER}\n${APPLE_TEST_SERVICES_ID}\n${sub}`, {
      id: 9001, issuer: ISSUER, clientId: APPLE_TEST_SERVICES_ID, subject: sub, userId: disabled.user.id,
      email: disabled.user.email, isPrivateEmail: false, createdAt: new Date(), linkedAt: new Date(),
    });
    const { res } = await signInAs(app, { sub });
    expect(res.headers.location).toBe("/login?apple=complete");
    const session = await redeem(app, res);
    expect({ status: session.status, code: session.body.code }).toEqual({ status: 403, code: "ACCOUNT_UNAVAILABLE" });
    expect(setCookies(session).has("__Host-taptpay-session")).toBe(false);
  });
});

describe("R1-T5d — whether Sign in with Apple is offered", () => {
  test("says yes when Apple is set up on an https origin, and nothing else", async () => {
    const { app } = await createTestApp();
    const res = await request(app).get("/api/auth/apple/available");
    expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { available: true } });
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    // It starts nothing: no cookie, and Apple is not asked.
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(appleRequests).toEqual([]);
    // Signed in or not, the answer is the same: it is about the server, not the caller.
    const owner = await createOwnerPrincipal();
    expect((await request(app).get("/api/auth/apple/available").set("Cookie", owner.cookie)).body).toEqual({ available: true });
  });
});
