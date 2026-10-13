import "./support/test-env";

// Sales with their own payment links are off (503) unless per-payment links are on.
process.env.FEATURE_NEW_RETAIL_PAYMENTS = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

jest.mock("../windcave", () => {
  const actual = jest.requireActual("../windcave");
  let sessions = 0;
  return {
    ...actual,
    isWindcaveConfigured: () => true,
    createWindcaveSession: jest.fn(async () => {
      sessions += 1;
      return { success: true, sessionId: `retail-session-${sessions}`, hppUrl: `https://uat.windcave.com/hpp/retail-${sessions}` };
    }),
  };
});

import crypto from "crypto";
import request from "supertest";
import * as windcave from "../windcave";
import { MemStorage, type TransactionStorageInput } from "../storage";
import { PaymentAttemptService } from "../payment-attempt-service";
import type { PaymentAttempt } from "@shared/schema";
import {
  createOwnerPrincipal, createTestApp, mintPaymentCredential, resetTestStorage, signedIn, storage, storageSnapshot,
} from "./support/http-harness";

/**
 * Merge of R2 and R3 (2026-10-13). R2 records an attempt's expected values before it asks
 * Windcave for a session (R2-T4), and serves the session's links only after attaching it.
 * An attempt whose lease ran out with no session attached, and with no R3 send intent,
 * therefore never reached a payer: nothing can be charged through it. The merge held such
 * attempts forever as soon as expected values existed, so one failed session creation left
 * the sale unpayable and uncancellable. These tests pin R2's rule back on the merged tree.
 */

jest.setTimeout(30_000);
const create = windcave.createWindcaveSession as jest.Mock;

beforeEach(() => resetTestStorage());

const attemptsOf = (transactionId: number): PaymentAttempt[] =>
  Array.from(((storage as any).paymentAttempts as Map<string, PaymentAttempt>).values())
    .filter(attempt => attempt.transactionId === transactionId);
const expireLease = (attemptId: string) => {
  (storage as any).paymentAttempts.get(attemptId).leaseExpiresAt = new Date(Date.now() - 1000);
};

async function saleWithFailedSessionCreation() {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const link = mintPaymentCredential();
  const sale = await storage.createTransaction({
    merchantId: owner.merchantId, itemName: "Flat white", price: "5.50", status: "pending", paymentMethod: "qr_code",
    splitEnabled: false, paymentTokenHash: link.tokenHash,
  } as any);
  create.mockResolvedValueOnce({ success: false, error: "PROVIDER_UNAVAILABLE" });
  const failed = await request(app).post(`/api/pay/t/${link.rawToken}/session`).send({ idempotencyKey: crypto.randomUUID() });
  expect(failed.status).toBe(503);
  const [attempt] = attemptsOf(sale.id);
  expect(attempt).toMatchObject({ state: "claiming", processorSessionId: null, expectedAmountCents: 550, sendStartedAt: null });
  return { app, owner, link, sale, attempt };
}

it("after a failed session creation's lease runs out, the next payer opens a new attempt", async () => {
  const { app, link, attempt } = await saleWithFailedSessionCreation();
  expireLease(attempt.id);

  const retried = await request(app).post(`/api/pay/t/${link.rawToken}/session`).send({ idempotencyKey: crypto.randomUUID() });

  expect(retried.status).toBe(200);
  expect(retried.body.sessionId).toEqual(expect.any(String));
  expect((await storage.getPaymentAttempt(attempt.id))?.state).toBe("abandoned");
});

// Owner decision OI-1 (2026-10-13) goes further than B-1: the owner need not wait for the lease.
it("the owner can cancel at once; the unsent attempt is closed so its session can never be served", async () => {
  const { app, owner, sale, attempt } = await saleWithFailedSessionCreation();

  const cancelled = await request(app).post(`/api/transactions/${sale.id}/cancel`).set(signedIn(owner));

  expect(cancelled.status).toBe(200);
  expect((await storage.getTransaction(sale.id))?.status).toBe("cancelled");
  expect((await storage.getPaymentAttempt(attempt.id))?.state).toBe("abandoned");
});

it("a cancellation refused for another reason releases nothing", async () => {
  const { app, owner, sale, attempt } = await saleWithFailedSessionCreation();
  expireLease(attempt.id);
  (storage as any).transactions.get(sale.id).completedSplits = 1;
  const before = storageSnapshot();

  const refused = await request(app).post(`/api/transactions/${sale.id}/cancel`).set(signedIn(owner));

  expect(refused.status).toBe(409);
  expect(storageSnapshot()).toBe(before);
  expect((await storage.getPaymentAttempt(attempt.id))?.state).toBe("claiming");
});

describe("PaymentAttemptService with MemStorage", () => {
  const KEY_ONE = "11111111-1111-4111-8111-111111111111";
  const KEY_TWO = "22222222-2222-4222-8222-222222222222";
  let repo: MemStorage;
  let service: PaymentAttemptService;
  let now: Date;

  beforeEach(() => {
    repo = new MemStorage();
    now = new Date("2026-10-13T10:00:00.000Z");
    service = new PaymentAttemptService(repo, () => new Date(now));
  });

  async function claimedWithExpectedValues() {
    const transaction = await repo.createTransaction({
      merchantId: 11, itemName: "Synthetic", price: "10.00", status: "pending", paymentMethod: "qr_code", splitEnabled: false,
    } as TransactionStorageInput);
    const claim = await service.claim({ transactionId: transaction.id, shareIndex: 0, idempotencyKey: KEY_ONE });
    if (claim.kind !== "claimed") throw new Error("fixture_claim");
    const recorded = await service.recordExpectedValues({
      attemptId: claim.attempt.id, amountCents: 1000, currency: "NZD",
      merchantReference: `TAPT_${claim.attempt.id}`, providerEnvironment: "uat",
    });
    expect(recorded.kind).toBe("recorded");
    return { transaction, attempt: claim.attempt };
  }

  test("a session that comes back after the lease ran out is never attached", async () => {
    const { attempt } = await claimedWithExpectedValues();
    now = new Date("2026-10-13T10:05:00.001Z");

    await expect(service.attachSession({
      attemptId: attempt.id, processorSessionId: "session-late", processorXId: "xid-late", rawReturnState: "A".repeat(43),
    })).resolves.toMatchObject({ kind: "expired", attempt: { state: "abandoned", processorSessionId: null } });
  });

  test("an attempt carrying R3 send intent stays held for claims, and a cancel leaves it able to settle", async () => {
    const { transaction, attempt } = await claimedWithExpectedValues();
    (repo as any).paymentAttempts.get(attempt.id).sendStartedAt = new Date(now);
    now = new Date("2026-10-13T10:05:00.001Z");

    await expect(service.claim({ transactionId: transaction.id, shareIndex: 0, idempotencyKey: KEY_TWO }))
      .resolves.toMatchObject({ kind: "expired", attempt: { id: attempt.id, state: "claiming" } });
    // OI-1: the cancel goes ahead, but leaves an attempt that may have reached Windcave able to settle.
    await expect(repo.cancelTransactionForMerchant(transaction.id, 11, now))
      .resolves.toMatchObject({ kind: "cancelled" });
    expect((await repo.getPaymentAttempt(attempt.id))?.state).toBe("claiming");
  });
});
