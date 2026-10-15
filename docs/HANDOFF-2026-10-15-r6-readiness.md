# R6 health/readiness and bounded shutdown — repository handoff

Phase / release: R6 operations, plan13.4 repository step. This is not official R6
exit or deployment approval. Branch `remediation/r6-operations-20261015`, base
`b7fa2de91b508eb624d2257eafc2dee7c53b1439`; exact commit is the commit containing
this handoff (`git log -1 --format=%H -- docs/HANDOFF-2026-10-15-r6-readiness.md`).
Verify the tree/remote instead of relying on old background session IDs.

Scope completed: minimal public no-store `/healthz` and `/readyz`, admission guard
before parsing/initiations while booting/draining, bounded single-flight DB checks,
and cached strict schema plus ledger validation. Required config errors still
prevent startup. The schema check uses a READ ONLY snapshot, expires stale success
and rejects a late result after timeout/drain. Scheduler freshness remains in
authenticated ops status, as plan13.4 specifies. No target-learned schema baseline
or environment bypass was added.

Signal handling now starts before asynchronous bootstrap. Drain tracks bootstrap,
HTTP, cron acquisition/lease cleanup, active payment/subscription/delivery workers,
SSE authorization and keepalive/schema tasks. It stops scheduling/admission first,
ends SSE, closes completed keep-alive sockets, then closes pools/Vite and flushes
audit events. Repeated signals share the deadline. Uncertain work times out with
nonzero exit and retained durable claims/holds; pool closure does not race a still
active worker. Startup binding never kills an unrelated port owner. Production
uncaught/startup failures remain fatal; development exception/rejection policy is
preserved with fixed diagnostics.
An explicitly injected per-app tracker also retains actual handler promises after
client disconnect/response completion. Delayed callbacks cannot dispatch a new
handler on a destroyed/ended response during drain. Existing async-route rejection,
arity, mountable-router and lazy-thenable protections remain. Real disconnect tests
first reproduced premature pool closure and untracked late dispatch, then passed
after app/guard/bootstrap integration. The server-side close event is awaited
explicitly in that fixture; a client-local close alone is not server confirmation.

Files changed: exact runtime/test/config source hashes are recorded in
`evidence/remediation-v2-2/r6/R6-READINESS-source-sha256-2026-10-15.txt`. Policy,
middleware review and generated inventory now include the two deliberate public
probes and their minimal disclosure. No client source/bundle change. CI runs the
new synthetic lifecycle tests; no remote CI execution is claimed.

Migrations: none added or edited. Applied0048a/b/c and0049a remain frozen.0049a
SHA256 `8b3aefa3997197b75345f726a9a05f62dcb0e8c5472c262f9326d81647760dfc`.
Canonical schema digest through0049a remains
`sha256:7c427b93f2e0a4c8ca48271faabbe07d641ee8a211d519364d6d0ea8002d3888`.
Canonical R4 integration must update/review schema/code/evidence together; never
edit applied SQL or automatically accept whatever schema a target currently has.

Preflight/count-only evidence: explicit local synthetic source `127.0.0.1:55440`,
`r5_full_scratch`, marker/application-target exclusion guards and strict original
R5 fingerprint. Readiness verifier creates a new random `r6_ready_<12hex>` clone,
applies frozen49a there and baselines the already verified historical effects with
the normal complete effect verifier. No historical replay/live ledger assertion.
Canonical fingerprint SQL/functions were extracted byte-for-byte into a pure
core module; the CLI retains its exports, guarded target selection and entrypoint.
The application imports only the core, preventing CLI execution when bundled.
Actual drift tests mutate and restore only that clone; original source schema and
merchant/transaction counts are rechecked unchanged. Final catalog is canonical.

Commands/results: the final verification receipt at
`evidence/remediation-v2-2/r6/R6-READINESS-VERIFICATION-2026-10-15.json` records
complete-file server regression coverage and exact counts, result/source hashes,
both typechecks, CLI safety and build evidence. Production client/server build
passed; the final server-only bootstrap change was rebundled against that client
build. Native readiness verifier passes8 checks; re-executed durable-cron verifier
passes all15 checks on new owned scratch/populated/logical-restore targets.
Operator CLI safety passes9 tests.
Final complete-file union: **235 suites / 5,220 tests passed**, zero missing,
failed or pending tests. Canonical fingerprint tests pass28; the source manifest
covers39 runtime/test/config files. Overlapping runs are counted once per file.

