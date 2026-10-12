// R2-T5 (plan v2.2 §9.5): the shared integrity verifier. A provider outcome settles
// money only when it matches what the payment expected before its session existed.
// Pure: no I/O, no logging. The caller records a sanitized event on a mismatch and
// leaves the payment reconcilable on anything that is not approved or declined.
import type { PaymentProviderEnvironment } from "@shared/schema";
import type { NormalizedTransaction, SessionQueryResult } from "./windcave-query";

export interface WindcaveExpectedOutcome {
  sessionId: string;
  amountCents: number;
  currency: string;
  merchantReference: string;
  /** The environment the payment was started under. */
  providerEnvironment: PaymentProviderEnvironment;
}

export interface WindcaveVerificationContext {
  /** The environment this server is configured for now. */
  providerEnvironment: PaymentProviderEnvironment;
  /** The configured REST username; compared when the reply names one. */
  accountUsername: string;
}

export type MismatchField = "session" | "amount" | "currency" | "reference" | "environment" | "account";

export type VerifiedOutcome =
  | { kind: "approved"; providerTransactionId: string }
  | { kind: "declined" }
  | { kind: "pending" }
  | { kind: "unverifiable"; reason: string }
  | { kind: "mismatch"; field: MismatchField };

function transactionMismatch(
  expected: WindcaveExpectedOutcome,
  context: WindcaveVerificationContext,
  transaction: NormalizedTransaction,
): MismatchField | null {
  if (transaction.sessionId !== undefined && transaction.sessionId !== expected.sessionId) return "session";
  if (transaction.amountCents !== expected.amountCents) return "amount";
  if (transaction.currency !== expected.currency) return "currency";
  if (transaction.merchantReference !== expected.merchantReference) return "reference";
  if (transaction.username !== undefined && transaction.username !== context.accountUsername) return "account";
  return null;
}

export function verifyWindcaveOutcome(
  expected: WindcaveExpectedOutcome,
  observed: SessionQueryResult,
  context: WindcaveVerificationContext,
): VerifiedOutcome {
  switch (observed.kind) {
    case "pending":
      return { kind: "pending" };
    case "ambiguous":
      return { kind: "unverifiable", reason: observed.reason };
    case "malformed":
      return { kind: "unverifiable", reason: "malformed" };
    case "integrity_mismatch":
      return { kind: "mismatch", field: "session" };
    case "approved":
    case "declined": {
      if (observed.sessionId !== expected.sessionId) return { kind: "mismatch", field: "session" };
      if (expected.providerEnvironment !== context.providerEnvironment) return { kind: "mismatch", field: "environment" };
      // Every transaction in the session must be this payment's, approved or not.
      for (const transaction of observed.transactions) {
        const field = transactionMismatch(expected, context, transaction);
        if (field) return { kind: "mismatch", field };
      }
      return observed.kind === "approved"
        ? { kind: "approved", providerTransactionId: observed.transaction.id }
        : { kind: "declined" };
    }
  }
}
