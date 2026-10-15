# R6 durable cron — verified repository step, October 15

Phase / release: R6 operations, durable cron step only. **R6 is not complete and
this is not a deployment handoff.** R5 release closeout is deferred, not waived;
track its six open checks in [the checklist](operations/r5-deferred-closeout.md).

Exact branch and commit: `remediation/r6-operations-20261015`, the commit containing
this handoff, based on `847b399a640810e32b8cec2e5a275be257329bf9`. Identify it with
`git log -1 --format=%H -- docs/HANDOFF-2026-10-15-r6-cron-inflight.md`; verify the
tree and remote instead of trusting an old session/run ID. The previous
[logging/inventory handoff](HANDOFF-2026-10-15-r6-inflight.md) remains historical
context for the first R6 slice and pending D9.

Scope completed: PostgreSQL coordinates the twelve cron job types across instances
using committed expiring leases, transaction advisory locks and short transactions.
Each operation obtains/releases its own connection; no session/backend affinity or
transaction across provider I/O is assumed. Job starts commit before effects.
Parent-row locking and owner/lease/deadline predicates fence stale completion.
Subscription billing starts independently; errors in a job do not block unrelated
job types. Completed slots return saved results. Unsafe uncertain jobs stay held
across restarts and later slots; only the existing durable billing/CAS upload
engines are automatically replayable. No production memory-lock fallback exists.

Cooperative producer checkpoints prevent further records/fallback sends after
ownership loss or deadline. A hung promise interrupts orchestration; it does not
prove that an external side effect was cancelled. Contextual uncertain message
sends stop fallback and require reconciliation. Manual behavior outside the cron
context and R3 financial/idempotency/outbox controls are preserved.

Authenticated status includes sanitized freshness, held-job identities, backlog
and dead-letter indicators. The guarded operator CLI previews read-only by default
and requires an exact target, run/job IDs, review digest and explicit execution
with stopped-inflight acknowledgement. It refuses any running cycle. There is no
HTTP clear/force action. See the [runbook](operations/r6-cron-runbook.md) for
reconciliation, rollout, scheduler and monitor settings.

Files changed: the exact 31 runtime/test/config files and their hashes are in
[the source manifest](evidence/remediation-v2-2/r6/R6-CRON-source-sha256-2026-10-15.txt).
The commit also contains scoped reviews, owner decisions, runbook, deferred R5
checklist, verification receipt and public catalog fingerprint. No client source
or checked-in app bundle was changed.

Migrations: `0049a_durable_cron.sql` applied **only to newly named owned local
synthetic clones**, now frozen at SHA256
`8b3aefa3997197b75345f726a9a05f62dcb0e8c5472c262f9326d81647760dfc`.
Never edit applied0048a/b/c or0049a; use reviewed forward migrations. Strict public
schema fingerprint through0049a is
`sha256:7c427b93f2e0a4c8ca48271faabbe07d641ee8a211d519364d6d0ea8002d3888`.
Recorded [catalog](evidence/remediation-v2-2/r6/R6-through-0049a-fingerprint-2026-10-15.json)
and CI pointer agree. This proof reverified canonical R5 bases, applied forward49a
and restored the populated clone; it does not claim complete historical replay
or a live target's ledger state.

Preflight/count-only evidence: explicit owned source host127.0.0.1:55440 and
`r5_full_scratch`/`r5_full_restore`, synthetic marker and application-target exclusion
guards. Both original schemas/counts/policies were rechecked unchanged. The
populated copy and logical restore retained 3,000 links. Final owned targets:
`r6_cron_01dbc855f59b_fresh`, `r6_cron_01dbc855f59b_populated`,
`r6_cron_01dbc855f59b_restored`. Shared/live mutation count0.

Commands/results: [verification receipt](evidence/remediation-v2-2/r6/R6-CRON-VERIFICATION-2026-10-15.json)
records source hashes and private result hashes. All **229 server suites / 5,195
tests** pass in a complete-file union: broad run, final focused suites, entire
migration suite and entire auth-throttle suite. Overlapping runs are not added
twice. The broad run's migration-inventory omission was fixed; the whole74-test
migration suite then passed. No assertion or timeout was relaxed.
`npm run test:r6:cli` passed9 tests; `npm run check`, `npm run check:r6` and
`npm run build` passed. Native verifier passed15 real PostgreSQL checks, including
real backend switching per transaction, two-instance exclusion, duplicate slot,
actual backend disconnect, expired takeover, late-owner refusal, cross-slot holds,
safe billing retry, guarded CLI preview/resolution, SQL history constraints,
freshness/backlogs and populated restore/source preservation.

Negative/no-side-effect tests: authentication precedes DB/job invocation; unknown
sends do not fall through; late work cannot report success or advance rows; live
leases exclude another executor after backend disconnect; held jobs cannot be
automatically retried; wrong/live-parent resolutions refuse; SQL rejects raw or
invalid metrics and history rewrites. Provider/card/message calls0. Real CLI
execution proof operated only on the named owned synthetic clone.

Provider/UAT activity: none. Actual Windcave evidence remains open. Device/browser
evidence: no new client/device regression run. Remote CI: updated, not executed.
Security/privacy review: scoped core/activation and pooling reviews plus
[final review](evidence/remediation-v2-2/r6/R6-CRON-FINAL-REVIEW-2026-10-15.md)
and separately recorded rereads; no external/delegated review is claimed. Status
and fixed errors omit customer/provider payloads and credentials.

External actions: repository commit/push only; no scheduler, monitor, alert
recipient, provider call, deployment, shared/live DDL/data action or main/R4 merge.
Feature flags/payment mode: no activation or enablement. Owner app PID4196 was
preserved throughout; never signal/restart it as part of this task. In-flight
provider effects cannot be ruled out by a local timeout and require review before
any live hold resolution. No live reconciliation was performed.

Known warnings/deferred items: existing Vite browser-data/bundle-size warnings;
no blocking build errors. Production-sized workset rehearsal must establish
completion within240s. R5's deferred checks, Claude's R4/canonical integration,
D9 entitlement/dunning approval and restored real-target report, actual UAT and
professional release review remain. External scheduler and named alert recipient
are unconfigured. R6 is not phase-complete.

Rollback: base847b399a is a reference, not an executable live rollback permission.
Preserve operational history and holds, drain old workers before rollout, and never
restart the uncoordinated predecessor while an uncertain effect/run exists.
Stop on fingerprint/ledger drift, failed proof, lost ownership or unknown effects.

Approvals: owner explicitly deferred R5 closeout and approved holding affected
uncertain job types while other jobs continue; see the dated decision files.
That approval does not answer D9, release a live hold, enable charging or deploy.

Next step: scoped preflight/review for **health/readiness and bounded full-server
shutdown**. Verify signal/drain order, prevent new cron work before pool closure,
bound active work and preserve uncertainty without claiming provider cancellation.
Do not take over Claude's R4. Reuse existing setup/PG17 via the private onboarding
test-env script, shell `login:false`; never print its credential values. No
dependencies, worktrees, environment drafts or sub-agents were added. Never stage
logs, credentials, private dumps, `.claude-home/**`, `.claude/settings.local.json`,
or use `git add -A` / `git add .`.
