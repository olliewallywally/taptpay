import "./support/test-env";

import request from "supertest";
import {
  apiKeyHeader,
  signedIn,
  createAdminPrincipal,
  createDisabledMemberPrincipal,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  cronHeader,
  resetTestStorage,
} from "./support/http-harness";

describe("R1-T1 no-live-system HTTP harness", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it(
    "constructs the app and answers an authenticated request as a merchant owner — no network, no database, no cron, no Vite",
    async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app).get("/api/auth/me").set(signedIn(owner));

      expect(response.status).toBe(200);
      expect(response.body.user.merchantId).toBe(owner.merchantId);
      expect(response.body.user.role).toBe("owner");
    },
    5_000,
  );

  it("rejects a request with no session cookie", async () => {
    const { app } = await createTestApp();

    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
  });

  it("authenticates an active teammate distinctly from the owner", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const response = await request(app).get("/api/auth/me").set(signedIn(member));

    expect(response.status).toBe(200);
    expect(response.body.user.merchantId).toBe(owner.merchantId);
    expect(response.body.user.role).toBe("member");
    expect(response.body.user.id).not.toBe(owner.user.id);
  });

  it("rejects a teammate whose seat was revoked after their session began", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const disabled = await createDisabledMemberPrincipal(owner.merchantId);

    const response = await request(app).get("/api/auth/me").set(signedIn(disabled));

    expect(response.status).toBe(401); // 401 since 2026-09-27 (R1-T3, P2.2, owner decision): a sign-in that is invalid, expired or disabled was 403.
  });

  it("two merchants see two different owners on the same route", async () => {
    const { app } = await createTestApp();
    const ownerA = await createOwnerPrincipal();
    const ownerB = await createOwnerPrincipal();

    const [resA, resB] = await Promise.all([
      request(app).get("/api/auth/me").set(signedIn(ownerA)),
      request(app).get("/api/auth/me").set(signedIn(ownerB)),
    ]);

    expect(resA.body.user.merchantId).toBe(ownerA.merchantId);
    expect(resB.body.user.merchantId).toBe(ownerB.merchantId);
    expect(resA.body.user.merchantId).not.toBe(resB.body.user.merchantId);
  });

  it("accepts the platform admin principal", async () => {
    const { app } = await createTestApp();
    const admin = await createAdminPrincipal();

    const response = await request(app).get("/api/auth/me").set(signedIn(admin));

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("admin");
  });

  it("authorizes the cron caller by shared secret, not a user session", async () => {
    const { app } = await createTestApp();

    const authorized = await request(app).get("/api/internal/cron/status").set(cronHeader());
    const unauthorized = await request(app)
      .get("/api/internal/cron/status")
      .set({ "x-cron-secret": "wrong" });

    expect(authorized.status).toBe(200);
    expect(authorized.body.configured).toBe(true);
    expect(unauthorized.status).toBe(401);
  });

  it("404s the disabled ecommerce API before the key is even checked (requireEcommerceApi precedes authenticateApiKey)", async () => {
    const { app } = await createTestApp();

    const response = await request(app)
      .get("/api/v1/transactions/1")
      .set(apiKeyHeader("not-a-real-key"));

    expect(response.status).toBe(404);
  });

  it("serves the Apple Pay domain-association file from the real repo path (regression for the import.meta -> process.cwd() fix)", async () => {
    const { app } = await createTestApp();

    // The route sets Content-Type: application/json on a file that is not
    // actually JSON, so the default client-side JSON parser must be bypassed
    // here — that mismatch is pre-existing and out of scope for this fixture.
    const response = await request(app)
      .get("/.well-known/apple-developer-merchantid-domain-association")
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          data += chunk;
        });
        res.on("end", () => callback(null, data));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body.length).toBeGreaterThan(0);
  });
});
