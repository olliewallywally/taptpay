jest.mock("../database", () => ({
  getDb: () => null,
  isDatabaseConnected: () => false,
}));

import { hashBearerCredential } from "../payment-credential";
import { PaymentAttemptService } from "../payment-attempt-service";
import {
  BillSplitConflictError,
  MemStorage,
  type TransactionStorageInput,
} from "../storage";

const KEY_ONE = "11111111-1111-4111-8111-111111111111";
const KEY_TWO = "22222222-2222-4222-8222-222222222222";
const KEY_THREE = "33333333-3333-4333-8333-333333333333";
const RETURN_ONE = "A".repeat(43);
const RETURN_TWO = "B".repeat(43);
const RETURN_THREE = "C".repeat(43);

function transactionInput(
  overrides: Partial<TransactionStorageInput> = {},
): TransactionStorageInput {
  return {
    merchantId: 1,
    itemName: "Durable payment",
    price: "10.00",
    status: "pending",
    paymentMethod: "qr_code",
    splitEnabled: false,
    ...overrides,
  } as TransactionStorageInput;
}

describe("PaymentAttemptService with MemStorage", () => {
  let storage: MemStorage;
  let service: PaymentAttemptService;
  let now: Date;

  beforeEach(() => {
    storage = new MemStorage();
    now = new Date("2026-08-06T10:00:00.000Z");
    service = new PaymentAttemptService(storage, () => new Date(now));
  });

  test("claims one live attempt, reuses the same key, and abandons an expired lease", async () => {
    const transaction = await storage.createTransaction(transactionInput());

    const first = await service.claim({
      transactionId: transaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_ONE,
    });
    expect(first.kind).toBe("claimed");
    if (first.kind !== "claimed") throw new Error("expected a claimed attempt");

    await expect(service.getAttemptByTransactionShareKey({
      transactionId: transaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_ONE,
    })).resolves.toMatchObject({ id: first.attempt.id });
    await expect(service.claim({
      transactionId: transaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_ONE,
    })).resolves.toMatchObject({ kind: "reused", attempt: { id: first.attempt.id } });
    await expect(service.claim({
      transactionId: transaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_TWO,
    })).resolves.toMatchObject({ kind: "conflict", attempt: { id: first.attempt.id } });

    now = new Date("2026-08-06T10:05:00.001Z");
    const replacement = await service.claim({
      transactionId: transaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_TWO,
    });
    expect(replacement).toMatchObject({
      kind: "claimed",
      abandonedAttemptId: first.attempt.id,
    });
    await expect(service.getAttempt(first.attempt.id)).resolves.toMatchObject({
      state: "abandoned",
    });
    await expect(service.claim({
      transactionId: transaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_ONE,
    })).resolves.toMatchObject({ kind: "expired", attempt: { id: first.attempt.id } });
  });

  test("keeps an expired processor-bound attempt exclusive until it is reconciled", async () => {
    const transaction = await storage.createTransaction(transactionInput());
    const claimed = await service.claim({
      transactionId: transaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_ONE,
    });
    if (claimed.kind !== "claimed") throw new Error("expected a claimed attempt");

    await service.attachSession({
      attemptId: claimed.attempt.id,
      processorSessionId: "session-expired",
      processorXId: "xid-expired",
      rawReturnState: RETURN_ONE,
    });
    now = new Date("2026-08-06T10:05:00.001Z");

    await expect(service.claim({
      transactionId: transaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_TWO,
    })).resolves.toMatchObject({
      kind: "expired",
      attempt: {
        id: claimed.attempt.id,
        state: "ready",
        processorSessionId: "session-expired",
      },
    });
    await expect(service.getAttempt(claimed.attempt.id)).resolves.toMatchObject({
      state: "ready",
      processorSessionId: "session-expired",
    });
  });

  test("attaches bounded hashed return state and rejects reused processor identity", async () => {
    const firstTransaction = await storage.createTransaction(transactionInput());
    const firstClaim = await service.claim({
      transactionId: firstTransaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_ONE,
    });
    if (firstClaim.kind !== "claimed") throw new Error("expected first claim");

    now = new Date("2026-08-06T10:00:10.000Z");
    const attached = await service.attachSession({
      attemptId: firstClaim.attempt.id,
      processorSessionId: "session-one",
      processorXId: "xid-one",
      rawReturnState: RETURN_ONE,
    });
    expect(attached).toMatchObject({
      kind: "attached",
      attempt: {
        state: "ready",
        returnStateHash: hashBearerCredential(RETURN_ONE),
      },
    });
    if (attached.kind !== "attached") throw new Error("expected attachment");
    expect(attached.attempt.returnStateHash).not.toBe(RETURN_ONE);
    expect(attached.attempt.returnStateExpiresAt).toEqual(
      new Date("2026-08-06T10:30:00.000Z"),
    );
    await expect(service.attachSession({
      attemptId: firstClaim.attempt.id,
      processorSessionId: "session-one",
      processorXId: "xid-one",
      rawReturnState: RETURN_ONE,
    })).resolves.toMatchObject({ kind: "reused" });
    await expect(service.resolveReturnState(RETURN_ONE)).resolves.toMatchObject({
      kind: "resolved",
      attempt: { id: firstClaim.attempt.id },
    });
    await expect(service.getAttemptByProcessorSessionId("session-one"))
      .resolves.toMatchObject({ id: firstClaim.attempt.id });

    const secondTransaction = await storage.createTransaction(transactionInput());
    const secondClaim = await service.claim({
      transactionId: secondTransaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_TWO,
    });
    if (secondClaim.kind !== "claimed") throw new Error("expected second claim");
    await expect(service.attachSession({
      attemptId: secondClaim.attempt.id,
      processorSessionId: "session-one",
      processorXId: "xid-two",
      rawReturnState: RETURN_TWO,
    })).resolves.toMatchObject({ kind: "conflict" });
  });

  test("atomically finalizes an approved unsplit payment exactly once", async () => {
    const transaction = await storage.createTransaction(transactionInput());
    const claim = await service.claim({
      transactionId: transaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_ONE,
    });
    if (claim.kind !== "claimed") throw new Error("expected claim");
    await service.attachSession({
      attemptId: claim.attempt.id,
      processorSessionId: "session-approved",
      processorXId: "xid-approved",
      rawReturnState: RETURN_ONE,
    });

    await expect(service.claimFinalization(claim.attempt.id, "wrong-session"))
      .resolves.toMatchObject({ kind: "conflict" });
    await expect(service.claimFinalization(claim.attempt.id, "session-approved"))
      .resolves.toMatchObject({ kind: "claimed", attempt: { state: "finalizing" } });

    const finalized = await service.finalize({
      attemptId: claim.attempt.id,
      processorSessionId: "session-approved",
      processorTransactionId: "processor-txn-approved",
      paymentMethod: "card",
      outcome: "approved",
    });
    expect(finalized).toMatchObject({
      kind: "finalized",
      attempt: { state: "approved", outcome: "approved" },
      transaction: {
        id: transaction.id,
        status: "completed",
        windcaveTransactionId: "processor-txn-approved",
        paymentMethod: "card",
      },
      counterIncremented: true,
    });
    const replay = await service.finalize({
      attemptId: claim.attempt.id,
      processorSessionId: "session-approved",
      processorTransactionId: "processor-txn-racing-replay",
      paymentMethod: "wallet",
      outcome: "approved",
    });
    expect(replay).toMatchObject({
      kind: "reused",
      counterIncremented: false,
    });
    await expect(storage.getTransaction(transaction.id)).resolves.toMatchObject({
      windcaveTransactionId: "processor-txn-approved",
      paymentMethod: "card",
    });
    await expect(service.claim({
      transactionId: transaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_ONE,
    })).resolves.toMatchObject({ kind: "terminal", attempt: { state: "approved" } });
  });

  test.each(["declined", "cancelled"] as const)(
    "finalizes %s without a fabricated processor ID or counter",
    async (outcome) => {
      const transaction = await storage.createTransaction(transactionInput());
      const claim = await service.claim({
        transactionId: transaction.id,
        shareIndex: 0,
        idempotencyKey: KEY_ONE,
      });
      if (claim.kind !== "claimed") throw new Error("expected claim");
      await service.attachSession({
        attemptId: claim.attempt.id,
        processorSessionId: `session-${outcome}`,
        processorXId: `xid-${outcome}`,
      });
      await service.claimFinalization(claim.attempt.id, `session-${outcome}`);

      const result = await service.finalize({
        attemptId: claim.attempt.id,
        processorSessionId: `session-${outcome}`,
        processorTransactionId: null,
        outcome,
      });
      expect(result).toMatchObject({
        kind: "finalized",
        attempt: { state: outcome },
        transaction: {
          status: outcome === "cancelled" ? "cancelled" : "failed",
          windcaveTransactionId: null,
        },
        counterIncremented: false,
      });
    },
  );

  test("serializes split configuration without duplicate or zero-cent rows", async () => {
    const transaction = await storage.createTransaction(
      transactionInput({ price: "12.01" }),
    );
    const [first, retry] = await Promise.all([
      storage.createBillSplit(transaction.id, 3),
      storage.createBillSplit(transaction.id, 3),
    ]);
    expect(first).toMatchObject({ id: transaction.id, totalSplits: 3 });
    expect(retry).toMatchObject({ id: transaction.id, totalSplits: 3 });
    const rows = await storage.getSplitPaymentsByTransaction(transaction.id);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.amount)).toEqual(["4.00", "4.00", "4.01"]);

    const tiny = await storage.createTransaction(transactionInput({ price: "0.01" }));
    await expect(storage.createBillSplit(tiny.id, 2)).rejects.toMatchObject({
      code: "BILL_SPLIT_CONFLICT",
      reason: "invalid-count",
    });
  });

  test("binds split settlement to the exact share and preserves the final-cent remainder", async () => {
    const transaction = await storage.createTransaction(transactionInput());
    const configured = await storage.createBillSplit(transaction.id, 3);
    expect(configured).toMatchObject({ isSplit: true, totalSplits: 3 });
    await expect(storage.createBillSplit(transaction.id, 3)).resolves.toMatchObject({
      id: transaction.id,
      totalSplits: 3,
    });
    await expect(storage.createBillSplit(transaction.id, 2)).rejects.toBeInstanceOf(
      BillSplitConflictError,
    );
    await expect(storage.getSplitPaymentsByTransaction(transaction.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ splitIndex: 1, amount: "3.33" }),
        expect.objectContaining({ splitIndex: 2, amount: "3.33" }),
        expect.objectContaining({ splitIndex: 3, amount: "3.34" }),
      ]),
    );

    const declinedShareOne = await service.claim({
      transactionId: transaction.id,
      shareIndex: 1,
      idempotencyKey: KEY_THREE,
    });
    if (declinedShareOne.kind !== "claimed") {
      throw new Error("expected declined share claim");
    }
    await service.attachSession({
      attemptId: declinedShareOne.attempt.id,
      processorSessionId: "session-share-one-declined",
      processorXId: "xid-share-one-declined",
    });
    await service.claimFinalization(
      declinedShareOne.attempt.id,
      "session-share-one-declined",
    );
    await expect(service.finalize({
      attemptId: declinedShareOne.attempt.id,
      processorSessionId: "session-share-one-declined",
      processorTransactionId: null,
      outcome: "declined",
    })).resolves.toMatchObject({
      kind: "finalized",
      attempt: { state: "declined" },
      splitPayment: { splitIndex: 1, status: "pending" },
      transaction: { status: "pending", completedSplits: 0 },
      counterIncremented: false,
    });

    const shareTwo = await service.claim({
      transactionId: transaction.id,
      shareIndex: 2,
      idempotencyKey: KEY_TWO,
    });
    if (shareTwo.kind !== "claimed") throw new Error("expected share two claim");
    await expect(service.claim({
      transactionId: transaction.id,
      shareIndex: 0,
      idempotencyKey: KEY_ONE,
    })).resolves.toEqual({
      kind: "target-conflict",
      reason: "split-target-required",
    });
    await service.attachSession({
      attemptId: shareTwo.attempt.id,
      processorSessionId: "session-share-two",
      processorXId: "xid-share-two",
      rawReturnState: RETURN_TWO,
    });
    await service.claimFinalization(shareTwo.attempt.id, "session-share-two");
    const shareTwoResult = await service.finalize({
      attemptId: shareTwo.attempt.id,
      processorSessionId: "session-share-two",
      processorTransactionId: "processor-share-two",
      paymentMethod: "card",
      outcome: "approved",
      receiptShare: 2,
    });
    expect(shareTwoResult).toMatchObject({
      kind: "finalized",
      splitPayment: {
        splitIndex: 2,
        status: "completed",
        windcaveTransactionId: "processor-share-two",
      },
      transaction: { status: "pending", completedSplits: 1 },
    });
    const afterShareTwo = await storage.getSplitPaymentsByTransaction(transaction.id);
    expect(afterShareTwo.find((split) => split.splitIndex === 1)?.status).toBe("pending");
    expect(afterShareTwo.find((split) => split.splitIndex === 2)?.status).toBe("completed");
    expect(afterShareTwo.find((split) => split.splitIndex === 3)?.status).toBe("pending");
    await expect(storage.createBillSplit(transaction.id, 3)).rejects.toBeInstanceOf(
      BillSplitConflictError,
    );

    const shareOne = await service.claim({
      transactionId: transaction.id,
      shareIndex: 1,
      idempotencyKey: KEY_ONE,
    });
    const shareThree = await service.claim({
      transactionId: transaction.id,
      shareIndex: 3,
      idempotencyKey: KEY_THREE,
    });
    if (shareOne.kind !== "claimed" || shareThree.kind !== "claimed") {
      throw new Error("expected remaining share claims");
    }
    await Promise.all([
      service.attachSession({
        attemptId: shareOne.attempt.id,
        processorSessionId: "session-share-one",
        processorXId: "xid-share-one",
        rawReturnState: RETURN_ONE,
      }),
      service.attachSession({
        attemptId: shareThree.attempt.id,
        processorSessionId: "session-share-three",
        processorXId: "xid-share-three",
        rawReturnState: RETURN_THREE,
      }),
    ]);
    await Promise.all([
      service.claimFinalization(shareOne.attempt.id, "session-share-one"),
      service.claimFinalization(shareThree.attempt.id, "session-share-three"),
    ]);
    const completions = await Promise.all([
      service.finalize({
        attemptId: shareOne.attempt.id,
        processorSessionId: "session-share-one",
        processorTransactionId: "processor-share-one",
        outcome: "approved",
        receiptShare: 1,
      }),
      service.finalize({
        attemptId: shareThree.attempt.id,
        processorSessionId: "session-share-three",
        processorTransactionId: "processor-share-three",
        outcome: "approved",
        receiptShare: 3,
      }),
    ]);
    expect(completions).toEqual([
      expect.objectContaining({ kind: "finalized" }),
      expect.objectContaining({ kind: "finalized" }),
    ]);
    await expect(storage.getTransaction(transaction.id)).resolves.toMatchObject({
      status: "completed",
      completedSplits: 3,
    });
  });
});
