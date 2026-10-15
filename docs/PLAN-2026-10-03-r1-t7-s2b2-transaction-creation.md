# R1-T7 S2b2 — transaction creation and disabled native writes

Base: `42792fd8`. Authority: owner request to finish R1 and S2 decomposition.
Scope: explicit-merchant creation with board ownership/active check at insert,
three authenticated sale-create registrations and disabled native outcome writes.
Remove unused log-only board association operation after complete caller search.

## Verification of Prior Fixes

S2b1 actual PostgreSQL 21 pass; new refund tests 19 pass; affected suites have no
runtime failure, final regenerated inventory/policy 31 pass; typecheck/build pass.
Read both existing transaction constructors and the service's token collision handling.

## Blocking Issues

None for scope. Native capability stays disabled; provider/state-machine enablement
is outside R1-T7. No application database or schema changes.

## High-Risk Concerns

Do not change token minting or collision retries. Canonicalize selectedStoneId before
checking; lock the board until insert commits so ownership/activity cannot change
between lookup and persistence. Memory checks and insert cannot yield. Scope takes
precedence over injected input identity; preserve fee/default/completion behavior.

## Missing Steps

Failing memory/SQL and actual HTTP race tests; both implementations; scoped callers;
real PostgreSQL board races; affected service/matrix regression; inventory/build/check.

## Unsafe Assumptions

An earlier route board lookup cannot authorize the insert. A global fixture constructor
is still needed by reviewed test/provider lanes; its existence does not authorize
authenticated callers. Scoping native writes does not validate native processing.

## Required Ordering Changes

Tests first, bounded code, independent SQL races, then facts/evidence.

## Open Product / Provider / Legal Questions

None for storage scope. Existing Tap-to-Pay/provider and real-device gates remain.

## Compliance and Data-Handling Notes

Synthetic tests only, no live system or client change. Keep raw public tokens out of logs.

## Test and Rollback Adequacy

Two tenants, inactive/missing boards, invalid tenant ids, no-board positive paths;
actual row-lock refusal and HTTP refusal without row/provider/notification creation.
Fix forward. No deployment or feature enablement.

## Final Recommendation (Approve / Do not approve)

**Approve S2b2 on `42792fd8` only**, tests first.

## Separate reread

Read registrations and helper independently: retail service is also used by API-v1;
use an explicit scoped writer at each authenticated caller without changing the
shared token factory. Cash creation preserves immediate completion. The association
method has no callers and only logs in both implementations, so remove it rather
than invent a mutation. Native writes remain tenant-scoped and refuse persistence
failures without stale-row success fallback; native capability stays off. **Approve.**
