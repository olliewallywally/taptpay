import { verifyWindcaveOutcome, type WindcaveExpectedOutcome } from "../windcave-verify";
import type { NormalizedTransaction, SessionQueryResult } from "../windcave-query";

/**
 * R2-T5 (plan v2.2 §9.5): a provider outcome counts only when it matches what the
 * payment expected — session, amount in cents, currency, merchant reference, provider
 * environment and (when the reply names one) provider account. Anything else is
 * pending, unverifiable or a mismatch, and none of those may settle money.
 */

const SESSION = "0000120000000000a1b2c3d4e5f60718";
const CONTEXT = { providerEnvironment: "uat" as const, accountUsername: "SyntheticUser" };
const EXPECTED: WindcaveExpectedOutcome = {
  sessionId: SESSION,
  amountCents: 1234,
  currency: "NZD",
  merchantReference: "TAPT_synthetic",
  providerEnvironment: "uat",
};

function tx(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  return {
    id: "0000000c00000001",
    authorised: true,
    type: "purchase",
    amountCents: 1234,
    currency: "NZD",
    merchantReference: "TAPT_synthetic",
    sessionId: SESSION,
    username: "SyntheticUser",
    ...overrides,
  };
}

const approved = (transaction = tx()): SessionQueryResult =>
  ({ kind: "approved", sessionId: SESSION, transactionCount: 1, transaction, transactions: [transaction] });
const declined = (transactions: NormalizedTransaction[]): SessionQueryResult =>
  ({ kind: "declined", sessionId: SESSION, transactionCount: transactions.length, transactions });

describe("verifyWindcaveOutcome", () => {
  it("verifies an approval that matches every expected value", () => {
    expect(verifyWindcaveOutcome(EXPECTED, approved(), CONTEXT))
      .toEqual({ kind: "approved", providerTransactionId: "0000000c00000001" });
  });

  it("verifies an approval when the reply does not name the provider account", () => {
    const t = tx({ username: undefined });
    expect(verifyWindcaveOutcome(EXPECTED, approved(t), CONTEXT))
      .toMatchObject({ kind: "approved" });
  });

  it.each([
    ["the session", approved({ ...tx() }), { ...EXPECTED, sessionId: "0000120000000000ffffffffffffffff" }, CONTEXT, "session"],
    ["the amount", approved(tx({ amountCents: 1233 })), EXPECTED, CONTEXT, "amount"],
    ["the currency", approved(tx({ currency: "AUD" })), EXPECTED, CONTEXT, "currency"],
    ["the merchant reference", approved(tx({ merchantReference: "TAPT_other" })), EXPECTED, CONTEXT, "reference"],
    ["the provider environment recorded on the payment", approved(), { ...EXPECTED, providerEnvironment: "production" as const }, CONTEXT, "environment"],
    ["the provider account", approved(tx({ username: "AnotherUser" })), EXPECTED, CONTEXT, "account"],
  ])("refuses an approval that differs in %s", (_label, observed, expected, context, field) => {
    expect(verifyWindcaveOutcome(expected, observed, context)).toEqual({ kind: "mismatch", field });
  });

  it("verifies a decline when every transaction in the session is this payment's", () => {
    expect(verifyWindcaveOutcome(EXPECTED, declined([tx({ authorised: false }), tx({ id: "0000000c00000002", authorised: false })]), CONTEXT))
      .toEqual({ kind: "declined" });
  });

  it("refuses a decline whose transactions are not this payment's", () => {
    expect(verifyWindcaveOutcome(EXPECTED, declined([tx({ authorised: false, merchantReference: "TAPT_other" })]), CONTEXT))
      .toEqual({ kind: "mismatch", field: "reference" });
  });

  it("refuses a decline under another provider environment", () => {
    expect(verifyWindcaveOutcome({ ...EXPECTED, providerEnvironment: "production" }, declined([tx({ authorised: false })]), CONTEXT))
      .toEqual({ kind: "mismatch", field: "environment" });
  });

  it("keeps a pending session pending", () => {
    expect(verifyWindcaveOutcome(EXPECTED, { kind: "pending", sessionId: SESSION }, CONTEXT)).toEqual({ kind: "pending" });
  });

  it.each([
    [{ kind: "ambiguous", reason: "no_transaction" }, "no_transaction"],
    [{ kind: "ambiguous", reason: "multiple_authorised" }, "multiple_authorised"],
    [{ kind: "ambiguous", reason: "type" }, "type"],
    [{ kind: "malformed", reason: "transaction" }, "malformed"],
  ] as const)("calls %p unverifiable, never approved or declined", (observed, reason) => {
    expect(verifyWindcaveOutcome(EXPECTED, observed as SessionQueryResult, CONTEXT)).toEqual({ kind: "unverifiable", reason });
  });

  it("reports the parser's session mismatch as a mismatch", () => {
    expect(verifyWindcaveOutcome(EXPECTED, { kind: "integrity_mismatch", reason: "session" }, CONTEXT))
      .toEqual({ kind: "mismatch", field: "session" });
  });
});
