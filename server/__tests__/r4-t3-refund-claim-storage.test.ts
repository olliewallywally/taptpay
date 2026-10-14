import { randomUUID } from "node:crypto";
import { MemStorage, type TransactionStorageInput } from "../storage";

/**
 * R4-T3 (docs/decisions/2026-10-14-r4-t3-atomic-refund-claim.md): claim, send intent and settle
 * in MemStorage, held to the same rules as PostgreSQL (scripts/verify-r4-t3-refund-claim-postgres.ts).
 */

const M = 11, OTHER = 12;
let repo: MemStorage, owner: number, otherOwner: number;

let nextUser = 900;
async function user(merchantId: number) {
  const id = nextUser++;
  (repo as any).users.set(id, { id, email: `${randomUUID()}@example.test`, merchantId, role: "merchant", status: "active" });
  return id;
}
async function sale(over: Partial<TransactionStorageInput> & Record<string, unknown> = {}, merchantId = M) {
  const row = await repo.createTransaction({ merchantId, itemName: "Synthetic", price: "20.00", status: "completed",
    paymentMethod: "qr_code", splitEnabled: false, ...over } as TransactionStorageInput);
  (repo as any).transactions.set(row.id, { ...row, windcaveTransactionId: "cap0001", totalRefunded: "0.00", refundableAmount: "20.00", ...over });
  return row.id;
}
const claim = (transactionId: number, over: Record<string, unknown> = {}) => repo.claimRefundOperationForMerchant(M, {
  merchantId: M, userId: owner, transactionId, idempotencyKey: randomUUID(), amountCents: 500, reasonText: "Synthetic", ...over } as any);

beforeEach(async () => {
  repo = new MemStorage();
  owner = await user(M); otherOwner = await user(OTHER);
});

describe("claim", () => {
  it("creates one requested operation with a stable X-ID and reference, and one audit event", async () => {
    const id = await sale();
    const result = await claim(id);
    expect(result.kind).toBe("claimed");
    if (result.kind !== "claimed") return;
    const op = result.operation;
    expect(op).toMatchObject({ state: "requested", status: "pending", amountCents: 500, refundAmount: "5.00", currency: "NZD",
      originalProviderTransactionId: "cap0001", originalShareIndex: 0, refundMethod: "original_payment_method",
      initiatedByUserId: owner, reasonText: "Synthetic", attemptCount: 0, leaseOwner: result.leaseOwner });
    expect(op.processorXId).toMatch(/^[0-9a-f]{32}$/);
    expect(op.merchantReference).toBe(`TAPTR_${op.operationId.replace(/-/g, "")}`);
    expect(op.nextReconciliationAt).toEqual(op.leaseExpiresAt);
    expect(repo.getRefundAuditEventsForTest(op.operationId).map(e => e.eventType)).toEqual(["Refund_Requested"]);
  });

  it("replays the same key and payload, whatever the reason says, and refuses a different payload", async () => {
    const id = await sale(), key = randomUUID();
    const first = await claim(id, { idempotencyKey: key });
    expect((await claim(id, { idempotencyKey: key, reasonText: "Reworded" })).kind).toBe("reused");
    expect((await claim(id, { idempotencyKey: key.toUpperCase() })).kind).toBe("reused");
    expect((await claim(id, { idempotencyKey: key, amountCents: 600 })).kind).toBe("conflict");
    const otherSale = await sale();
    expect((await claim(otherSale, { idempotencyKey: key })).kind).toBe("conflict");
    expect(first.kind).toBe("claimed");
  });

  it("refuses another key while a refund on the sale is live (one live refund per sale)", async () => {
    const id = await sale();
    await claim(id);
    expect(await claim(id)).toEqual({ kind: "in-progress" });
  });

  it("refuses what cannot be refunded, before creating anything", async () => {
    expect(await claim(await sale({ status: "pending" }))).toEqual({ kind: "not-refundable", reason: "status" });
    expect(await claim(await sale({ isSplit: true }))).toEqual({ kind: "not-refundable", reason: "split" });
    expect(await claim(await sale({ windcaveTransactionId: null }))).toEqual({ kind: "not-refundable", reason: "capture_missing" });
    expect(await claim(await sale({ windcaveTransactionId: "WC_1.5" }))).toEqual({ kind: "not-refundable", reason: "capture_invalid" });
    expect(await claim(await sale({}, OTHER))).toEqual({ kind: "not-found" });
    expect(await claim(await sale(), { userId: otherOwner })).toEqual({ kind: "not-found" });
    expect(await claim(await sale({ totalRefunded: "18.00" }), { amountCents: 201 })).toEqual({ kind: "insufficient", remainingCents: 200 });
    expect((await claim(await sale({ totalRefunded: "18.00" }), { amountCents: 200 })).kind).toBe("claimed");
  });

  it("counts live operations in the remaining amount (the formula, below the in-progress rule)", async () => {
    const id = await sale();
    expect(repo.remainingRefundableCentsForTest(id)).toBe(2000);
    await claim(id, { amountCents: 750 });
    expect(repo.remainingRefundableCentsForTest(id)).toBe(1250);
  });
});

