# R4 §21.1 review — pass 1, 2026-10-12

Reviewed: plan §11, the [R4 preflight](R4-preflight-2026-10-12.md), the
[R2/R3 schema conflict](../R2-R3-SCHEMA-CONFLICT-2026-10-12.md), and the refund route,
provider call and storage at the R2-T7 commit. By this session; an independent review is
owed before implementation.

### Verification of Prior Fixes
R1 made the refund routes tenant-scoped and owner-only and put initiation behind
`FEATURE_REFUND_INITIATION`; re-read and confirmed. R2-T6 removed provider text from
`createWindcaveRefund`'s errors; confirmed. Nothing else about refunds changed in R2.

### Blocking Issues
1. **The R2/R3 schema decision.** R4 refunds the captured provider transaction (R2's
   `provider_transaction_id` vs R3's `processor_transaction_id` and
   `payment_session_bindings`) and reconciles through R3's worker and outbox, which exist
   only on Codex's branch. Implementing R4 on either branch now would add a third design.
2. RD-3 and RD-5 (ambiguous failure releases the reservation; the sale shows refunded
   before confirmation) must not be enabled; the flag is off, so they are not live.

### High-Risk Concerns
RD-1/RD-3 together are a double-refund path the moment the flag turns on. RD-9 refunds
split sales against the wrong capture.

### Missing Steps
An ADR for the refund state graph and reservation representation (§11.3: reservations
separate from confirmed totals), written after the R2/R3 decision.

### Unsafe Assumptions
That a 2xx from the refund endpoint means the refund happened (RD-2).

### Required Ordering Changes
R2/R3 decision → R2/R3 merge → R4-T1 (no schema) → R4-T2 migration → T3 → T4 → T5.
R4-T1 could start before the merge (it touches only `createWindcaveRefund` and a new
parser), but it would still collide with R3's provider contract
(`server/durable-payment-contract.ts`), so it waits too.

### Open Product / Provider / Legal Questions
Preflight §4 questions 2–4; whether Windcave's refund query is available for
reconciliation by X-ID (not certain; confirm from the REST documentation or UAT).

### Compliance and Data-Handling Notes
No provider text or IDs in merchant responses or logs (R2-T6's guard extends to refunds).

### Test and Rollback Adequacy
The §11.5 list is adequate; add the R2-style marker guard for the refund path.

### Final Recommendation
**Approve the preflight; do not start R4 code** until the R2/R3 schema decision is made
and the branches are merged.
