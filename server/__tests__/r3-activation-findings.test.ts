import { randomUUID } from "node:crypto";
import { readPaymentDurabilityPreflight } from "../payment-durability-preflight";
import { createRetailReconciliationFinalizer } from "../retail-reconciliation-adapter";
import { PaymentReconciliationWorker } from "../payment-reconciliation";
import { PaymentAttemptService } from "../payment-attempt-service";
import { MemStorage, type TransactionStorageInput } from "../storage";

/**
 * The merge review's latent R3 findings (docs/evidence/remediation-v2-2/r3/R2-R3-MERGE-REVIEW-2026-10-13.md),
 * fixed before the worker is ever switched on. The worker stays unmounted.
 */

const now = new Date("2026-10-13T10:00:00Z");
const binding = { sessionId: "session-A", processorXId: "x-A", amountCents: 1001, currency: "NZD", reference: "TAPT_A",
  environment: "uat" as const, providerAccount: "configured-account", paymentAttemptId: randomUUID() };
const claim = { id: randomUUID(), sessionId: "session-A", owner: randomUUID(), attemptCount: 1, firstReceivedAt: now, leaseExpiresAt: new Date(now.getTime() + 60000) };

describe("H-1 / D2: the retail adapter speaks R2's representation", () => {
  function service() {
    const finalize = jest.fn(async (_input: any) => ({ kind: "finalized" as const, attempt: {} as any, transaction: {} as any, splitPayment: null, counterIncremented: false }));
    return { finalize, getAttempt: jest.fn(async () => ({ id: binding.paymentAttemptId, shareIndex: 0 })) };
  }
  it("a decline carries no provider transaction into the sale's money columns", async () => {
    const fake = service();
    await createRetailReconciliationFinalizer(fake as any)(binding, { ...binding, kind: "verified", outcome: "declined", transactionId: "tx-declined", transactionCount: 1 }, claim);
    expect(fake.finalize.mock.calls[0][0]).toMatchObject({ outcome: "declined", processorTransactionId: null });
  });
  it("an approval carries its transaction, and both carry the account the binding resolved", async () => {
    const fake = service();
    await createRetailReconciliationFinalizer(fake as any)(binding, { ...binding, kind: "verified", outcome: "approved", transactionId: "tx-approved", transactionCount: 1 }, claim);
    expect(fake.finalize.mock.calls[0][0]).toMatchObject({ processorTransactionId: "tx-approved", reconciliation: { expectedProviderAccount: "configured-account" } });
  });
});

describe("preflight counts R2-recorded attempts as complete (Option A)", () => {
  it("asks only R2's columns, even once 0037's R3-only columns exist", async () => {
    const sql: string[] = [];
    const client = { query: async (text: string) => { sql.push(text); return { rows: [{ n: 0, yes: true }] }; } };
    await readPaymentDurabilityPreflight(client);
    const missing = sql.find(text => text.includes("expected_amount_cents IS NULL"))!;
    expect(missing).toBeDefined();
    expect(missing).not.toContain("expected_provider_account");
    expect(missing).not.toContain("request_fingerprint");
  });
});

describe("MemStorage attach matches PostgreSQL", () => {
  let repo: MemStorage, service: PaymentAttemptService, clock: Date;
  beforeEach(() => { repo = new MemStorage(); clock = new Date(now); service = new PaymentAttemptService(repo, () => new Date(clock)); });
  async function recorded() {
    const sale = await repo.createTransaction({ merchantId: 11, itemName: "Synthetic", price: "10.00", status: "pending", paymentMethod: "qr_code", splitEnabled: false } as TransactionStorageInput);
    const claimed = await service.claim({ transactionId: sale.id, shareIndex: 0, idempotencyKey: randomUUID() });
    if (claimed.kind !== "claimed") throw new Error("fixture_claim");
    await service.recordExpectedValues({ attemptId: claimed.attempt.id, amountCents: 1000, currency: "NZD", merchantReference: `TAPT_${claimed.attempt.id}`, providerEnvironment: "uat" });
    return claimed.attempt;
  }
  it("a pre-set X-ID refuses another", async () => {
    const attempt = await recorded();
    (repo as any).paymentAttempts.get(attempt.id).processorXId = "preset";
    await expect(service.attachSession({ attemptId: attempt.id, processorSessionId: "s-1", processorXId: "other" })).resolves.toMatchObject({ kind: "conflict" });
  });
  it("an attempt carrying send intent attaches after its lease", async () => {
    const attempt = await recorded();
    (repo as any).paymentAttempts.get(attempt.id).sendStartedAt = new Date(now);
    clock = new Date(now.getTime() + 300_001);
    await expect(service.attachSession({ attemptId: attempt.id, processorSessionId: "s-1", processorXId: "x-1" })).resolves.toMatchObject({ kind: "attached" });
  });
});

describe("D4: every dead-letter raises one sanitized signal", () => {
  function repository(settlement: any) {
    return {
      claimInbox: jest.fn(async () => claim), resolveSession: jest.fn(async () => binding),
      finalize: jest.fn(async () => settlement), finishInbox: jest.fn(async () => true), recordReconciliation: jest.fn(async () => undefined),
    };
  }
  it("a settlement conflict", async () => {
    const audit = jest.fn();
    await new PaymentReconciliationWorker(repository({ kind: "conflict" }) as any,
      { query: async () => ({ ...binding, kind: "verified", outcome: "approved", transactionId: "tx-1", transactionCount: 1 }) } as any, () => now, () => 0, audit).runOne(randomUUID());
    expect(audit).toHaveBeenCalledWith("PAYMENT_RECONCILIATION_DEAD_LETTER", { code: "settlement_conflict" });
  });
  it("retries exhausted, naming the last transient cause, never an identity", async () => {
    const audit = jest.fn(), repo = repository({ kind: "finalized" });
    repo.claimInbox.mockResolvedValue({ ...claim, attemptCount: 20 });
    await new PaymentReconciliationWorker(repo as any, { query: async () => ({ kind: "pending" }) } as any, () => now, () => 0, audit).runOne(randomUUID());
    expect(audit).toHaveBeenCalledWith("PAYMENT_RECONCILIATION_DEAD_LETTER", { code: "retry_exhausted", cause: "provider_pending" });
    expect(JSON.stringify(audit.mock.calls)).not.toContain("session-A");
  });
});
