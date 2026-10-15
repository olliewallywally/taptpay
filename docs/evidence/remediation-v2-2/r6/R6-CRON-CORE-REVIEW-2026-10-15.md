## Verification of Prior Fixes

Reviewed847b399a's actual code, prior224-suite evidence, current12-pass route,
R3 billing/outbox identity, R5 frozen schema and the linked durable cron design.
Property/trades generation has unique period backstops, but initial message
delivery is send-then-mark and cannot be safely repeated solely from a lease.

## Blocking Issues

No blocker for core schema/coordinator and synthetic verification. Activation of
held-job recovery on existing cron routes awaits owner product/security approval.
Do not claim applied/live schema or complete§13.3 before integration/evidence.

## High-Risk Concerns

Session-lock loss can leave an in-flight external call alive. Persist started
jobs before invocation, retain held uncertainty across slots, fence old owner
completion and stop at boundaries. A lease is not provider idempotency. A resolved
promise with error counts is not success. Preserve independent subscription start.

## Missing Steps

Forward schema and coordinator, injected runner, bounded safe metrics, exact-slot
retry, expired takeover, safe holds, authenticated aggregate status, reviewed
release tooling, real PG concurrency/crash and schema convergence. Route wiring
and checkpoint propagation follow owner recovery-policy approval.

## Unsafe Assumptions

No process-local fallback for a real deployment. No arbitrary string/error/PII in
history/status. No default automatic resend/release on restart/timeout/new slot.
No assumption an older application participates in the new lock; rollout drains
old cron first. Five-minute cadence is proposed configuration, not already set.

## Required Ordering Changes

Record failing-first tests before source. Apply new SQL only to named owned
clones after tests/review; freeze it after application. Match ORM/baseline/current
fingerprint and verify fresh/restored convergence before commit. No shared DDL.
Hold activation is dependent work; core construction/testing is independent.

## Open Product / Provider / Legal Questions

Owner chooses the uncertain-send recovery workflow before route activation.
Actual external scheduler/alert owner remains unconfigured. D9, R5 closeout and
real UAT are separate outstanding gates, not approved by this continuation.

## Compliance and Data-Handling Notes

Counts/UUID/fixed enum history only. No message/token plaintext or provider calls;
preserve appPID4196 and existing setup. No worktree/new dependency is required.
Rollback cannot discard holds or enable old uncoordinated cron.

## Test and Rollback Adequacy

Require actual two-client exclusion, slot retries, expired takeover and old-owner
fencing; unfinished unsafe job stays held across slots; later unrelated jobs
progress; wrong/missing secret prevents DB access. Fault and result-count failures
must be visible. Pure mocks alone cannot prove locking/schema behavior.

## Final Recommendation (Approve / Do not approve)

**Approve** core durable-cron schema/coordinator and synthetic tests described in
docs/operations/r6-durable-cron-design.md at base847b399a. Existing route activation
is excluded pending the owner decision; shared release/deployment is excluded.

Separate pre-implementation reread checked lock-loss/in-flight-call ambiguity,
cross-slot holds, stale completion, database clocks, retry identity, unsafe error
counts, subscription independence, baseline/restore and rollout with old workers.
Same scoped approval. No external/delegated reviewer is claimed.

Post-answer pre-activation reread: owner approved holding uncertain job types,
recorded in docs/decisions/2026-10-15-r6-uncertain-cron-jobs-held.md. Approve route
integration/checkpoint propagation of that exact policy and authenticated status,
with failing-first HTTP and actual PG evidence before commit. No remaining owner
policy blocker for this scope. Hard deadlines must interrupt orchestration even
when a provider promise hangs, without pretending to cancel the provider effect;
persist a hold and fence any late completion. Rechecked existing auth before DB,
independent billing start, ineligibility-vs-send uncertainty and old-worker rollout.
No shared/live action or phase-complete approval.
