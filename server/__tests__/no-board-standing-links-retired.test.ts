import "./support/test-env";

import request from "supertest";
import {
  signedIn,
  createAdminPrincipal,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  mintPaymentCredential,
  resetTestStorage,
  storage,
} from "./support/http-harness";

/**
 * Owner decision 2026-09-25 (server/no-board-address.ts): the business-wide no-board address
 * is retired. Its printable QR image and its NFC tag address answer 410 (a compatibility
 * tombstone, plan §5.4), and no response hands the address out any more — not the business's
 * settings, the admin view, or a cancelled or split sale. A board's QR, NFC tag and page are
 * unchanged.
 */
beforeEach(() => {
  resetTestStorage();
});

async function boardSale(merchantId: number) {
  const board = await storage.createNextTaptStone(merchantId);
  const sale = await storage.createTransaction({
    merchantId,
    itemName: "Board sale",
    price: "40.00",
    status: "pending",
    paymentMethod: "qr_code",
    splitEnabled: true,
    taptStoneId: board.id,
  } as any);
  return { board, sale };
}

function privateLinkSale(merchantId: number) {
  return storage.createTransaction({
    merchantId,
    itemName: "Private link sale",
    price: "30.00",
    status: "pending",
    paymentMethod: "qr_code",
    splitEnabled: false,
    paymentTokenHash: mintPaymentCredential().tokenHash,
  } as any);
}

const businessWide = (merchantId: number) => new RegExp(`/pay/${merchantId}(?![0-9/])|/api/merchants/${merchantId}/qr`);

describe("the business-wide no-board QR code and NFC tag are retired", () => {
  it("answers 410 for the business's QR image, printable size or not", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    for (const path of [`/api/merchants/${owner.merchantId}/qr`, `/api/merchants/${owner.merchantId}/qr?size=800&download=true`]) {
      const response = await request(app).get(path);
      expect({ path, status: response.status }).toEqual({ path, status: 410 });
      expect(response.headers["content-type"]).toMatch(/application\/json/);
      expect(response.headers["content-disposition"]).toBeUndefined();
      expect(response.body).toEqual({ code: "NO_BOARD_ADDRESS_RETIRED", message: expect.stringContaining("own payment link") });
    }
  });

  it("still draws a board's QR image", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const board = await storage.createNextTaptStone(owner.merchantId);

    const response = await request(app).get(`/api/merchants/${owner.merchantId}/stone/${board.id}/qr`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
  });

  it("answers a business's NFC tag with a notice page, not a redirect to the retired page", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const response = await request(app).get(`/nfc/${owner.merchantId}`);

    expect(response.status).toBe(410);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.text).toContain("Ask for your payment link");
    expect(response.text).toContain("Each sale now has its own payment link.");
    expect(response.text).not.toMatch(businessWide(owner.merchantId));
    expect(response.text).not.toContain("<script");
  });

  it("still sends a board's NFC tag to that board's page", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const board = await storage.createNextTaptStone(owner.merchantId);

    const response = await request(app).get(`/nfc/${owner.merchantId}/stone/${board.id}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain(`https://harness.test/pay/${owner.merchantId}/stone/${board.id}`);
  });
});

describe("no response hands out the business-wide address", () => {
  it("leaves it out of the business's own settings, for the owner and a teammate", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);

    for (const principal of [owner, member]) {
      const response = await request(app).get(`/api/merchants/${owner.merchantId}/profile`).set(signedIn(principal));
      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty("paymentUrl");
      expect(response.body).not.toHaveProperty("qrCodeUrl");
      expect(JSON.stringify(response.body)).not.toMatch(businessWide(owner.merchantId));
    }
  });

  it("leaves it out of the admin view of a business", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const response = await request(app).get(`/api/admin/merchants/${owner.merchantId}`).set(signedIn(await createAdminPrincipal()));

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty("paymentUrl");
    expect(response.body).not.toHaveProperty("qrCodeUrl");
    expect(JSON.stringify(response.body)).not.toMatch(businessWide(owner.merchantId));
  });

  it("gives a cancelled board-less sale no address, and a cancelled board sale its board's", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const linked = await privateLinkSale(owner.merchantId);
    const { board, sale } = await boardSale(owner.merchantId);

    const cancelledLinked = await request(app).post(`/api/transactions/${linked.id}/cancel`).set(signedIn(owner)).send({});
    expect(cancelledLinked.status).toBe(200);
    expect(cancelledLinked.body).toMatchObject({ id: linked.id, status: "cancelled" });
    expect(cancelledLinked.body).not.toHaveProperty("paymentUrl");
    expect(cancelledLinked.body).not.toHaveProperty("qrCodeUrl");

    const cancelledBoard = await request(app).post(`/api/transactions/${sale.id}/cancel`).set(signedIn(owner)).send({});
    expect(cancelledBoard.status).toBe(200);
    expect(cancelledBoard.body).toMatchObject({
      paymentUrl: `https://harness.test/pay/${owner.merchantId}/stone/${board.id}`,
      qrCodeUrl: `https://harness.test/api/merchants/${owner.merchantId}/stone/${board.id}/qr`,
    });
  });

  it("gives a split board sale its board's address, not the business-wide one", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const { board, sale } = await boardSale(owner.merchantId);

    const response = await request(app).post(`/api/transactions/${sale.id}/split`).send({ totalSplits: 2 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: sale.id,
      paymentUrl: `https://harness.test/pay/${owner.merchantId}/stone/${board.id}`,
    });
    expect(JSON.stringify(response.body)).not.toMatch(businessWide(owner.merchantId));
  });

  // The admin 'test payment link' check (410 since 2026-09-25) was removed on 2026-09-26 (owner
  // decision, C10 batch 4): c10-batch-4-retired-routes.test.ts.
});
