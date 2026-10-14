import { createHash } from "node:crypto";
import type { RefundOperationState } from "@shared/schema";
import { WINDCAVE_REQUEST_TIMEOUT_MS, type RefundOutcome } from "./windcave-client";

/**
 * R4-T3 (docs/decisions/2026-10-14-r4-t3-atomic-refund-claim.md): the refund-operation rules
 * MemStorage, DatabaseStorage and the route share. They mirror migration 0039's graph, the
 * ADR's settle table and refund-ID rules (§5), and its reply-from-committed-state rule (C-1).
 */

export type RefundMethod = "original_payment_method" | "bank_transfer" | "manual";

/** Each claim, send intent and settle statement is bounded by this (SET LOCAL statement_timeout). */
export const REFUND_STATEMENT_TIMEOUT_MS = 5_000;
const REFUND_LEASE_MARGIN_MS = 30_000;
/** Covers the send intent, one no-poll provider request and the settle, with a margin (ADR §4). */
export const REFUND_LEASE_MS = WINDCAVE_REQUEST_TIMEOUT_MS + 2 * REFUND_STATEMENT_TIMEOUT_MS + REFUND_LEASE_MARGIN_MS;
/** When a scheduled `unknown` operation is next due for R4-T4's worker. */
export const REFUND_RECHECK_MS = 5 * 60_000;

/** 0039's token shape for provider transaction IDs (captures and refunds). */
export const PROVIDER_TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

const MOVES: Readonly<Record<RefundOperationState, readonly RefundOperationState[]>> = {
  requested: ["requested", "submitted", "cancelled"],
  submitted: ["submitted", "unknown", "succeeded", "failed"],
  unknown: ["unknown", "succeeded", "failed"],
  succeeded: [], failed: [], cancelled: [],
};

/** The arrows 0039's trigger allows between operation states. */
export function canMoveRefundOperation(from: RefundOperationState, to: RefundOperationState): boolean {
  return MOVES[from].includes(to);
}

export const LIVE_REFUND_STATES: readonly RefundOperationState[] = ["requested", "submitted", "unknown"];

/** SHA-256 hex over what makes two requests the same refund. The reason is left out: a reworded
 * retry is the same refund, and a short reason cannot be confirmed by guessing (ADR §1). */
export function refundFingerprint(input: {
  merchantId: number; transactionId: number; amountCents: number; currency: string; method: RefundMethod;
}): string {
  const canonical = JSON.stringify([input.merchantId, input.transactionId, 0, input.amountCents, input.currency, input.method]);
  return createHash("sha256").update(canonical).digest("hex");
}

export type ProviderRefundIdCheck = "valid" | "absent" | "malformed" | "capture";

/** Whether a provider's refund ID may be stored. A duplicate is found by the store (23505). */
export function validProviderRefundId(id: string | undefined | null, capture: string): ProviderRefundIdCheck {
  if (id === undefined || id === null) return "absent";
  if (!PROVIDER_TOKEN.test(id)) return "malformed";
  if (id === capture) return "capture";
  return "valid";
}

/** The provider's outcome, or an exception thrown by the call (C-4). */
export type RefundCallOutcome = RefundOutcome | { kind: "thrown" };

export interface RefundSettlePlan {
  state: "succeeded" | "failed" | "unknown";
  /** The refund ID to write once, or null. A duplicate found on write parks the operation. */
  refundId: string | null;
  /** An `unknown` operation with no next reconciliation time, kept for a reviewer. */
  parked: boolean;
  errorCode: string | null;
}

const PARKED_INVALID_ID: RefundSettlePlan = { state: "unknown", refundId: null, parked: true, errorCode: "provider_refund_id_invalid" };

/** ADR §5: what one synchronous outcome writes. Money that may have moved is never failed. */
export function refundSettlePlan(outcome: RefundCallOutcome, capture: string): RefundSettlePlan {
  switch (outcome.kind) {
    case "refunded": {
      const id = validProviderRefundId(outcome.refundTransactionId, capture);
      return id === "valid"
        ? { state: "succeeded", refundId: outcome.refundTransactionId, parked: false, errorCode: null }
        : PARKED_INVALID_ID;
    }
    case "pending": {
      const id = validProviderRefundId(outcome.refundTransactionId, capture);
      if (id === "capture") return PARKED_INVALID_ID;
      return { state: "unknown", refundId: id === "valid" ? outcome.refundTransactionId! : null, parked: false, errorCode: "provider_pending" };
    }
    case "declined": {
      const id = validProviderRefundId(outcome.refundTransactionId, capture);
      if (id === "capture") return PARKED_INVALID_ID;
      return { state: "failed", refundId: id === "valid" ? outcome.refundTransactionId! : null, parked: false, errorCode: "provider_declined" };
    }
    case "rejected":
      return { state: "failed", refundId: null, parked: false, errorCode: `provider_rejected_${Math.trunc(outcome.status)}` };
    case "invalid_request":
    case "disabled":
      return { state: "failed", refundId: null, parked: false, errorCode: `provider_${outcome.kind}` };
    case "unknown":
      return { state: "unknown", refundId: null, parked: false, errorCode: `provider_unknown_${outcome.reason}` };
    case "malformed":
      return { state: "unknown", refundId: null, parked: false, errorCode: "provider_malformed" };
    case "mismatch":
      return { state: "unknown", refundId: null, parked: true, errorCode: `provider_mismatch:${outcome.field}` };
    case "thrown":
      return { state: "unknown", refundId: null, parked: false, errorCode: "provider_error" };
  }
}

export interface RefundReply { status: 200 | 202 | 422; code: string; message: string }

/** C-1: the reply follows the committed state, never the provider's outcome. A `requested`
 * operation answered here is one another request is sending (C-2: no keyConsumed). */
export function refundReply(state: RefundOperationState): RefundReply {
  switch (state) {
    case "succeeded": return { status: 200, code: "REFUNDED", message: "Refund processed" };
    case "failed":
    case "cancelled": return { status: 422, code: "REFUND_NOT_MADE", message: "The refund was not made." };
    case "requested": return { status: 202, code: "REFUND_BEING_SENT", message: "This refund is already being sent. Check back shortly." };
    default: return { status: 202, code: "REFUND_BEING_CHECKED", message: "The refund is being checked. Do not try again." };
  }
}
