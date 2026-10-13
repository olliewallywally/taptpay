import "./support/test-env";

// Sales with their own payment links are off (503) unless per-payment links are on.
process.env.FEATURE_NEW_RETAIL_PAYMENTS = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

jest.mock("../windcave", () => {
  const actual = jest.requireActual("../windcave");
  let sessions = 0;
  return {
    ...actual,
    isWindcaveConfigured: jest.fn(() => true),
    createWindcaveSession: jest.fn(async () => {
      sessions += 1;
      return { success: true, sessionId: `retail-session-${sessions}`, hppUrl: `https://uat.windcave.com/hpp/retail-${sessions}` };
    }),
    queryWindcaveSession: jest.fn(async () => ({ success: false, error: "pending" })),
  };
});

import crypto from "crypto";
import request from "supertest";
import * as windcave from "../windcave";
import * as push from "../push";
import { MemStorage, type TransactionStorageInput } from "../storage";
import { PaymentAttemptService } from "../payment-attempt-service";
import type { PaymentAttempt } from "@shared/schema";
import {
  createOwnerPrincipal, createTestApp, mintPaymentCredential, resetTestStorage, signedIn, storage, storageSnapshot,
} from "./support/http-harness";

/**
 * Owner decision OI-1 (2026-10-13, docs/decisions/2026-10-13-cancel-after-payment-attempt-owner-decision.md):
 * a merchant can cancel a sale even if someone has tried to pay. Money already taken still needs a refund;
 * a payment window that may still be open is checked with Windcave first, and never closed off, so a payment
 * that lands after the cancel is recorded rather than lost.
 */

jest.setTimeout(30_000);
const query = windcave.queryWindcaveSession as jest.Mock;
const create = windcave.createWindcaveSession as jest.Mock;
const configured = windcave.isWindcaveConfigured as jest.Mock;

