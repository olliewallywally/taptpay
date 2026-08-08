jest.mock("../database", () => ({
  getDb: () => null,
  isDatabaseConnected: () => false,
}));

import type { PlanId } from "@shared/plans";
import { MemStorage, type MerchantSignupStorageInput } from "../storage";

function signupInput(
  email: string,
  planId: PlanId = "team",
): MerchantSignupStorageInput {
  return {
    name: "Owner Person",
    businessName: "Parity Shop",
    businessType: "retail",
    email,
    phone: "+6421000000",
    address: "1 Test Street",
    password: "StrongPassword123!",
    confirmPassword: "StrongPassword123!",
    verificationToken: `verify-${email}`,
    passwordHash: "owner-hash",
    planId,
    contactEmail: "receipts@example.test",
    contactPhone: "+6421111111",
    businessAddress: "2 Trading Street",
    nzbn: "9429000000000",
    gstNumber: "123-456-789",
    director: "Owner Person",
    businessDescription: "A local test business",
    websiteUrl: "https://example.test",
    estimatedAnnualTurnover: "100000-250000",
    onboardingCompleted: true,
  };
}

function liveInvite(
  email: string,
  token: string,
  now: Date = new Date(),
) {
  return {
    email,
    name: email.split("@")[0],
    inviteTokenHash: token,
    inviteExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  };
}

