## Verification of Prior Fixes

Verified branch/HEAD aa0802b2, source tree unchanged except the proposal and
excluded logs. Read the latest readiness handoff, canonical subscription schema,
0014, shared access helper, storage getters, durable finalizer, counts-only CLI,
baseline contract and master plan13/21. Owner D9 approval is recorded separately.

## Blocking Issues

No blocker for the repository scope below. Real historical classification,
activation, UAT and release evidence remain explicitly outside this scope.

## High-Risk Concerns

Never infer a grant from status/missing billing date. Separate immutable service
periods from mutable billing state so current unpaid grants survive failed
activation. Paid history derives only from applied confirmed billing or reviewed
historical success. Enforce tenant/source/period binding in PostgreSQL. Append
revocations with review evidence rather than erase history. Keep R3 charge and
unknown-result identities unchanged.

## Missing Steps

Failing-first policy/report/CLI tests; forward0049b, schema/baseline contract;
shared typed policy; single-query enriched subscription reads; immutable paid
period capture in the same billing transaction; guarded classification/activation
tool; aggregate transition report; PostgreSQL scratch/populated/logical-restore
proof; refreshed canonical fingerprint and readiness verification; handoff.

## Unsafe Assumptions

Existing rows are unclassified. Applied0014 does not identify its affected rows.
Deployment cannot silently activate a new access policy: the singleton starts in
legacy mode; explicit operator activation must follow reviewed classification and
refuse newly blocked or unclassified intended-current rows. No environment bypass.
Legacy fixtures retain their old behavior; production reads explicitly carry the
database policy state and a missing/invalid state must fail closed.

## Required Ordering Changes

Create the new empty append-only records/control through a forward migration;
do not update subscription/billing data in migration. Capture future applied paid
periods atomically. Produce before/after reports and rehearse classification before
activation. Keep live gate legacy until approved real evidence. All existing
HTTP/job consumers keep their shared helper, with one atomic SQL projection on
subscription reads; do not add route-local rules.

## Open Product / Provider / Legal Questions

D9 is answered by the dated owner decision. Actual provenance evidence, named
alert ownership, UAT and independent professional review remain release inputs;
no new product choices are assumed in this implementation.

## Compliance and Data-Handling Notes

Manifest references are scoped IDs, dates and evidence digests only, read from a
local file with bounded size. Tools require a dedicated securely supplied URL,
exact host/port/database, verified remote TLS and read-only dry-run by default.
Output contains aggregate counts/fixed errors, never tokens/PII/raw SQL errors.
No shared/live mutation, provider/message calls, owner-process restart or deploy.

## Test and Rollback Adequacy

Require exact start/end, UTC grace/retry limits, exhausted/unpaid/invalid/future
cases, current grants across billing failure, all shared consumers, report totals
and unclassified/regression activation refusal. Verify actual tenant constraints,
immutable history, paid capture, repeated classification, guarded activation and
logical restore. Freeze forward SQL after first successful rehearsal; preserve
0048a/b/c/0049a. Rollback retains all periods/attempts and must not silently restore
uncoordinated cron or bypass policy. No test weakening.

## Final Recommendation (Approve / Do not approve)

**Approve** the D9 repository implementation on aa0802b2 described above. D9
approval resolves the policy blocker; staged activation resolves the deployment
lockout hazard; evidence-bound classification resolves fabricated-grant risk.
This is a local scoped review, not external or professional release sign-off.

Separately recorded independent reread: rechecked 0014's lack of per-row audit,
grant survival under suspended/past_due billing, cancellation/unknown-charge
preservation, atomic control/provenance reads, race-free activation/reporting,
bounded secret-free tooling and paid-source linkage. Same scoped Approve.

Operator parser rereview before correction: native CLI execution refused the
valid manifest-sha256 flag because its generic name pattern excluded digits.
A new positive concrete-command test reproduces that refusal. Approve allowing
digits after the initial letter while retaining the explicit option allowlist,
duplicate refusal, digest pinning and exact booleans. Separately recorded reread
checked that this does not permit any additional option or connection override.

Revocation rereview before correction: the aggregate legacy-to-D9 comparison
cannot detect loss of a grant that legacy policy had already blocked, especially
while its billing status is suspended. A native negative test reproduces this.
Approve locking all affected parents in order and comparing their actual explicit
access before/after classification in enforced mode, rolling back any loss. Keep
the global activation comparison as well. A separately recorded reread checked
revocation tenant binding, transaction-clock consistency, source/parent races and
minimal projections without card or evidence values. Same scoped approval.