describe("send intent", () => {
  it("moves requested to submitted once, for the lease holder only", async () => {
    const id = await sale();
    const claimed = await claim(id); if (claimed.kind !== "claimed") throw new Error("fixture");
    const op = claimed.operation;
    expect((await repo.markRefundSubmittedForMerchant(op.operationId, M, randomUUID(), "uat")).kind).toBe("not-sent");
    const sent = await repo.markRefundSubmittedForMerchant(op.operationId, M, claimed.leaseOwner, "uat");
    expect(sent.kind).toBe("submitted");
    expect((sent as any).operation).toMatchObject({ state: "submitted", status: "processing", attemptCount: 1 });
    expect((await repo.markRefundSubmittedForMerchant(op.operationId, M, claimed.leaseOwner, "uat")).kind).toBe("not-sent");
    expect(repo.getRefundAuditEventsForTest(op.operationId).map(e => e.eventType)).toEqual(["Refund_Requested", "Refund_Submitted"]);
  });

  it("lets another request take over a requested operation only after its lease expired", async () => {
    const id = await sale();
    const claimed = await claim(id); if (claimed.kind !== "claimed") throw new Error("fixture");
    const op = claimed.operation;
    (repo as any).refunds.get(op.id).leaseExpiresAt = new Date(Date.now() - 1);
    const taken = await repo.markRefundSubmittedForMerchant(op.operationId, M, randomUUID(), "uat");
    expect(taken.kind).toBe("submitted");
    expect(repo.getRefundAuditEventsForTest(op.operationId).at(-1)?.payload).toMatchObject({ takeover: true });
  });

  it("never sends in another environment, or for another business", async () => {
    const id = await sale();
    const claimed = await claim(id); if (claimed.kind !== "claimed") throw new Error("fixture");
    expect((await repo.markRefundSubmittedForMerchant(claimed.operation.operationId, M, claimed.leaseOwner, "production")).kind).toBe("not-sent");
    expect((await repo.markRefundSubmittedForMerchant(claimed.operation.operationId, OTHER, claimed.leaseOwner, "uat")).kind).toBe("not-found");
  });
});