beforeEach(() => {
  resetTestStorage();
  query.mockReset().mockResolvedValue({ success: false, error: "pending" });
  configured.mockReset().mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

const attemptsOf = (transactionId: number): PaymentAttempt[] =>
  Array.from(((storage as any).paymentAttempts as Map<string, PaymentAttempt>).values())
    .filter(attempt => attempt.transactionId === transactionId);

async function owned() {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const link = mintPaymentCredential();
  const sale = await storage.createTransaction({
    merchantId: owner.merchantId, itemName: "Flat white", price: "5.50", status: "pending", paymentMethod: "qr_code",
    splitEnabled: false, paymentTokenHash: link.tokenHash,
  } as any);
  const cancel = () => request(app).post(`/api/transactions/${sale.id}/cancel`).set(signedIn(owner));
  return { app, owner, link, sale, cancel };
}

/** A payer opened the payment page: the attempt has a session and is waiting. */
async function openedSale() {
  const made = await owned();
  const opened = await request(made.app).post(`/api/pay/t/${made.link.rawToken}/session`).send({ idempotencyKey: crypto.randomUUID() });
  expect(opened.status).toBe(200);
  const [attempt] = attemptsOf(made.sale.id);
  expect(attempt.state).toBe("ready");
  return { ...made, sessionId: opened.body.sessionId as string, returnState: opened.body.returnState as string, attempt };
}

describe("cancelling a sale someone has tried to pay", () => {
  it("asks Windcave first, then cancels when it cannot say yet, leaving the window able to settle", async () => {
    const { cancel, sale, sessionId, attempt } = await openedSale();

    const cancelled = await cancel();

    expect(cancelled.status).toBe(200);
    expect((await storage.getTransaction(sale.id))?.status).toBe("cancelled");
    expect((await storage.getPaymentAttempt(attempt.id))?.state).toBe("ready");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toBe(sessionId);
    expect(query.mock.calls[0][1]).toEqual({
      sessionId, amountCents: 550, currency: "NZD", merchantReference: `TAPT_${attempt.id}`,
      providerEnvironment: windcave.currentProviderEnvironment(),
    });
  });

  it("records a payment that completes after the cancel, and tells the merchant", async () => {
    const { app, cancel, sale, returnState, attempt } = await openedSale();
    expect((await cancel()).status).toBe(200);
    const pushed = jest.spyOn(push, "sendPushToMerchant").mockResolvedValue(undefined as any);
    query.mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "provider-late" });

    await request(app).get(`/api/pay/return/${returnState}`).query({ source: "hpp" });

    expect(await storage.getTransaction(sale.id)).toMatchObject({ status: "completed", windcaveTransactionId: "provider-late" });
    expect((await storage.getPaymentAttempt(attempt.id))?.state).toBe("approved");
    expect(pushed).toHaveBeenCalledWith(sale.merchantId, expect.objectContaining({ type: "payment_received", transactionId: sale.id }));
  });

  it("refuses the cancel and records the payment when Windcave says it was just paid", async () => {
    const { cancel, sale, attempt } = await openedSale();
    query.mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "provider-now" });

    const refused = await cancel();

    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ code: "PAYMENT_COMPLETED", message: "This sale has just been paid" });
    expect(await storage.getTransaction(sale.id)).toMatchObject({ status: "completed", windcaveTransactionId: "provider-now" });
    expect((await storage.getPaymentAttempt(attempt.id))?.state).toBe("approved");
  });

  it("closes a verified decline and cancels the sale (it stays cancelled, not failed)", async () => {
    const { cancel, sale, attempt } = await openedSale();
    query.mockResolvedValue({ success: true, approved: false });

    expect((await cancel()).status).toBe(200);

    expect((await storage.getTransaction(sale.id))?.status).toBe("cancelled");
    expect((await storage.getPaymentAttempt(attempt.id))?.state).toBe("declined");
  });

  it("cancels without asking when the provider is not configured, leaving the attempt untouched", async () => {
    const { cancel, sale, attempt } = await openedSale();
    configured.mockReturnValue(false);

    expect((await cancel()).status).toBe(200);

    expect(query).not.toHaveBeenCalled();
    expect((await storage.getTransaction(sale.id))?.status).toBe("cancelled");
    expect((await storage.getPaymentAttempt(attempt.id))?.state).toBe("ready");
  });

  it("asks Windcave once, without retrying, and holds no storage lock while it waits", async () => {
    const { cancel } = await openedSale();
    query.mockImplementation(async (_sessionId: string, _expected: unknown, options: unknown) => {
      expect(options).toEqual({ singleAttempt: true });
      expect((storage as any).paymentAttemptLocks.size).toBe(0);
      return { success: false, error: "pending" };
    });
    expect((await cancel()).status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("cancels at once while a session is still being created; that session is never served", async () => {
    const { app, cancel, link, sale } = await owned();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    create.mockImplementationOnce(async () => { await held; return { success: true, sessionId: "retail-late", hppUrl: "https://uat.windcave.com/hpp/late" }; });
    const opening = request(app).post(`/api/pay/t/${link.rawToken}/session`).send({ idempotencyKey: crypto.randomUUID() }).then(r => r);
    let cancelStatus: number;
    try {
      for (let i = 0; i < 400 && attemptsOf(sale.id)[0]?.expectedAmountCents == null; i++) await new Promise(resolve => setTimeout(resolve, 5));
      cancelStatus = (await cancel()).status;
    } finally { release(); }
    const opened = await opening;
    expect(cancelStatus).toBe(200);

    expect(opened.status).toBeGreaterThanOrEqual(400);
    expect(opened.body.hppUrl).toBeUndefined();
    expect((await storage.getTransaction(sale.id))?.status).toBe("cancelled");
    expect(attemptsOf(sale.id)[0].state).toBe("abandoned");
  });

  it("a session attached just before the cancel cannot reopen the cancelled sale", async () => {
    const { app, cancel, link, sale, owner } = await owned();
    const attach = storage.attachPaymentAttemptSessionRecord.bind(storage);
    jest.spyOn(storage, "attachPaymentAttemptSessionRecord").mockImplementation(async (input) => {
      const attached = await attach(input);
      await storage.cancelTransactionForMerchant(sale.id, owner.merchantId);
      return attached;
    });

    const opened = await request(app).post(`/api/pay/t/${link.rawToken}/session`).send({ idempotencyKey: crypto.randomUUID() });

    expect(opened.status).toBe(410);
    expect(opened.body.hppUrl).toBeUndefined();
    expect((await storage.getTransaction(sale.id))?.status).toBe("cancelled");
    void cancel;
  });

  it("still refuses when money was already taken on a share: a refund is the way back", async () => {
    const { cancel, sale } = await owned();
    (storage as any).transactions.get(sale.id).completedSplits = 1;
    const pushed = jest.spyOn(push, "sendPushToMerchant");
    const before = storageSnapshot();
    const refused = await cancel();
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
      code: "PAYMENT_CAPTURED", message: "A payment has already been taken on this sale. Refund it instead of cancelling.",
    });
    // Refused before anything is asked or written: no provider call, no write, no message.
    expect(storageSnapshot()).toBe(before);
    expect(query).not.toHaveBeenCalled();
    expect(pushed).not.toHaveBeenCalled();
  });

  it("a session recorded by a declined attempt no longer blocks the cancel", async () => {
    const { cancel, sale } = await owned();
    (storage as any).transactions.get(sale.id).windcaveSessionId = "session-of-a-decline";
    expect((await cancel()).status).toBe(200);
    expect((await storage.getTransaction(sale.id))?.status).toBe("cancelled");
  });
});

