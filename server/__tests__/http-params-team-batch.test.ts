import "./support/test-env";

import crypto from "crypto";
import request from "supertest";
import {
  signedIn,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  storage,
} from "./support/http-harness";

/**
 * R1-T6 — `/api/team/:userId/*` identifier batch (2026-09-06). This is the
 * final identifier-family batch: after this, every `parseInt(req.params.*)`/
 * `parseInt(req.query.*)` site in `server/routes.ts` is either migrated or a
 * documented judgment-call exception (the four QR `size` clamps and the
 * `revenue-over-time` `days` clamp reviewed and closed out in
 * `R1-T6-nfc-tapt-stone-and-days-clamp-2026-09-06.md` and
 * `R1-T6-transactions-refunds-batch-2026-09-06.md`). See the evidence doc for
 * the full site list and the reordering judgment call these four routes
 * needed (the pre-existing `isAccountOwner` role check ran *before* the old
 * `parseInt` line in the source, so the new guard had to move ahead of it,
 * not just replace the old line in place).
 *
 * All four routes sit behind `authenticateToken` only (no capability flag),
 * so no env var needs flipping for this file, unlike the transactions/refunds
 * and admin batches.
 */
describe("R1-T6 — /api/team/:userId identifier batch", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  const GARBAGE_IDS = ["abc", "1abc", "1.5", "-1", "0", "+1", "1e3"];

  /**
   * An "invited" (not yet accepted) team member — needed for resend/revoke,
   * which only match rows still in `status: "invited"`. Mirrors
   * `createMemberPrincipal`'s seat-granting steps but stops before
   * `activateInvitedUser`, since resend/revoke operate on the pending state.
   */
  async function inviteFixtureMember(merchantId: number) {
    await storage.getOrCreateSubscription(merchantId);
    const upgraded = await storage.changeSubscriptionPlan(merchantId, "team");
    if (!upgraded.ok) throw new Error(`fixture: could not grant a team seat — ${upgraded.reason}`);

    const rawToken = crypto.randomBytes(24).toString("hex");
    const inviteTokenHash = crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
    const invited = await storage.inviteTeamMember(merchantId, {
      email: `invited.${crypto.randomBytes(4).toString("hex")}@harness.test`,
      inviteTokenHash,
      inviteExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    if (!invited.ok) throw new Error(`fixture: could not invite member — ${invited.reason}`);
    return { user: invited.user, rawToken, inviteTokenHash };
  }

  describe("POST /api/team/:userId/resend", () => {
    it.each(GARBAGE_IDS)("userId=%s returns 400 for the owner", async (garbage) => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .post(`/api/team/${encodeURIComponent(garbage)}/resend`)
        .set(signedIn(owner));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid userId");
    });

    it("userId=abc returns 400 for a non-owner member too — parsing now runs before the role gate", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const member = await createMemberPrincipal(owner.merchantId);

      const response = await request(app)
        .post("/api/team/abc/resend")
        .set(signedIn(member));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid userId");
    });

    it("a well-formed userId is still 403 for a non-owner member — the role gate is unaffected by the reorder", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const member = await createMemberPrincipal(owner.merchantId);
      const invite = await inviteFixtureMember(owner.merchantId);

      const response = await request(app)
        .post(`/api/team/${invite.user.id}/resend`)
        .set(signedIn(member));
      expect(response.status).toBe(403);
      expect(response.body.message).toBe("Only the account owner can resend invites");
    });

    it("a well-formed but unknown userId 404s rather than 400", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .post("/api/team/999999/resend")
        .set(signedIn(owner));
      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Invite not found");
    });

    it("the owner resends a real pending invite", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const invite = await inviteFixtureMember(owner.merchantId);

      const response = await request(app)
        .post(`/api/team/${invite.user.id}/resend`)
        .set(signedIn(owner));
      expect(response.status).toBe(200);
      expect(response.body.member.id).toBe(invite.user.id);
    });
  });

  describe("DELETE /api/team/:userId/invite", () => {
    it.each(GARBAGE_IDS)("userId=%s returns 400 for the owner", async (garbage) => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .delete(`/api/team/${encodeURIComponent(garbage)}/invite`)
        .set(signedIn(owner));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid userId");
    });

    it("userId=abc returns 400 for a non-owner member too", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const member = await createMemberPrincipal(owner.merchantId);

      const response = await request(app)
        .delete("/api/team/abc/invite")
        .set(signedIn(member));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid userId");
    });

    it("a well-formed userId is still 403 for a non-owner member", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const member = await createMemberPrincipal(owner.merchantId);
      const invite = await inviteFixtureMember(owner.merchantId);

      const response = await request(app)
        .delete(`/api/team/${invite.user.id}/invite`)
        .set(signedIn(member));
      expect(response.status).toBe(403);
      expect(response.body.message).toBe("Only the account owner can revoke invites");
    });

    it("a well-formed but unknown userId 404s rather than 400", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .delete("/api/team/999999/invite")
        .set(signedIn(owner));
      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Invite not found");
    });

    it("a well-formed userId belonging to a different merchant's invite 404s — parsing and tenant scoping are distinct stages", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const otherOwner = await createOwnerPrincipal();
      const otherInvite = await inviteFixtureMember(otherOwner.merchantId);

      const response = await request(app)
        .delete(`/api/team/${otherInvite.user.id}/invite`)
        .set(signedIn(owner));
      expect(response.status).toBe(404);
    });

    it("the owner revokes a real pending invite", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const invite = await inviteFixtureMember(owner.merchantId);

      const response = await request(app)
        .delete(`/api/team/${invite.user.id}/invite`)
        .set(signedIn(owner));
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Invite revoked");
    });
  });

  describe("PUT /api/team/:userId/status", () => {
    it.each(GARBAGE_IDS)("userId=%s returns 400 for the owner", async (garbage) => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .put(`/api/team/${encodeURIComponent(garbage)}/status`)
        .set(signedIn(owner))
        .send({ status: "disabled" });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid userId");
    });

    it("userId=abc returns 400 for a non-owner member too", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const member = await createMemberPrincipal(owner.merchantId);

      const response = await request(app)
        .put("/api/team/abc/status")
        .set(signedIn(member))
        .send({ status: "disabled" });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid userId");
    });

    it("a well-formed userId is still 403 for a non-owner member", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const member = await createMemberPrincipal(owner.merchantId);
      const target = await createMemberPrincipal(owner.merchantId);

      const response = await request(app)
        .put(`/api/team/${target.user.id}/status`)
        .set(signedIn(member))
        .send({ status: "disabled" });
      expect(response.status).toBe(403);
      expect(response.body.message).toBe("Only the account owner can change logins");
    });

    it("a well-formed userId with an invalid status body still 400s with the route's own message, not the id guard's", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const target = await createMemberPrincipal(owner.merchantId);

      const response = await request(app)
        .put(`/api/team/${target.user.id}/status`)
        .set(signedIn(owner))
        .send({ status: "not-a-real-status" });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid request");
    });

    it("the owner disables a real active member and their live connections are dropped", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const target = await createMemberPrincipal(owner.merchantId);

      const response = await request(app)
        .put(`/api/team/${target.user.id}/status`)
        .set(signedIn(owner))
        .send({ status: "disabled" });
      expect(response.status).toBe(200);
      expect(response.body.member.id).toBe(target.user.id);
      expect(response.body.member.status).toBe("disabled");
    });
  });

  describe("DELETE /api/team/:userId", () => {
    it.each(GARBAGE_IDS)("userId=%s returns 400 for the owner", async (garbage) => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .delete(`/api/team/${encodeURIComponent(garbage)}`)
        .set(signedIn(owner));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid userId");
    });

    it("userId=abc returns 400 for a non-owner member too", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const member = await createMemberPrincipal(owner.merchantId);

      const response = await request(app)
        .delete("/api/team/abc")
        .set(signedIn(member));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid userId");
    });

    it("a well-formed userId is still 403 for a non-owner member", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const member = await createMemberPrincipal(owner.merchantId);
      const target = await createMemberPrincipal(owner.merchantId);

      const response = await request(app)
        .delete(`/api/team/${target.user.id}`)
        .set(signedIn(member));
      expect(response.status).toBe(403);
      expect(response.body.message).toBe("Only the account owner can remove logins");
    });

    it("a well-formed but unknown userId 404s rather than 400", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .delete("/api/team/999999")
        .set(signedIn(owner));
      expect(response.status).toBe(404);
    });

    it("a well-formed userId belonging to a different merchant 404s — parsing and tenant scoping are distinct stages", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const otherOwner = await createOwnerPrincipal();
      const otherMember = await createMemberPrincipal(otherOwner.merchantId);

      const response = await request(app)
        .delete(`/api/team/${otherMember.user.id}`)
        .set(signedIn(owner));
      expect(response.status).toBe(404);
    });

    it("the owner removes a real active member", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const target = await createMemberPrincipal(owner.merchantId);

      const response = await request(app)
        .delete(`/api/team/${target.user.id}`)
        .set(signedIn(owner));
      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Login removed");

      const refetch = await storage.getUserById(target.user.id);
      expect(refetch).toBeUndefined();
    });
  });
});
