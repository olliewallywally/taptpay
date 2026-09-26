import "./support/test-env";

import crypto from "crypto";
import request from "supertest";
import {
  bearer, createAdminPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage,
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
