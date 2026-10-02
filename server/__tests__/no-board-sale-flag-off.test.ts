import "./support/test-env";

import request from "supertest";
import { sseBroker } from "../sse-broker";
import {
  signedIn, type SignedIn,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  storage,
} from "./support/http-harness";

/**
 * Owner decision 2026-09-25 (server/no-board-address.ts): a sale without a payment board
 * always has its own link. With per-payment links switched off (FEATURE_NEW_RETAIL_PAYMENTS,
 * off in this harness) such a sale has no link to use — as property and trades have none with
 * invoice payments off — so it is refused rather than made the old shared way. A board sale
 * is unaffected.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  resetTestStorage();
  jest.spyOn(storage, "getOrCreateSubscription").mockResolvedValue({
    status: "active",
    lastBillingDate: new Date(Date.now() - DAY_MS),
    currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS),
  } as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function createSale(principal: SignedIn & { merchantId: number }, body: Record<string, unknown>) {
  const { app } = await createTestApp();
  return request(app)
    .post("/api/transactions")
    .set(signedIn(principal))
    .send({ merchantId: principal.merchantId, itemName: "Flat white", price: "5.50", ...body });
}

describe("a sale without a payment board, with per-payment links switched off", () => {
  it("is refused with 503, creating and announcing nothing", async () => {
    const owner = await createOwnerPrincipal();
    const broadcast = jest.spyOn(sseBroker, "broadcast");

    const response = await createSale(owner, {});

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ message: "Per-payment links are not enabled yet" });
    expect(await storage.getTransactionsByMerchant(owner.merchantId)).toHaveLength(0);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("still lets a board sale through on its board's address", async () => {
    const owner = await createOwnerPrincipal();
    const board = await storage.createNextTaptStone(owner.merchantId);

    const response = await createSale(owner, { selectedStoneId: board.id });

    expect(response.status).toBe(200);
    expect(response.body.paymentUrl).toBe(`https://harness.test/pay/${owner.merchantId}/stone/${board.id}`);
  });
});
