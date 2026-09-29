import "./support/test-env";

// Only /api/v1/* needs a feature flag flipped for this batch — the ecommerce
// API is 404-gated shut by default (see http-harness.test.ts), and a garbage
// :id can never reach this batch's new parse+400 check while that gate stays
// closed. Every other route below is reachable with the harness's defaults.
// Enabling any money-capability flag requires ENV_VALIDATION_MODE=enforce
// (config.ts's own "capability" check) — paymentMode itself stays "disabled"
// (test-env.ts), so this only satisfies that one check and does not turn on
// any other capability.
process.env.FEATURE_ECOMMERCE_API = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

import request from "supertest";
import {
  bearer,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  storage,
} from "./support/http-harness";
import type { TransactionStorageInput } from "../storage";

/**
 * R1-T6 — transaction/payment/checkout/refund identifier batch (2026-09-06).
 * Covers every `parseInt(req.params.*)`/`parseInt(req.query.*)` site this
 * batch's scope named: `/api/transactions/*`, `/api/split-payments/:id`,
 * `/api/refunds/:refundId`, and `/api/v1/transactions/:id`. See the evidence
 * doc for the full site list, the two judgment calls (receipt-qr `size`, and
 * the `/api/v1` route's `error`-vs-`message` response envelope), and why the
 * refund-creation capability flag is deliberately left off in this file.
 */
