import "./support/test-env";

// Refunds are switched on here so a refund request reaches its own checks; turning a money flag on
// needs ENV_VALIDATION_MODE=enforce (config.ts). Restored in afterAll for the worker's next file.
const savedEnv = {
  FEATURE_REFUND_INITIATION: process.env.FEATURE_REFUND_INITIATION,
  ENV_VALIDATION_MODE: process.env.ENV_VALIDATION_MODE,
};
process.env.FEATURE_REFUND_INITIATION = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

import request from "supertest";
import {
  signedIn, createOwnerPrincipal, createTestApp, resetTestStorage, storage, storageSnapshot,
} from "./support/http-harness";

/**
 * C10 route review, batch 6b (the business's sales, payments and refunds), 2026-09-27.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

/** The business's subscription is in order, so the billing gate lets a sale through. */
function billingInOrder() {
  jest.spyOn(storage, "getOrCreateSubscription").mockResolvedValue({
    status: "active",
    lastBillingDate: new Date(Date.now() - DAY_MS),
    currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS),
  } as any);
}

/**
 * The cash sale read its body without a schema (parseInt, parseFloat: "1abc" and "Infinity"
 * passed) and never checked its board, so it could record a sale on another business's board, or
 * a deleted one. It is held to the rules creating a sale uses.
 */
describe("a cash sale is held to the rules creating a sale uses", () => {
  it("takes the terminal's own request", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    billingInOrder();

    const res = await request(app).post("/api/transactions/cash-sale").set(signedIn(owner))
      .send({ merchantId: owner.merchantId, itemName: "Flat white", price: "5.50" });

    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({ itemName: "Flat white", price: "5.50", status: "completed", paymentMethod: "cash" });
  });

  it("takes a sale on one of the business's active boards", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const board = await storage.createNextTaptStone(owner.merchantId);
    billingInOrder();

    const res = await request(app).post("/api/transactions/cash-sale").set(signedIn(owner))
      .send({ merchantId: owner.merchantId, itemName: "Flat white", price: "5.50", stoneId: board.id });

    expect(res.status).toBe(200);
    expect(res.body.transaction.taptStoneId).toBe(board.id);
  });

  it.each([
    ["a business number that is not a whole number", { merchantId: "1abc" }],
    ["a price of Infinity", { price: "Infinity" }],
    ["a price with letters after it", { price: "5abc" }],
    ["a price with three decimal places", { price: "5.505" }],
    ["no item name", { itemName: "   " }],
    ["an item name that is not text", { itemName: 42 }],
    ["a field the terminal never sends", { status: "pending" }],
  ])("refuses %s, and records nothing", async (_what, change) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    billingInOrder();
    const before = storageSnapshot();

    const res = await request(app).post("/api/transactions/cash-sale").set(signedIn(owner))
      .send({ merchantId: owner.merchantId, itemName: "Flat white", price: "5.50", ...change });

    expect(res.status).toBe(400);
    expect(storageSnapshot()).toBe(before);
  });

  it("refuses another business's board, and records nothing", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const other = await createOwnerPrincipal();
    const theirs = await storage.createNextTaptStone(other.merchantId);
    billingInOrder();
    const before = storageSnapshot();

    const res = await request(app).post("/api/transactions/cash-sale").set(signedIn(owner))
      .send({ merchantId: owner.merchantId, itemName: "Flat white", price: "5.50", stoneId: theirs.id });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Selected payment board is unavailable" });
    expect(storageSnapshot()).toBe(before);
  });

  it("refuses a deleted board of the business, and records nothing", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const board = await storage.createNextTaptStone(owner.merchantId);
    await storage.deleteTaptStoneForMerchant(board.id, owner.merchantId);
    billingInOrder();
    const before = storageSnapshot();

    const res = await request(app).post("/api/transactions/cash-sale").set(signedIn(owner))
      .send({ merchantId: owner.merchantId, itemName: "Flat white", price: "5.50", stoneId: board.id });

    expect(res.status).toBe(400);
    expect(storageSnapshot()).toBe(before);
  });
});

/**
 * A refund's amount was only checked with parseFloat: "5abc" passed as 5, the amount was reserved,
 * and storing the refund then failed in PostgreSQL (refund_amount is decimal(10,2)), leaving the
 * reservation behind. The amount is held to the price rule before anything is reserved.
 */
describe("a refund's amount is a plain amount of money", () => {
  const completedSale = (merchantId: number) => storage.createTransaction({
    merchantId, itemName: "Refundable sale", price: "20.00", status: "completed", paymentMethod: "qr_code",
    splitEnabled: false,
  } as any);

  it.each(["5abc", "Infinity", "1e1", "5.505", "-5", " 5"])("refuses %p before anything is reserved", async (refundAmount) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const sale = await completedSale(owner.merchantId);
    const reserve = jest.spyOn(storage, "reserveRefundAmountForMerchant");
    const before = storageSnapshot();

    const res = await request(app).post(`/api/transactions/${sale.id}/refunds`).set(signedIn(owner))
      .send({ refundAmount, refundReason: "Changed their mind" });

    expect(res.status).toBe(400);
    expect(reserve).not.toHaveBeenCalled();
    expect(storageSnapshot()).toBe(before);
  });

  it("lets a plain amount through to the provider check", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const sale = await completedSale(owner.merchantId);

    const res = await request(app).post(`/api/transactions/${sale.id}/refunds`).set(signedIn(owner))
      .send({ refundAmount: "5.00", refundReason: "Changed their mind" });

    // No provider in the harness: the request gets past the amount to the provider check.
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("REFUND_PROVIDER_UNAVAILABLE");
  });
});
