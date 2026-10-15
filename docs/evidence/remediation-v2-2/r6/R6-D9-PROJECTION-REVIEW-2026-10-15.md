## Verification of Prior Fixes

Owned PostgreSQL first run passed six checks, then application getSubscription
failed with42883. The first successfully applied0049b is frozen at
e8d4303ab2463f9e8aa9d2cfd95d0e8383e5e8cb61eaf9253cb1e6afbab157dc.

## Blocking Issues

Drizzle's single-table selection strips a Column's outer table qualification
inside nested SQL. The resulting inner id resolves to an entitlement UUID,
instead of the subscription integer. Correct the projection before accepting it.

## High-Risk Concerns

Every correlated parent reference must remain explicitly qualified, including
merchant ID. Never substitute request text or drop tenant binding to fix types.

## Missing Steps

Replace only the two fixed outer references with static qualified SQL identifiers,
then rerun the actual DatabaseStorage getter on the owned database.

## Unsafe Assumptions

Template interpolation does not guarantee qualification survives ORM compilation.
Typecheck/unit tests cannot substitute for an actual database query.

## Required Ordering Changes

Record this scoped rereview, repair application projection, then repeat the
native checks. Do not edit the successfully applied migration to fix app SQL.

## Open Product / Provider / Legal Questions

No new policy choice. Existing D9 approval and all release prerequisites stand.

## Compliance and Data-Handling Notes

Fixed schema/table/column literals only. Keep values parameterized; no secrets,
new external effects, tenant widening or live mutation.

## Test and Rollback Adequacy

Native failure is recorded as42883. Require getter+guarded activation and tenant
checks to pass. Preserve the immutable applied migration and owner app process.

## Final Recommendation (Approve / Do not approve)

**Approve** only the static identifier correction on the current D9 working tree.
Separately recorded independent reread checked ORM selection rewriting, all inner
aliases and both parent references. The fix preserves tenant linkage and adds no
untrusted SQL. This is a local rereview; no external review is claimed.