describe("MemStorage auth, team, and subscription parity", () => {
  test("persists the atomic signup profile, owner login, and selected plan", async () => {
    const storage = new MemStorage();
    const merchant = await storage.createMerchantWithSignup(
      signupInput("  Owner@Example.Test  ", "crew"),
    );

    expect(merchant).toMatchObject({
      email: "owner@example.test",
      contactEmail: "receipts@example.test",
      contactPhone: "+6421111111",
      businessAddress: "2 Trading Street",
      nzbn: "9429000000000",
      gstNumber: "123-456-789",
      director: "Owner Person",
      businessDescription: "A local test business",
      websiteUrl: "https://example.test",
      estimatedAnnualTurnover: "100000-250000",
      onboardingCompleted: true,
      qrCodeUrl: `/api/merchants/${merchant.id}/qr`,
      paymentUrl: `/pay/${merchant.id}`,
    });
    await expect(
      storage.getMerchantByEmail(" OWNER@EXAMPLE.TEST "),
    ).resolves.toMatchObject({ id: merchant.id });
    await expect(
      storage.getUserByEmail(" OWNER@EXAMPLE.TEST "),
    ).resolves.toMatchObject({
      merchantId: merchant.id,
      role: "owner",
      status: "active",
      password: "owner-hash",
    });
    await expect(storage.getSubscription(merchant.id)).resolves.toMatchObject({
      status: "pending",
      planId: "crew",
      seatLimit: 10,
      priceCents: 1299,
    });
  });

  test("enforces invite CAS, expiry, status transitions, and global email uniqueness", async () => {
    const storage = new MemStorage();
    const merchant = await storage.createMerchantWithSignup(
      signupInput("owner@example.test"),
    );
    const now = new Date();
    const invited = await storage.inviteTeamMember(
      merchant.id,
      liveInvite("Member@Example.Test", "invite-one", now),
    );
    expect(invited.ok).toBe(true);
    if (!invited.ok) throw new Error("invite should succeed");
    expect(invited.user.email).toBe("member@example.test");
    await expect(storage.countSeatsInUse(merchant.id)).resolves.toBe(2);

    await expect(
      storage.inviteTeamMember(
        merchant.id,
        liveInvite(" MEMBER@example.test ", "duplicate", now),
      ),
    ).resolves.toEqual({ ok: false, reason: "email-taken" });
    await expect(
      storage.rotateTeamInvite(merchant.id, invited.user.id, {
        expectedTokenHash: "stale-token",
        inviteTokenHash: "invite-two",
        inviteExpiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      }),
    ).resolves.toEqual({ ok: false, reason: "conflict" });
    const rotated = await storage.rotateTeamInvite(merchant.id, invited.user.id, {
      expectedTokenHash: "invite-one",
      inviteTokenHash: "invite-two",
      inviteExpiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
    });
    expect(rotated.ok).toBe(true);

    const acceptResults = await Promise.all(
      Array.from({ length: 8 }, () =>
        storage.activateInvitedUser(
          invited.user.id,
          "invite-two",
          "member-hash",
          "Member Person",
          now,
        ),
      ),
    );
    expect(acceptResults.filter(Boolean)).toHaveLength(1);
    await expect(storage.getUserById(invited.user.id)).resolves.toMatchObject({
      status: "active",
      inviteTokenHash: null,
      name: "Member Person",
    });

    const owner = await storage.getUserByEmail("owner@example.test");
    expect(owner).toBeDefined();
    await expect(
      storage.setTeamMemberStatus(merchant.id, owner!.id, "disabled"),
    ).resolves.toEqual({ ok: false, reason: "owner" });
    await expect(
      storage.setTeamMemberStatus(merchant.id, invited.user.id, "disabled"),
    ).resolves.toMatchObject({ ok: true, user: { status: "disabled" } });
    await expect(
      storage.setTeamMemberStatus(merchant.id, invited.user.id, "active"),
    ).resolves.toMatchObject({ ok: true, user: { status: "active" } });

    const expired = await storage.inviteTeamMember(merchant.id, {
      email: "expired@example.test",
      inviteTokenHash: "expired-token",
      inviteExpiresAt: new Date(now.getTime() - 1),
    });
    expect(expired.ok).toBe(true);
    await expect(storage.countSeatsInUse(merchant.id)).resolves.toBe(2);
    if (!expired.ok) throw new Error("expired invite row should be created");
    await expect(
      storage.rotateTeamInvite(merchant.id, expired.user.id, {
        expectedTokenHash: "expired-token",
        inviteTokenHash: "renewed-token",
        inviteExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(storage.countSeatsInUse(merchant.id)).resolves.toBe(3);
    await expect(
      storage.revokeTeamInvite(merchant.id, expired.user.id, "stale-token"),
    ).resolves.toBe(false);
    await expect(
      storage.revokeTeamInvite(merchant.id, expired.user.id, "renewed-token"),
    ).resolves.toBe(true);
  });

  test("atomically consumes reset tokens and keeps the owner credential in sync", async () => {
    const storage = new MemStorage();
    const merchant = await storage.createMerchantWithSignup(
      signupInput("owner@example.test"),
    );
    const owner = await storage.getUserByEmail("owner@example.test");
    expect(owner).toBeDefined();
    const now = new Date();
    await storage.setUserResetToken(
      owner!.id,
      "reset-token",
      new Date(now.getTime() + 60_000),
    );

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        storage.resetUserPasswordByToken("reset-token", "new-owner-hash", now),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(storage.getUserByResetToken("reset-token")).resolves.toBeUndefined();
    await expect(storage.getUserById(owner!.id)).resolves.toMatchObject({
      password: "new-owner-hash",
      resetToken: null,
      resetTokenExpiry: null,
    });
    await expect(storage.getMerchant(merchant.id)).resolves.toMatchObject({
      passwordHash: "new-owner-hash",
    });
  });

  test("charges activation and upgrades, queues paid downgrades, and honours the pending seat cap", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
    try {
      const storage = new MemStorage();
      const merchant = await storage.createMerchantWithSignup(
        signupInput("owner@example.test", "team"),
      );
      expect(await storage.bindSubscriptionCardSession(merchant.id, "  session-one  "))
        .toBe(true);
      await expect(storage.bindSubscriptionCardSession(merchant.id, "   "))
        .resolves.toBe(false);
      const activationCharge = jest.fn(async () => ({
        success: true as const,
        approved: true,
        windcaveTransactionId: "wc-activation",
      }));
      const activated = await storage.completeSubscriptionCardSetup(
        merchant.id,
        "session-one",
        {
          windcaveCardId: "card-one",
          brand: "visa",
          last4: "4242",
          expiry: "12/30",
        },
        activationCharge,
      );
      expect(activated).toMatchObject({
        ok: true,
        charged: true,
        subscription: { status: "active", planId: "team", priceCents: 899 },
      });
      expect(activationCharge).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 899, cardId: "card-one" }),
      );

      const replacement = await storage.completeSubscriptionCardSetup(
        merchant.id,
        "session-one",
        {
          windcaveCardId: "card-two",
          brand: "mastercard",
          last4: "4444",
          expiry: "11/31",
        },
        activationCharge,
      );
      expect(replacement).toMatchObject({ ok: true, charged: false });
      expect(activationCharge).toHaveBeenCalledTimes(1);

      const upgradeCharge = jest.fn(async () => ({
        success: true as const,
        approved: true,
        windcaveTransactionId: "wc-upgrade",
      }));
      const upgraded = await storage.changeSubscriptionPlan(
        merchant.id,
        "crew",
        upgradeCharge,
      );
      expect(upgraded).toMatchObject({
        ok: true,
        applied: "immediate",
        subscription: { planId: "crew", seatLimit: 10, priceCents: 1299 },
      });
      expect(upgradeCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          targetPlanId: "crew",
          cardId: "card-two",
        }),
      );

      for (let index = 0; index < 4; index += 1) {
        const result = await storage.inviteTeamMember(
          merchant.id,
          liveInvite(`member-${index}@example.test`, `token-${index}`),
        );
        expect(result.ok).toBe(true);
      }
      await expect(storage.countSeatsInUse(merchant.id)).resolves.toBe(5);
      await expect(
        storage.changeSubscriptionPlan(merchant.id, "team"),
      ).resolves.toMatchObject({
        ok: true,
        applied: "queued",
        subscription: { planId: "crew", pendingPlanId: "team" },
      });
      await expect(
        storage.inviteTeamMember(
          merchant.id,
          liveInvite("blocked@example.test", "blocked-token"),
        ),
      ).resolves.toEqual({
        ok: false,
        reason: "seat-limit",
        seatsInUse: 5,
        seatLimit: 5,
      });

      await expect(storage.cancelSubscription(merchant.id, "testing"))
        .resolves.toMatchObject({ subscription: { status: "active", cancelAtPeriodEnd: true } });
      await expect(storage.resumeSubscription(merchant.id))
        .resolves.toMatchObject({ status: "active", cancelAtPeriodEnd: false });
      await expect(storage.getBillingHistory(merchant.id))
        .resolves.toEqual(expect.arrayContaining([
          expect.objectContaining({ billingType: "monthly_subscription", status: "succeeded" }),
          expect.objectContaining({ billingType: "plan_change", status: "succeeded" }),
        ]));
    } finally {
      jest.useRealTimers();
    }
  });

  test("does not burn another decline attempt and skips dunning rows still in backoff", async () => {
    jest.useFakeTimers();
    const now = new Date("2026-08-07T12:00:00.000Z");
    jest.setSystemTime(now);
    try {
      const storage = new MemStorage();
      const merchant = await storage.createMerchantWithSignup(
        signupInput("owner@example.test", "solo"),
      );
      await storage.bindSubscriptionCardSession(merchant.id, "decline-session");
      const declineCharge = jest.fn(async () => ({
        success: true as const,
        approved: false,
        windcaveTransactionId: "wc-decline",
        declineReason: "Insufficient funds",
      }));
      const card = {
        windcaveCardId: "declined-card",
        brand: "visa",
        last4: "0002",
        expiry: "12/30",
      };
      await expect(
        storage.completeSubscriptionCardSetup(
          merchant.id,
          "decline-session",
          card,
          declineCharge,
        ),
      ).resolves.toMatchObject({ ok: false, reason: "declined" });
      await expect(
        storage.completeSubscriptionCardSetup(
          merchant.id,
          "decline-session",
          card,
          declineCharge,
        ),
      ).resolves.toMatchObject({ ok: false, reason: "declined" });
      expect(declineCharge).toHaveBeenCalledTimes(1);
      const subscription = await storage.getSubscription(merchant.id);
      expect(subscription).toMatchObject({
        status: "past_due",
        failedPaymentCount: 1,
      });
      await expect(storage.getBillingHistory(merchant.id)).resolves.toHaveLength(1);
      await expect(storage.claimSubscriptionsDueForBilling(now)).resolves.toEqual([]);

      const retryAt = new Date(
        new Date(subscription!.nextBillingDate!).getTime() + 24 * 60 * 60 * 1000 + 1,
      );
      const claimed = await storage.claimSubscriptionsDueForBilling(retryAt);
      expect(claimed).toHaveLength(1);
      expect(claimed[0].billingClaimToken).toEqual(expect.any(String));
      await storage.releaseSubscriptionBillingClaim(
        claimed[0].id,
        claimed[0].billingClaimToken!,
      );
      await expect(
        storage.claimSubscriptionsDueForBilling(retryAt, 5, [claimed[0].id]),
      ).resolves.toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});
