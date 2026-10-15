# R4 §21.1 review — pass 3 (R4-T2 scope), 2026-10-14

Reviewed: plan §11.2–§11.4, the [ADR](../../../decisions/2026-10-14-r4-t2-refund-operation-schema.md),
`refunds` in `shared/schema.ts`, the refund route and storage, and migrations 0034–0038 on
`ccr-e07e3100-0wm8kr` after the R2+R3 merge and the 2026-10-14 outstanding work. By this
session. An independent reread follows (pass 4).

## Verification of Prior Fixes
- **Pass 1 blocker 1 (the R2/R3 schema decision): resolved.**
  - The owner chose Option A on 2026-10-12.
  - R2 and R3 are merged on this branch (2026-10-13; merge review B-1/B-2 fixed).
  - Retail captures are R2's `transactions.windcave_transaction_id`,
    `split_payments.windcave_transaction_id` and `payment_attempts.provider_transaction_id`.
    The refund operation records the capture by its provider ID and share index, so it
    depends on neither R3 table.
- **Pass 1 blocker 2 (RD-3/RD-5 not enabled): still holds.**
  - `FEATURE_REFUND_INITIATION` is off, and its 503 is still first in the route (re-read).
  - RD-3 was fixed in R4-T1. RD-5 is removed by R4-T3's use of this schema.
- **Pass 1 missing step (the ADR for the state graph and reservations):** written; this
  pass reviews it.

## Blocking Issues
None for R4-T2 as scoped below.

## R4-T2 scope (approved)
- **Migration `0039_refund_operations.sql`** exactly as the ADR describes: the columns, the
  shape CHECKs, the state-graph trigger, the composite tenant key with its count-only abort,
  and the six indexes.
- **The Drizzle declaration, the baseline contract entries and the migrate-order list.**
- **MemStorage legacy refunds** get an `operation_id` and null operation fields.
- **A PostgreSQL verifier** that applies 0000–0039 to a fresh local database and proves
  every rule, accepting and refusing.
- **Not in scope:**
  - no writer creates an operation row (R4-T3);
  - no worker (R4-T4);
  - no DTO (R4-T5).
  - The flag stays off.

## High-Risk Concerns
1. **The table rewrite** (`operation_id`'s volatile default) takes an ACCESS EXCLUSIVE lock
   on `refunds`. The lock is bounded by the runner's `lock_timeout`. Measure it on a clone
   before production.
2. **A legacy row with a business that does not match its sale** aborts the migration. That
   is intended: such a row is a tenant defect to resolve from evidence, not to rewrite.
3. **The trigger is the only enforcement of the graph** until R4-T3's code exists. The
   verifier must exercise every arrow and every refused one.

## Missing Steps
None for T2. R4-T3 must stop using `reserveRefundAmountForMerchant` and
`releaseRefundAmountForMerchant` for operation rows (recorded in the ADR).

## Unsafe Assumptions
- **That `total_refunded` holds only confirmed amounts.** Legacy rows written by the old
  reservation path count as confirmed. That is conservative: it lowers the balance and
  never raises it. The count-only preflight in the runbook reports legacy rows by status.
- **That Windcave's refund X-ID limit is 64 characters.** This is R4-T1's client bound,
  not a provider fact. Confirm in UAT.

## Required Ordering Changes
None: T2 → T3 → T4 → T5, as pass 1.

## Open Product / Provider / Legal Questions
Preflight §4 questions 2–4 (split refunds, admin path, record-only methods). None blocks T2:
the schema allows each answer.

## Compliance and Data-Handling Notes
- New identifiers (X-ID, provider refund ID, reference) stay out of logs and responses
  (R2-T6).
- The migration's abort messages carry counts only.
- `reason_text` is merchant-entered free text, limited to 500 characters. It is not shown
  to payers.

## Test and Rollback Adequacy
- **Tests:** failing tests first, at three levels.
  - migrate-order and baseline-contract unit tests;
  - a schema-parity pass;
  - the PostgreSQL verifier on a fresh database, with no shared database.
- **Rollback:** a code revert. The objects are inert for legacy writers.

## Final Recommendation
**Approve R4-T2** as scoped above, subject to the pass-4 independent reread.
