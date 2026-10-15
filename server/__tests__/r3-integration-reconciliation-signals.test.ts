import { randomUUID } from "node:crypto";
import { PaymentReconciliationWorker } from "../payment-reconciliation";
import { createWindcaveReconciliationProvider } from "../windcave-reconciliation-provider";

/**
 * R3 integration (docs/evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md), carried from
 * the R2 branch's OI-2 and H-3: a decline's evidence does not depend on the order Windcave lists
 * its transactions in, and a mismatch keeps R2-T6's field-level signal on the worker path.
 */

const now = new Date("2026-10-14T10:00:00Z");
const expected = { sessionId: "session-A", processorXId: "persisted-xid", amountCents: 1001, currency: "NZD",
  reference: "invoice-share-A", environment: "uat" as const, providerAccount: "synthetic-account" };
const context = { providerEnvironment: "uat" as const, accountUsername: "synthetic-account" };
const transaction = { id: "transaction-A", authorised: false, type: "purchase", amount: "10.01", currency: "NZD",
  merchantReference: "invoice-share-A", sessionId: "session-A", username: "synthetic-account" };
const provider = (transactions: unknown[]) => createWindcaveReconciliationProvider(
  { querySession: async () => ({ kind: "reply" as const, body: { id: "session-A", state: "complete", transactions } }) }, context);

test("OI-2: a decline names the same transaction whatever order the reply lists them in", async () => {
  const one = { ...transaction, id: "transaction-A" }, two = { ...transaction, id: "transaction-B" };
  const forward = await provider([one, two]).query(expected), backward = await provider([two, one]).query(expected);
  expect(forward).toMatchObject({ kind: "verified", outcome: "declined" });
  expect(backward).toMatchObject({ kind: "verified", outcome: "declined" });
  expect((forward as any).transactionId).toBe((backward as any).transactionId);
  const refOne = await provider([one, two]).discoverReference!("session-A"), refTwo = await provider([two, one]).discoverReference!("session-A");
  expect(refOne).toBe(refTwo);
});

test.each([
  ["amount", { amount: "10.00" }], ["currency", { currency: "AUD" }], ["reference", { merchantReference: "other" }],
] as const)("H-3: a %s mismatch names its field and never a value", async (field, patch) => {
  expect(await provider([{ ...transaction, authorised: true, ...patch }]).query(expected)).toEqual({ kind: "mismatch", field });
});

test.each([[{ environment: "production" as const }, "environment"], [{ providerAccount: "other" }, "account"]] as const)(
  "H-3: a persisted %p mismatch names its field", async (patch, field) => {
    expect(await provider([transaction]).query({ ...expected, ...patch })).toEqual({ kind: "mismatch", field });
  });

test("H-3: the worker raises one PROVIDER_OUTCOME_MISMATCH with the field and records it on the attempt", async () => {
  const claim = { id: randomUUID(), sessionId: expected.sessionId, owner: randomUUID(), attemptCount: 1, firstReceivedAt: now, leaseExpiresAt: new Date(now.getTime() + 60000) };
  const repository = { claimInbox: jest.fn(async () => claim), resolveSession: jest.fn(async () => ({ ...expected, paymentAttemptId: randomUUID() })),
    finalize: jest.fn(), finishInbox: jest.fn(async () => true) };
  const audit = jest.fn();
  await new PaymentReconciliationWorker(repository as any, { query: async () => ({ kind: "mismatch", field: "amount" }) } as any,
    () => now, () => 0, undefined, audit).runOne(randomUUID());
  expect(audit).toHaveBeenCalledWith("PROVIDER_OUTCOME_MISMATCH", { field: "amount" });
  expect(repository.finishInbox).toHaveBeenCalledWith(claim,
    expect.objectContaining({ status: "dead_letter", code: "integrity_mismatch", attemptCode: "integrity_mismatch:amount" }), now);
  expect(repository.finalize).not.toHaveBeenCalled();
});

test("H-3: verified evidence the worker's own re-check refuses is reported under its field", async () => {
  const claim = { id: randomUUID(), sessionId: expected.sessionId, owner: randomUUID(), attemptCount: 1, firstReceivedAt: now, leaseExpiresAt: new Date(now.getTime() + 60000) };
  const repository = { claimInbox: jest.fn(async () => claim), resolveSession: jest.fn(async () => ({ ...expected, paymentAttemptId: randomUUID() })),
    finalize: jest.fn(), finishInbox: jest.fn(async () => true) };
  const audit = jest.fn();
  const evidence = { ...expected, amountCents: 1000, kind: "verified", outcome: "approved", transactionId: "tx-A", transactionCount: 1 };
  await new PaymentReconciliationWorker(repository as any, { query: async () => evidence } as any, () => now, () => 0, undefined, audit).runOne(randomUUID());
  expect(audit).toHaveBeenCalledWith("PROVIDER_OUTCOME_MISMATCH", { field: "amount" });
});
