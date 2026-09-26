import "./support/test-env";

import crypto from "crypto";
import request from "supertest";
import {
  bearer, createAdminPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage, storageSnapshot,
} from "./support/http-harness";

/**
 * C10 route review, batch 4 (the platform admin's routes), 2026-09-26.
 *
 * POST /api/admin/merchants/:id/activate sets a waiting application's password and marks it
 * verified. It found the application by its sign-up token, not by the business asked for: a
 * business with no waiting application was looked up as the token '' — a 500 today, since no code
 * stores an empty token, but any row holding one would have had its password set and been
 * verified instead of the business named.
 */
beforeEach(() => {
  resetTestStorage();
});

describe("activating a business with a password (admin)", () => {
  it("refuses a business with no waiting application, and never touches another business", async () => {
    const { app } = await createTestApp();
    const admin = createAdminPrincipal();
    const target = await createOwnerPrincipal();
    const bystander = await createOwnerPrincipal();
    await storage.updateMerchant(bystander.merchantId, { status: "pending", verificationToken: "" } as any);
    const before = await storage.getMerchant(bystander.merchantId);

    const res = await request(app)
      .post(`/api/admin/merchants/${target.merchantId}/activate`)
      .set(bearer(admin))
      .send({ password: "Password1!" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "This business has no waiting application to activate" });
    expect(await storage.getMerchant(bystander.merchantId)).toEqual(before);
  });

  it("still activates a waiting application, with the password given", async () => {
    const { app } = await createTestApp();
    const admin = createAdminPrincipal();
    const token = crypto.randomBytes(32).toString("hex");
    const waiting = await storage.createMerchantWithSignup({
      name: "Waiting Owner", businessName: "Waiting Ltd", businessType: "retail",
      email: `waiting.${crypto.randomBytes(4).toString("hex")}@harness.test`,
      phone: "021 555 0100", address: "1 Waiting Street, Auckland", verificationToken: token,
    } as any);

    const res = await request(app)
      .post(`/api/admin/merchants/${waiting.id}/activate`)
      .set(bearer(admin))
      .send({ password: "Password1!" });

    expect(res.status).toBe(200);
    expect(res.body.merchant).toMatchObject({ id: waiting.id, status: "verified" });
    expect(await storage.getMerchant(waiting.id)).toMatchObject({ status: "verified", verificationToken: null });
  });
});

/**
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-4-owner-answers.md, answer 4):
 * the business page (client/src/pages/admin/MerchantDetail.tsx) shows Verify only for a waiting
 * application and Activate Account only for a verified business, and the routes now accept only
 * that. Before, verify took any state but verified (an active business was set back to verified)
 * and set-active any state but active (an application whose email was never confirmed became
 * active, and sign-in accepts active).
 */
describe("verify and set-active accept only what the business page offers", () => {
  const waitingApplication = () => storage.createMerchantWithSignup({
    name: "Waiting Owner", businessName: "Waiting Ltd", businessType: "retail",
    email: `waiting.${crypto.randomBytes(4).toString("hex")}@harness.test`,
    phone: "021 555 0100", address: "1 Waiting Street, Auckland",
    verificationToken: crypto.randomBytes(32).toString("hex"), passwordHash: "synthetic-password-hash",
  } as any);

  it("verify refuses an active business, and changes nothing", async () => {
    const { app } = await createTestApp();
    const active = await createOwnerPrincipal();
    const before = storageSnapshot();

    const res = await request(app).post(`/api/admin/merchants/${active.merchantId}/verify`).set(bearer(createAdminPrincipal()));

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "Only a waiting application can be verified" });
    expect(storageSnapshot()).toBe(before);
  });

  it("verify still verifies a waiting application that chose a password", async () => {
    const { app } = await createTestApp();
    const waiting = await waitingApplication();

    const res = await request(app).post(`/api/admin/merchants/${waiting.id}/verify`).set(bearer(createAdminPrincipal()));

    expect(res.status).toBe(200);
    expect(await storage.getMerchant(waiting.id)).toMatchObject({ status: "verified" });
  });

  it("set-active refuses a waiting application, and changes nothing", async () => {
    const { app } = await createTestApp();
    const waiting = await waitingApplication();
    const before = storageSnapshot();

    const res = await request(app).post(`/api/admin/merchants/${waiting.id}/set-active`).set(bearer(createAdminPrincipal()));

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: "Only a verified business can be activated" });
    expect(storageSnapshot()).toBe(before);
  });

  it("set-active still activates a verified business", async () => {
    const { app } = await createTestApp();
    const verified = await waitingApplication();
    await storage.updateMerchantStatus(verified.id, "verified");

    const res = await request(app).post(`/api/admin/merchants/${verified.id}/set-active`).set(bearer(createAdminPrincipal()));

    expect(res.status).toBe(200);
    expect(await storage.getMerchant(verified.id)).toMatchObject({ status: "active" });
  });
});
