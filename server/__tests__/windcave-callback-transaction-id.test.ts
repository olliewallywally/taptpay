import "./support/test-env";

import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";
import type { TransactionStorageInput } from "../storage";

/**
 * Route review, batch 2b (C10): the Windcave browser callback read its
 * transactionId with parseInt, so "12abc" found sale 12 — the permissive parse
 * R1-T6 retired everywhere else (its source guard looks for parseInt(req.…)
 * directly and missed this one, read through a variable first). A malformed
 * id now finds nothing, like an unknown one.
 */
async function settledSale() {
  const owner = await createOwnerPrincipal();
  const sale = await storage.createTransaction({
    merchantId: owner.merchantId,
    itemName: "Coffee",
    price: "5.00",
    status: "pending",
    paymentMethod: "qr_code",
    splitEnabled: false,
  } as TransactionStorageInput);
  await storage.updateTransactionSessionState(sale.id, "approved");
  return sale;
}

describe("the Windcave browser callback's transactionId", () => {
  beforeEach(() => resetTestStorage());

  it("finds a sale by its exact number", async () => {
    const sale = await settledSale();
    const { app } = await createTestApp();
    const response = await request(app).get(`/api/windcave/callback?transactionId=${sale.id}`);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`/receipt/${sale.id}`);
  });

  it.each([
    ["trailing text", (id: number) => `${id}abc`],
    ["a decimal", (id: number) => `${id}.0`],
    ["a sign", (id: number) => `+${id}`],
    ["an exponent", (id: number) => `${id}e0`],
  ])("finds nothing for a number with %s, as for an unknown one", async (_label, form) => {
    const sale = await settledSale();
    const { app } = await createTestApp();
    const response = await request(app).get(`/api/windcave/callback?transactionId=${encodeURIComponent(form(sale.id))}`);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/");
  });
});
