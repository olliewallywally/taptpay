# R6 health, readiness and shutdown

This repository step implements plan13.4. It does not activate a deployment,
configure an external monitor, answer D9 or close R6. The
[cron runbook](r6-cron-runbook.md) and [deferred R5 checklist](r5-deferred-closeout.md)
remain applicable. Claude owns R4 and canonical release integration is separate.

## Public probes

| Endpoint | Result | Dependency/meaning |
| --- | --- | --- |
| `GET /healthz` |200 `{"status":"ok"}` | Process can answer HTTP. No DB or provider call. Remains live during drain until listener closure. |
| `GET /readyz` |200 `{"status":"ready"}` or503 `{"status":"not_ready"}` | Boot complete, configuration loaded successfully, bounded DB SELECT1, fresh cached schema/ledger validation, not draining. |

Both use no-store, inherit security/request-ID headers and disclose no diagnostics,
host, schema, credentials, provider status or customer information. They run before
body parsing and business admission. Invalid required configuration fails before
the listener starts; optional audit-mode diagnostics are not invented required
settings. Missing DB in explicit development MemStorage mode leaves readiness
false while the app and liveness can work. Production startup still fails closed
if the database or migration/schema validation fails.

Use liveness for process replacement and readiness for routing. A DB outage must
not cause an automatic liveness restart loop. Scheduler staleness and reconciliation
backlog stay in authenticated operations status; they do not remove public traffic
through readiness without a separate deployment-owner decision.

## Bounded dependency checks

The readiness pool uses the existing Neon transport, at most2 connections,
1500ms connection and1000ms query timeout. Public DB probes have a2500ms response
budget, share one physical attempt per process and cache its outcome for1s. A
timed-out physical attempt remains registered until it actually settles, so
repeated probes cannot enqueue unlimited replacement work.

Schema validation checks the complete migration ledger against current checked-in
names/checksums/order and the canonical strict public-schema fingerprint. It uses
one short REPEATABLE READ READ ONLY transaction with LOCAL timezone/search path
and timeouts. It reads metadata and the ledger, creates no ledger/schema and scans
no application row data. The canonical digest through frozen0049a is
`sha256:7c427b93f2e0a4c8ca48271faabbe07d641ee8a211d519364d6d0ea8002d3888`.

Validation runs at boot and refreshes every60s, with a15s response budget and
one physical refresh. A failed refresh invalidates readiness immediately; a
success expires after90s even if a later refresh hangs. Late success after timeout
or drain cannot restore validity. HTTP requests never trigger catalog scans.
Recovery requires successful validation, not restarting or learning the target's
schema as a new baseline. Canonical release/schema changes require a reviewed
artifact and matching expected digest; no environment bypass is provided.

## Shutdown order and evidence

SIGTERM/SIGINT handling is installed before awaited bootstrap work. A repeated
signal shares the same shutdown and deadline. The process:

1. Marks readiness false and rejects new business requests with a fixed no-store
   503, `Connection: close` and Retry-After before parsing or initiation.
2. Stops new cron runs/worker ticks/schema refresh/keepalive work, and ends SSE
   subscriptions. The broker refuses new streams and suppresses pending writes.
3. Closes the listener and idle connections, finishes accepted HTTP responses,
   and waits up to7s for active bootstrap, HTTP, cron, worker and SSE work.
   Completed keep-alive responses end their socket once all accepted requests
   there have finished. Subscription loops stop between recovery records/phases.
4. After a successful drain, allows1s for application/cron/readiness pools and
   development Vite cleanup. Attempts an audit-log flush within1500ms.
5. Exits0 only after successful drain/resource close/audit flush. A fatal startup
   or production uncaught exception exits1 even if cleanup succeeds. A hard10s
   process deadline bounds the sequence. Existing development exception and
   unhandled-rejection policy is retained with fixed diagnostics.

An explicit per-app tracker retains native async-handler promises independently
of socket/response lifetime. A client disconnect cannot let normal pool cleanup
overtake that accepted work. The existing async-route guard still preserves
rejection forwarding, handler arity and lazy-thenable protections. During drain,
a delayed callback cannot dispatch a new handler on a destroyed/ended response.

On drain timeout, destroy only this process's remaining sockets, skip normal pool
closure while active work may still need its connection, attempt the bounded
audit flush and exit1. Durable R3 claims and R6 holds/leases remain for recovery.
A transport timeout, closed HTTP socket or process exit does **not** prove that
an external send/charge was cancelled. Reconcile possible effects using domain
procedures; never manufacture a new charge or clear an uncertain hold to test it.
Worker drain tracks the accepted task, including its current durable item; it
does not claim to cancel a provider promise that already escaped a transport
timeout. R3's existing target/attempt identity and uncertainty controls remain.

Startup port conflicts return failure and never terminate another process.
Signal/HTTP tests use their own ephemeral listeners and child processes; the
owner workspace app remains untouched. Applied migrations0048a/b/c and0049a are
unchanged. This step adds no migration.

## Activation and rollback

The release operator must verify the platform's termination grace permits the10s
budget plus scheduling margin, set the public probe URLs in deployment/monitor
settings, and rehearse a rolling restart on the approved combined build. Monitor
fixed shutdown/schema diagnostics and readiness failures through the approved
log route. No platform settings or alert recipient were configured by this work.

Freeze canonical schema/code/migration history together. Stop on pending/drifted/
orphaned/out-of-order ledger, fingerprint mismatch, failed tests or uncertain
effects. Preserve cron history, leases and holds through rollback. Do not restart
old uncoordinated workers alongside the new coordinator. No live-target check,
provider UAT, charging enablement or deployment is implied by local proofs.
