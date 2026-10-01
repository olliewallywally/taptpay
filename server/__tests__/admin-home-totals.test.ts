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

/**
 * The admin area's home page (owner decision 2026-09-30,
 * docs/decisions/2026-09-30-r1-t4-phase-e-go-owner-answers.md, answer 2). It showed $0 revenue, 0 sales
 * and 0 pending whatever the platform held, because it asked for a list the server does not serve
 * (GET /api/transactions). The totals now come from the admin's own figures
 * (GET /api/admin/analytics), which gain what the page shows and they lacked: how many sales are still
 * waiting, and how many businesses' figures could not be read (R1-T9's rule: never a made-up zero).
 */

beforeEach(() => resetTestStorage());

const sale = (merchantId: number, price: string, status: string) =>
  storage.createTransaction({ merchantId, itemName: "Sale", price, status, paymentMethod: "qr_code", splitEnabled: false } as any);

describe("the platform's totals for the admin home page", () => {
  it("count every business's sales: revenue from completed ones, and how many are still waiting", async () => {
    const { app } = await createTestApp();
    const first = await createOwnerPrincipal();
    const second = await createOwnerPrincipal();
    await sale(first.merchantId, "12.50", "completed");
    await sale(first.merchantId, "4.50", "pending");
    await sale(second.merchantId, "7.50", "completed");
    await sale(second.merchantId, "3.00", "failed");
    await sale(second.merchantId, "9.00", "pending");

    const res = await request(app).get("/api/admin/analytics").set(bearer(createAdminPrincipal()));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalMerchants: 2,
      totalRevenue: 20,
      totalTransactions: 5,
      completedTransactions: 2,
      pendingTransactions: 2,
      businessesNotLoaded: 0,
    });
  });

  it("say how many businesses' figures could not be read, rather than counting them as nothing without a word", async () => {
    const { app } = await createTestApp();
    const first = await createOwnerPrincipal();
    const second = await createOwnerPrincipal();
    await sale(first.merchantId, "12.50", "completed");
    await sale(first.merchantId, "4.50", "pending");
    await sale(second.merchantId, "7.50", "completed");
    const read = storage.getMerchantAnalytics.bind(storage);
    const failing = jest.spyOn(storage, "getMerchantAnalytics").mockImplementation(async (merchantId: number) => {
      if (merchantId === second.merchantId) throw new Error("the database did not answer");
      return read(merchantId);
    });
    try {
      const res = await request(app).get("/api/admin/analytics").set(bearer(createAdminPrincipal()));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        totalMerchants: 2, totalRevenue: 12.5, totalTransactions: 2, pendingTransactions: 1, businessesNotLoaded: 1,
      });
    } finally {
      failing.mockRestore();
    }
  });

  it("with no business at all, every total is a true zero", async () => {
    const { app } = await createTestApp();
    const res = await request(app).get("/api/admin/analytics").set(bearer(createAdminPrincipal()));
    expect(res.body).toMatchObject({
      totalMerchants: 0, totalRevenue: 0, totalTransactions: 0, pendingTransactions: 0, businessesNotLoaded: 0,
    });
  });

  it("the list the page used to ask for is still not served to a reader", async () => {
    const { app } = await createTestApp();
    const res = await request(app).get("/api/transactions").set(bearer(createAdminPrincipal()));
    // No such read: the app's own page (or nothing) answers, never a list of sales.
    expect(Array.isArray(res.body)).toBe(false);
  });
});
