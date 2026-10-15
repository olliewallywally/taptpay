# T-3 decline supersession — implementation review pass 3 (2026-10-15)

An independent read-only reviewer checked the uncommitted implementation against
[ADR revision 3](../../../decisions/2026-10-15-t3-decline-supersession.md) and review pass 2's
conditions C1–C10. **Verdict: APPROVE WITH CONDITIONS D1–D6.** No defect that loses money or
records a wrong amount was found.

Confirmed:
- Supersession happens only in reconciliation, and never passes through `finalizing`.
- The registry is checked before any write.
- Rule 4 and the quiet decline come after the lease fence and full evidence validation.
- The quiet decline writes only the second attempt's rows.
- Invoice share counts stay consistent.
- Lock order and concurrency are serialised.
- Migration 0050's triggers, backfill order and trigger lists are correct.
- No existing write is blocked by the new guards.
- Every settlement-event insert supplies the new column.

| # | Finding | Resolution |
|---|---|---|
| D1 | An "approval" naming the declined card's own transaction ID was accepted silently; before T-3 it was a conflict with an alert. | Both finalizers require a different ID; otherwise `conflict` (alert fires). Failing PG test first. |
| D2 | A decline notification claimed (`processing`) but not yet prepared when the supersession commits was still sent. | Delivery preparation writes only a `skip`/`superseded` target for a superseded decline. Failing PG test first. |
| D3 | A provider transaction already held by another binding or split share failed on an unmapped unique key, so it was retried as an internal error until `retry_exhausted` with no alert (older than T-3). | Both keys are mapped to `conflict`. Failing PG test first. |
| D4 | No tests for the invoice quiet decline or a frozen cancelled attempt; nor for a billing-attempt registry holder or a commit-time deferred failure. | The first two are added (they passed: that code was already right). Not added: a billing-attempt holder has a NULL `binding_session_id`, so it takes the same code path as the session-holder test (by reading, not by test). The commit-time binding check raises `payment_binding_supersession_check`, which is in the mapped list. No test drives it through a finalizer, because the finalizers' pre-checks stop first; the D3 test does exercise the mapping wrapper. |
| D5 | `shared/schema.ts` did not declare the `supersedes_event_id` foreign key. | Declared. |
| D6 | No owner runbook for 0049–0050; no implementation evidence record; `logs/` must not be committed. | [Runbook](../../../operations/runbook-2026-10-15-apply-0049-0050.md), [evidence](T3-2026-10-15.md); `logs/` is never staged. |

Optional hardening (not adopted): a direct SQL `declined` → `approved` on an attempt without a binding
change is not refused by the database; the code never does it, and C5 as written is met.
