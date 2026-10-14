# R3 regression cutover — bounded fixture review

## Verification of Prior Fixes
Full client: 133 suites / 1500 tests pass with no skips. Build and typecheck pass
at their recorded scope. Owned PostgreSQL: 72 durability, 16 subscription,
14 command, 10 delivery and 24 actual-route checks pass. Fourteen retail served
contract tests also pass. Migration checksums and both complete schemas match.

## Blocking Issues
The full server candidate is not green. Historical fixtures call legacy wrappers
or supply bare sessions without UUID/share/persisted attempts; those are no longer
completion authority. Refusal/positive coverage must be repaired before commit.

## High-Risk Concerns
Do not restore boolean-only provider outcomes, select the next pending share,
or ACK without a database. Do not manufacture observations in production.
Use the actual R2 parser/verifier for synthetic positive payment evidence.

## Missing Steps
Complete retained route/permission fixtures and exact actor assertions. Preserve
missing/foreign-session, expired-state, amount/account/share mismatch, unknown
acceptance, duplicate and disabled-initiation checks. Rerun the full server
suite against the final tree; passing subsets cannot stand in for it.

## Unsafe Assumptions
A MemStorage HTTP app has no durable inbox or invoice attempt engine. Its old
mocked wrapper does not configure the new runtime. Use explicit injected test
ports to test controller projections/delegation; the actual registered routes,
concrete FKs, verification and financial/outbox effects are independently exercised
by verify-r3-http-postgres.ts and the 72-check fault suite. No test deletion or
skip is approved merely to remove a failure.

## Required Ordering Changes
Capture the existing red assertion, repair the request/fixture with the exact
UUID/share and configured port, retain its security and one-time assertions,
then run that subset. When an assertion requires an obsolete direct email or
wrapper, replace it with the equivalent reviewed outbox/shared-verifier contract.
Preserve environment-first import order before the app/harness/config modules.

## Open Product / Provider / Legal Questions
No new product decision. Preserve the current retail/invoice split allocations,
owner cancellation policy, card restart intent, conditional R2 field policy and
all production flags. Official UAT and production-sized restored proof remain open.

## Compliance and Data-Handling Notes
Synthetic credentials and contacts only. Guard the owned DB before importing
app/config. No external fetch, provider, email or push. Actual provider replies
are synthetic typed fixtures (`authorised`, stable ID and money/reference); browser
`approved` is never evidence. No sensitive fixture payload enters evidence files.

## Test and Rollback Adequacy
Do not broaden business behavior to satisfy a pre-cutover request. Test ports do
not prove SQL durability; actual PostgreSQL rehearsal is separately recorded.
Final source, generated inventories, typed graphs, migration fingerprints,
client/server regressions and build must agree before the authorized push.
Rollback retains schema/financial identity and never reinstates blind resends.

## Final Recommendation (Approve / Do not approve)
Approve this bounded request/fixture cutover with equivalent coverage and a full
rerun. Do not approve committing the candidate while server checks are red, and
do not approve R3 exit or release without the external evidence.

Separately recorded reread: financial positive tests must exercise the actual R2
normalizer/verifier and real attempt identity. Merely mocking a wrapper's boolean
cannot test the new path. The 24-case served PostgreSQL proof does this across
numbered/token/property/trades, full/split and cross-aggregate session reuse.

Coverage mapping for repaired fixtures: R1 session binding now tests both hosted
and Google Pay with valid UUIDs, foreign/unprepared and legacy-row-only session
refusal, and actual preparation/verified completion/replay. Numeric callback
parsing keeps malformed suffix/decimal/sign/exponent cases and adds owned hashed
state positive receipt plus cached-state-only refusal. Exact-share tests retain
under/over/wrong-remainder, full price and all three shares; same-command retry
now proves one provider creation rather than permitting a second purchase.
The R0 no-database notification fixture now requires retryable 503 (GET/JSON POST)
or method 405; its cached-row callbacks require reconciliation 409. These are
explicit fail-closed compatibility checks, not synthetic money finalization.

R2 trace mapping: original recorded-expected-values, browser cancel versus verified
decline, amount mismatch and approval/unknown/throw diagnostics now use actual
synthetic R2 observations and fixed worker enum codes. The owned actual-route
script separately asserts the persisted retail reconciliation code/time. Provider
error text is no longer converted into a free-form attempt diagnostic.

October 14 contract reread: the route matrix must record the implemented 404 for
an unknown checkout callback rather than its obsolete homepage redirect. Numeric
callback is now a state-bearing link, and belongs in unknown-link refusal coverage.
Synthetic wallet links must use the actual pinned `/mh/` path. A mismatched query
is held with `integrity_mismatch`; an unavailable query retries. Financial tests
must distinguish those states. Quote view/response fixtures configure the scoped
atomic port, and acceptance supplies a paid subscription. Cron's route fixture
checks orchestration/delegation; the dedicated cron and PostgreSQL subscription
checks prove renewal, fencing and history. Delivery routing has its own stored
receiver proof; completion tests assert no direct bypass email. Approve these
bounded fixture and matrix-fact corrections, subject to the final full regression.

Final completed-run reread: the full server invocation covered 214 suites / 5016
tests (196 suites passed; 18 historical fixture suites were red). Retain its raw
result hash, then rerun every red suite and every affected policy/receiver/caller
suite. Preserve coverage for all 214 names and publish the exact replacement
results; do not call the original red invocation green. Separate per-file Jest
registries make this valid final coverage when production financial paths are
unchanged. The late product correction is quote-blocked notice content (owned
customer name and configured Billing URL), tested through the real PG receiver
and pure renderer. All receipt adapter/receiver suites must rerun for that change.
Creation API selectors now use the existing typed path builder without changing
request URLs. Regenerate policy/facts and rerun their whole dependent family.
Do not drop failed/cancelled cancellation cases: unpaid records are now audited
and safely replayed, while captured states remain refused. Mock ports must return
empty arrays for unrelated tables, support transaction timeout SQL and returning
IDs, and retain lock/scope/CAS assertions. Actual concurrency/rollback proof is
separately exercised by the guarded PostgreSQL suites. Approve this bounded
complete-run plus explicit replacement-suite evidence, with no unresolved latest
failures, typecheck, client regression, build and exact staged source manifest.
