# R1-T7 S3b — property schedules

Code: `17a9f71d`; base: `c7741b3f`; branch `remediation/r1-continuation-20260907`.
[Preflight and separate reread](../../../PLAN-2026-10-03-r1-t7-s3-property.md).
Code complete; independent review remains owed. S3c and whole R1 remain active.

Replacement now locks the owned parent profile, terminates only that merchant's
live schedules, inserts the new schedule, and saves creation/replacement history
in one transaction. Concurrent replacements leave one active schedule. Archive
uses the same parent-first lock order. An event write failure rolls back everything.

Authenticated schedule reads, updates and termination require merchant and current
parent ownership. Mutations lock parent then child and recheck identity/state.
Resume computes its date from the locked cycle, preserving the owner decision to
skip paused time. Runtime projection blocks identity, ownership, lifecycle and cron
field injection. Three obsolete global contracts removed; public checkout read and
cron date advance remain explicit separate lanes. The existing pure UTC calculation
was extracted and re-exported to avoid a storage/cron import cycle. Memory property
support stays DB-only. No client/schema changes or new role/entitlement policy.

Verification:

- Independently repeated prior profile/property tests: **3 suites / 78 pass**;
  fresh actual PostgreSQL profile verifier: **9 pass / 0 fail**.
- Red first: new storage tests **17 fail**; HTTP **8 fail**. Corrected the create
  fixture so it intercepts both the old and new readers, then replayed against
  committed `c7741b3f`: **8 genuine failures**. Four implementation files were
  preserved and restored byte for byte in `finally`; no Git reset/stash was used.
- Final affected property/attachment/role/inventory regression: **14 suites /
  419 pass**. Includes all corrected HTTP races and owner/member served contracts.
- Fresh actual PostgreSQL schedules verifier: **17 pass / 0 fail**. Eight parallel
  replacements; archive/replacement lock order; scoped inconsistent-child handling;
  cancellation and parent/child ownership/reparent waits; latest-cycle resume;
  real event-trigger failures rolling back replacement, pause and termination.
- `npm run check`, `npm run build`, `git diff --check` and staged whitespace pass.
  Inventories regenerated: **187 registrations / 0 unclassified / 0 gaps;
  232 storage contracts**. No full-server/client/browser rerun is claimed.

Commands and logs: the three-test baseline, focused storage/HTTP red runs, corrected
committed-base replay, the 14 `--runTestsByPath` suites, both PostgreSQL verifiers,
typecheck/build, route-policy and tenant-storage generators. Logs are under
`/tmp/taptpay-s3b-*`; they contain synthetic output, not application database records.

No application database/provider, live migration, feature enablement, UI, push or
deployment action. Only the named disposable loopback databases were migrated.
The disposable server remains running only for the next S3c verification during
this active turn; it is not application state and must be stopped before handoff.
Build warnings remain the existing large chunks and stale browser-data package;
Jest retains its existing ts-jest configuration warning.

Rollback: fix forward; do not restore globally keyed authenticated writes or
non-atomic replacement. Existing September 27 owner decisions authorize the retained
schedule behavior; October 3 authorization directs continuing the remaining R1 work.
Review focus: parent-before-child locks, post-wait predicates and state checks,
replacement/history transaction, field projection and untouched public/cron lanes.

Next: S3c property invoice management and authenticated delivery; then S4–S6,
Apple implementation and R1-T10 acceptance. Existing external/provider/device and
independent review gates are unchanged. This batch does not close R1-T7 or R1.
