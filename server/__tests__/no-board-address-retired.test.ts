import "./support/test-env";

// Production runs with per-payment links on (the owner's 2026-09-14 attestation), and the
// rework leans on them: a sale without a payment board is always per-payment. Turning a
// money flag on needs ENV_VALIDATION_MODE=enforce (config.ts's capability check); payment
// mode itself stays "disabled" (test-env.ts). Restored in afterAll for the worker's next file.
const savedEnv = {
  FEATURE_NEW_RETAIL_PAYMENTS: process.env.FEATURE_NEW_RETAIL_PAYMENTS,
  ENV_VALIDATION_MODE: process.env.ENV_VALIDATION_MODE,
};
process.env.FEATURE_NEW_RETAIL_PAYMENTS = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

import request from "supertest";
import { sseBroker } from "../sse-broker";
import {
  bearer,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  mintPaymentCredential,
  openEventStream,
  resetTestStorage,
  storage,
} from "./support/http-harness";

/**
 * Owner decision 2026-09-25 (docs/decisions/2026-09-25-no-board-rework-402-and-batch-owner-answers.md,
 * item 1): with a payment board, the board's own page and stream, unchanged; without one,
 * every sale has its own private link (`/pay/t/<token>`), the way property and trades bill.
 *
 * Retired here: the business-wide no-board address's live feed and its "current sale" read
 * (gap 12's leak and its residual). Before this change, anyone who knew or guessed a
 * business's number could open `GET /api/merchants/:id/events` with no sign-in and watch
 * every no-board sale (item, price, status), or poll `active-transaction` for the same.
 * The staff terminal read its own current sale from that same anonymous poll, which cannot
 * see its per-payment sales at all; it now reads it signed in.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  resetTestStorage();
  sseBroker.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** A no-board sale made the old way: no board, no link of its own. */
function sharedNoBoardSale(merchantId: number, itemName = "Shared counter sale") {
  return storage.createTransaction({
    merchantId,
    itemName,
    price: "12.50",
    status: "pending",
    paymentMethod: "qr_code",
    splitEnabled: false,
  } as any);
}

/** A no-board sale with its own private link, as every phone and desktop terminal now makes. */
function privateLinkSale(merchantId: number, itemName = "Private link sale") {
  const { tokenHash } = mintPaymentCredential();
  return storage.createTransaction({
    merchantId,
    itemName,
    price: "30.00",
    status: "pending",
    paymentMethod: "qr_code",
    splitEnabled: false,
    paymentTokenHash: tokenHash,
  } as any);
}

async function boardSale(merchantId: number, itemName = "Board sale") {
  const board = await storage.createNextTaptStone(merchantId);
  const sale = await storage.createTransaction({
    merchantId,
    itemName,
    price: "8.00",
    status: "pending",
    paymentMethod: "qr_code",
    splitEnabled: false,
    taptStoneId: board.id,
  } as any);
  return { board, sale };
}

/** The business's subscription is in order, so the create route's billing gate lets a sale through. */
function billingInOrder() {
  jest.spyOn(storage, "getOrCreateSubscription").mockResolvedValue({
    status: "active",
    lastBillingDate: new Date(Date.now() - DAY_MS),
    currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS),
  } as any);
}

