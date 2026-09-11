import "./support/test-env";

import request from "supertest";
import {
  bearer,
  createAdminPrincipal,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  storage,
} from "./support/http-harness";
import type { TransactionStorageInput } from "../storage";

/**
 * R1-T6 — `/api/admin/*` identifier batch (2026-09-06). Covers every
 * remaining `parseInt(req.params.*)` site scoped to `/api/admin`: the five
 * `/api/admin/merchants/:id/*` sub-routes (verify, set-active, transactions,
 * windcave-merchant-id, activate), the three plain `/api/admin/merchants/:id`
 * CRUD routes (PUT/GET/DELETE), and `/api/admin/api-keys/:keyId/revoke`. See
 * the evidence doc for the full site list and judgment calls (the revoke
 * "real id" test settling for MemStorage's always-true stub, and why
 * `activate`'s happy path is proven indirectly rather than end-to-end).
 *
 * Every route here sits behind `authenticateAdmin`, so every request —
 * garbage id included — carries a real admin bearer token; a 400 here must
 * come from the id guard, not from the auth gate that runs before it.
 */
describe("R1-T6 — /api/admin identifier batch", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  const GARBAGE_IDS = ["abc", "1abc", "1.5", "-1", "0", "+1", "1e3"];

  function fixtureTransaction(merchantId: number) {
    return storage.createTransaction({
      merchantId,
      itemName: "Admin batch fixture item",
      price: "10.00",
      status: "pending",
      paymentMethod: "qr_code",
      splitEnabled: false,
    } as TransactionStorageInput);
  }

  describe("POST /api/admin/merchants/:id/verify", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400 for an authenticated admin", async (garbage) => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .post(`/api/admin/merchants/${encodeURIComponent(garbage)}/verify`)
        .set(bearer(admin));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a well-formed but unknown id 404s rather than 400", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .post("/api/admin/merchants/999999/verify")
        .set(bearer(admin));
      expect(response.status).toBe(404);
    });

    it("verifies a real, not-yet-verified merchant with a password already set", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();
      // createOwnerPrincipal's merchant is activated ("active") with a real
      // passwordHash (set by createUser) — never "verified" — so this is a
      // legitimate not-yet-verified target for the handler's own checks.
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .post(`/api/admin/merchants/${owner.merchantId}/verify`)
        .set(bearer(admin));
      expect(response.status).toBe(200);
      expect(response.body.merchant.status).toBe("verified");
    });
  });

  describe("POST /api/admin/merchants/:id/set-active", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .post(`/api/admin/merchants/${encodeURIComponent(garbage)}/set-active`)
        .set(bearer(admin));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a well-formed but unknown id 404s rather than 400", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .post("/api/admin/merchants/999999/set-active")
        .set(bearer(admin));
      expect(response.status).toBe(404);
    });

    it("activates a real, freshly created (pending) merchant", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();
      const pending = await storage.createMerchant({
        name: "Pending Co",
        businessName: "Pending Co Ltd",
        email: `pending.${Date.now()}@harness.test`,
      } as any);

      const response = await request(app)
        .post(`/api/admin/merchants/${pending.id}/set-active`)
        .set(bearer(admin));
      expect(response.status).toBe(200);
      expect(response.body.merchant.status).toBe("active");
    });
  });

  describe("GET /api/admin/merchants/:id/transactions", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .get(`/api/admin/merchants/${encodeURIComponent(garbage)}/transactions`)
        .set(bearer(admin));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a well-formed but unknown id returns 200 with an empty list (this route never checks merchant existence)", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .get("/api/admin/merchants/999999/transactions")
        .set(bearer(admin));
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("a real merchant's transactions are returned", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();
      const owner = await createOwnerPrincipal();
      const txn = await fixtureTransaction(owner.merchantId);

      const response = await request(app)
        .get(`/api/admin/merchants/${owner.merchantId}/transactions`)
        .set(bearer(admin));
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(txn.id);
    });
  });

  describe("PATCH /api/admin/merchants/:id/windcave-merchant-id", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400 without even needing a body", async (garbage) => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .patch(`/api/admin/merchants/${encodeURIComponent(garbage)}/windcave-merchant-id`)
        .set(bearer(admin))
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a well-formed but unknown id 404s rather than 400", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .patch("/api/admin/merchants/999999/windcave-merchant-id")
        .set(bearer(admin))
        .send({ windcaveMerchantId: "wc-123" });
      expect(response.status).toBe(404);
    });

    it("updates a real merchant's Windcave merchant id", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .patch(`/api/admin/merchants/${owner.merchantId}/windcave-merchant-id`)
        .set(bearer(admin))
        .send({ windcaveMerchantId: "wc-123" });
      expect(response.status).toBe(200);

      const updated = await storage.getMerchant(owner.merchantId);
      expect(updated?.windcaveMerchantId).toBe("wc-123");
    });
  });

  describe("POST /api/admin/merchants/:id/activate", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400 even with no password in the body", async (garbage) => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .post(`/api/admin/merchants/${encodeURIComponent(garbage)}/activate`)
        .set(bearer(admin))
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it(
      "a well-formed id without a password gets the password-required 400, not the id-invalid one " +
        "— proving the id guard already passed",
      async () => {
        const { app } = await createTestApp();
        const admin = createAdminPrincipal();
        const owner = await createOwnerPrincipal();

        const response = await request(app)
          .post(`/api/admin/merchants/${owner.merchantId}/activate`)
          .set(bearer(admin))
          .send({});
        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Password is required for activation");
      },
    );

    it("a well-formed but unknown id 404s once a password is supplied", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .post("/api/admin/merchants/999999/activate")
        .set(bearer(admin))
        .send({ password: "Whatever123" });
      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/admin/merchants/:id", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .put(`/api/admin/merchants/${encodeURIComponent(garbage)}`)
        .set(bearer(admin))
        .send({ businessName: "New Name Ltd" });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a well-formed but unknown id 404s rather than 400", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .put("/api/admin/merchants/999999")
        .set(bearer(admin))
        .send({ businessName: "New Name Ltd" });
      expect(response.status).toBe(404);
    });

    it("updates a real merchant's business details", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .put(`/api/admin/merchants/${owner.merchantId}`)
        .set(bearer(admin))
        .send({ businessName: "Updated Business Name Ltd" });
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(owner.merchantId);
      expect(response.body.businessName).toBe("Updated Business Name Ltd");
    });
  });

  describe("GET /api/admin/merchants/:id", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .get(`/api/admin/merchants/${encodeURIComponent(garbage)}`)
        .set(bearer(admin));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a well-formed but unknown id 404s rather than 400", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app).get("/api/admin/merchants/999999").set(bearer(admin));
      expect(response.status).toBe(404);
    });

    it("a real merchant returns 200", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .get(`/api/admin/merchants/${owner.merchantId}`)
        .set(bearer(admin));
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(owner.merchantId);
    });
  });

  describe("DELETE /api/admin/merchants/:id", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .delete(`/api/admin/merchants/${encodeURIComponent(garbage)}`)
        .set(bearer(admin));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a well-formed but unknown id 404s rather than 400", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app).delete("/api/admin/merchants/999999").set(bearer(admin));
      expect(response.status).toBe(404);
    });

    it("deletes a real merchant, which then 404s on re-fetch", async () => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();
      const throwaway = await storage.createMerchant({
        name: "Throwaway Co",
        businessName: "Throwaway Co Ltd",
        email: `throwaway.${Date.now()}@harness.test`,
      } as any);

      const deleteResponse = await request(app)
        .delete(`/api/admin/merchants/${throwaway.id}`)
        .set(bearer(admin));
      expect(deleteResponse.status).toBe(200);

      const refetch = await request(app)
        .get(`/api/admin/merchants/${throwaway.id}`)
        .set(bearer(admin));
      expect(refetch.status).toBe(404);
    });
  });

  describe("POST /api/admin/api-keys/:keyId/revoke", () => {
    it.each(GARBAGE_IDS)("keyId=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const admin = createAdminPrincipal();

      const response = await request(app)
        .post(`/api/admin/api-keys/${encodeURIComponent(garbage)}/revoke`)
        .set(bearer(admin));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid keyId");
    });

    it(
      "a well-formed keyId reaches the unavailable ecommerce tombstone",
      async () => {
        const { app } = await createTestApp();
        const admin = createAdminPrincipal();

        const response = await request(app)
          .post("/api/admin/api-keys/1/revoke")
          .set(bearer(admin));
        expect(response.status).toBe(404);
        expect(response.body.success).not.toBe(true);
      },
    );
  });
});
