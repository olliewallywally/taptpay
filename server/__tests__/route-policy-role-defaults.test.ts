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

  it("a member cannot upload the merchant logo; the owner can", async () => {
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
    expect(ownerAttempt.status).toBe(200);
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

/**
 * R1-T3's safe default is explicit: "Password change: move to
 * /api/account/password, or prove the path merchant equals the authenticated
 * account. Never ignore a path ID."
 *
 * The superseded version of this block asserted the opposite contract — that a
 * cross-tenant path id returns 200 because only the caller's own login changes.
 * That is the behaviour the plan names as wrong, and its assertions are quoted
 * verbatim in docs/evidence/remediation-v2-2/r1/R1-T3-password-path-contract-2026-09-11.md.
 * The route is not moved: its only caller builds the URL from the caller's own
 * JWT, so enforcing equality has an empty client blast radius.
 */
describe("R1-T3 safe-default: password change proves the path merchant is the caller's", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("refuses a cross-tenant path id and changes nobody's password", async () => {
    const { app } = await createTestApp();
    const ownerA = await createOwnerPrincipal();
    const ownerB = await createOwnerPrincipal();

    const response = await request(app)
      .put(`/api/merchants/${ownerB.merchantId}/change-password`)
      .set(bearer(ownerA))
      .send({ currentPassword: "Harness123", newPassword: "NewHarness456", confirmPassword: "NewHarness456" });

    expect(response.status).toBe(403);

    // Zero side effects: both accounts keep their original password, and the
    // password the attacker tried to set works for neither.
    for (const owner of [ownerA, ownerB]) {
      const stillOld = await request(app)
        .post(`/api/auth/login`)
        .send({ email: owner.user.email, password: "Harness123" });
      expect(stillOld.status).toBe(200);

      const attemptedNew = await request(app)
        .post(`/api/auth/login`)
        .send({ email: owner.user.email, password: "NewHarness456" });
      expect(attemptedNew.status).toBe(401);
    }
  });

  it("still changes an owner's own password when the path id is their own", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const response = await request(app)
      .put(`/api/merchants/${owner.merchantId}/change-password`)
      .set(bearer(owner))
      .send({ currentPassword: "Harness123", newPassword: "NewHarness456", confirmPassword: "NewHarness456" });

    expect(response.status).toBe(200);

    const oldFails = await request(app)
      .post(`/api/auth/login`).send({ email: owner.user.email, password: "Harness123" });
    expect(oldFails.status).toBe(401);
    const newWorks = await request(app)
      .post(`/api/auth/login`).send({ email: owner.user.email, password: "NewHarness456" });
    expect(newWorks.status).toBe(200);
  });

  it("still lets a member change their own password on their own merchant", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    const response = await request(app)
      .put(`/api/merchants/${owner.merchantId}/change-password`)
      .set(bearer(member))
      .send({ currentPassword: "Harness123", newPassword: "NewHarness456", confirmPassword: "NewHarness456" });

    expect(response.status).toBe(200);

    // The teammate's own login rotated; the owner's did not.
    const memberNew = await request(app)
      .post(`/api/auth/login`).send({ email: member.user.email, password: "NewHarness456" });
    expect(memberNew.status).toBe(200);
    const ownerUntouched = await request(app)
      .post(`/api/auth/login`).send({ email: owner.user.email, password: "Harness123" });
    expect(ownerUntouched.status).toBe(200);
  });

  it("rejects a malformed path id before anything else", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const response = await request(app)
      .put(`/api/merchants/1abc/change-password`)
      .set(bearer(owner))
      .send({ currentPassword: "Harness123", newPassword: "NewHarness456", confirmPassword: "NewHarness456" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid id");
  });
});