describe("the business-wide no-board live feed is retired", () => {
  it("refuses an anonymous no-board stream with 410 and subscribes nothing", async () => {
    const { app } = await createTestApp();
    const { merchantId } = await createOwnerPrincipal();
    await sharedNoBoardSale(merchantId);

    const stream = await openEventStream(app, `/api/merchants/${merchantId}/events`);
    try {
      expect(stream.status).toBe(410);
      expect(String(stream.headers["content-type"])).not.toContain("text/event-stream");
    } finally {
      await stream.close();
    }
    expect(sseBroker.subscriberCount(merchantId)).toBe(0);

    const response = await request(app).get(`/api/merchants/${merchantId}/events`);
    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      code: "NO_BOARD_ADDRESS_RETIRED",
      message: expect.stringContaining("own payment link"),
    });
  });

  it("still delivers a no-board sale's update to the business's own stream, and never to a board's stream", async () => {
    const { app } = await createTestApp();
    const { merchantId, token } = await createOwnerPrincipal();
    const { board } = await boardSale(merchantId);

    const merchantStream = await openEventStream(app, `/api/merchants/${merchantId}/events`, bearer({ token }));
    const boardStream = await openEventStream(app, `/api/merchants/${merchantId}/events?stoneId=${board.id}`);
    try {
      expect(merchantStream.status).toBe(200);
      expect(boardStream.status).toBe(200);
      await expect(merchantStream.nextEvent()).resolves.toMatchObject({ type: "connected", audience: "merchant" });
      await expect(boardStream.nextEvent()).resolves.toMatchObject({ type: "connected", audience: "board" });

      // A new sale with its own private link is the update. (These tests toggled splitting on an
      // existing sale until that route was removed on 2026-09-27, C10 batch 6b.)
      billingInOrder();
      const created = await request(app)
        .post("/api/transactions")
        .set(bearer({ token }))
        .send({ merchantId, itemName: "Private link sale", price: "30.00" });
      expect(created.status).toBe(200);

      await expect(merchantStream.nextEvent()).resolves.toMatchObject({
        type: "transaction_updated",
        transaction: { id: created.body.id, itemName: "Private link sale" },
      });
      await expect(boardStream.nextEvent(300)).rejects.toThrow(/no event/);
    } finally {
      await merchantStream.close();
      await boardStream.close();
    }
  });

  it("delivers a board's sale to that board's stream at once, with the business's stream", async () => {
    const { app } = await createTestApp();
    const { merchantId, token } = await createOwnerPrincipal();
    const board = await storage.createNextTaptStone(merchantId);

    const merchantStream = await openEventStream(app, `/api/merchants/${merchantId}/events`, bearer({ token }));
    const boardStream = await openEventStream(app, `/api/merchants/${merchantId}/events?stoneId=${board.id}`);
    try {
      await merchantStream.nextEvent();
      await boardStream.nextEvent();

      // A new sale on the board is the update (see the test above).
      billingInOrder();
      const created = await request(app)
        .post("/api/transactions")
        .set(bearer({ token }))
        .send({ merchantId, itemName: "Board sale", price: "8.00", selectedStoneId: board.id })
        .expect(200);

      await expect(boardStream.nextEvent()).resolves.toMatchObject({
        type: "transaction_updated",
        addressingMode: "board",
        stoneId: board.id,
        transaction: { id: created.body.id },
      });
      await expect(merchantStream.nextEvent()).resolves.toMatchObject({
        type: "transaction_updated",
        transaction: { id: created.body.id },
      });
    } finally {
      await merchantStream.close();
      await boardStream.close();
    }
  });
});

