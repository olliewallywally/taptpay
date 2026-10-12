# R4 §21.1 review — pass 2 (R4-T1 scope), 2026-10-12

Reviewed after the owner's [Option A decision](../../../decisions/2026-10-12-r2-r3-option-a-owner-decision.md):
R2's client is the provider boundary, so R4-T1 no longer collides with R3's provider
contract. Pass 1's blocking issue stands for R4-T2 onward. By this session.

### Verification of Prior Fixes
Pass 1's RD-1–RD-13 re-read at `01b8bcdd`: unchanged.

### Blocking Issues
None for R4-T1 as scoped below.

### R4-T1 scope (approved)
- `createRefund` on R2's injectable client: the caller's X-ID (never generated inside),
  no automatic retry (an ambiguous call is "unknown", resolved by reconciliation, not by
  resending), redirects not followed, a 202 polled only at a validated self link or the
  reply's own ID on the configured origin.
- Typed outcomes: refunded, declined, pending, rejected (4xx other than 409/429),
  unknown (timeout, network, 5xx, 409, 429, 3xx, other), malformed, mismatch(field),
  invalid_request, disabled.
- A final reply counts only when strictly parsed (R2-T3's transaction normalizer) and its
  type is `refund`, its exact cents, currency and reference are what was asked, and its
  provider account (when named) is ours. A mismatch records a sanitized security event.
- The refund route releases the reservation and marks the refund failed only on declined,
  rejected, invalid_request or disabled (the provider did not move money); on everything
  else it keeps the reservation and answers 503 "being checked" (RD-2, RD-3). Fixed
  messages only.
- Not in T1: the persisted X-ID and stable reference (RD-1's other half, T3), cents and
  schema (T2/T3), the worker (T4), DTOs and manual refunds (T5). The flag stays off.

### High-Risk Concerns
1. The request field naming the original transaction (`transaction2Id` today) is not
   confirmed: neither Windcave's REST guide nor a search showed the refund body, and the
   API reference is client-rendered. T1 keeps it unchanged and marks it for UAT; a wrong
   name would make every refund fail at the provider (a refusal, not a double refund).
2. Strict parsing may read a real refund reply as malformed if Windcave omits fields; the
   failure mode is a kept reservation (no money moves twice). Confirm in UAT.

### Final Recommendation
**Approve R4-T1.** R4-T2 onward stay blocked on the merged R2+R3 tree.
