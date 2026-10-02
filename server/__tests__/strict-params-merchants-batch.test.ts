import "./support/test-env";

import request from "supertest";
import { signedIn, createOwnerPrincipal, createTestApp, resetTestStorage } from "./support/http-harness";

/**
 * R1-T6 batch 1 (/api/merchants family, 39 sites) — proves the family
 * actually rejects what bare parseInt silently accepted, on a real request
 * through the app, not just the parser unit tests.
 */
describe("R1-T6 batch 1 — /api/merchants strict numeric parsing", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it.each(["abc", "1abc", "1.5", "-1", "0", "+1", "1e3", " 1"])(
    "GET /api/merchants/%s returns 400, not a truncated/coerced lookup",
    async (garbage) => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .get(`/api/merchants/${encodeURIComponent(garbage)}/profile`)
        .set(signedIn(owner));

      expect(response.status).toBe(400);
    },
  );

  it("still works normally for a real merchant id", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const response = await request(app).get(`/api/merchants/${owner.merchantId}/profile`).set(signedIn(owner));

    expect(response.status).toBe(200);
  });

  it("a garbage :id never reaches the ownership check as a false 403 — it is a 400 before any tenant comparison", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    // Old behaviour: parseInt("999999999999999999999") silently became an
    // unsafe/rounded number and fell through to a 403/404 further down.
    const response = await request(app)
      .get("/api/merchants/999999999999999999999/profile")
      .set(signedIn(owner));

    expect(response.status).toBe(400);
  });
});
