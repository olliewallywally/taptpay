# R6 D9 entitlement implementation — repository handoff

Phase / release: R6 plan13.1 repository work. D9 is now approved and implemented;
official R6 release exit still requires the real-target/UAT/operator evidence below.

Exact branch and commit: `remediation/r6-operations-20261015`, base
`aa0802b2064744c445e5f7aff3962abee84cd919`. Exact implementation commit is the one
containing this handoff; resolve with `git log -1 --format=%H --` and this path.
Read actual status/remote rather than relying on old process/session IDs.

Scope completed: owner D9 decision, typed shared entitlement/dunning policy,
append-only evidence-bound service periods and revocations, same-transaction
capture of applied paid periods, atomic application parent/control/provenance
reads, counts-only before/after comparison and guarded local operator tooling.
All existing HTTP/job send gates retain the shared helper. Renewal-card readiness,
R3 charge identity, unknown recovery, cancellation and billing ownership remain
separate. Current unpaid grants survive billing past_due/suspended state without
manufacturing payment history. No historical row is classified automatically.

Files changed: exact runtime/schema/test/CI/tool paths and SHA256s are in
`evidence/remediation-v2-2/r6/R6-D9-source-sha256-2026-10-15.txt`. Read the
[rollout runbook](operations/r6-entitlement-rollout.md), adopted
[proposal](operations/r6-entitlement-policy-proposal.md) and
[decision](decisions/2026-10-15-r6-d9-entitlement-and-dunning.md).

Migrations: new forward0049b_subscription_entitlements.sql, frozen after first
owned application at SHA256
`e8d4303ab2463f9e8aa9d2cfd95d0e8383e5e8cb61eaf9253cb1e6afbab157dc`.
Applied0048a/b/c and0049a remain byte-identical. Canonical strict public-schema
digest through0049b is
`sha256:3d6ff3e4471e623cfed35fc5971521e537142ece22eae6a546e3ebdf52969c40`;
readiness and its native verifier now require that schema plus complete ledger.
R4 integration must reconcile code/schema/evidence; do not edit applied files.

Preflight queries and count-only results: guarded source127.0.0.1:55440,
r5_full_scratch and r5_full_restore, with strict original R5 fingerprint and
application-target exclusion. Verifier creates random owned r6_policy clones,
rehearses empty history/default legacy state, reviewed grant and paid historical
classification, actual enforced application reads, failed/unknown/approved billing
and post-capture rollback/reconciliation. Populated clone retains all original
business rows; logical restore preserves catalog, history, policy and aggregate
report. Original source schema/counts are rechecked unchanged. Historical ledger
baseline on the synthetic clone uses complete effect verification, not a claim of
fresh historical replay. No production-sized or real-target proof is claimed.

Commands run and results: final
`evidence/remediation-v2-2/r6/R6-D9-VERIFICATION-2026-10-15.json` records exact
commands/log hashes/source hashes. Focused whole-file regression:23 server suites,
526 tests, all passed. This is not a new run of all235 historical server suites.
Native PostgreSQL:18 D9 checks,4 inventory checks,8 readiness checks, all passed.
Operator CLI safety15 tests and canonical fingerprint28 tests passed. Both
typechecks and production build passed; final server was rebundled against the
unchanged client build. CI is wired for the new policy/CLI tests; no remote CI
execution or external review is claimed.

Negative/no-side-effect tests: classification is physically READ ONLY by default;
unknown inputs, wrong target, unpinned manifests, bogus paid sources, tenant
mismatch, history mutation and unsafe activation are refused. Enforced
classification locks affected parents and refuses loss of their current access,
including grants previously blocked by legacy policy. Two independent billing
engines make one synthetic purchase/bill/paid period. Uncertain provider result
creates no paid period/decline increment. Failure after paid capture rolls back
bill and period; retry queries the same provider identity and never repeats POST.
Actual DB drift/closed-pool readiness tests still refuse and recover. Public DTO
does not expose internal entitlement context or evidence. No constraints,
timeouts or assertions were weakened.

Provider/UAT activity:0 real provider/card/message calls. Only injected synthetic
billing outcomes. Device/browser evidence: no client change or new device run.

Security/privacy review: required ten-heading preflight plus separately recorded
rereads, focused query-qualification review, and final review. Reports expose only
counts and snapshot time; manifests stay private and are file-digest pinned.
Runtime projections exclude review/provider identities. Tools print fixed errors.
No sub-agents or delegated/professional sign-off is claimed.

Failure history: first policy module was absent (zero executed tests, not a pass).
Report tests reproduced the absent after-policy assessment. Native application
query exposed Drizzle stripping outer column qualification inside correlated SQL
(42883); static qualified identifiers fixed it without changing migration.
An initial pending fixture incorrectly used a future renewal date; correcting its
initial due anchor established current rather than future paid access. Native CLI
found the generic option parser rejecting manifest-sha256; positive command test
failed first, then the allowlisted parser was repaired. Independent restore clocks
were initially compared for equality; reports now validate each clock and compare
all actual counts. The populated-template attempt correctly refused an open
verifier connection (55006); closed that source observer before cloning. The exact
owned verifier804775 was checked by argv and SIGINTed to release its leaked test
observer; owner4196 was untouched. A later native negative test exposed loss of
current grants through correction tooling; parent-locked before/after effective
access comparison now refuses it. Formatter relocation of a ts-expect-error was
fixed with a namespace import. Failed outputs are retained privately and hashed.

External actions: repository commit/push only. No shared/live DDL/data mutation,
provider/message calls, deployment, activation, scheduler/recipient configuration,
R4/main merge or live reconciliation. Owner app PID4196 remains untouched.
Feature flags/payment mode after deploy: no deployment or configuration change.
The migration's default policy is legacy; explicit activation requires real-target
classification/comparison, reviewed release digest and release-check acknowledgement.

In-flight operations/reconciliation status: no live operations inspected/resolved.
R3 unknown attempts retain their identity and holds. Test databases/processes are
owned and synthetic; do not reuse their classifications on a real target.

Known warnings/deferred items: existing browser-data/chunk-size and ts-jest
deprecation notices. Remaining R6: approved restored real-target provenance and
before/after report, actual Windcave stored-card/purchase/retry/decline UAT and
professional scope/release review, external scheduler and named alert recipient,
deployment probe/termination settings and rolling-restart/capacity evidence.
Claude owns R4; canonical R4 integration and six deferred R5 release checks remain
combined-release prerequisites. D9 is no longer an unanswered decision.

Rollback commit and constraints: aa0802b2 is a source reference, not an approved
live rollback. Preserve all schema/history/periods/attempts/holds. Control is
one-way; do not bypass it by deploying an old reader. Reviewed revocations append
evidence and cannot silently remove current access. Stop/reconcile uncertain
effects before rollback. Do not run old and new cron together.

Approvals: owner “Ok go ahead” approved the concrete D9 proposal. Existing
directions cover repository implementation and commit/push. No live activation,
real charges or deployment is implied. No further D9 approval is needed.

Stop conditions checked: unsafe classifications/activation/history edits fail;
schema/ledger drift refuses readiness; applied files remain frozen; all stated
checks finish green. Official R6 remains open for the named external evidence.

Next phase prerequisites: complete those release inputs before claiming R6 exit.
Do not take Claude's R4 or start another phase without owner direction.

Environment: reuse existing PG17 setup and private test-env script, shell
login:false. No dependency/worktree or environment draft/configuration changes.
Never stage logs/private manifests/env/dumps, .claude-home or local Claude config;
stage explicit reviewed paths only.
