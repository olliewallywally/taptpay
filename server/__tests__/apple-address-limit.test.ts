import "./support/test-env";
import "./support/trusted-proxy-env";
import { APPLE_TEST_SERVICES_ID } from "./support/apple-sign-in-test-env";

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { VALID_PASSWORD, createOwnerPrincipal, createTestApp, resetTestStorage, signedIn, storage, type Principal } from "./support/http-harness";

/**
 * R1-T5b and R1-T5c with addresses told apart (TRUST_PROXY_HOPS=1: one proxy in front). Apple's
 * returns that get as far as asking Apple are counted per visitor address, a sign-in's and a signed-in
 * owner's connect in one count, so one address cannot make the server ask Apple without limit. A
 * return that succeeds gives its count back. Nothing leaves the machine: fetch is replaced.
 */
jest.setTimeout(60_000); // a connect's start checks the password with a real bcrypt compare

type App = Awaited<ReturnType<typeof createTestApp>>["app"];
const ISSUER = "https://appleid.apple.com";
const OAUTH_COOKIE = "__Host-taptpay-apple-oauth";
const NOT_COMPLETED = "Apple sign in was not completed. Please try again.";
const WAIT = "Too many attempts. Please try again in 30 seconds.";

const apple = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const subject = () => `001234.${crypto.randomBytes(16).toString("hex")}.0123`;
let tokenRequests: number;
/** Apple's answer to the next exchange: this identity token, or (with none set) a refused code. */
let nextToken: string | undefined;
let fetchSpy: jest.SpyInstance;
let log: jest.SpyInstance;

beforeEach(() => {
  resetTestStorage();
  tokenRequests = 0;
  nextToken = undefined;
  log = jest.spyOn(console, "error").mockImplementation(() => undefined);
  fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input: any) => {
    const url = String(input);
    if (url === "https://appleid.apple.com/auth/keys") {
      return new Response(JSON.stringify({ keys: [{ ...apple.publicKey.export({ format: "jwk" }), kid: "apple-key-1", use: "sig", alg: "RS256" }] }), { status: 200 });
    }
    if (url === "https://appleid.apple.com/auth/token") {
      tokenRequests += 1;
      const idToken = nextToken;
      nextToken = undefined;
      return idToken
        ? new Response(JSON.stringify({ id_token: idToken }), { status: 200 })
        : new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    }
    throw new Error(`unexpected outbound request in test: ${url}`);
  });
});
afterEach(() => { fetchSpy.mockRestore(); log.mockRestore(); });

/** As the proxy would forward a visitor at `visitor`. */
const via = (visitor: string) => ({ "X-Forwarded-For": visitor });
function startingCookie(res: request.Response): string {
  const line = ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith(`${OAUTH_COOKIE}=`));
  if (!line) throw new Error("the response set no starting cookie");
  return line.split(";")[0];
}
function identityToken(nonce: string, sub: string, email?: string) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: ISSUER, aud: APPLE_TEST_SERVICES_ID, sub, nonce, iat: now - 5, exp: now + 600, ...(email ? { email, email_verified: "true", is_private_email: "false" } : {}) },
    apple.privateKey, { algorithm: "RS256", header: { alg: "RS256", kid: "apple-key-1" } as any },
  );
}
type Started = { state: string; nonce: string; cookie: string };
/** Apple's form post back, from Apple's own origin, forwarded for the visitor's address. */
const appleReturns = (app: App, from: Record<string, string>, started: Pick<Started, "state" | "cookie">, form: Record<string, string> = {}) =>
  request(app).post("/api/auth/apple/callback").type("form").set({ Origin: ISSUER, Cookie: started.cookie, ...from })
    .send({ state: started.state, code: "apple-code-1", ...form });
async function beginSignIn(app: App, from: Record<string, string>): Promise<Started> {
  const res = await request(app).get("/api/auth/apple").set(from);
  const target = new URL(res.headers.location);
  return { state: target.searchParams.get("state")!, nonce: target.searchParams.get("nonce")!, cookie: startingCookie(res) };
}
async function beginConnect(app: App, owner: Principal, from: Record<string, string>): Promise<Started> {
  const res = await request(app).post("/api/auth/apple/connect").set({ ...signedIn(owner), ...from }).send({ currentPassword: VALID_PASSWORD });
  if (res.status !== 200) throw new Error(`fixture: the connect start answered ${res.status} ${JSON.stringify(res.body)}`);
  const target = new URL(res.body.url);
  return { state: target.searchParams.get("state")!, nonce: target.searchParams.get("nonce")!, cookie: startingCookie(res) };
}
/** A sign-in return whose code Apple refuses: one attempt that asked Apple and failed. */
const refusedSignIn = async (app: App, from: Record<string, string>) => appleReturns(app, from, await beginSignIn(app, from));
const loginError = (res: request.Response) => new URL(res.headers.location, "https://harness.test").searchParams.get("error");
/** Where a connect's return sends the browser: Settings, with one fixed word. */
function word(res: request.Response): string | null {
  const target = new URL(res.headers.location, "https://harness.test");
  expect([res.status, target.pathname]).toEqual([303, "/settings"]);
  return target.searchParams.get("apple");
}
const connectedTo = (owner: Principal) => (storage as any).getAppleIdentityForLogin(owner.user.userId);