describe("the anonymous no-board 'current sale' read is retired", () => {
  it("answers 410 and reveals nothing about the business's open sales", async () => {
    const { app } = await createTestApp();
    const { merchantId } = await createOwnerPrincipal();
    const shared = await sharedNoBoardSale(merchantId);
    const linked = await privateLinkSale(merchantId);

    const response = await request(app).get(`/api/merchants/${merchantId}/active-transaction`);

    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      code: "NO_BOARD_ADDRESS_RETIRED",
      message: expect.stringContaining("own payment link"),
    });
    const text = JSON.stringify(response.body);
    for (const leaked of ["Shared counter sale", "Private link sale", "12.50", "30.00"]) {
      expect(text).not.toContain(leaked);
    }
    expect(response.headers["x-legacy-no-board-ambiguous"]).toBeUndefined();
    void shared;
    void linked;
  });

  it("gives the business's own terminal its newest open sale when signed in, including a sale with its own link", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    await sharedNoBoardSale(owner.merchantId);
    const linked = await privateLinkSale(owner.merchantId);

    const response = await request(app)
      .get(`/api/merchants/${owner.merchantId}/active-transaction`)
      .set(bearer(owner));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: linked.id, itemName: "Private link sale", status: "pending" });
    // The same shape the business's own stream sends (merchantSseTransactionDto).
    expect(response.body).toHaveProperty("merchantNet");
    // A private link can't be rebuilt (only its hash is kept), and the business-wide
    // address is gone: no address at all rather than a wrong one.
    expect(response.body).not.toHaveProperty("paymentUrl");
    expect(response.body).not.toHaveProperty("qrCodeUrl");
    expect(response.body).not.toHaveProperty("paymentTokenHash");
  });

  it("gives a teammate's signed-in terminal the same", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const linked = await privateLinkSale(owner.merchantId);

    const response = await request(app)
      .get(`/api/merchants/${owner.merchantId}/active-transaction`)
      .set(bearer(member));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: linked.id });
  });

  it("gives a board sale's board address to the signed-in terminal", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const { board, sale } = await boardSale(owner.merchantId);

    const response = await request(app)
      .get(`/api/merchants/${owner.merchantId}/active-transaction`)
      .set(bearer(owner));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: sale.id,
      taptStoneId: board.id,
      paymentUrl: `https://harness.test/pay/${owner.merchantId}/stone/${board.id}`,
    });
  });

  it("refuses another business's login with 403 and no data", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const stranger = await createOwnerPrincipal();
    await sharedNoBoardSale(owner.merchantId);
    await privateLinkSale(owner.merchantId);

    const response = await request(app)
      .get(`/api/merchants/${owner.merchantId}/active-transaction`)
      .set(bearer(stranger));

    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toMatch(/counter sale|link sale|12\.50|30\.00/);
  });

  it("refuses a token that is not valid, with no data", async () => {
    const { app } = await createTestApp();
    const { merchantId } = await createOwnerPrincipal();
    await sharedNoBoardSale(merchantId);

    const response = await request(app)
      .get(`/api/merchants/${merchantId}/active-transaction`)
      .set({ Authorization: "Bearer not-a-real-token" });

    // authenticateToken's answer for a token that doesn't verify, on every signed-in route.
    expect(response.status).toBe(401); // 401 since 2026-09-27 (R1-T3, P2.2, owner decision): a sign-in that is invalid, expired or disabled was 403.
    expect(response.body).toEqual({ message: "Invalid or expired token" });
  });

  it("still lets a board's page read that board's sale without signing in", async () => {
    const { app } = await createTestApp();
    const { merchantId } = await createOwnerPrincipal();
    await sharedNoBoardSale(merchantId);
    const { board, sale } = await boardSale(merchantId);

    const response = await request(app).get(`/api/merchants/${merchantId}/active-transaction?stoneId=${board.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: sale.id, taptStoneId: board.id });
  });
});

describe("a sale without a payment board always gets its own link", () => {
  async function createSale(principal: { token: string; merchantId: number }, body: Record<string, unknown>) {
    const { app } = await createTestApp();
    return request(app)
      .post("/api/transactions")
      .set(bearer(principal))
      .send({ merchantId: principal.merchantId, itemName: "Flat white", price: "5.50", ...body });
  }

  it("is per-payment even when the request names no link type", async () => {
    const owner = await createOwnerPrincipal();
    billingInOrder();

    const response = await createSale(owner, {});

    expect(response.status).toBe(200);
    expect(response.body.paymentUrl).toMatch(/^https:\/\/harness\.test\/pay\/t\/[A-Za-z0-9_-]{43}$/);
    expect(response.body.qrCodeUrl).toMatch(/^https:\/\/harness\.test\/api\/pay\/t\/[A-Za-z0-9_-]{43}\/qr$/);
    const stored = await storage.getTransaction(response.body.id);
    expect(stored?.taptStoneId ?? null).toBeNull();
    expect(stored?.paymentTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a request for a shared no-board sale, creating and announcing nothing", async () => {
    const owner = await createOwnerPrincipal();
    billingInOrder();
    const broadcast = jest.spyOn(sseBroker, "broadcast");

    const response = await createSale(owner, { linkMode: "legacy" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: "NO_BOARD_SALE_NEEDS_OWN_LINK",
      message: expect.stringContaining("own payment link"),
    });
    expect(await storage.getTransactionsByMerchant(owner.merchantId)).toHaveLength(0);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("leaves a board sale on its board's address", async () => {
    const owner = await createOwnerPrincipal();
    billingInOrder();
    const board = await storage.createNextTaptStone(owner.merchantId);

    const response = await createSale(owner, { selectedStoneId: board.id });

    expect(response.status).toBe(200);
    expect(response.body.paymentUrl).toBe(`https://harness.test/pay/${owner.merchantId}/stone/${board.id}`);
    const stored = await storage.getTransaction(response.body.id);
    expect(stored?.taptStoneId).toBe(board.id);
    expect(stored?.paymentTokenHash ?? null).toBeNull();
  });
});
