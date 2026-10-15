# R6 cron operation and recovery

Repository implementation and synthetic verification are separate from external
scheduler activation. No scheduler or alert recipient was configured by this
change. Owner approved uncertain-job holds on October15; see
[decision](../decisions/2026-10-15-r6-uncertain-cron-jobs-held.md) and
[design](r6-durable-cron-design.md). R5's [deferred closeout](r5-deferred-closeout.md),
R4 integration, D9, real UAT and the remaining R6 readiness work remain release
gates.

## Deployment sequence

1. Freeze/review the combined candidate and canonical migration history. Preserve
   applied0048a/b/c and0049a bytes; use reviewed forward files for any correction.
2. Pause the old external trigger and drain old cron activity/instances before
   activating the new coordinator. An older process-local coordinator never
   takes the new lock or lease. Mixed old/new cron execution is unsafe.
3. Follow the existing approved migration-release procedure for the exact target,
   then deploy compatible code.0049a creates operational history/guards only;
   absence/incompatibility returns503. There is no local-lock fallback.
4. Confirm the authenticated status endpoint, an initial controlled cycle and
   durable parent/job results. Complete deployment/readiness/UAT approvals before
   enabling the real scheduler. Reconcile any prior uncertain effects first.

Applied only to owned synthetic clones during development:
0049a SHA256 `8b3aefa3997197b75345f726a9a05f62dcb0e8c5472c262f9326d81647760dfc`.
Through0049a strict public-schema digest:
`sha256:7c427b93f2e0a4c8ca48271faabbe07d641ee8a211d519364d6d0ea8002d3888`.
These hashes do not establish a live target's state or migration ledger.

## External scheduler settings to enter before activation

| Setting | Required value/behavior |
| --- | --- |
| Target | One `POST https://APPROVED_ORIGIN/api/internal/cron`, empty body. |
| Authentication | `x-cron-secret` from the secure `CRON_SECRET` binding; never a query parameter or logged value. |
| Cadence | Every five minutes. Slots use database UTC time; jobs retain their own business-time rules. |
| Timeout | Allow up to290 seconds where supported:240s work budget plus bounded DB cleanup. A shorter platform timeout is an unknown transport result; inspect durable status. |
| Retry | For network/503/409, wait60 seconds and retry at most twice, then alert. Repeated calls in a completed slot return saved results. A later slot can process eligible work but cannot bypass holds. |
| Partial failure |207 requires status review; do not call individual passes or blindly resend messages.200 means the cycle committed without job errors; a confirmed card decline remains a business outcome. |
| Alert owner | **Unassigned — the deployment owner must name a recipient/on-call route before activation.** |

The interval is currently a reviewed300000ms constant used for slots and freshness.
Changing external cadence alone changes retry/freshness behavior; review code and
operations together. A caller disconnect does not undo accepted provider work.

## Monitoring

Poll `GET /api/internal/cron/status` every60 seconds with the same secret over TLS.
The endpoint returns `Cache-Control: no-store`, fixed codes, UUIDs and bounded
counts/metrics; it never exposes a notification body, contact, card/provider token
or raw database/provider error. Missing configuration/auth fails before DB access.

- `alerts.schedulerStale`: no successful cycle, or last success at least10min old.
  Record initial activation time and ensure the first successful cycle occurs.
- `alerts.uncertainJobs` / `heldJobs`: review the exact job/run IDs before that job
  type resumes. Other types can continue. Unsafe failures retain a hold across
  restart and later slots; elapsed time never clears one.
- `alerts.expiredRun`: an expired active lease awaits recovery. A new authorized
  trigger can abandon/recover it; investigate repeated loss before resuming work.
- `alerts.reconciliationAged`: pending/retrying/processing provider inbox work is
  at least10min old. Use the existing R3 reconciliation process and retained
  provider identities; never issue a replacement charge to test recovery.
- `alerts.stuckBilling`: an outer billing claim or unapplied attempt is at least
 10min old. Confirm lease/attempt/provider state through R3 procedures.
- `counts.deadLetters`: keep the previous sample in the monitoring service and
  alert on increases. `deadLettersPresent` remains true while any exist, so a
  missed sample cannot hide an outstanding dead letter.
- `heldDeliveries` belongs to R3's durable delivery targets. Reconcile it with the
  delivery procedure; the R6 cron-resolution tool does not resolve those rows.

Alert on status503/unreachability and sustained scheduler409 as well. No outgoing
email/Slack alert was configured or sent by this work. These operational flags
do not remove public traffic through readiness; that is a separate owner choice.

## Resolve an uncertain cron job

The hold applies to the affected job type across merchants, as approved. Identify
it from the bounded `heldJobs` array (`runId`, `jobId`, job name, start and fixed
error). Pause its trigger as needed, verify the old worker/in-flight work has
stopped, and reconcile every possible side effect from that pass. Use reviewed
domain procedures to record verified invoice/message/billing state first.

Choose `verified_complete` only after confirming the earlier pass's effects are
recorded correctly, or `verified_safe_retry` after confirming replay is safe.
Create a dated review record and SHA256 its reference; supply that digest rather
than raw message/provider/customer data. The tool updates the exact held cron
history entry and keeps its original identity/metrics. Normal later passes still
read the domain workset, so clearing a hold does not replace domain reconciliation.

Provide `R6_CRON_DATABASE_URL` securely. It must explicitly identify the user and
match host/port/database. Ambient application/PG credentials cannot supply the
target; remote TLS verification is required. Preview the concrete operation:

```sh
node --import tsx scripts/r6-cron-resolve.ts \
  --expected-host=APPROVED_HOST --expected-port=5432 \
  --expected-database=APPROVED_DATABASE \
  --run-id=HELD_RUN_UUID --job-id=HELD_JOB_UUID \
  --resolution=verified_safe_retry --review-digest=REVIEW_REFERENCE_SHA256
```

Default is a read-only dry-run. After review, use the same exact arguments plus
`--execute=true --acknowledge-inflight-stopped=true`. Execution refuses a running
cycle, wrong/non-held identity or mismatched target. Failure prints one fixed
code; unresolved/busy execution exits2 without a resolution. Recheck status and
the review record before the next scheduled attempt. There is no HTTP hold-clear
endpoint, automatic expiry, broad “force” or implicit resend operation.

## Capacity and rollback

Heartbeat is15s, lease45s, work budget240s. Every orchestration transaction has
local5s statement/2s lock limits, with3s connection and5s query timeout at runtime.
Provider work executes after the start record commits and outside DB transactions.
Existing pass worksets/order remain; production-sized rehearsal must establish
that work completes within the budget. Review batching before increasing volume
that approaches it; do not bypass holds or raise time limits to mask uncertain
delivery. In-flight external effects remain possible after a timeout.

Rollback must preserve history/holds and stop new coordinated work before changing
code. Do not restart old uncoordinated cron while a run or uncertain effect exists.
R6 health/readiness/bounded full-server shutdown is separate outstanding work.
