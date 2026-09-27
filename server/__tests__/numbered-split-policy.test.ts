import "./support/test-env";

import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, storageSnapshot } from "./support/http-harness";
import type { TransactionStorageInput } from "../storage";

/**
 * Route review, batch 2b (C10): a board sale's numbered split route. Splitting
 * is the business's choice per sale (made when the sale is created): the customer's
 * page only offers it when allowed, and the per-payment link route refuses it
 * otherwise, but this route split any pending sale. Its body is now checked
 * like the link route's: a whole number of shares from 2 to 10, nothing else.
 */
async function boardSale(splitEnabled: boolean) {
  const owner = await createOwnerPrincipal();
  return storage.createTransaction({
    merchantId: owner.merchantId,
    itemName: "Dinner",
    price: "100.00",
    status: "pending",
    paymentMethod: "qr_code",
    splitEnabled,
  } as TransactionStorageInput);
}

describe("splitting a numbered (board) sale", () => {
  beforeEach(() => resetTestStorage());

  it("is refused when the business has not allowed splitting, and changes nothing", async () => {
    const sale = await boardSale(false);
    const { app } = await createTestApp();
    const before = storageSnapshot();

    const response = await request(app).post(`/api/transactions/${sale.id}/split`).send({ totalSplits: 2 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ message: "This payment cannot be split" });
    expect(storageSnapshot()).toBe(before);
  });

  it("splits a sale the business allowed to be split", async () => {
    const sale = await boardSale(true);
    const { app } = await createTestApp();

    const response = await request(app).post(`/api/transactions/${sale.id}/split`).send({ totalSplits: 2 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ isSplit: true, totalSplits: 2, splitAmount: "50.00" });
  });

  it.each([
    ["a numeric string", { totalSplits: "5" }],
    ["a fraction", { totalSplits: 2.5 }],
    ["more than ten", { totalSplits: 11 }],
    ["fewer than two", { totalSplits: 1 }],
    ["nothing", {}],
    ["an extra field", { totalSplits: 2, merchantId: 1 }],
  ])("refuses %s as the number of shares, and changes nothing", async (_label, body) => {
    const sale = await boardSale(true);
    const { app } = await createTestApp();
    const before = storageSnapshot();

    const response = await request(app).post(`/api/transactions/${sale.id}/split`).send(body);

    expect(response.status).toBe(400);
    expect(storageSnapshot()).toBe(before);
  });
});
