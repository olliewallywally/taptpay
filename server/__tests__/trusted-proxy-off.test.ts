import "./support/test-env";
import "./support/google-oauth-test-env";

import request from "supertest";
import { signedIn, createAdminPrincipal, createTestApp, resetTestStorage } from "./support/http-harness";

/**
 * R1-T4 phase B, with the setting off (TRUST_PROXY_HOPS unset: the default until the
 * owner's live check, decision 2026-09-21 Q4). The app then believes no forwarded header:
 * a visitor who writes `X-Forwarded-For` or `X-Forwarded-Proto` changes nothing, and no
 * limit is keyed on an address that may be the proxy's for everyone.
 */

let tokenRequests: number;
let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  resetTestStorage();
  tokenRequests = 0;
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

const FORGED = { "X-Forwarded-For": "203.0.113.9", "X-Forwarded-Proto": "https" };

it("takes the connection's own address and protocol, whatever the visitor writes", async () => {
  const { app } = await createTestApp();

  const seen = await request(app).get("/api/admin/request-origin").set(signedIn(await createAdminPrincipal())).set(FORGED);

  expect(seen.status).toBe(200);
  expect(seen.body).toEqual(expect.objectContaining({
    trustProxyHops: null,
    addressLimits: "off",
    protocol: "http",
    forwardedFor: ["203.0.113.9"],
  }));
  expect(seen.body.clientAddress).toBe(seen.body.connectionAddress);
  expect(seen.body.clientAddress).not.toBe("203.0.113.9");
});

it("keys no limit on the address: 25 Google callbacks from one address all reach Google", async () => {
  const { app } = await createTestApp();

  for (let i = 0; i < 25; i += 1) {
    const started = await request(app).get("/api/auth/google").set(FORGED);
    const state = new URL(started.headers.location).searchParams.get("state") ?? "";
    const cookie = ([] as string[]).concat(started.headers["set-cookie"] ?? [])
      .find((c) => c.startsWith("__Host-taptpay-google-oauth="))!.split(";")[0];
    await request(app).get(`/api/auth/google/callback?code=synthetic-code&state=${encodeURIComponent(state)}`)
      .set(FORGED).set("Cookie", cookie);
  }

  expect(tokenRequests).toBe(25);
});