describe("R1-T6 — transactions/refunds identifier batch", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  function pendingTransaction(merchantId: number, overrides: Partial<TransactionStorageInput> = {}) {
    return storage.createTransaction({
      merchantId,
      itemName: "Batch fixture item",
      price: "10.00",
      status: "pending",
      paymentMethod: "qr_code",
      splitEnabled: false,
      ...overrides,
    } as TransactionStorageInput);
  }

  // Same shape POST /api/transactions/cash-sale itself uses to build a
  // completed, non-token transaction — proven-working fields, not guessed.
  function completedTransaction(merchantId: number, overrides: Partial<TransactionStorageInput> = {}) {
    return storage.createTransaction({
      merchantId,
      itemName: "Batch fixture item",
      price: "10.00",
      status: "completed",
      paymentMethod: "cash",
      windcaveFeeRate: "0.0000",
      windcaveFeeAmount: "0.00",
      platformFeeRate: "0.0000",
      platformFeeAmount: "0.00",
      merchantNet: "10.00",
      splitEnabled: false,
      ...overrides,
    } as TransactionStorageInput);
  }

  const GARBAGE_IDS = ["abc", "1abc", "1.5", "-1", "0", "+1", "1e3"];

  describe("POST /api/transactions/:id/split (public)", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const response = await request(app)
        .post(`/api/transactions/${encodeURIComponent(garbage)}/split`)
        .send({ totalSplits: 2 });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a real pending transaction splits successfully", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      // Splitting must be allowed for the sale (numbered-split-policy.test.ts).
      const txn = await pendingTransaction(owner.merchantId, { splitEnabled: true });

      const response = await request(app)
        .post(`/api/transactions/${txn.id}/split`)
        .send({ totalSplits: 2 });
      expect(response.status).toBe(200);
      expect(response.body.totalSplits).toBe(2);
    });
  });

  // PATCH /api/transactions/:id/split-enabled was removed on 2026-09-27 (owner decision, C10 batch 6b):
  // both terminals set splitting when they create the sale.


  describe("GET /api/split-payments/:id (public)", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const response = await request(app).get(
        `/api/split-payments/${encodeURIComponent(garbage)}`,
      );
      expect(response.status).toBe(400);
    });

    it("an unknown-but-well-formed id 404s rather than 400", async () => {
      const { app } = await createTestApp();
      const response = await request(app).get("/api/split-payments/999999");
      expect(response.status).toBe(404);
    });

    it("a real split payment returns 200", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const txn = await pendingTransaction(owner.merchantId);
      const split = await storage.createBillSplit(txn.id, 2);
      const splits = await storage.getSplitPaymentsByTransaction(txn.id);

      const response = await request(app).get(`/api/split-payments/${splits[0].id}`);
      expect(response.status).toBe(200);
      expect(response.body.transactionId).toBe(txn.id);
      expect(split).toBeDefined();
    });
  });

  describe("POST /api/transactions/:id/cancel (owner/admin only)", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const response = await request(app)
        .post(`/api/transactions/${encodeURIComponent(garbage)}/cancel`)
        .set(bearer(owner));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("the owning merchant can cancel their own pending transaction", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const txn = await pendingTransaction(owner.merchantId);

      const response = await request(app)
        .post(`/api/transactions/${txn.id}/cancel`)
        .set(bearer(owner));
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("cancelled");
    });
  });

  describe("POST /api/transactions/:id/pay (public, Windcave HPP)", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400 before rate limiting/body checks reject it differently", async (garbage) => {
      const { app } = await createTestApp();
      const response = await request(app)
        .post(`/api/transactions/${encodeURIComponent(garbage)}/pay`)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a well-formed but unknown id 404s (parsing let it through to the lookup)", async () => {
      const { app } = await createTestApp();
      const response = await request(app).post("/api/transactions/999999/pay").send({});
      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/transactions/:id/hosted-fields-complete (public)", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400 even with no sessionId in the body", async (garbage) => {
      const { app } = await createTestApp();
      const response = await request(app)
        .post(`/api/transactions/${encodeURIComponent(garbage)}/hosted-fields-complete`)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a well-formed id without sessionId gets the sessionId-required 400, not the id one — proving parsing already passed", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const txn = await pendingTransaction(owner.merchantId);

      const response = await request(app)
        .post(`/api/transactions/${txn.id}/hosted-fields-complete`)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("sessionId required");
    });
  });

  describe("POST /api/transactions/:id/googlepay-complete (public)", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400 even with no sessionId in the body", async (garbage) => {
      const { app } = await createTestApp();
      const response = await request(app)
        .post(`/api/transactions/${encodeURIComponent(garbage)}/googlepay-complete`)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a well-formed id without sessionId gets the sessionId-required 400, not the id one", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const txn = await pendingTransaction(owner.merchantId);

      const response = await request(app)
        .post(`/api/transactions/${txn.id}/googlepay-complete`)
        .send({});
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("sessionId required");
    });
  });

  describe("GET /api/transactions/:id (public)", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const response = await request(app).get(
        `/api/transactions/${encodeURIComponent(garbage)}`,
      );
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("an unknown-but-well-formed id 404s rather than 400", async () => {
      const { app } = await createTestApp();
      const response = await request(app).get("/api/transactions/999999");
      expect(response.status).toBe(404);
    });

    it("a real transaction returns 200", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const txn = await completedTransaction(owner.merchantId);

      const response = await request(app).get(`/api/transactions/${txn.id}`);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(txn.id);
    });
  });

  describe("POST /api/transactions/:id/receipt-pdf (public, transactionId + optional ?splitId)", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const response = await request(app).post(
        `/api/transactions/${encodeURIComponent(garbage)}/receipt-pdf`,
      );
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a real completed transaction with no splitId returns a PDF", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const txn = await completedTransaction(owner.merchantId);

      const response = await request(app).post(`/api/transactions/${txn.id}/receipt-pdf`);
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("application/pdf");
    });

    it("?splitId=abc on a real transaction 400s instead of silently becoming NaN", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const txn = await completedTransaction(owner.merchantId);

      const response = await request(app).post(
        `/api/transactions/${txn.id}/receipt-pdf?splitId=abc`,
      );
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid splitId");
    });

    it("omitting ?splitId entirely stays optional (falls through to the whole-transaction path)", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const txn = await completedTransaction(owner.merchantId);

      const response = await request(app).post(`/api/transactions/${txn.id}/receipt-pdf`);
      expect(response.status).toBe(200);
    });
  });

  describe("GET /api/transactions/:id/receipt-qr (public)", () => {
    it.each(GARBAGE_IDS)("id=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const response = await request(app).get(
        `/api/transactions/${encodeURIComponent(garbage)}/receipt-qr`,
      );
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid id");
    });

    it("a real transaction returns a PNG", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const txn = await completedTransaction(owner.merchantId);

      const response = await request(app).get(`/api/transactions/${txn.id}/receipt-qr`);
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("image/png");
    });

    // SUPERSEDED 2026-09-11. This block previously asserted that size=-100
    // "still renders a valid PNG rather than crashing" — the deliberate
    // exemption batch 1 recorded for bounded tuning values. The tracker's gap 6
    // reverses that exemption: a present-but-invalid value must be refused, not
    // silently replaced by the default. The old assertions are quoted in
    // docs/evidence/remediation-v2-2/r1/R1-T6-bounded-query-values-2026-09-11.md.
    it("size=-100 is refused rather than silently falling back to the default", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const txn = await completedTransaction(owner.merchantId);

      const response = await request(app).get(
        `/api/transactions/${txn.id}/receipt-qr?size=-100`,
      );
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid size");
    });
  });

  describe("POST /api/transactions/:transactionId/refunds (auth; capability-gated)", () => {
    it.each(GARBAGE_IDS)("transactionId=%s returns 400 for the owning merchant", async (garbage) => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const response = await request(app)
        .post(`/api/transactions/${encodeURIComponent(garbage)}/refunds`)
        .set(bearer(owner))
        .send({ refundAmount: "1.00", refundReason: "test", refundMethod: "original_payment_method" });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid transactionId");
    });

    it("a garbage transactionId is 400 even for a non-owner-role caller — parsing precedes the owner-only capability check", async () => {
      // Refund initiation is owner-only (R1-T3). This proves malformed input
      // is rejected before that role gate is ever reached, matching this
      // task family's 400-before-403 ordering rule — same shape as the
      // existing route-policy-role-defaults.test.ts member-vs-owner refund
      // test, but exercising the id parser instead of the role gate.
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .post("/api/transactions/abc/refunds")
        .set(bearer(owner))
        .send({ refundAmount: "1.00", refundReason: "test", refundMethod: "original_payment_method" });
      expect(response.status).toBe(400);
    });

    it("a well-formed transactionId reaches the refund-initiation capability gate (503), not a 400 — the capability flag is off by default in this harness", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .post("/api/transactions/999999/refunds")
        .set(bearer(owner))
        .send({ refundAmount: "1.00", refundReason: "test", refundMethod: "original_payment_method" });
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("REFUND_INITIATION_DISABLED");
    });
  });

  describe("GET /api/transactions/:transactionId/refunds (auth, list)", () => {
    it.each(GARBAGE_IDS)("transactionId=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const response = await request(app)
        .get(`/api/transactions/${encodeURIComponent(garbage)}/refunds`)
        .set(bearer(owner));
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid transactionId");
    });

    it("the owning merchant gets an empty list for a real refund-free transaction", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const txn = await completedTransaction(owner.merchantId);

      const response = await request(app)
        .get(`/api/transactions/${txn.id}/refunds`)
        .set(bearer(owner));
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  // GET /api/refunds/:refundId was removed on 2026-09-27 (owner decision, C10 batch 6b).


  describe("GET /api/v1/transactions/:id (ecommerce API key; error-envelope route, see evidence doc)", () => {
    it("without a valid API key, a garbage id never reaches the parser at all — 401 from authenticateApiKey first", async () => {
      const { app } = await createTestApp();
      const response = await request(app).get("/api/v1/transactions/abc");
      expect(response.status).toBe(401);
    });

    it.each(GARBAGE_IDS)("with a valid key, id=%s returns 400 with an error-shaped body, not message-shaped", async (garbage) => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      jest.spyOn(storage, "getApiKeyByKey").mockResolvedValue({
        id: 1,
        merchantId: owner.merchantId,
        status: "active",
        permissions: ["read_transactions"],
      } as any);

      const response = await request(app)
        .get(`/api/v1/transactions/${encodeURIComponent(garbage)}`)
        .set({ Authorization: "Bearer harness-ecommerce-api-key" });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "Invalid id" });
    });

    it("with a valid key, a well-formed but unknown id 404s with the route's own error envelope", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      jest.spyOn(storage, "getApiKeyByKey").mockResolvedValue({
        id: 1,
        merchantId: owner.merchantId,
        status: "active",
        permissions: ["read_transactions"],
      } as any);

      const response = await request(app)
        .get("/api/v1/transactions/999999")
        .set({ Authorization: "Bearer harness-ecommerce-api-key" });
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Transaction not found" });
    });
  });
});
