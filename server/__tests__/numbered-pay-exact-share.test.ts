import "./support/test-env";

jest.mock("../windcave", () => {
  const actual = jest.requireActual("../windcave");
  let sessions = 0;
  return {
    ...actual,
    isWindcaveConfigured: () => true,
    createWindcaveSession: jest.fn(async () => ({
      success: true,
      sessionId: `session-${++sessions}`,
      hppUrl: "https://uat.windcave.com/hpp",
    })),
    queryWindcaveSession: jest.fn(async (sessionId: string) => ({
      success: true,
      approved: true,
      windcaveTransactionId: `provider-${sessionId}`,
    })),
  };
});

import request from "supertest";
import * as windcave from "../windcave";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, storageSnapshot } from "./support/http-harness";
import type { TransactionStorageInput } from "../storage";

/**
 * Owner decision 2026-09-26 (answer 1, "Exact share only"): a board sale's
 * customer pays exactly what is owed — the next share of a split bill, or the
 * whole price — as a per-payment link's customer already does. An amount that
 * differs is refused before any provider session exists. Before, the customer
 * could name any amount up to what was left, and the share it paid was then
 * counted as fully paid (every share of $100 paid with $0.01).
 */
const providerAmounts = () => (windcave.createWindcaveSession as jest.Mock).mock.calls.map((call) => call[1]);

async function boardSale(price: string, splitEnabled: boolean) {
  const owner = await createOwnerPrincipal();
  return storage.createTransaction({
    merchantId: owner.merchantId,
    itemName: "Dinner",
    price,
    status: "pending",
    paymentMethod: "qr_code",
    splitEnabled,
  } as TransactionStorageInput);
}

async function payAndComplete(app: any, saleId: number, body: Record<string, unknown>) {
  const pay = await request(app).post(`/api/transactions/${saleId}/pay`).send(body);
  expect(pay.status).toBe(200);
  const done = await request(app)
    .post(`/api/transactions/${saleId}/hosted-fields-complete`)
    .send({ sessionId: pay.body.sessionId });
  expect(done.status).toBe(200);
}

describe("a board sale's customer pays exactly what is owed", () => {
  beforeEach(() => {
    resetTestStorage();
    (windcave.createWindcaveSession as jest.Mock).mockClear();
  });

  describe("a split bill of $100 in three ($33.33, $33.33, $33.34)", () => {
    async function splitSale() {
      const sale = await boardSale("100.00", true);
      const { app } = await createTestApp();
      const split = await request(app).post(`/api/transactions/${sale.id}/split`).send({ totalSplits: 3 });
      expect(split.status).toBe(200);
      return { app, sale };
    }

    it.each([["a cent", "0.01"], ["more than the share", "50.00"], ["another share's amount", "33.34"]])(
      "refuses %s for the first share, before any provider session, and changes nothing",
      async (_label, amount) => {
        const { app, sale } = await splitSale();
        const before = storageSnapshot();

        const response = await request(app).post(`/api/transactions/${sale.id}/pay`).send({ amount });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ message: "Payment amount does not match the outstanding share" });
        expect(providerAmounts()).toEqual([]);
        expect(storageSnapshot()).toBe(before);
      },
    );

    it("charges the share itself, whether or not the customer states it", async () => {
      const { app, sale } = await splitSale();
      await request(app).post(`/api/transactions/${sale.id}/pay`).send({}).expect(200);
      await request(app).post(`/api/transactions/${sale.id}/pay`).send({ amount: "33.33" }).expect(200);
      expect(providerAmounts()).toEqual(["33.33", "33.33"]);
    });

    it("charges the last share its remainder, and refuses the others' amount for it", async () => {
      const { app, sale } = await splitSale();
      await payAndComplete(app, sale.id, {});
      await payAndComplete(app, sale.id, { amount: "33.33" });

      const wrong = await request(app).post(`/api/transactions/${sale.id}/pay`).send({ amount: "33.33" });
      expect(wrong.status).toBe(400);
      await payAndComplete(app, sale.id, {});

      expect(providerAmounts()).toEqual(["33.33", "33.33", "33.34"]);
      const after = await storage.getTransaction(sale.id);
      expect(after).toMatchObject({ completedSplits: 3, totalSplits: 3, status: "completed" });
    });
  });

  describe("an unsplit sale of $12.50", () => {
    it("refuses any other amount, before any provider session", async () => {
      const sale = await boardSale("12.50", false);
      const { app } = await createTestApp();
      const response = await request(app).post(`/api/transactions/${sale.id}/pay`).send({ amount: "1.00" });
      expect(response.status).toBe(400);
      expect(providerAmounts()).toEqual([]);
    });

    it("charges the price, whether or not the customer states it", async () => {
      const sale = await boardSale("12.50", false);
      const { app } = await createTestApp();
      await request(app).post(`/api/transactions/${sale.id}/pay`).send({ amount: "12.50" }).expect(200);
      expect(providerAmounts()).toEqual(["12.50"]);
    });
  });
});