describe("settle", () => {
  async function submitted(over: Record<string, unknown> = {}) {
    const id = await sale(over);
    const claimed = await claim(id); if (claimed.kind !== "claimed") throw new Error("fixture");
    await repo.markRefundSubmittedForMerchant(claimed.operation.operationId, M, claimed.leaseOwner, "uat");
    return { id, op: claimed.operation, owner: claimed.leaseOwner };
  }

  it("refunded: succeeded, totals and status updated in the same step", async () => {
    const { id, op, owner: lease } = await submitted();
    const settled = await repo.settleRefundOperationForMerchant(op.operationId, M, lease, { kind: "refunded", refundTransactionId: "ref001" });
    expect(settled.kind).toBe("settled");
    expect((settled as any).operation).toMatchObject({ state: "succeeded", status: "completed", providerRefundTransactionId: "ref001",
      leaseOwner: null, nextReconciliationAt: null, completedAt: null, windcaveRefundId: null });
    expect(await repo.getTransaction(id)).toMatchObject({ totalRefunded: "5.00", refundableAmount: "15.00", status: "partially_refunded" });
  });

  it("a full refund marks the sale refunded, recomputed from the totals", async () => {
    const { id, op, owner: lease } = await submitted({ totalRefunded: "15.00" });
    await repo.settleRefundOperationForMerchant(op.operationId, M, lease, { kind: "refunded", refundTransactionId: "ref002" });
    expect(await repo.getTransaction(id)).toMatchObject({ totalRefunded: "20.00", refundableAmount: "0.00", status: "refunded" });
  });

  it("declined: failed, totals untouched", async () => {
    const { id, op, owner: lease } = await submitted();
    const settled = await repo.settleRefundOperationForMerchant(op.operationId, M, lease, { kind: "declined" });
    expect((settled as any).operation).toMatchObject({ state: "failed", status: "failed", lastErrorCode: "provider_declined" });
    expect(await repo.getTransaction(id)).toMatchObject({ totalRefunded: "0.00", status: "completed" });
  });

  it("a refunded reply with an unusable ID, or a duplicate ID, is parked, never failed, and moves no totals", async () => {
    const first = await submitted();
    await repo.settleRefundOperationForMerchant(first.op.operationId, M, first.owner, { kind: "refunded", refundTransactionId: "dup001" });
    const second = await submitted();
    const dup = await repo.settleRefundOperationForMerchant(second.op.operationId, M, second.owner, { kind: "refunded", refundTransactionId: "dup001" });
    expect((dup as any).operation).toMatchObject({ state: "unknown", nextReconciliationAt: null, lastErrorCode: "provider_refund_id_invalid" });
    expect((await repo.getTransaction(second.id))?.totalRefunded).toBe("0.00");
    const third = await submitted();
    const bad = await repo.settleRefundOperationForMerchant(third.op.operationId, M, third.owner, { kind: "refunded", refundTransactionId: "cap0001" });
    expect((bad as any).operation).toMatchObject({ state: "unknown", nextReconciliationAt: null });
  });

  it("pending keeps its ID and is scheduled; a thrown call is scheduled unknown", async () => {
    const one = await submitted();
    const pending = await repo.settleRefundOperationForMerchant(one.op.operationId, M, one.owner, { kind: "pending", refundTransactionId: "pend01" });
    expect((pending as any).operation).toMatchObject({ state: "unknown", status: "processing", providerRefundTransactionId: "pend01", leaseOwner: null });
    expect((pending as any).operation?.nextReconciliationAt).toBeInstanceOf(Date);
    const two = await submitted();
    const thrown = await repo.settleRefundOperationForMerchant(two.op.operationId, M, two.owner, { kind: "thrown" });
    expect((thrown as any).operation).toMatchObject({ state: "unknown", lastErrorCode: "provider_error" });
  });

  it("changes nothing for another lease holder or a finished operation", async () => {
    const { op, owner: lease } = await submitted();
    expect((await repo.settleRefundOperationForMerchant(op.operationId, M, randomUUID(), { kind: "declined" })).kind).toBe("unchanged");
    await repo.settleRefundOperationForMerchant(op.operationId, M, lease, { kind: "declined" });
    expect((await repo.settleRefundOperationForMerchant(op.operationId, M, lease, { kind: "refunded", refundTransactionId: "r9" })).kind).toBe("unchanged");
  });
});

describe("the legacy path is fenced (B-1)", () => {
  it("reserve, release and update-status refuse a sale with any operation, live or finished", async () => {
    const id = await sale();
    const claimed = await claim(id); if (claimed.kind !== "claimed") throw new Error("fixture");
    await repo.markRefundSubmittedForMerchant(claimed.operation.operationId, M, claimed.leaseOwner, "uat");
    await repo.settleRefundOperationForMerchant(claimed.operation.operationId, M, claimed.leaseOwner, { kind: "refunded", refundTransactionId: "fin001" });
    expect(await repo.releaseRefundAmountForMerchant(id, M, 5)).toBe(false);
    expect(await repo.reserveRefundAmountForMerchant(id, M, 1)).toBeNull();
    expect(await repo.updateRefundStatusForMerchant(claimed.operation.id, M, "failed")).toBeUndefined();
    expect(await repo.getTransaction(id)).toMatchObject({ totalRefunded: "5.00", status: "partially_refunded" });
  });

  it("legacy reserve and release still work on a sale without operations", async () => {
    const id = await sale();
    expect(await repo.reserveRefundAmountForMerchant(id, M, 2)).not.toBeNull();
    expect(await repo.releaseRefundAmountForMerchant(id, M, 2)).toBe(true);
  });
});
