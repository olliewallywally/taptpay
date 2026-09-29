import "./support/test-env";

// The ecommerce API is shut (404) by default; enabling a capability flag needs
// enforce mode (config.ts). Payment mode stays "disabled" (test-env.ts).
process.env.FEATURE_ECOMMERCE_API = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";
import type { TransactionStorageInput } from "../storage";

/**
 * Route review, batch 1 (C10): the ecommerce API checks the key's permission
 * before it reads the body (P2.2's order: role before body), and a sale of
 * another merchant is answered exactly like a missing one (P2.2: 404 where a
 * difference would tell a key which sale numbers exist).
 */
const KEY_HEADER = { Authorization: "Bearer harness-ecommerce-api-key" };

function keyFor(merchantId: number, permissions: string[]) {
  return { id: 41, merchantId, status: "active", permissions } as any;
}

describe("the ecommerce API's order of checks and what its answers reveal", () => {
  beforeEach(() => {
    resetTestStorage();
    jest.spyOn(storage, "updateApiKeyLastUsed").mockResolvedValue(undefined as any);
  });
  afterEach(() => jest.restoreAllMocks());

  it("refuses a key without create_transactions before looking at the body", async () => {
    const owner = await createOwnerPrincipal();
    jest.spyOn(storage, "getApiKeyByKey").mockResolvedValue(keyFor(owner.merchantId, ["read_transactions"]));
    const { app } = await createTestApp();

    const response = await request(app).post("/api/v1/transactions").set(KEY_HEADER).send({ amount: "not money" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Insufficient permissions" });
  });

  it("still reports a malformed body to a key that may create sales", async () => {
    const owner = await createOwnerPrincipal();
    jest.spyOn(storage, "getApiKeyByKey").mockResolvedValue(keyFor(owner.merchantId, ["create_transactions"]));
    const { app } = await createTestApp();

    const response = await request(app).post("/api/v1/transactions").set(KEY_HEADER).send({ amount: "not money" });

    expect(response.status).toBe(400);
  });

  it("answers another merchant's sale exactly as a sale that does not exist", async () => {
    const mine = await createOwnerPrincipal();
    const theirs = await createOwnerPrincipal();
    const theirSale = await storage.createTransaction({
      merchantId: theirs.merchantId,
      itemName: "Their sale",
      price: "10.00",
      status: "pending",
      paymentMethod: "qr_code",
      splitEnabled: false,
    } as TransactionStorageInput);
    jest.spyOn(storage, "getApiKeyByKey").mockResolvedValue(keyFor(mine.merchantId, ["read_transactions"]));
    const { app } = await createTestApp();

    const foreign = await request(app).get(`/api/v1/transactions/${theirSale.id}`).set(KEY_HEADER);
    const missing = await request(app).get(`/api/v1/transactions/${theirSale.id + 1000}`).set(KEY_HEADER);

    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(missing.status);
    expect(foreign.body).toEqual(missing.body);
  });

  it("still answers the key's own sale", async () => {
    const owner = await createOwnerPrincipal();
    const sale = await storage.createTransaction({
      merchantId: owner.merchantId,
      itemName: "My sale",
      price: "12.50",
      status: "pending",
      paymentMethod: "qr_code",
      splitEnabled: false,
    } as TransactionStorageInput);
    jest.spyOn(storage, "getApiKeyByKey").mockResolvedValue(keyFor(owner.merchantId, ["read_transactions"]));
    const { app } = await createTestApp();

    const response = await request(app).get(`/api/v1/transactions/${sale.id}`).set(KEY_HEADER);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: sale.id, item_name: "My sale", status: "pending" });
  });
});
