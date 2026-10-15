# R3 manual-change guard review

Base `9d52d8a5`. Scope: harden the existing retail cancellation and property/trades
void/external-payment writes against already recorded provider activity. No R2
transport or checkout initiation changes, migration or notification activation.

## Verification of Prior Fixes
Foundation full server run, scoped corrections, real PostgreSQL verifier and
restored migration are recorded in the foundation verification. Read the active
scoped writes and their existing tenant, parent-lock and audit tests directly.

## Blocking Issues
No blocker for rejecting unsafe manual changes when activity is already recorded.
Legacy checkout still sends before durable attachment; the interval before that
attachment cannot be fixed by these guards. R2-backed initiation convergence is
required to close that race and the full R3 phase.

## High-Risk Concerns
A pending transaction can contain a captured split share. An expired attempt may
still be chargeable. Manual cancellation/void/payment must not erase either.

## Missing Steps
Cash/create/cancel command idempotency and durable event/message delivery remain
separate work. Current cancellation success keeps its existing response/replay
contract; this change supplies refusal guards, not a full command finalizer.

## Unsafe Assumptions
Expiry alone is not proof of no provider acceptance. A legacy session without a
verified durable outcome stays blocked. Memory and query-capture tests do not
prove PostgreSQL serialization; run the actual guarded methods against PostgreSQL.

## Required Ordering Changes
Record review → failing regression tests → scoped storage guards and fixed HTTP
conflict messages → scoped checks and real PostgreSQL → separately recorded reread.
Use the existing parent locks and tenant predicates; do not add another mutation
service or change authorization.

## Open Product / Provider / Legal Questions
No new product choice is required for these safety refusals. Releasing historical
bound sessions requires Claude's R2 verification and reconciliation evidence.

## Compliance and Data-Handling Notes
Fixed conflict text contains no provider identity, token or raw error. Test data
stays synthetic. No external payment or messaging call is permitted by tests.

## Test and Rollback Adequacy
Prove live and expired attempts, unattached send intent, captured split shares,
legacy bound sessions, cross-tenant refusal and clean cancellation. Invoice tests
cover both void and external-payment writes, unchanged audit counts on refusal,
and preservation of clean writes. Existing route behavior remains under tests.
Rollback restores the earlier guard behavior; it is not a provider reconciliation.

## Final Recommendation (Approve / Do not approve)
**Approve** these bounded storage and HTTP refusal changes. **Do not approve** R3
closure or deployment. A separately recorded Codex reread confirms the scope and
the uncovered legacy pre-attachment race; it does not claim Claude/human review.

Implementation reread: the activity query runs after the aggregate lock in a
separate statement. Actual PostgreSQL exposed Drizzle's dequalification of an
outer ID in a single-table projection; explicit identifiers now preserve the
correlation. The waiting-cancellation case and both verticals passed with the
fix. **Approve** this verified guard checkpoint for commit, with the scope limits
above; cash, command audit/outbox and R2 initiation convergence remain open.

Verification: six new memory/HTTP cases first failed; three PostgreSQL guard
checks first failed against the old methods. Final PostgreSQL run: 33 checks on
the owned retained PostgreSQL 17.11 cluster (29 foundation + four guard checks).
Final scoped server run: 12 suites / 177 tests passed, including four invoice HTTP
conflict cases and route inventory/facts/review. Application and verifier type
checks and the application build passed. A parallel check with the build had two
5-second HTTP timeouts; the complete scoped repeat passed serially without
changing timeouts or assertions. An earlier broad guard run was stopped before
completion to refresh the policy; no additional full-server pass is claimed.
Foundation's earlier full 189-suite / 4,604-test evidence retains its own scope.
