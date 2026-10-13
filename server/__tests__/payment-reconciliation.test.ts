import { randomUUID } from "node:crypto";
import { PaymentReconciliationWorker, evidenceMatchesExpectation } from "../payment-reconciliation";
import { requestFingerprint, invoiceShareCents } from "../durable-payment-contract";

const expected = { sessionId: "session-A", processorXId: "x-A", amountCents: 1001,
  currency: "NZD", reference: "INV-A-SHARE-1", environment: "uat" as const, providerAccount: "test-account" };
const evidence = { ...expected, kind: "verified" as const, outcome: "approved" as const,
  transactionId: "tx-A", transactionCount: 1 as const };

describe("R3 verified reconciliation boundary", () => {
  test.each(["sessionId", "processorXId", "amountCents", "currency", "reference", "environment", "providerAccount"] as const)(
    "%s mismatch cannot settle", (field) => {
      expect(evidenceMatchesExpectation(expected, { ...evidence, [field]: field === "amountCents" ? 1000 : "different" } as any)).toBe(false);
    });
  // Owner decision OI-2 (2026-10-13): the count is information, not a refusal.
  test("several provider transactions can settle; a count that is not a positive integer, or boolean-only approval, cannot", () => {
    expect(evidenceMatchesExpectation(expected, { ...evidence, transactionCount: 2 } as any)).toBe(true);
    for (const transactionCount of [0, -1, 1.5, Number.NaN])
      expect(evidenceMatchesExpectation(expected, { ...evidence, transactionCount } as any)).toBe(false);
    expect(evidenceMatchesExpectation(expected, { success: true, approved: true } as any)).toBe(false);
  });
  test("exact split cents sum to the invoice, including small remainder shares", () => {
    expect([1,2,3].map((share) => invoiceShareCents(1001, 3, share))).toEqual([334,334,333]);
    expect(() => invoiceShareCents(2, 3, 3)).toThrow();
  });
  test("fingerprint changes with money, share, scope or account, and is stable for property order", () => {
    const base = { ...expected, merchantId: 1, invoiceId: randomUUID(), shareIndex: 1 };
    expect(requestFingerprint(base)).toBe(requestFingerprint(Object.fromEntries(Object.entries(base).reverse())));
    for (const change of [{amountCents:1000},{shareIndex:2},{merchantId:2},{providerAccount:"other"}])
      expect(requestFingerprint({ ...base, ...change })).not.toBe(requestFingerprint(base));
  });
  test.each(["pending", "unknown", "unavailable"] as const)("%s schedules retry without settlement", async (kind) => {
    const repository = fakeRepository();
    const worker = new PaymentReconciliationWorker(repository as any, { query: async () => ({kind}) } as any, () => now);
    await worker.runOne(randomUUID());
    expect(repository.finalize).not.toHaveBeenCalled();
    expect(repository.finishInbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({status:"retry",code:`provider_${kind}`}),now);
  });
  test("integrity mismatch is dead-lettered without money mutation, with R2-T6's sanitized event", async () => {
    const repository = fakeRepository(), audit = jest.fn();
    await new PaymentReconciliationWorker(repository as any, {query: async () => ({...evidence,amountCents:1000})} as any,()=>now,()=>0,audit).runOne(randomUUID());
    expect(repository.finalize).not.toHaveBeenCalled();
    expect(repository.finishInbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({status:"dead_letter",code:"integrity_mismatch"}),now);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith("PROVIDER_OUTCOME_MISMATCH", {field:"amount"});
  });
  // H-3: the worker's mismatch path keeps R2-T6's signals: the event and the retail attempt's code.
  test("a provider mismatch on a retail binding records integrity_mismatch:<field> on the attempt", async () => {
    const repository = fakeRepository(), audit = jest.fn(), paymentAttemptId = randomUUID();
    repository.resolveSession.mockResolvedValue({...expected, paymentAttemptId} as any);
    await new PaymentReconciliationWorker(repository as any, {query: async () => ({kind:"mismatch",field:"reference"})} as any,()=>now,()=>0,audit).runOne(randomUUID());
    expect(repository.recordReconciliation).toHaveBeenCalledWith(expect.objectContaining({paymentAttemptId}), "integrity_mismatch:reference", now);
    expect(audit).toHaveBeenCalledWith("PROVIDER_OUTCOME_MISMATCH", {field:"reference"});
    expect(repository.finalize).not.toHaveBeenCalled();
    expect(repository.finishInbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({status:"dead_letter",code:"integrity_mismatch"}),now);
  });
  test("a failed code write still dead-letters the mismatch, never retries it", async () => {
    const repository = fakeRepository();
    repository.recordReconciliation.mockRejectedValue(new Error("synthetic"));
    await new PaymentReconciliationWorker(repository as any, {query: async () => ({kind:"mismatch",field:"amount"})} as any,()=>now,()=>0,jest.fn()).runOne(randomUUID());
    expect(repository.finishInbox).toHaveBeenCalledTimes(1);
    expect(repository.finishInbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({status:"dead_letter",code:"integrity_mismatch"}),now);
  });
  test("evidence with several transactions settles and completes the inbox with its transaction", async () => {
    const repository = fakeRepository();
    await new PaymentReconciliationWorker(repository as any, {query: async () => ({...evidence,transactionCount:2})} as any,()=>now,()=>0,jest.fn()).runOne(randomUUID());
    expect(repository.finalize).toHaveBeenCalledTimes(1);
    expect(repository.finishInbox).toHaveBeenCalledWith(expect.anything(), {status:"complete",transactionId:"tx-A"},now);
  });
  test("finalizer commit precedes inbox completion; failed completion is replayable", async () => {
    const repository = fakeRepository();
    const order: string[] = [];
    repository.finalize.mockImplementation(async () => {order.push("commit");return {kind:"finalized"};});
    repository.finishInbox.mockImplementation(async () => {order.push("complete");throw new Error("synthetic crash");});
    await new PaymentReconciliationWorker(repository as any,{query:async()=>evidence},()=>now).runOne(randomUUID());
    expect(order[0]).toBe("commit");
    expect(order[1]).toBe("complete");
  });
});
const now=new Date("2026-10-12T03:00:00Z");
function fakeRepository() {
  return {claimInbox:jest.fn(async()=>({id:randomUUID(),sessionId:expected.sessionId,owner:randomUUID(),
      attemptCount:1,firstReceivedAt:now,leaseExpiresAt:new Date(now.getTime()+60000)})),
    resolveSession:jest.fn(async()=>({...expected,invoiceAttemptId:randomUUID()})),
    finalize:jest.fn(async()=>({kind:"finalized"})),
    recordReconciliation:jest.fn(async()=>undefined),
    finishInbox:jest.fn(async()=>true)};
}
