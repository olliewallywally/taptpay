import "./support/test-env";

// Refund initiation is gated by a money capability flag; enabling one
// requires enforce mode (server/config.ts's moneyFlagEnabled check).
process.env.FEATURE_REFUND_INITIATION = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

import jwt from "jsonwebtoken";
import request from "supertest";
import {
  bearer,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
} from "./support/http-harness";
import { config } from "../config";

// A minimal buffer that passes this route's PNG magic-byte check
// (89 50 4E 47 0D 0A 1A 0A) without needing a real decodable image — the
// tests here are about the role gate, not image handling.
const PNG_MAGIC_ONLY = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

describe("R1-T3 safe-default role gates — owner-only merchant configuration", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("a member cannot change the theme; the owner can", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const memberAttempt = await request(app)
      .put(`/api/merchants/${owner.merchantId}/theme`)
      .set(bearer(member))
      .send({ themeId: "midnight" });
    expect(memberAttempt.status).toBe(403);

    const ownerAttempt = await request(app)
      .put(`/api/merchants/${owner.merchantId}/theme`)
      .set(bearer(owner))
      .send({ themeId: "midnight" });
    expect(ownerAttempt.status).toBe(200);
  });

  it("a member cannot change the daily goal; the owner can", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const memberAttempt = await request(app)
      .put(`/api/merchants/${owner.merchantId}/daily-goal`)
      .set(bearer(member))
      .send({ dailyGoal: "750.00" });
    expect(memberAttempt.status).toBe(403);

    const ownerAttempt = await request(app)
      .put(`/api/merchants/${owner.merchantId}/daily-goal`)
      .set(bearer(owner))
      .send({ dailyGoal: "750.00" });
    expect(ownerAttempt.status).toBe(200);
  });

  it("a member cannot upload the merchant logo; the owner clears the role gate (this route writes uploadedFiles via `db` directly — one of the three known routes.ts exceptions the plan assigns to R1-T7, so it 500s with no live database here rather than the 200 it gives with one; the role gate is what T3 owns and is what this asserts)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const memberAttempt = await request(app)
      .post(`/api/merchants/${owner.merchantId}/logo`)
      .set(bearer(member))
      .attach("logo", PNG_MAGIC_ONLY, "logo.png");
    expect(memberAttempt.status).toBe(403);

    const ownerAttempt = await request(app)
      .post(`/api/merchants/${owner.merchantId}/logo`)
      .set(bearer(owner))
      .attach("logo", PNG_MAGIC_ONLY, "logo.png");
    expect(ownerAttempt.status).not.toBe(403);
  });

  it("a member cannot delete the merchant logo; the owner can", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const memberAttempt = await request(app)
      .delete(`/api/merchants/${owner.merchantId}/logo`)
      .set(bearer(member));
    expect(memberAttempt.status).toBe(403);

    const ownerAttempt = await request(app)
      .delete(`/api/merchants/${owner.merchantId}/logo`)
      .set(bearer(owner));
    expect(ownerAttempt.status).not.toBe(403);
  });

  it("a member cannot initiate a refund; the owner clears the role gate (a 404 on the made-up transaction id proves it, not a 403)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const memberAttempt = await request(app)
      .post("/api/transactions/999999/refunds")
      .set(bearer(member))
      .send({ refundAmount: "1.00", refundReason: "test", refundMethod: "original_payment_method" });
    expect(memberAttempt.status).toBe(403);

    const ownerAttempt = await request(app)
      .post("/api/transactions/999999/refunds")
      .set(bearer(owner))
      .send({ refundAmount: "1.00", refundReason: "test", refundMethod: "original_payment_method" });
    expect(ownerAttempt.status).not.toBe(403);
  });
});

describe("R1-T3 safe-default role gates — admin requires the validated principal, not a role claim alone", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("rejects a role:'admin' JWT claim whose email does not match config.admin.email", async () => {
    const { app } = await createTestApp();

    // generateToken() itself refuses to mint this (see auth.ts) — that is the
    // point: proving the server-side check, not just the client-side helper,
    // rejects a forged claim requires signing one directly.
    const forged = jwt.sign(
      { principal: "admin", userId: 1, email: "not-the-real-admin@harness.test", merchantId: 0, role: "admin" },
      config.jwtSecret,
      { expiresIn: "1h" },
    );

    const response = await request(app).get("/api/admin/merchants").set({ Authorization: `Bearer ${forged}` });

    expect(response.status).toBe(403);
  });

  it("rejects a merchant owner token on an admin-only route", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const response = await request(app).get("/api/admin/merchants").set(bearer(owner));

    expect(response.status).toBe(403);
  });
});

describe("R1-T3 safe-default: password change never trusts the path merchant id", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("changes the caller's own password regardless of the :id in the URL, and never the account the id actually names", async () => {
    const { app } = await createTestApp();
    const ownerA = await createOwnerPrincipal();
    const ownerB = await createOwnerPrincipal();

    // ownerA calls the change-password route with ownerB's merchant id in the
    // path — the path id must never be trusted for who gets changed.
    const response = await request(app)
      .put(`/api/merchants/${ownerB.merchantId}/change-password`)
      .set(bearer(ownerA))
      .send({ currentPassword: "Harness123", newPassword: "NewHarness456", confirmPassword: "NewHarness456" });

    expect(response.status).toBe(200);

    // ownerB's password must be unchanged — the mismatched path id had zero effect.
    const bStillOldPassword = await request(app)
      .post(`/api/auth/login`)
      .send({ email: ownerB.user.email, password: "Harness123" });
    expect(bStillOldPassword.status).toBe(200);

    // ownerA's password, meanwhile, really did change.
    const aOldPasswordNowFails = await request(app)
      .post(`/api/auth/login`)
      .send({ email: ownerA.user.email, password: "Harness123" });
    expect(aOldPasswordNowFails.status).toBe(401);

    const aNewPasswordWorks = await request(app)
      .post(`/api/auth/login`)
      .send({ email: ownerA.user.email, password: "NewHarness456" });
    expect(aNewPasswordWorks.status).toBe(200);
  });
});
