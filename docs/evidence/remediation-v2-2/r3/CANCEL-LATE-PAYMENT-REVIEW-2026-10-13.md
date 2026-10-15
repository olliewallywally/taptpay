# R3 cancellation, manual commands and late payment review

Base `27d235b8`; applies the owner's October 13 cancellation decision.

## Verification of Prior Fixes
The approved invoice flow and concurrent reservations pass 52 synthetic
PostgreSQL checks. R2 verification of retry histories passes 33 tests. The full
regression suite and other R3 streams remain open.

## Blocking Issues
The current finalizers reject a cancelled/voided parent. Removing the cancellation
guard alone would lose a later verified payment. Fix and test those finalizers
before exposing cancellation after an attempt. No captured money may be erased.

## High-Risk Concerns
Ask the shared verifier outside locks, then re-read under the parent lock.
Keep every attempt, provider identity, exact amount and share. Cancellation is
not a provider refund or evidence that a payment did not happen. A paid share
still prevents a new cancel/void/external-payment write.

## Missing Steps
Atomic command audit and outbox in existing concrete event tables; stable
command identity and fingerprint; trades event outbox FK; prior-status metadata
on settlement events; late approval handling; remove duplicate route logging
and communication; update caller/graph/tests and R4 handover.

## Unsafe Assumptions
A provider transaction ID can belong to a decline. It alone is not proof of
captured money. An unknown provider result does not refuse the owner's cancel.
A later payment on an externally paid invoice is extra money: record it once,
preserve the external-payment record and notify the merchant for resolution.
Do not charge or refund again automatically.

## Required Ordering Changes
Add failing PostgreSQL late-payment tests, then additive schema/audit/outbox
support, then finalizers, then cancellation/void/external handlers. Split/amount
configuration retains its stronger guard. Match actor authority to the server's
authenticated principal, never body fields.

## Open Product / Provider / Legal Questions
The owner chose cancellation even while Windcave is pending/unavailable.
Partial late payments retain their exact captured shares. Claude's R4 must use
verified captured amounts, not assume a cancelled split bill captured its whole
price. UAT, rollout and retention decisions remain separate gates.

## Compliance and Data-Handling Notes
Reuse transaction_events and job_events with concrete invoice/transaction FKs.
Audit remains append-only. Store actor classification and command fingerprint,
not credentials or a raw provider reply. Delivery payloads omit internal payment
identities. Late events must not replace a newer sale on an anonymous board.

## Test and Rollback Adequacy
Test cancellation versus approval, late full/partial approvals, void and external
payment versus provider completion, duplicates, tenant/actor scope, exact cents,
audit/outbox rollback and live/declined/unknown states. Keep forward schema and
financial/audit records on rollback; do not return to a build that loses late money.

## Final Recommendation (Approve / Do not approve)
Approve this bounded repair with failing tests first and isolated rehearsal.
No R3 exit, live migration, feature activation or deployment approval.

Separately recorded reread: do not reopen an invoice marked paid externally or
increment its paid-share count again. A late captured payment needs its own
immutable settlement event. Preserve void/cancel timestamps when money arrives;
record the previous state so delivery can tell the merchant what happened. A
repeat manual command must not create another audit or delivery task.

Implementation follow-up: 71 owned PostgreSQL checks pass, including full and
partial late captures after void, a late capture after external payment, duplicate
settlement, manual audit/outbox rollback, tenant-scoped session lookup and shared
verification without holding invoice/attempt locks. The targeted guard/graph
suites pass 11 tests; typecheck and diff whitespace checks pass. This work remains
uncommitted and is not a full regression or R3 exit claim.

Separately recorded implementation reread: unknown results retain every concrete
attempt and provider identity. A duplicate manual command does not repeat state,
audit or outbox writes; changing its external reference conflicts. Financial
settlement still requires matched provider evidence and a current inbox fence.
Receipt/SSE/push receiver wiring and create-command coverage remain unfinished.
The cancellation route still has a temporary first-record SSE publication; remove
it when the real keyed receiver is wired. No live flag or deployment was enabled.
