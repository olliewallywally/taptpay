# R3 implementation preflight and independent reread

Scope: ADR `docs/decisions/2026-10-12-r3-durable-payment-storage.md` at base
`e408f597`; inactive durable storage, worker and receipt adapter only. No live
migration, provider call, production activation or route replacement is approved.

## Verification of Prior Fixes
Re-ran `payment-attempt-service.test.ts` and `invoice-split-sessions.test.ts`:
2 suites, 21 tests passed. Inspected retail lock order, existing global session
index, invoice split bindings and callback/FPRN routes directly. Existing invoice
completed-session arrays do not establish immutable share/amount ownership.

## Blocking Issues
No blocker for this bounded implementation. R2's actual verifier and transport
are absent from this checkout; they block activation and phase completion.

## High-Risk Concerns
Cross-domain session reuse, lease expiry after possible provider acceptance,
invoice void/manual-paid races, and replay increments require database constraints
and real competing connections. Immutable expected fields cannot be inferred
from returned provider money. Keep attached attempts live while outcome is unknown.

## Missing Steps
Before worker implementation: populated restore rehearsal of the expansion SQL.
Before activation: every active caller migration,
verified R2 adapter, startup/operations integration, provider request validation
against documented FPRN format, production-sized migration rehearsal and approval.

## Unsafe Assumptions
Memory tests cannot prove PostgreSQL locking. Successful send is not durable
delivery. Expired return state does not cancel a legitimate provider session.
No synthetic test is provider UAT or evidence about populated production data.

## Required Ordering Changes
ADR → failing behavioral tests → SQL → isolated restored rehearsal → storage/
worker implementation → fault/concurrency verification → separately reviewed
integration. Preserve existing retail engine rather than replace it.

## Open Product / Provider / Legal Questions
Claude owns R2. Its exported verifier API and documented receipt fields must be
confirmed from the eventual code. No additional product choice is needed to
implement the inactive interface and storage now.

## Compliance and Data-Handling Notes
No raw bodies, public tokens, session/transaction IDs or provider errors in logs.
Persist only bounded reconciliation identifiers and enumerated error codes.
Tests use synthetic records in an isolated local PostgreSQL instance.

## Test and Rollback Adequacy
Require duplicate receipts, competing/stale workers, crash/replay finalization,
fingerprint/tenant/share/session mismatches, pending outcomes, partial cents,
constraints and restored migration fingerprints. Services remain inactive;
existing payment routes retain their current behavior until convergence review.

## Final Recommendation (Approve / Do not approve)
**Approve** the bounded inactive implementation described above at `e408f597`.
This does not approve deployment or claim the R3 phase is complete.

Independent second pass (separately recorded reread by Codex, not another agent):
rechecked ADR against §10.1–10.7 and routes. Caught the need for a global session
registry, unexpired lease fencing, and no automatic replacement of unknown
provider outcomes. Those requirements are explicit in the ADR and test scope.
**Approve** the same inactive scope; R2/route/production gates remain open.

Implementation reread: retail now has a fenced same-transaction event/outbox hook
and rejects terminal replay with a different provider transaction ID. Database
tests required the retry timestamp cast. A crash-window review required durable
send intent before provider acceptance; invoice marker and retail expectations
now cover it. Quote links received the invoice hash/compatibility sequence. The
receipt adapter exports handlers, keeping the active registration inventory
complete. Graph reread preserves property `dispatched`, trades `sent`, and quote
`expired` statuses. The recorded evidence links the actual restored and fault runs.
The final lease reread found that owner ID alone did not fence an expired task
when the same ID acquired a new lease. A failing PostgreSQL regression confirmed
it. Inbox finalization/completion, original retail finalization and outbox ACK now
also require the claim generation and exact expiry; all 29 PostgreSQL checks
passed on both owned clusters after correction.

**Approve** this tested foundation for commit. **Do not approve** R3 closure or
deployment: R2 adapters, active route/caller convergence, message receivers,
production-sized restore and owner migration/deployment approval remain open.
This is a separate Codex reread, not a claim of Claude or human review.
