import "./support/test-env";

import request from "supertest";
import { VALID_PASSWORD, createMemberPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, signedIn, storage } from "./support/http-harness";
import { startAppleConnect } from "../apple-sign-in";

/**
 * R1-T5b: with no Apple settings (this file sets none), Sign in with Apple is simply not offered:
 * both routes send the browser back to the login page with a fixed message, and Apple is never asked.
 */
let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  resetTestStorage();
  fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input: any) => { throw new Error(`unexpected outbound request in test: ${String(input)}`); });
});
afterEach(() => fetchSpy.mockRestore());

const loginError = (res: request.Response) => new URL(res.headers.location, "https://harness.test").searchParams.get("error");

test("the start sets no cookie and goes back to the login page", async () => {
  const { app } = await createTestApp();
  const res = await request(app).get("/api/auth/apple");
  expect(res.status).toBe(302);
  expect(loginError(res)).toBe("Apple sign in is not configured");
  expect(res.headers["set-cookie"]).toBeUndefined();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("a post to the callback is answered the same way, whatever it carries", async () => {
  const { app } = await createTestApp();
  const res = await request(app).post("/api/auth/apple/callback").type("form")
    .set({ Origin: "https://appleid.apple.com" }).send({ state: "A".repeat(43), code: "apple-code-1" });
  expect(res.status).toBe(303);
  expect(loginError(res)).toBe("Apple sign in is not configured");
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("the session route still only redeems a code that was issued", async () => {
  const { app } = await createTestApp();
  const res = await request(app).post("/api/auth/apple/session");
  expect(res.status).toBe(401);
  expect(res.body.code).toBe("APPLE_SIGN_IN_EXPIRED");
});

// R1-T5c: connecting needs Apple; reading the connection and disconnecting do not.
test("an owner cannot start a connect, and no password is checked for one", async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  for (const currentPassword of [VALID_PASSWORD, "Wrong-password-1", "Wrong-password-1", "Wrong-password-1", "Wrong-password-1", "Wrong-password-1", "Wrong-password-1"]) {
    const res = await request(app).post("/api/auth/apple/connect").set(signedIn(owner)).send({ currentPassword });
    expect({ status: res.status, body: res.body }).toEqual({ status: 503, body: { code: "APPLE_NOT_AVAILABLE", message: "Sign in with Apple is not available." } });
    expect(res.headers["set-cookie"]).toBeUndefined();
  }
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("the connection says Apple is not available, and one made earlier can still be removed", async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const key = { issuer: "https://appleid.apple.com", clientId: "nz.taptpay.signin.earlier", subject: "001234.earlier.0123" };
  expect(await (storage as any).connectAppleIdentity(owner.user.userId, key, { email: "earlier@example.test", isPrivateEmail: false })).toBe("connected");
  const read = await request(app).get("/api/auth/apple/connection").set("Cookie", owner.cookie);
  expect(read.body).toEqual({ available: false, connected: true, email: "earlier@example.test", isPrivateEmail: false, connectedAt: expect.any(String) });
  const removed = await request(app).post("/api/auth/apple/disconnect").set(signedIn(owner)).send({ currentPassword: VALID_PASSWORD });
  expect({ status: removed.status, body: removed.body }).toEqual({ status: 200, body: { connected: false } });
  expect(await (storage as any).getAppleIdentity(key)).toBeUndefined();
});

test("what the server cannot do is said before who may ask, and after who is signed in", async () => {
  // The plan's order (P2.2): authentication, then the capability, then the role.
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const member = await createMemberPrincipal(owner.merchantId);
  const connect = (headers: Record<string, string>) => request(app).post("/api/auth/apple/connect").set(headers).send({ currentPassword: VALID_PASSWORD });
  expect((await connect({})).body).toMatchObject({ code: "INVALID_SESSION" });
  const teammate = await connect(signedIn(member));
  expect({ status: teammate.status, code: teammate.body.code }).toEqual({ status: 503, code: "APPLE_NOT_AVAILABLE" });
  // Disconnecting and reading need nothing of Apple, so there the teammate is told it is the owner's.
  for (const res of [
    await request(app).post("/api/auth/apple/disconnect").set(signedIn(member)).send({ currentPassword: VALID_PASSWORD }),
    await request(app).get("/api/auth/apple/connection").set("Cookie", member.cookie),
  ]) {
    expect({ status: res.status, body: res.body }).toEqual({ status: 403, body: { message: "Only the account owner can do this." } });
  }
  expect(fetchSpy).not.toHaveBeenCalled();
});

test("a connect begun while Apple was set up returns to an app where it no longer is: Apple is not asked and nothing is connected", async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  // The cookie a start would have set for this owner's live session (the same signing key).
  const started = startAppleConnect({ userId: owner.user.userId!, sessionId: owner.sessionId });
  const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
  // Said before anything else is done: the start is not taken up (the same return again is answered
  // the same, not as expired) and no failure is logged.
  for (const attempt of [1, 2]) {
    const res = await request(app).post("/api/auth/apple/callback").type("form")
      .set({ Origin: "https://appleid.apple.com", Cookie: `__Host-taptpay-apple-oauth=${started.cookieValue}` })
      .send({ state: started.state, code: "apple-code-1" });
    expect([attempt, res.status, res.headers.location]).toEqual([attempt, 303, "/settings?apple=unavailable"]);
    expect(([] as string[]).concat(res.headers["set-cookie"] ?? []).join("\n")).toMatch(/__Host-taptpay-apple-oauth=;.*Expires=Thu, 01 Jan 1970/);
  }
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(await (storage as any).getAppleIdentityForLogin(owner.user.userId)).toBeUndefined();
});
