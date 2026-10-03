import "./support/test-env";
import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, signedIn, storageSnapshot } from "./support/http-harness";
import { observeRefusalEffects } from "./support/refusal-effects";
beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

test.each(["ownership", "inactive"])("cash sale refuses board %s change at insertion", async change => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const other = await createOwnerPrincipal();
  const board = await storage.createNextTaptStone(owner.merchantId);
  jest.spyOn(storage, "getOrCreateSubscription").mockResolvedValue({ status: "active", lastBillingDate: new Date(), currentPeriodEnd: new Date(Date.now() + 86400000) } as any);
  const held = storage as any;
  const read = typeof held.getTaptStoneForMerchant === "function" ? "getTaptStoneForMerchant" : "getTaptStone";
  // Old route uses the global reader; the fallback ensures this regression fails on the base.
  const routeReader = held.createTransactionForMerchant ? read : "getTaptStone";
  const original = held[routeReader].bind(storage);
  let before: string | undefined;
  jest.spyOn(held, routeReader).mockImplementation(async (...args: any[]) => {
    const result = await original(...args);
    const stale = { ...result };
    if (change === "ownership") held.taptStones.get(board.id).merchantId = other.merchantId;
    else held.taptStones.get(board.id).isActive = false;
    before = storageSnapshot();
    return stale;
  });
  const effects = observeRefusalEffects();
  try {
    const res = await request(app).post("/api/transactions/cash-sale").set(signedIn(owner))
      .send({ merchantId: owner.merchantId, stoneId: board.id, itemName: "Synthetic", price: "10.00" });
    expect(res.status).toBe(400);
    expect(storageSnapshot()).toBe(before);
    effects.assertNone();
  } finally { effects.restore(); }
});