describe("Apple's returns, limited per address", () => {
  it("asks Apple at most 20 times for one address, then makes it wait; another address carries on", async () => {
    const { app } = await createTestApp();
    const attacker = via("203.0.113.60");

    for (let i = 0; i < 20; i += 1) expect(loginError(await refusedSignIn(app, attacker))).toBe(NOT_COMPLETED);
    expect(tokenRequests).toBe(20);

    expect(loginError(await refusedSignIn(app, attacker))).toBe(WAIT);
    expect(tokenRequests).toBe(20);

    expect(loginError(await refusedSignIn(app, via("203.0.113.61")))).toBe(NOT_COMPLETED);
    expect(tokenRequests).toBe(21);
  });

  it("never counts a return cancelled at Apple, or one that fails its state check, for a sign-in or a connect", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const from = via("203.0.113.62");

    for (let i = 0; i < 25; i += 1) {
      const cancelled = await beginSignIn(app, from);
      await appleReturns(app, from, cancelled, { error: "user_cancelled_authorize" });
      await appleReturns(app, from, { state: cancelled.state, cookie: (await beginSignIn(app, from)).cookie });
    }
    // The same two for a connect (fewer: each start is a real password check).
    for (let i = 0; i < 3; i += 1) {
      const cancelled = await beginConnect(app, owner, from);
      expect(word(await appleReturns(app, from, cancelled, { error: "user_cancelled_authorize" }))).toBe("cancelled");
      expect(word(await appleReturns(app, from, { state: cancelled.state, cookie: (await beginConnect(app, owner, from)).cookie }))).toBe("expired");
    }
    expect(tokenRequests).toBe(0);
    for (let i = 0; i < 20; i += 1) await refusedSignIn(app, from);
    expect(tokenRequests).toBe(20);
  });

  it("never counts a connect's return refused before Apple is asked: a start already taken up, a session that has ended", async () => {
    const { app } = await createTestApp();
    const from = via("203.0.113.67");
    // One connect that connects (its count is given back), then the same return again and again.
    const started = await beginConnect(app, await createOwnerPrincipal(), from);
    nextToken = identityToken(started.nonce, subject());
    expect(word(await appleReturns(app, from, started))).toBe("connected");
    for (let i = 0; i < 25; i += 1) expect(word(await appleReturns(app, from, started))).toBe("expired");
    // Three owners who signed out before Apple returned.
    for (let i = 0; i < 3; i += 1) {
      const owner = await createOwnerPrincipal();
      const left = await beginConnect(app, owner, from);
      await request(app).post("/api/auth/logout").set(signedIn(owner)).expect(204);
      expect(word(await appleReturns(app, from, left))).toBe("expired");
    }
    expect(tokenRequests).toBe(1);
    // The address still has its twenty.
    for (let i = 0; i < 20; i += 1) expect(loginError(await refusedSignIn(app, from))).toBe(NOT_COMPLETED);
    expect(tokenRequests).toBe(21);
  });

  it("counts a signed-in owner's connect with them: over the limit it waits, asks Apple nothing and connects nothing", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const from = via("203.0.113.63");
    for (let i = 0; i < 20; i += 1) await refusedSignIn(app, from);

    const started = await beginConnect(app, owner, from);
    nextToken = identityToken(started.nonce, subject());
    const waiting = await appleReturns(app, from, started);
    expect(word(waiting)).toBe("try-later");
    expect(([] as string[]).concat(waiting.headers["set-cookie"] ?? []).join("\n")).toMatch(/__Host-taptpay-apple-oauth=;.*Expires=Thu, 01 Jan 1970/);
    expect(tokenRequests).toBe(20);
    expect(await connectedTo(owner)).toBeUndefined();

    // From another address the same owner connects (a new start: the first was taken up).
    const elsewhere = via("203.0.113.64");
    const again = await beginConnect(app, owner, elsewhere);
    nextToken = identityToken(again.nonce, subject());
    expect(word(await appleReturns(app, elsewhere, again))).toBe("connected");
    expect(tokenRequests).toBe(21);
    expect(await connectedTo(owner)).toMatchObject({ userId: owner.user.userId });
  });

  it("gives a connect's count back when it connects, and keeps it when Apple refuses", async () => {
    const { app } = await createTestApp();
    const from = via("203.0.113.65");
    for (let i = 0; i < 18; i += 1) await refusedSignIn(app, from);

    // A connect Apple refuses is the nineteenth.
    const refused = await beginConnect(app, await createOwnerPrincipal(), from);
    expect(word(await appleReturns(app, from, refused))).toBe("failed");
    // A connect that connects takes the twentieth and gives it back.
    const owner = await createOwnerPrincipal();
    const started = await beginConnect(app, owner, from);
    nextToken = identityToken(started.nonce, subject());
    expect(word(await appleReturns(app, from, started))).toBe("connected");
    expect(tokenRequests).toBe(20);

    // So one more return still asks Apple, and the one after waits.
    expect(loginError(await refusedSignIn(app, from))).toBe(NOT_COMPLETED);
    expect(loginError(await refusedSignIn(app, from))).toBe(WAIT);
    expect(tokenRequests).toBe(21);
  });

  it("gives a sign-in's count back when it signs someone in", async () => {
    const { app } = await createTestApp();
    const from = via("203.0.113.66");
    for (let i = 0; i < 19; i += 1) await refusedSignIn(app, from);

    // A first sign-in that makes a business takes the twentieth and gives it back.
    const started = await beginSignIn(app, from);
    nextToken = identityToken(started.nonce, subject(), `first.${crypto.randomBytes(4).toString("hex")}@example.test`);
    expect((await appleReturns(app, from, started)).headers.location).toBe("/login?apple=complete");
    expect(tokenRequests).toBe(20);

    expect(loginError(await refusedSignIn(app, from))).toBe(NOT_COMPLETED);
    expect(loginError(await refusedSignIn(app, from))).toBe(WAIT);
    expect(tokenRequests).toBe(21);
  });
});
