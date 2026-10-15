import "./support/test-env";

import request from "supertest";
import {
  signedIn, createOwnerPrincipal, createTestApp, mintPaymentCredential, resetTestStorage, storage,
} from "./support/http-harness";

/**
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 3):
 * each customer page gets the business's details with what it already shows, and the public
 * by-number business read (GET /api/merchants/:id) is retired: counting through business numbers
 * listed every business, unconfirmed sign-ups included. Per-sale payment links stop carrying the
 * account holder's name and the contact email (the sign-in address unless changed), which no
 * screen shows.
 */
const RECEIPT_DETAILS = {
  businessName: "Kōwhai Café",
  businessAddress: "2 Kōwhai Lane, Auckland",
  contactPhone: "09 555 0199",
  gstNumber: "123-456-789",
  nzbn: "9429041234567",
};

beforeEach(() => {
  resetTestStorage();
});

async function business() {
  const owner = await createOwnerPrincipal({ name: "Morgan Reid", businessName: RECEIPT_DETAILS.businessName });
  await storage.updateMerchant(owner.merchantId, {
    ...RECEIPT_DETAILS,
    contactEmail: owner.user.email,
    customLogoUrl: "/uploads/logos/kowhai.png",
  });
  return owner;
}

function saleFor(merchantId: number, extra: Record<string, unknown> = {}) {
  return storage.createTransaction({
    merchantId,
    itemName: "Flat white",
    price: "5.50",
    status: "pending",
    paymentMethod: "qr_code",
    splitEnabled: false,
    ...extra,
  } as any);
}

function expectNoAccountHolder(body: unknown, owner: { user: { email: string } }) {
  const text = JSON.stringify(body);
  expect(text).not.toContain(owner.user.email);
  expect(text).not.toContain("Morgan Reid");
}

describe("a board sale's own answer carries its business's details", () => {
  it("gives the receipt's business details with the sale, and never the sign-in address or the holder's name", async () => {
    const { app } = await createTestApp();
    const owner = await business();
    const sale = await saleFor(owner.merchantId);

    const res = await request(app).get(`/api/transactions/${sale.id}`);

    expect(res.status).toBe(200);
    expect(res.body.itemName).toBe("Flat white");
    expect(res.body.merchant).toEqual({
      ...RECEIPT_DETAILS,
      customLogoUrl: "/uploads/logos/kowhai.png",
      themeId: expect.anything(),
    });
    expectNoAccountHolder(res.body, owner);
  });
});

describe("a payment link's answers carry the business's details, and nothing about its account holder", () => {
  it("drops the holder's name and the contact email from the link and its receipt", async () => {
    const { app } = await createTestApp();
    const owner = await business();
    const { rawToken, tokenHash } = mintPaymentCredential();
    await saleFor(owner.merchantId, { paymentTokenHash: tokenHash });

    const link = await request(app).get(`/api/pay/t/${rawToken}`);
    const receipt = await request(app).get(`/api/pay/t/${rawToken}/receipt`);

    expect(link.status).toBe(200);
    expect(link.body.merchant).toMatchObject(RECEIPT_DETAILS);
    expect(link.body.merchant).not.toHaveProperty("name");
    expect(link.body.merchant).not.toHaveProperty("contactEmail");
    expectNoAccountHolder(link.body, owner);
    expect([200, 404, 409]).toContain(receipt.status);
    expectNoAccountHolder(receipt.body, owner);
  });
});

describe("a board's page gets its business's name and logo from the board", () => {
  it("answers for one of the business's active boards, and for nothing else", async () => {
    const { app } = await createTestApp();
    const owner = await business();
    const board = await request(app).post(`/api/merchants/${owner.merchantId}/tapt-stones`).set(signedIn(owner)).send({});
    expect(board.status).toBe(200);
    const other = await createOwnerPrincipal();

    const own = await request(app).get(`/api/merchants/${owner.merchantId}/stone/${board.body.id}/brand`);
    const wrongBusiness = await request(app).get(`/api/merchants/${other.merchantId}/stone/${board.body.id}/brand`);
    const missing = await request(app).get(`/api/merchants/${owner.merchantId}/stone/${board.body.id + 1000}/brand`);
    const malformed = await request(app).get(`/api/merchants/${owner.merchantId}/stone/1e3/brand`);

    expect(own.status).toBe(200);
    expect(own.body).toEqual({ businessName: RECEIPT_DETAILS.businessName, customLogoUrl: "/uploads/logos/kowhai.png" });
    for (const res of [wrongBusiness, missing]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: "Payment board not found" });
    }
    expect(malformed.status).toBe(400);

    const removed = await request(app)
      .delete(`/api/merchants/${owner.merchantId}/tapt-stones/${board.body.id}`)
      .set(signedIn(owner));
    expect(removed.status).toBeLessThan(300);
    expect((await request(app).get(`/api/merchants/${owner.merchantId}/stone/${board.body.id}/brand`)).status).toBe(404);
  });
});
