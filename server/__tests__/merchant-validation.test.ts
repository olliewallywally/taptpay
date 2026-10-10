import "./support/test-env";

import express from "express";
import request from "supertest";
import { insertTransactionSchema } from "@shared/schema";
import { storage } from "../storage";
import {
  validateMerchant, validateMerchantTransaction,
  type MerchantRequest, type MerchantTransactionRequest,
} from "../middleware/merchant-validation";

// These retained helpers have no application callers. Mount them here only to
// verify their validation contract; they do not authenticate these test routes.
function validationApp() {
  const app = express();
  app.get("/merchants/:merchantId", validateMerchant, (req: MerchantRequest, res) => {
    res.json({ id: req.merchant?.id, status: req.merchant?.status });
  });
  app.get("/merchants/:merchantId/transactions/:transactionId", validateMerchantTransaction,
    (req: MerchantTransactionRequest, res) => {
      res.json({ id: req.transaction?.id, merchantId: req.transaction?.merchantId });
    });
  return app;
}

beforeEach(() => storage.clearAllMerchants?.());

async function merchant(status = "pending") {
  const created = await storage.createMerchant({
    name: "Test merchant", businessName: "Test business", businessType: "retail",
    email: "merchant@example.test", phone: "021 555 0100", address: "1 Test Street",
    password: "TestOnlyPassword123", confirmPassword: "TestOnlyPassword123",
  });
  return (await storage.updateMerchantStatus(created.id, status))!;
}

async function transaction(merchantId: number) {
  return storage.createTransaction(insertTransactionSchema.parse({
    merchantId, itemName: "Test sale", price: "10.00",
  }));
}

describe("retained merchant validation", () => {
  it.each(["pending", "active", "inactive"])("refuses a %s merchant exactly like a missing merchant", async (status) => {
    const existing = await merchant(status);
    const app = validationApp();
    const refused = await request(app).get(`/merchants/${existing.id}`);
    const missing = await request(app).get(`/merchants/${existing.id + 1}`);
    expect(refused.status).toBe(404);
    expect(missing.status).toBe(refused.status);
    expect(refused.body).toEqual({ message: "Not found" });
    expect(missing.body).toEqual(refused.body);
  });

  it("passes a verified merchant to the next handler", async () => {
    const existing = await merchant("verified");
    const res = await request(validationApp()).get(`/merchants/${existing.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: existing.id, status: "verified" });
  });

  it.each(["1junk", "0", "-1", "1.5", "9007199254740992"])("rejects malformed merchant ID %s before storage", async (id) => {
    const lookup = jest.spyOn(storage, "getMerchant");
    expect((await request(validationApp()).get(`/merchants/${id}`)).status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("retained merchant transaction validation", () => {
  it("refuses foreign and unowned transactions exactly like a missing transaction", async () => {
    const existing = await transaction(1);
    const app = validationApp();
    const foreign = await request(app).get(`/merchants/2/transactions/${existing.id}`);
    const missing = await request(app).get(`/merchants/2/transactions/${existing.id + 1}`);
    jest.spyOn(storage, "getTransaction").mockResolvedValueOnce({ ...existing, merchantId: null });
    const unowned = await request(app).get(`/merchants/2/transactions/${existing.id}`);
    for (const res of [foreign, missing, unowned]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: "Not found" });
    }
  });

  it("passes a transaction with the requested merchant ID to the next handler", async () => {
    const existing = await transaction(1);
    const res = await request(validationApp()).get(`/merchants/1/transactions/${existing.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: existing.id, merchantId: 1 });
  });

  it.each([["1junk", "1"], ["1", "1junk"], ["1", "9007199254740992"]])(
    "rejects malformed merchant/transaction IDs %s/%s before storage", async (merchantId, transactionId) => {
      const lookup = jest.spyOn(storage, "getTransaction");
      const res = await request(validationApp()).get(`/merchants/${merchantId}/transactions/${transactionId}`);
      expect(res.status).toBe(400);
      expect(lookup).not.toHaveBeenCalled();
    });
});
