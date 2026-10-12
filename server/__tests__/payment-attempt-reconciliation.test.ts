jest.mock("../database", () => ({
  getDb: () => null,
  isDatabaseConnected: () => false,
}));

import { PaymentAttemptInputError, PaymentAttemptService } from "../payment-attempt-service";
import { MemStorage, type TransactionStorageInput } from "../storage";

/**
 * R2-T6 (plan v2.2 §9.4 "sanitized last reconciliation code/timestamps"; the R2-T4 ADR
 * said R2-T5 writes them, and it did not): every provider query on a retail attempt
 * leaves its outcome as a short sanitized code and the time, so an attempt left
 * reconcilable says why. The code is never provider text; it changes nothing else.
 */

const KEY = "11111111-1111-4111-8111-111111111111";

describe("an attempt's last reconciliation", () => {
  let storage: MemStorage;
  let service: PaymentAttemptService;
  let now: Date;

  beforeEach(() => {
    storage = new MemStorage();
    now = new Date("2026-10-12T10:00:00.000Z");
    service = new PaymentAttemptService(storage, () => new Date(now));
  });

  async function claimed() {
    const transaction = await storage.createTransaction({
      merchantId: 1, itemName: "Durable payment", price: "10.00", status: "pending", paymentMethod: "qr_code", splitEnabled: false,
    } as TransactionStorageInput);
    const claim = await service.claim({ transactionId: transaction.id, shareIndex: 0, idempotencyKey: KEY });
    if (claim.kind !== "claimed") throw new Error("expected a claimed attempt");
    return claim.attempt;
  }

  it("records the code and the time, and nothing else", async () => {
    const attempt = await claimed();
    now = new Date("2026-10-12T10:01:00.000Z");

    const result = await service.recordReconciliation({ attemptId: attempt.id, code: "integrity_mismatch:amount" });

    expect(result.kind).toBe("recorded");
    const after = await storage.getPaymentAttempt(attempt.id);
    expect(after).toEqual({
      ...attempt,
      lastReconciliationCode: "integrity_mismatch:amount",
      lastReconciledAt: new Date("2026-10-12T10:01:00.000Z"),
    });
  });

  it("keeps only the last one", async () => {
    const attempt = await claimed();
    await service.recordReconciliation({ attemptId: attempt.id, code: "pending" });
    now = new Date("2026-10-12T10:05:00.000Z");
    await service.recordReconciliation({ attemptId: attempt.id, code: "approved" });
    expect(await storage.getPaymentAttempt(attempt.id)).toMatchObject({
      lastReconciliationCode: "approved", lastReconciledAt: new Date("2026-10-12T10:05:00.000Z"),
    });
  });

  it("answers not-found for an unknown attempt", async () => {
    await expect(service.recordReconciliation({ attemptId: "33333333-3333-4333-8333-333333333333", code: "pending" }))
      .resolves.toEqual({ kind: "not-found" });
  });

  it.each([
    ["provider text", "Windcave 400: {\"message\":\"declined\"}"],
    ["spaces", "still processing"],
    ["capitals", "Pending"],
    ["an empty code", ""],
    ["more than 64 characters", `a${"b".repeat(64)}`],
  ])("refuses %s as a code", async (_label, code) => {
    const attempt = await claimed();
    // The service validates synchronously, as its other recorders do.
    expect(() => service.recordReconciliation({ attemptId: attempt.id, code })).toThrow(PaymentAttemptInputError);
    expect((await storage.getPaymentAttempt(attempt.id))?.lastReconciliationCode).toBeNull();
  });
});
