import "./support/test-env";
import "./support/apple-sign-in-test-env";

// No public origin and no deployment domain: the address is the request's own, as in local
// development, and that is not https. (The configuration refuses a public origin that is not https,
// and requires one for Sign in with Apple outside tests, so this is the only way to get here.)
delete process.env.PUBLIC_ORIGIN;
delete process.env.PRODUCTION_DOMAIN;
delete process.env.REPLIT_DOMAINS;
delete process.env.REPLIT_DEV_DOMAIN;

import request from "supertest";
import { VALID_PASSWORD, createOwnerPrincipal, createTestApp, resetTestStorage, signedIn } from "./support/http-harness";
import { appleSignInCookies } from "../apple-sign-in";

/**
 * R1-T5b: Apple answers by a cross-site form post, and only a `SameSite=None; Secure` cookie comes
 * back with one. On an origin that is not https the starting cookie could not be Secure, so the flow
 * is refused at the start instead of failing later with a missing cookie.
 */
beforeEach(() => resetTestStorage());

test("on an http origin the start sets no cookie and says why", async () => {
  const { app } = await createTestApp();
  const res = await request(app).get("/api/auth/apple");
  expect(res.status).toBe(302);
  expect(new URL(res.headers.location, "http://harness.test").searchParams.get("error")).toBe("Apple sign in needs a secure (https) address");
  expect(res.headers["set-cookie"]).toBeUndefined();
});

test("the cookies are __Host- and Secure only on https; the starting one is SameSite=None, the handoff Strict", () => {
  const https = appleSignInCookies("https://harness.test");
  expect(https.secure).toBe(true);
  expect(https.oauth).toEqual({ name: "__Host-taptpay-apple-oauth", options: { httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 600_000 } });
  expect(https.handoff).toEqual({ name: "__Host-taptpay-apple-handoff", options: { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 60_000 } });
  const http = appleSignInCookies("http://localhost:5000");
  expect(http.secure).toBe(false);
  expect([http.oauth.name, http.handoff.name]).toEqual(["taptpay-apple-oauth", "taptpay-apple-handoff"]);
});

// R1-T5c: a connect starts with the same cookie, so it is refused on an http origin too.
test("on an http origin an owner cannot start a connect, and the connection says Apple is not available", async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  // With no public origin the page's CSRF token is bound to the address the request came to: ask for
  // it the way the page does, at one fixed address.
  const host = { Host: "harness.local" };
  const page = await request(app).get("/api/auth/session").set({ Cookie: owner.cookie, ...host });
  const res = await request(app).post("/api/auth/apple/connect").set({ ...signedIn({ cookie: owner.cookie, csrf: page.body.csrfToken }), ...host })
    .send({ currentPassword: VALID_PASSWORD });
  expect({ status: res.status, body: res.body }).toEqual({ status: 503, body: { code: "APPLE_NOT_AVAILABLE", message: "Sign in with Apple is not available." } });
  expect(([] as string[]).concat(res.headers["set-cookie"] ?? []).some((line) => line.includes("apple-oauth"))).toBe(false);
  const read = await request(app).get("/api/auth/apple/connection").set({ Cookie: owner.cookie, ...host });
  expect(read.body).toEqual({ available: false, connected: false, email: null, isPrivateEmail: false, connectedAt: null });
});

// R1-T5d: set up, but the origin is not https, so the flow cannot run: not offered.
test("on an http origin the server says Sign in with Apple is not offered", async () => {
  const { app } = await createTestApp();
  const res = await request(app).get("/api/auth/apple/available");
  expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { available: false } });
});