Negative/no-side-effect evidence: boot/config/schema failures refuse readiness
before unnecessary DB probes; hung checks cannot queue replacement queries; late
results cannot revive draining readiness; real schema/ledger drift and a closed
DB connection pool fail then recover. Real SIGTERM/SIGINT with repeated signals
drain open SSE, active HTTP and workers before pool/audit closure. Tests cover
stalled work, nonzero audit/fatal failure, late resource registration and occupied
port preservation. Existing audit200-event flush/disk-failure tests remain intact.
No assertion/timeout or database constraint was relaxed.

Failure history: initially absent modules failed loading, then one hung-probe test
needed to await actual physical completion. Real signal tests exposed an idle
keep-alive socket delaying listener closure; source now ends it only after its
accepted requests finish. Inventory assumptions that all middleware precedes the
first route were updated to verify exact probe/security/parser ordering. Review
text now explicitly says no route rate limiter. The first native verifier passed
an unsupported log callback as a migration timeout override; normal timeout
validation correctly refused it, and the corrected invocation passes. Compiler
checks caught test-helper generic/parameter types and a formatter-moved suppression;
fixed without weakening runtime guards. Final receipt preserves prior failed runs.
Final bundle review reproduced the CLI-entrypoint relocation bug with exit1 and
FINGERPRINT_INVALID_CONNECTION in an isolated no-credential fixture. The pure-core
extraction resolves it; the bundled fixture now exits0 without CLI output. Broad
regression also found stale tenant/public served-route inventories; regenerated
the tenant record and added actual public probe requests and family ownership.
The long in-band regression run later hit unchanged five-second fixture timeouts.
Its exact owned runner709133 was verified by Jest/output arguments and SIGINTed;
owner app4196 was untouched. Subsequent complete-file proofs use fresh batches
and isolated whole-file processes (at most two at once) without increasing
timeouts or weakening assertions. Only exact owned verification runners were
stopped when changing process isolation; completed file results were preserved.

Provider/UAT activity:0 provider/card/message calls. Device/browser evidence: no
new client/device run. Security/privacy: fixed public statuses and diagnostics,
read-only metadata checks, guarded synthetic verifiers, scoped preflight and final
review plus separately recorded rereads. No delegated/external review is claimed.

External actions: repository commit/push only. No deployment, live/shared DDL/data
mutation, feature/payment-mode activation, external scheduler/monitor/recipient
configuration, R4/main merge or live hold resolution. Owner app PID4196 remains
running and must not be signalled/restarted. No sub-agents, dependency/worktree or
environment configuration changes. Private logs/dumps remain outside Git.

In-flight/reconciliation status: no live reconciliation performed. A closed
socket/process or timeout does not prove provider cancellation. Use the existing
R3 domain procedures and owner-approved R6 uncertain-job holds; never invent a new
attempt identity or clear a hold merely to retry. Normal active work can finish
its accepted durable item; timeout exits1 and leaves recovery evidence.

Warnings/deferred items: existing Vite browser-data/bundle-size warnings only.
Remaining R6 exit gates are D9 approval and shared entitlement/provenance policy,
restored real-target before/after report, actual stored-card/purchase UAT and
professional release review. External scheduler, named alert recipient, platform
probe configuration, termination grace and rolling-restart/capacity rehearsal
remain release-operator work. R5's six deferred checks and Claude's canonical R4
integration remain open. None is waived by passing repository tests.

Rollback constraints: preserve schema/history/holds; stop new work and reconcile
uncertain effects before rollback. Do not blindly deploy the process-local cron
predecessor. Base b7fa2de9 is a repository reference, not an approved live rollback.
Stop on ledger/schema drift, failed proofs or unknown effects.

Approvals: existing user direction covers this next repository step and commit/
push. Owner's uncertain-job hold decision remains unchanged. D9 is still pending.
Next phase prerequisites: resolve the remaining R6 decisions/evidence before
official exit. Do not start another phase or take Claude's R4 without direction.
Read [the operations runbook](operations/r6-health-readiness-shutdown.md) and
[previous cron handoff](HANDOFF-2026-10-15-r6-cron-inflight.md).

Environment: reuse the existing setup/PG17 private test-env script, shell
`login:false`, no credential printing. Never stage `logs/`, private env/dumps,
`.claude-home/**` or `.claude/settings.local.json`; use explicit paths only, never
`git add -A` or `git add .`.

Final freeze note: removed one terminal separator blank line from the extracted
core after functional freeze. SQL/function bytes and compiled server bytes remain
identical. All235 suites were checked after functional freeze; the receipt records
the harmless formatting exception and exact before/after hashes.
