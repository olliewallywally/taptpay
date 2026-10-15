# R6 first repository slice — phase remains in progress

Branch `remediation/r6-operations-20261015`, base R5
`3534978f1443dad6429fdd902bbc833836048c88`. Owner instructed “Ok then start of r6”.
Claude owns R4. The first slice is the commit containing this handoff; it is not
R6 phase completion, a main merge or deployment. R5 live-target/retention gates
remain open. GitHub main was checked read-only:17932265 (September30), not merged.

## Implemented and verified

AsyncLocalStorage request/job context, UUID response header before body parsing,
bounded descriptor-only central redaction, strict one-line JSON and safe global
5xx/parser errors. Provider/job/security call sites use this boundary;329 console
calls in17 explicit runtime files were migrated with their arguments behind a
redacted payload. Existing static categories remain but old prose is suppressed.
Typed cron completion/failure fields preserve counts/duration/fixed job names.
Existing audit queue/private0600/bounds/finite drain remain. Session audit joins
use diagnostic SHA256 prefixes instead of raw IDs. Two analytics500 responses no
longer return upstream error.message; their route facts now reflect that.

Actual cron HTTP tests prove all12 passes get distinct job IDs, retain their
request ID across overlapping work and continue after a failed pass. Durable
workers/recovery batches and loop-failure diagnostics carry job context. This is
logging context, not cross-instance cron serialization; cronRunning is still local.

The dedicated read-only entitlement CLI scans an explicitly named target only,
in a repeatable-read READ ONLY snapshot with bounded keyset pages and rollback.
It counts all merchants including missing subscriptions, applies the unchanged
shared gate, reconciles totals, flags period/payment-date claims and reports token
presence without selecting/decrypting values. Provenance is unclassified and
proposed blocked-after remains null/pending_D9. No access or billing-history change.

Read [operator notes](operations/r6-observability-and-entitlement-inventory.md),
[final review](evidence/remediation-v2-2/r6/R6-OBSERVABILITY-INVENTORY-FINAL-REVIEW-2026-10-15.md),
[verification receipt](evidence/remediation-v2-2/r6/R6-OBSERVABILITY-INVENTORY-VERIFICATION-2026-10-15.json)
and [54-file source manifest](evidence/remediation-v2-2/r6/R6-OBSERVABILITY-INVENTORY-source-sha256-2026-10-15.txt).

## Evidence and failure history

All224 currently discoverable server suites /5,169 tests pass, zero missing files,
failures or skips, in a verified complete-file union. The broad run completed with
nine failures in five suites (old audit/console/request formats and two stale
analytics error facts). Full reruns of all five suites pass81 tests after fixing
the diagnostic session join and adapting the format assertions; original security
behavior assertions remain. Full auth-throttle separately passes18 tests, with
unchanged assertions/timeouts. Final affected-source run:10 suites /127 tests.
Overlapping runs are not added twice; this is not a single-command broad pass.

Four standalone CLI safety tests and four actual PostgreSQL checks pass. PG proof
uses six synthetic merchants/five subscriptions in newly named clones, verifies
READ ONLY on every page, demonstrates a refused write, exercises actual target
validation and confirms the original source policies/data remain unchanged.
Application and R6 script typechecks pass. Production client/server build passes;
final server-only context changes were rebundled using the successful client build.
CI hooks are added, but remote CI has not been executed.

Private diagnostics are in /tmp/taptpay-r6. Earlier interrupted authentication
run, failing-first cases and an intermediate command with three nonexistent test
filenames are retained and explicitly not described as passes. The three timed-
out cases passed in isolation and the entire file then passed. Correct explicit
focused paths pass. No tests/timeouts/constraints were disabled. Do not rerun the
private migrate-console.cjs/context-workers.cjs blindly; they were already applied.

## Owner D9 answer pending

An async question asks approval for honoring verified explicit migration grants
until their recorded end, without inventing a bill, preserving initial/day1/day3/
day7 attempts and eight-day paid grace. No reply has arrived. Plan§13.1 explicitly
requires approval before access changes. Missing lastBillingDate alone cannot
establish a grant. The current inventory does not pretend to assess after-policy.

## Remaining R6 work, in order

1. Review concrete durable cron policy/schema before implementing it. Replace
   process-local serialization with database coordination, parent/per-job history,
   fencing, safe takeover/retry and authenticated freshness/backlog/dead-letter
   status. Keep existing pass order and independent subscription start. Initial
   property/trades email/WhatsApp delivery is still send-then-mark: a scheduler
   lease alone cannot make crash recovery idempotent. Handle unknown sends with
   reviewed durable idempotent delivery or an explicit held/review policy before
   claiming safe takeover. Existing R3 money/outbox protection stays intact.
2. Health/readiness and graceful shutdown remain absent. Minimal liveness;
   readiness requires boot/config, bounded DB SELECT1, cached actual migration/
   fingerprint validity and not-draining. Freshness stays in authenticated ops
   by default. Mark draining before listener close, stop initiations/jobs, bound
   HTTP/SSE/workers. Test isolated owned child processes only.
3. After D9 approval, review exact provenance/history forward migration and
   restored before/after counts before updating shared access policy. Never
   fabricate charges/grants, patch routes individually or edit applied0048a/b/c.
4. Arrange actual stored-card UAT through the existing R3 checklist plus§13.2:
   period/restart survival, stable X-ID/one charge, two workers, timeout, decline,
   approved grace, replacement/removal/expired token. Real charging stays off.
5. Owner/operator configures external scheduler cadence/auth/timeouts/retry and
   alert ownership, produces real-target report/rehearsal/UAT, and integrates
   Claude R4 against canonical R3/R5 before shared release. No such evidence exists
   in this slice. R6 cannot close until its remaining exit conditions are met.

## Environment and staging

No shared/live migration, provider/message call, deployment or owner app restart.
Preserve owner appPID4196. Reuse existing setup and local PG17/port55440;
/workspace/.onboarding/r3-postgres/test-env.sh initializes the test environment.
The R6 verifier independently guards r5_full_scratch as its owned synthetic source
and creates new clones; original source policies remain legacy/unselected.
No worktree, dependency or environment draft change was needed.

Use login:false shells and explicit Git paths, never git add -A or git add .;
exclude logs/, .claude-home/**, .claude/settings.local.json, private dumps/keys/env
and fixtures. Read AGENTS.md/CLAUDE.md, the plan§13/§21 and current scoped reviews
before next code. Historical phase handoffs are not approval for new work.