describe("a numbered (board) sale someone has tried to pay", () => {
  async function boardSale() {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const sale = await storage.createTransaction({
      merchantId: owner.merchantId, itemName: "Board sale", price: "7.00", status: "pending", paymentMethod: "qr_code", splitEnabled: false,
    } as any);
    await storage.updateTransactionWindcaveSession(sale.id, "board-session", "pending", "board-xid");
    return { app, owner, sale, cancel: () => request(app).post(`/api/transactions/${sale.id}/cancel`).set(signedIn(owner)) };
  }

  it("cancels when Windcave cannot say yet", async () => {
    const { cancel, sale } = await boardSale();
    expect((await cancel()).status).toBe(200);
    expect(query).toHaveBeenCalledWith("board-session", expect.objectContaining({ amountCents: 700, merchantReference: `TXN_${sale.id}` }), { singleAttempt: true });
    expect((await storage.getTransaction(sale.id))?.status).toBe("cancelled");
  });

  it("refuses when Windcave says it was just paid, leaving the recording to the board's own notification", async () => {
    const { cancel, sale } = await boardSale();
    query.mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "board-paid" });
    const refused = await cancel();
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("PAYMENT_COMPLETED");
    expect((await storage.getTransaction(sale.id))?.status).toBe("pending");
  });

  it("a cancelled board sale cannot open a new payment session", async () => {
    const { app, cancel, sale } = await boardSale();
    expect((await cancel()).status).toBe(200);
    create.mockClear();
    const opened = await request(app).post(`/api/transactions/${sale.id}/pay`).send({ merchantId: sale.merchantId });
    expect(opened.status).toBe(410);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("storage after a cancel", () => {
  const KEY = "11111111-1111-4111-8111-111111111111";
  let repo: MemStorage, service: PaymentAttemptService;
  beforeEach(() => { repo = new MemStorage(); service = new PaymentAttemptService(repo); });
  const input = (overrides: Partial<TransactionStorageInput> = {}) => ({
    merchantId: 11, itemName: "Synthetic", price: "10.00", status: "pending", paymentMethod: "qr_code", splitEnabled: false, ...overrides,
  } as TransactionStorageInput);

  async function readyAttempt(transactionId: number, shareIndex = 0) {
    const claim = await service.claim({ transactionId, shareIndex, idempotencyKey: crypto.randomUUID() });
    if (claim.kind !== "claimed") throw new Error("fixture_claim");
    const amountCents = shareIndex === 0 ? 1000 : 500;
    await service.recordExpectedValues({ attemptId: claim.attempt.id, amountCents, currency: "NZD", merchantReference: `TAPT_${claim.attempt.id}`, providerEnvironment: "uat" });
    await service.attachSession({ attemptId: claim.attempt.id, processorSessionId: `s-${claim.attempt.id}`, processorXId: `x-${claim.attempt.id.slice(0, 8)}` });
    return claim.attempt;
  }

  it("a late approval completes a cancelled unsplit sale, once", async () => {
    const sale = await repo.createTransaction(input());
    const attempt = await readyAttempt(sale.id);
    expect((await repo.cancelTransactionForMerchant(sale.id, 11)).kind).toBe("cancelled");
    await service.claimFinalization(attempt.id, `s-${attempt.id}`);
    const settled = await service.finalize({ attemptId: attempt.id, processorSessionId: `s-${attempt.id}`, processorTransactionId: "late", paymentMethod: "card", outcome: "approved" });
    expect(settled).toMatchObject({ kind: "finalized", transaction: { status: "completed" }, counterIncremented: true });
    await expect(service.finalize({ attemptId: attempt.id, processorSessionId: `s-${attempt.id}`, processorTransactionId: "late", paymentMethod: "card", outcome: "approved" }))
      .resolves.toMatchObject({ kind: "reused", counterIncremented: false });
  });

  it("a late decline closes the attempt and leaves the sale cancelled", async () => {
    const sale = await repo.createTransaction(input());
    const attempt = await readyAttempt(sale.id);
    await repo.cancelTransactionForMerchant(sale.id, 11);
    await service.claimFinalization(attempt.id, `s-${attempt.id}`);
    await expect(service.finalize({ attemptId: attempt.id, processorSessionId: `s-${attempt.id}`, outcome: "declined" }))
      .resolves.toMatchObject({ kind: "finalized", attempt: { state: "declined" }, transaction: { status: "cancelled" } });
  });

  it("a late approved share records the share and leaves the split sale cancelled", async () => {
    const sale = await repo.createTransaction(input());
    await repo.createBillSplit(sale.id, 2);
    const attempt = await readyAttempt(sale.id, 1);
    expect((await repo.cancelTransactionForMerchant(sale.id, 11)).kind).toBe("cancelled");
    await service.claimFinalization(attempt.id, `s-${attempt.id}`);
    await expect(service.finalize({ attemptId: attempt.id, processorSessionId: `s-${attempt.id}`, processorTransactionId: "share", paymentMethod: "card", outcome: "approved", receiptShare: 1 }))
      .resolves.toMatchObject({ kind: "finalized", splitPayment: { status: "completed" }, transaction: { status: "cancelled", completedSplits: 1 } });
  });

  it("a cancel abandons a payer's unsent claim at once, so its session can never be attached", async () => {
    const sale = await repo.createTransaction(input());
    const claim = await service.claim({ transactionId: sale.id, shareIndex: 0, idempotencyKey: KEY });
    if (claim.kind !== "claimed") throw new Error("fixture_claim");
    expect((await repo.cancelTransactionForMerchant(sale.id, 11)).kind).toBe("cancelled");
    await expect(service.attachSession({ attemptId: claim.attempt.id, processorSessionId: "late", processorXId: "late-xid" }))
      .resolves.toMatchObject({ kind: "expired" });
  });

  it("an approved attempt refuses the cancel as money taken", async () => {
    const sale = await repo.createTransaction(input());
    const attempt = await readyAttempt(sale.id);
    (repo as any).paymentAttempts.get(attempt.id).state = "approved";
    await expect(repo.cancelTransactionForMerchant(sale.id, 11)).resolves.toMatchObject({ kind: "conflict", reason: "payment-captured" });
  });

  it("status and session writers never reopen a cancelled sale", async () => {
    const sale = await repo.createTransaction(input());
    await repo.cancelTransactionForMerchant(sale.id, 11);
    await expect(repo.updateTransactionStatus(sale.id, "processing")).resolves.toBeUndefined();
    await expect(repo.updateTransactionStatus(sale.id, "failed")).resolves.toBeUndefined();
    await expect(repo.updateTransactionWindcaveSession(sale.id, "s", "pending", "x")).resolves.toBeUndefined();
    expect((await repo.getTransaction(sale.id))?.status).toBe("cancelled");
  });

  it("a legacy split share approved after the cancel does not reopen the sale", async () => {
    const sale = await repo.createTransaction(input());
    await repo.createBillSplit(sale.id, 2);
    await repo.cancelTransactionForMerchant(sale.id, 11);
    const [share] = await repo.getSplitPaymentsByTransaction(sale.id);
    await repo.updateSplitPaymentStatus(share.id, "completed", "legacy-share");
    expect((await repo.getTransaction(sale.id))?.status).toBe("cancelled");
  });
});
