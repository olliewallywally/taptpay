# R6 durable cron design

Base847b399a, October15 2026. Scope: plan§13.3; no entitlement, provider charging,
R4 merge, shared migration or deployment. Preserve the12 current job names/order,
independent subscription start and existing job-level financial claims/outboxes.

## Coordination and retry identity

Use a committed PostgreSQL parent lease and a unique running-parent row. A short
transaction advisory lock serializes acquisition/takeover and reviewed hold
resolution. Every operation checks out its own connection, begins a transaction,
sets LOCAL bounds/UTC, commits or rolls back, then releases it. No session lock,
backend affinity or session SET state is assumed between operations. Job writes
lock/recheck the parent before the job row, so concurrent billing/other passes
cannot interleave transactions or let stale completion cross a takeover.
0049a persists parent/per-job history; applied bytes are frozen. Two instances
cannot enter a normal cycle together. The pooling review supersedes the initial
session-lock proposal without changing schema or the approved hold policy.
Database time assigns a five-minute scheduler slot. A completed slot returns its
durable result on retry; no second pass execution. This is a proposed operating
cadence, not a claim that an external scheduler has been configured.

After a crash the committed lease blocks takeover until expiry. On expiry, close
the abandoned parent and mark its started unfinished unsafe jobs held; only the
explicitly reviewed replay-safe financial/CAS jobs become failed/retryable.
A new parent attempt can run unstarted jobs in the
same slot, skipping completed ones. A unique partial index prevents the same job
type being running/held twice across parents. Old owner completion/heartbeat
writes require the original running parent/owner and unexpired lease; they fail
after takeover. Keep original attempts and timestamps rather than overwriting
crash history. A new slot does not bypass a held job.

Heartbeat every15s, lease45s, bounded run budget240s. Failed renewal/deadline sets
an abort state; checkpoints before job/record boundaries stop further work. Local
monotonic budgets subtract transaction round-trip time conservatively; database
ownership predicates are authoritative. A provider call
already in flight may still finish; its job remains held unless the original
owner can commit completion while valid. This does not claim external exactly-
once delivery, roll back a provider action, or replace R3's stable money keys.

## Uncertain sends — owner approved October15

Approved recovery: hold affected started unfinished unsafe job types until an
operator reconciles the possible side effects. Other job types continue. Do not
automatically repeat unkeyed email/SMS/WhatsApp or partly recorded generation.
Successful job completion is recorded before clearing its active slot. A lost
completion commit leaves a visible hold. Known-safe failure retries can be
separately typed where existing DB/provider idempotency is proven (subscription
financial attempts and CAS upload maintenance); never infer safety from a name.

A counts/errors result must not be reported successful merely because its promise
resolved. Fixed numeric/boolean result fields only; errors are fixed codes, never
upstream text/PII. Confirmed billing declines are recorded business outcomes,
separate from scheduler transport/local failures. Delivery's existing failed
counter also includes pre-send ineligibility; it alone does not prove an unknown
send. Returned error counts or thrown faults from an unsafe job are held.

An explicit guarded reconciliation operation must name the exact held job/run,
record a review-reference digest and choose verified complete or verified safe
retry. No automatic release by time, later slot, restart or unauthenticated API.
No public/unreviewed HTTP endpoint may clear holds. Changing the owner workflow
for this uncertainty was approved under CLAUDE.md and is recorded in
../decisions/2026-10-15-r6-uncertain-cron-jobs-held.md. It does not approve actual
live hold resolution, provider operations or deployment.

## History and operations

Parent/per-job start/end/status, bounded counts, duration, owner and fixed error
codes are persisted. No contact, notification body, provider identity, key or token
belongs in these tables or responses. Expose minimal aggregate status only behind
the existing x-cron-secret authorization; absent/mismatched secret still fails
closed before any DB/job call. Add no public status URL. Return503 if durable
coordination is unavailable, never fall back to process-local exclusion in a
real database deployment. Tests may explicitly inject an isolated memory adapter.

Ops reports no successful parent within two expected intervals, held jobs,
expired active leases, aged reconciliation/billing work and rising dead letters.
Use closed SQL aggregates/counts; schema compatibility is required. Scheduler
freshness does not affect public readiness without a separate owner decision.
Document scheduler URL/header/cadence/timeouts/retry and alert ownership; actual
external configuration/alert recipient remain an operator prerequisite.

## Verification and rollout

Failing-first orchestration/security tests, actual two-connection PG exclusion,
slot retry, parent/subjob persistence, one failing pass with later progress,
crashed/expired lease and fenced old owner, held unknown job across later slots,
safe reviewed release, fresh/stale/backlog/dead-letter status. No real provider
calls or owner app restart. Apply0049a only to newly named owned scratch/restored
targets, freeze applied SQL, verify ORM/baseline and strict catalog restore
convergence, update CI's current expected fingerprint. Applied0048a/b/c stay fixed.

Before shared deployment: reconcile any pre-existing process-local cron activity,
stop old coordinators/drain them, apply the reviewed migration, deploy compatible
code, then activate one external scheduler. An older uncoordinated app instance
cannot be made safe by the new advisory lock it never takes. R4/canonical release
integration remains required. Rollback must preserve holds/history and never
reactivate uncoordinated cron while a coordinated/uncertain run exists.
