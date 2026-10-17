## Verification of Prior Fixes

Existing canonical0049b migration replay/repeat and four native PG verifiers pass.
Full client1507 tests pass; server regression remains running on accepted tree.
Current CI leaves most fresh-database storage verifiers unexecuted after ORM upgrade.

## Blocking Issues

New real guard test reproduces application collision through localhost alias: the
old guard compares literal hostnames. Fix this before expanding storage coverage.
New storage-target tests fail because the scoped adapter does not exist yet.
R3/R5/R6 scripts pin source project/port/template; do not silently retarget them.

## High-Risk Concerns

Keep assertCIDatabase strict r8_ci_<16hex>. Add a separate storage guard sharing
transport/marker/collision validation, allowing only taptpay_s[234]_verify_r8_<16hex>.
Normalize three loopback aliases for application collision refusal, never for
allowing remote target hosts. Storage target itself must still be127.0.0.1 with
explicit user/password/port and only existing allowlisted safe query parameters.
Creation has no IF NOT EXISTS; drop only after this invocation created that DB.

## Missing Steps

Require three failing-first pure guard regressions then actual passing results.
Add fresh PG verifiers for Apple identities/connect, tenant transactions/settings/
stragglers/property/trades, upload ownership/scans/lifecycle and R2 expected values/
X-ID, plus existing isolated-schema server storage. No fixture or budget weakening.
Use original verifier scripts/guards/migration runner and unchanged frozen SQL.
Run all against separately created empty owned databases, capture sanitized stage
results and repeat canonical fingerprint/replay. Persist reproducible CI coverage.

## Unsafe Assumptions

Passing memory tests or four PG tools does not cover all SQL consumers of ORM0.45.
A phase-prefixed database is not owned merely because of its name: validate URL,
create successfully without collision, retain created flag, and drop only that name.
Explicitly defer fixed-source R3/R5/R6 verifiers instead of changing their guards.
No shared database, restored customer copy, external jobs or provider credentials.

## Required Ordering Changes

Approve this bounded runner/guard repair before changing it. Preserve existing
core guard behavior, add separate namespace tests and run before any new DB effect.
Propagate cancellation to nested child groups; finish owned DB cleanup in finally.
Full canonical and added actual storage verification precede final acceptance.

## Open Product / Provider / Legal Questions

No payment/product/provider policy changes. Real restored clone, locks, actual
UAT, security/history, physical devices and professional/release approvals remain.
Claude retains R4; no application or R4 implementation code is changed here.

## Compliance and Data-Handling Notes

Only own synthetic PG17 loopback server and random scratch identities. Clean child
environment discards ambient application/provider URLs; retain them only for
identity collision refusal. Raw PG logs remain private; publish stage names/counts.

## Test and Rollback Adequacy

Three focused tests cover alias collision, positive scoped names and rejection of
unsafe host/port/name/marker/query/collision, plus existing full guard/tool suite.
Actual storage tools exercise their original concurrency/tenant/rollback checks.
Rollback runner/guard/test additions together; synthetic databases are disposable.

## Final Recommendation (Approve / Do not approve)

Approve only alias collision repair, separate strictly namespaced scratch adapter,
additive existing-verifier coverage and cancellation propagation described above.
No relaxed original verifier target guard or production/release authorization.
