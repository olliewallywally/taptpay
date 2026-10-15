## Verification of Prior Fixes

The first12 real PG scenarios pass, with frozen0049a and identical scratch/
populated/restore fingerprints. Owner approved uncertain-job holds. HTTP and
producer checkpoint tests pass. Review found session-affinity assumptions in the
initial coordinator, unsuitable for a transaction-pooled deployment.

## Blocking Issues

Do not release the session-lock implementation. The replacement below resolves
the assumption without schema changes; final actual PG proof is required.

## High-Risk Concerns

Session advisory locks and SET session state cannot be relied on across pooled
transactions. Concurrent job/billing/heartbeat operations must not interleave
BEGIN/COMMIT on a shared client. A stale owner's EXISTS snapshot alone is weaker
than locking/rechecking the parent before recording a job effect/completion.

## Missing Steps

Use a fresh pool checkout per short transaction, BEGIN then SET LOCAL limits/UTC,
and always commit/rollback before release. Acquisition/resolution use the same
nonblocking transaction advisory lock. The committed unique running-parent row
and expiring DB lease provide exclusion between transactions. Lock/recheck that
parent FOR UPDATE before job writes; renewals use a fenced UPDATE. Retain active-
job uniqueness and held uncertainty across slots. Resolve holds only when no
parent is running and the exact original parent is terminal.

## Unsafe Assumptions

No backend PID/session affinity, long transaction across provider I/O, implicit
session SET persistence or per-client concurrent transaction stack. Retained
lease objects carry identity/state only, no checked-out connection. Monotonic
local budget/lease checks conservatively subtract transaction round-trip time;
DB predicates/parent locks remain authoritative. In-flight provider calls still
require held reconciliation, never a claim that their side effect was cancelled.

## Required Ordering Changes

Record this review before refactoring. Keep0049a bytes fixed. Replace only source/
test orchestration; rerun original12 scenarios plus transaction-switching proof,
live-lease busy/expired takeover, heartbeat and exact hold-resolution guards.

## Open Product / Provider / Legal Questions

The owner-approved hold policy is unchanged, so no new product decision is needed.
External scheduler/monitor configuration, D9 and UAT remain open as before.

## Compliance and Data-Handling Notes

Owned local synthetic targets only. No provider or shared/live action. The
transaction-switching adapter exists only in the verifier, not as an application
fallback. No real secrets or connection strings in diagnostics.

## Test and Rollback Adequacy

Actual PG must prove a job survives a backend disconnect yet cannot be re-entered
by another owner while its committed lease is live. After expiry/takeover, old
completion fails even through a fresh connection. A verifier adapter must reject
all SQL outside BEGIN/COMMIT and alternate real backend connections per
transaction. Keep history/holds and do not roll back to uncoordinated old workers.

## Final Recommendation (Approve / Do not approve)

**Approve** the pooled-connection-safe durable lease replacement described above,
on base847b399a with current uncommitted R6 work and unchanged0049a hash8b3aefa3.
Approval is for repository implementation/tests, not a completed proof or release.

Separate pre-implementation reread checked commit visibility before provider I/O,
parent-before-job lock ordering, absence of shared-client transaction interleave,
lease expiry vs late completion, operator clearing during live runs, pool limits,
fixed errors and unchanged approved uncertainty policy. Same scoped approval;
no external/delegated review is claimed.
