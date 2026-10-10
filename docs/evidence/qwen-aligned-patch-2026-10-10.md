# Qwen patch aligned with the latest push

Base: `bd5d120498503e0e0607c0bc814a88c81a80e1e9`, remote branch
`remediation/r1-continuation-20260907`. Author/committer date: 2026-10-10
11:39:10 UTC. Remote tip was independently checked again before application.
This confirms the commit is from today; GitHub push-event time was not queried.
`main` remains at `17932265`. The original patch was based on that older main.

## Verification of Prior Fixes

Reviewed the five commits in the handover's latest push range
`fe7e41bf873c7523256c42a3ffc08b51497eb038..bd5d1204` and compared the
original patch with the full 97-commit branch difference. The original patch
failed to apply in seven files. Resolved conflicts against current source,
regenerated route policy inventory, and preserved cookie sessions/CSRF,
tenant-scoped payment reads/writes, reconciliation errors, inactive-board 404,
signed OAuth state, and Apple private-key configuration. No client source,
dependency, schema, migration, or feature flag changes were introduced.

The supplied guide contains 14 numbered findings, not an identified 47-push
range. Implemented the supported corrections: indistinguishable merchant and
transaction refusals; random process-local development key; explicit unknown
proxy warning; defensive active-transaction null; IPv6 /64 limiter keys;
strict Tap to Pay input and stored-charge validation; bounded asynchronous
audit logging and shutdown; shared request types; bounded base64 padding
validation; cash-sale cast removal; accurate OAuth delimiter documentation.
Inactive boards already return the correct uniform 404 upstream and this was
retained. No unsupported circular-dependency explanation was added (issue 11).

Added regressions use cookie sessions and scoped storage. Tests explicitly
check CSRF refusal, merchant-scoped lookup/finalization and reconciliation
when a scoped update fails. Session audit tests now wait up to two seconds for
the actual asynchronous event and still assert event presence and secret
redaction; no security assertion was removed.

## Blocking Issues

No identified blocker to applying this patch locally. Production release
approval is outside this review; existing payment/native readiness gates remain.

## High-Risk Concerns

Tap to Pay retry/concurrency/idempotency and real iPhone/provider behavior
remain separate launch requirements. The general limiter remains process-local.
Audit logging can lose events on disk failure, overload or shutdown timeout,
with explicit diagnostics; it is not a durable financial ledger.

## Missing Steps

Live Windcave, PostgreSQL and native iPhone validation were not performed.
No deployment, migration, commit or remote push is part of this application.

## Unsafe Assumptions

Do not equate these 14 reviewed findings with an audit of every historical
push. Browser fixtures and in-memory payment tests do not prove live payments.
The old public development key is retired; restarting without an explicit
local key changes derived CSRF/OAuth/admin/device keys, as documented.

## Required Ordering Changes

Apply only against the exact latest base above, preserving the existing
cookie-session and tenant-scoping changes. Verify patch application and compare
resulting files byte-for-byte with the tested combined checkout.

## Open Product / Provider / Legal Questions

Existing deployment, proxy topology, Apple configuration, real-device and
payment-provider gates remain with their owners. Feature defaults are unchanged.

## Compliance and Data-Handling Notes

No real payments or external messages were sent. Validation uses synthetic
browser/provider data and local storage. No secrets were added to the patch.

## Test and Rollback Adequacy

TypeScript and client/server build passed. The combined browser matrix passed
204/204 cells across 45 routes (840 API calls). Latest-push browser session
protocol passed 33 checks; device geometry passed 35 fixtures.
The first combined full test run passed 5,994/6,000 tests: one asynchronous
logging assumption and five timeouts while multiple full suites and browser
checks competed for four CPUs. These failures were recorded, not ignored.
The baseline archive's sole test failure was a Git source guard because an
archive has no .git; the combined Git checkout passes that guard.
Terminal dock baseline timing checks were not fully green under concurrent
load; this patch changes no client source. This remains a browser release
verification limitation, not a claim of complete release readiness.
Final rerun results are recorded below. The original patch is preserved at
`/workspace/reviews/qwen-corrected-2026-10-10/corrected.patch`.

## Final Recommendation (Approve / Do not approve)

Approve local application of the corrected patch on the exact base, with
recorded final regression results below. Do not infer production deployment approval.
A separately recorded reread verified the auth, config, OAuth and payment diff
against current upstream source and preserved its session/tenant contracts.

## Final application and verification

Applied in `/workspace/taptpay` on local branch `fix/qwen-aligned-20261010`
after reversing only the previously exported original patch and verifying a
clean checkout. Switched to the exact latest base, then applied the independently
verified aligned patch. All 23 applied files match the candidate byte-for-byte.
No commit, push, migration or deployment was performed. Remote tip remained
`bd5d1204` at the final check.

- Final TypeScript check: passed; prior combined client/server build: passed.
- Focused session/role/board/signup/Tap to Pay rerun: 6 suites, 105 tests passed.
- Final full run: 303/304 suites, 5,999/6,000 tests passed (589.442 seconds).
  Its only failure was a five-second timeout in the existing board QR size test.
- That entire QR-query suite passed separately with unchanged assertions and
  `--detectOpenHandles`: 15/15 tests, QR test 1.593 seconds. No open handles were
  reported in that isolated run. The full run emitted a worker teardown warning.
  This is a passing targeted rerun, not a claim of a fully green single full run.
- All new patch regressions passed in the full run, including asynchronous audit
  logging, request validation, IPv6 limiter, middleware and base64 checks.
- Browser matrix: 204/204 cells passed. Terminal-dock timing limitations noted
  above remain outside this server patch and require release verification.
- `git diff --check`: passed. Patch export applies against exact base contents,
  and every resulting file is compared with the final candidate.

Validation logs and exported patch are under
`/workspace/reviews/push-compatibility-2026-10-10/`.
