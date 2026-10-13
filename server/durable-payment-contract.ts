import { createHash } from "node:crypto";

export type ProviderOutcome = "approved" | "declined" | "cancelled";
export type AttemptState = "claiming" | "ready" | "finalizing" | ProviderOutcome | "abandoned";
export type InboxStatus = "pending" | "processing" | "retry" | "complete" | "dead_letter";
export type ReconciliationError = "provider_pending" | "provider_unknown" | "provider_unavailable" |
  "unbound_session" | "integrity_mismatch" | "settlement_conflict" | "internal_error" | "retry_exhausted";

export interface ProviderExpectation {
  sessionId: string;
  processorXId: string;
  amountCents: number;
  currency: string;
  reference: string;
  environment: "uat" | "production";
  providerAccount: string;
}
export type SessionBinding = ProviderExpectation & (
  { invoiceAttemptId: string; paymentAttemptId?: never } |
  { paymentAttemptId: string; invoiceAttemptId?: never }
);

/** R2 adapter must query through its validated transport and verify every field.
 * No adapter from the old success/approved booleans is permitted. */
export type ProviderQueryResult =
  | { kind: "pending" | "unknown" | "unavailable" }
  | { kind: "mismatch" }
  | (ProviderExpectation & { kind: "verified"; outcome: ProviderOutcome;
      transactionId: string; transactionCount: 1; paymentMethod?: string });
export type VerifiedOutcome = Extract<ProviderQueryResult, { kind: "verified" }>;
export interface ReconciliationProvider {
  query(expected: Readonly<ProviderExpectation>): Promise<ProviderQueryResult>;
}
export interface InboxClaim {
  id: string;
  sessionId: string;
  owner: string;
  attemptCount: number;
  firstReceivedAt: Date;
  leaseExpiresAt: Date;
}
export type SettlementResult = { kind: "finalized" | "reused"; eventId?: string } |
  { kind: "conflict" | "not-found" | "lease-lost" | "adapter-unavailable" };
export interface ReconciliationRepository {
  claimInbox(owner: string, now: Date): Promise<InboxClaim | undefined>;
  resolveSession(sessionId: string): Promise<SessionBinding | undefined>;
  finalize(binding: SessionBinding, outcome: VerifiedOutcome, claim: InboxClaim, now: Date): Promise<SettlementResult>;
  finishInbox(claim: InboxClaim, result: { status: "retry" | "complete" | "dead_letter";
    code?: ReconciliationError; transactionId?: string; nextAttemptAt?: Date }, now: Date): Promise<boolean>;
}

export function requestFingerprint(input: Record<string, unknown>): string {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) :
    value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
}
export function invoiceShareCents(total: number, count: number, share: number): number {
  if (!Number.isSafeInteger(total) || total < 1 || !Number.isSafeInteger(count) || count < 2 || count > 12 ||
      !Number.isSafeInteger(share) || share < 1 || share > count || total < count) throw new Error("invalid_invoice_share");
  return Math.floor(total / count) + (share <= total % count ? 1 : 0);
}
export const isSessionId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value);
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
