import {
  REFUND_LEASE_MS, canMoveRefundOperation, refundFingerprint, refundReply, refundSettlePlan, validProviderRefundId,
} from "../refund-operation-rules";
import { WINDCAVE_REQUEST_TIMEOUT_MS } from "../windcave-client";

/**
 * R4-T3 (docs/decisions/2026-10-14-r4-t3-atomic-refund-claim.md): the rules both stores and the
 * route share. They mirror migration 0039's graph and the ADR's settle table and refund-ID rules.
 */
const CAPTURE = "cap0001";

describe("the state graph mirrors 0039", () => {
  it.each([
    ["requested", "submitted", true], ["requested", "cancelled", true], ["requested", "succeeded", false], ["requested", "unknown", false],
    ["submitted", "succeeded", true], ["submitted", "failed", true], ["submitted", "unknown", true], ["submitted", "cancelled", false], ["submitted", "requested", false],
    ["unknown", "succeeded", true], ["unknown", "failed", true], ["unknown", "submitted", false],
    ["succeeded", "failed", false], ["failed", "unknown", false], ["cancelled", "submitted", false],
  ] as const)("%s → %s: %s", (from, to, allowed) => {
    expect(canMoveRefundOperation(from, to)).toBe(allowed);
  });
});

describe("the fingerprint", () => {
  const base = { merchantId: 7, transactionId: 42, amountCents: 1050, currency: "NZD", method: "original_payment_method" as const };
  it("is SHA-256 hex, and ignores the reason (a reworded retry is the same refund)", () => {
    expect(refundFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes with the business, the sale, the cents or the method", () => {
    const one = refundFingerprint(base);
    for (const change of [{ merchantId: 8 }, { transactionId: 43 }, { amountCents: 1051 }, { method: "manual" as const }]) {
      expect(refundFingerprint({ ...base, ...change })).not.toBe(one);
    }
  });
});

describe("provider refund IDs", () => {
  it("accept 0039's token shape that is not the capture", () => {
    expect(validProviderRefundId("ref_0001-A", CAPTURE)).toBe("valid");
    expect(validProviderRefundId(undefined, CAPTURE)).toBe("absent");
    expect(validProviderRefundId("has space", CAPTURE)).toBe("malformed");
    expect(validProviderRefundId("x".repeat(65), CAPTURE)).toBe("malformed");
    expect(validProviderRefundId(CAPTURE, CAPTURE)).toBe("capture");
  });
});

describe("the settle table and ID rules (ADR §5)", () => {
  const plan = (outcome: Parameters<typeof refundSettlePlan>[0]) => refundSettlePlan(outcome, CAPTURE);
  it("refunded: succeeded with a valid ID; otherwise parked, never failed", () => {
    expect(plan({ kind: "refunded", refundTransactionId: "ref1" })).toEqual({ state: "succeeded", refundId: "ref1", parked: false, errorCode: null });
    for (const id of ["", "bad id", CAPTURE]) {
      expect(plan({ kind: "refunded", refundTransactionId: id })).toEqual({ state: "unknown", refundId: null, parked: true, errorCode: "provider_refund_id_invalid" });
    }
  });
  it("pending: scheduled with or without a usable ID; parked when it names the capture", () => {
    expect(plan({ kind: "pending", refundTransactionId: "ref2" })).toEqual({ state: "unknown", refundId: "ref2", parked: false, errorCode: "provider_pending" });
    expect(plan({ kind: "pending" })).toEqual({ state: "unknown", refundId: null, parked: false, errorCode: "provider_pending" });
    expect(plan({ kind: "pending", refundTransactionId: "bad id" })).toEqual({ state: "unknown", refundId: null, parked: false, errorCode: "provider_pending" });
    expect(plan({ kind: "pending", refundTransactionId: CAPTURE })).toEqual({ state: "unknown", refundId: null, parked: true, errorCode: "provider_refund_id_invalid" });
  });
  it("declined: failed, keeping a valid ID; parked when it names the capture", () => {
    expect(plan({ kind: "declined", refundTransactionId: "dec1" })).toEqual({ state: "failed", refundId: "dec1", parked: false, errorCode: "provider_declined" });
    expect(plan({ kind: "declined" })).toEqual({ state: "failed", refundId: null, parked: false, errorCode: "provider_declined" });
    expect(plan({ kind: "declined", refundTransactionId: "bad id" })).toEqual({ state: "failed", refundId: null, parked: false, errorCode: "provider_declined" });
    expect(plan({ kind: "declined", refundTransactionId: CAPTURE })).toEqual({ state: "unknown", refundId: null, parked: true, errorCode: "provider_refund_id_invalid" });
  });
  it("rejected, invalid_request and disabled: failed (nothing was refunded)", () => {
    expect(plan({ kind: "rejected", status: 404 })).toEqual({ state: "failed", refundId: null, parked: false, errorCode: "provider_rejected_404" });
    expect(plan({ kind: "invalid_request" })).toMatchObject({ state: "failed", errorCode: "provider_invalid_request" });
    expect(plan({ kind: "disabled" })).toMatchObject({ state: "failed", errorCode: "provider_disabled" });
  });
  it("unknown and malformed are scheduled; a mismatch is parked with its field", () => {
    expect(plan({ kind: "unknown", reason: "timeout" })).toEqual({ state: "unknown", refundId: null, parked: false, errorCode: "provider_unknown_timeout" });
    expect(plan({ kind: "malformed" })).toEqual({ state: "unknown", refundId: null, parked: false, errorCode: "provider_malformed" });
    expect(plan({ kind: "mismatch", field: "amount" })).toEqual({ state: "unknown", refundId: null, parked: true, errorCode: "provider_mismatch:amount" });
  });
  it("an exception from the call is scheduled unknown, never failed (C-4)", () => {
    expect(plan({ kind: "thrown" })).toEqual({ state: "unknown", refundId: null, parked: false, errorCode: "provider_error" });
  });
  it("every error code fits 0039's sanitized shape", () => {
    const outcomes: Array<Parameters<typeof refundSettlePlan>[0]> = [{ kind: "rejected", status: 418 }, { kind: "mismatch", field: "reference" },
      { kind: "unknown", reason: "network" }, { kind: "thrown" }, { kind: "pending", refundTransactionId: CAPTURE }];
    for (const outcome of outcomes) expect(plan(outcome).errorCode).toMatch(/^[a-z][a-z0-9_:]{0,63}$/);
  });
});

describe("the reply follows the committed state (C-1)", () => {
  it.each([
    ["succeeded", 200, "REFUNDED"], ["failed", 422, "REFUND_NOT_MADE"], ["unknown", 202, "REFUND_BEING_CHECKED"],
    ["submitted", 202, "REFUND_BEING_CHECKED"], ["requested", 202, "REFUND_BEING_SENT"],
  ] as const)("%s → %i %s", (state, status, code) => {
    expect(refundReply(state)).toMatchObject({ status, code });
    expect(refundReply(state)).not.toHaveProperty("keyConsumed");
  });
});

describe("the lease covers the no-poll worst case", () => {
  it("is at least the request timeout plus both statement timeouts and a margin", () => {
    expect(REFUND_LEASE_MS).toBeGreaterThanOrEqual(WINDCAVE_REQUEST_TIMEOUT_MS + 2 * 5_000 + 30_000);
  });
});
