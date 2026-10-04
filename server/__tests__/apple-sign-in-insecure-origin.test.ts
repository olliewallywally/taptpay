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
import { createTestApp, resetTestStorage } from "./support/http-harness";
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
