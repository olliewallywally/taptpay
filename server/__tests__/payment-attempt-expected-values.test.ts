jest.mock("../database", () => ({
  getDb: () => null,
  isDatabaseConnected: () => false,
}));

import { PaymentAttemptInputError, PaymentAttemptService } from "../payment-attempt-service";
import { MemStorage, type TransactionStorageInput } from "../storage";

/**
 * R2-T4 (plan v2.2 §9.4; ADR 2026-10-12): an attempt's expected provider values are
 * recorded before its provider session exists, cannot change once a session is
 * attached, and are required to attach one. Finalization stores the provider
 * transaction ID, which no second attempt may claim.
 */

const KEY_ONE = "11111111-1111-4111-8111-111111111111";
const KEY_TWO = "22222222-2222-4222-8222-222222222222";
const RETURN_ONE = "A".repeat(43);
const RETURN_TWO = "B".repeat(43);

function transactionInput(): TransactionStorageInput {
  return {
    merchantId: 1,
    itemName: "Durable payment",
    price: "10.00",
    status: "pending",
    paymentMethod: "qr_code",
    splitEnabled: false,
  } as TransactionStorageInput;
}

describe("expected provider values on a payment attempt", () => {
  let storage: MemStorage;
  let service: PaymentAttemptService;
  let now: Date;

  beforeEach(() => {
    storage = new MemStorage();
    now = new Date("2026-10-12T10:00:00.000Z");
    service = new PaymentAttemptService(storage, () => new Date(now));
  });

  async function claimed(key = KEY_ONE) {
    const transaction = await storage.createTransaction(transactionInput());
    const claim = await service.claim({ transactionId: transaction.id, shareIndex: 0, idempotencyKey: key });
    if (claim.kind !== "claimed") throw new Error("expected a claimed attempt");
    return claim.attempt;
  }

  function expected(attemptId: string, overrides: Partial<Parameters<PaymentAttemptService["recordExpectedValues"]>[0]> = {}) {
    return {
      attemptId,
      amountCents: 1000,
      currency: "NZD",
      merchantReference: `TAPT_${attemptId}`,
      providerEnvironment: "uat" as const,
      ...overrides,
    };
  }

  test("records them on a claimed attempt that has no session yet", async () => {
    const attempt = await claimed();
    const result = await service.recordExpectedValues(expected(attempt.id));
    expect(result).toMatchObject({
      kind: "recorded",
      attempt: {
        id: attempt.id,
        expectedAmountCents: 1000,
        expectedCurrency: "NZD",
        expectedMerchantReference: `TAPT_${attempt.id}`,
        providerEnvironment: "uat",
        processorSessionId: null,
      },
    });
  });

  test("is idempotent for the same values and refuses different ones", async () => {
    const attempt = await claimed();
    await service.recordExpectedValues(expected(attempt.id));
    await expect(service.recordExpectedValues(expected(attempt.id))).resolves.toMatchObject({ kind: "reused" });
    for (const change of [
      { amountCents: 1001 },
      { currency: "AUD" },
      { merchantReference: "TAPT_other" },
      { providerEnvironment: "production" as const },
    ]) {
      await expect(service.recordExpectedValues(expected(attempt.id, change))).resolves.toMatchObject({ kind: "conflict" });
    }
    await expect(service.getAttempt(attempt.id)).resolves.toMatchObject({ expectedAmountCents: 1000, expectedCurrency: "NZD" });
  });

  test("refuses to attach a session before they are recorded", async () => {
    const attempt = await claimed();
    await expect(service.attachSession({
      attemptId: attempt.id,
      processorSessionId: "session-one",
      processorXId: "xid-one",
      rawReturnState: RETURN_ONE,
    })).resolves.toMatchObject({ kind: "expected-values-missing" });
    await expect(service.getAttempt(attempt.id)).resolves.toMatchObject({ state: "claiming", processorSessionId: null });
  });

  test("cannot change them once a session is attached", async () => {
    const attempt = await claimed();
    await service.recordExpectedValues(expected(attempt.id));
    await expect(service.attachSession({
      attemptId: attempt.id,
      processorSessionId: "session-one",
      processorXId: "xid-one",
      rawReturnState: RETURN_ONE,
    })).resolves.toMatchObject({ kind: "attached" });
    await expect(service.recordExpectedValues(expected(attempt.id))).resolves.toMatchObject({ kind: "reused" });
    await expect(service.recordExpectedValues(expected(attempt.id, { amountCents: 5 }))).resolves.toMatchObject({ kind: "conflict" });
  });

  test("refuses to record them on an attempt the old code attached without them", async () => {
    // An attempt attached before the migration (no expected values) stays as it is.
    const attempt = await claimed();
    const internal = (storage as unknown as { paymentAttempts: Map<string, typeof attempt> }).paymentAttempts;
    internal.set(attempt.id, { ...attempt, state: "ready", processorSessionId: "legacy-session", processorXId: "legacy-xid" });
    await expect(service.recordExpectedValues(expected(attempt.id))).resolves.toMatchObject({ kind: "conflict" });
  });

  test("answers an unknown attempt as not found", async () => {
    await expect(service.recordExpectedValues(expected("44444444-4444-4444-8444-444444444444"))).resolves.toEqual({ kind: "not-found" });
  });

  it.each([
    ["a negative amount", { amountCents: -1 }, "amountCents"],
    ["a fractional amount", { amountCents: 10.5 }, "amountCents"],
    ["an unsafe amount", { amountCents: Number.MAX_SAFE_INTEGER + 1 }, "amountCents"],
    ["a lowercase currency", { currency: "nzd" }, "currency"],
    ["an empty reference", { merchantReference: "" }, "merchantReference"],
    ["an over-long reference", { merchantReference: "x".repeat(65) }, "merchantReference"],
    ["another environment", { providerEnvironment: "simulation" as never }, "providerEnvironment"],
  ])("rejects %s before touching storage", async (_label, change, field) => {
    // Like the service's other inputs, an invalid one throws before any storage call.
    const attempt = await claimed();
    let thrown: unknown;
    try {
      void service.recordExpectedValues(expected(attempt.id, change));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PaymentAttemptInputError);
    expect(thrown).toMatchObject({ field });
    await expect(service.getAttempt(attempt.id)).resolves.toMatchObject({ expectedAmountCents: null });
  });

  async function readyForFinalization(key: string, session: string, xid: string, returnState: string) {
    const attempt = await claimed(key);
    await service.recordExpectedValues(expected(attempt.id));
    await service.attachSession({ attemptId: attempt.id, processorSessionId: session, processorXId: xid, rawReturnState: returnState });
    await service.claimFinalization(attempt.id, session);
    return attempt;
  }

  test("finalization stores the provider transaction ID on the attempt", async () => {
    const attempt = await readyForFinalization(KEY_ONE, "session-one", "xid-one", RETURN_ONE);
    const result = await service.finalize({
      attemptId: attempt.id,
      processorSessionId: "session-one",
      processorTransactionId: "0000000c00000001",
      paymentMethod: "card",
      outcome: "approved",
      receiptShare: null,
    });
    expect(result).toMatchObject({ kind: "finalized", attempt: { providerTransactionId: "0000000c00000001" } });
  });

  test("a declined finalization stores no provider transaction ID", async () => {
    const attempt = await readyForFinalization(KEY_ONE, "session-one", "xid-one", RETURN_ONE);
    const result = await service.finalize({
      attemptId: attempt.id,
      processorSessionId: "session-one",
      processorTransactionId: null,
      paymentMethod: "card",
      outcome: "declined",
      receiptShare: null,
    });
    expect(result).toMatchObject({ kind: "finalized", attempt: { providerTransactionId: null } });
  });

  test("a second attempt cannot be finalized with a provider transaction already recorded", async () => {
    const first = await readyForFinalization(KEY_ONE, "session-one", "xid-one", RETURN_ONE);
    await service.finalize({
      attemptId: first.id, processorSessionId: "session-one", processorTransactionId: "0000000c00000001",
      paymentMethod: "card", outcome: "approved", receiptShare: null,
    });
    const second = await readyForFinalization(KEY_TWO, "session-two", "xid-two", RETURN_TWO);
    await expect(service.finalize({
      attemptId: second.id, processorSessionId: "session-two", processorTransactionId: "0000000c00000001",
      paymentMethod: "card", outcome: "approved", receiptShare: null,
    })).resolves.toMatchObject({ kind: "conflict" });
    await expect(service.getAttempt(second.id)).resolves.toMatchObject({ state: "finalizing", providerTransactionId: null });
  });
});
