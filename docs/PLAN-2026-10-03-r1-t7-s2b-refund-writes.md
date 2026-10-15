# R1-T7 S2b1 — authenticated refund writes

Base: `8d535426`; branch `remediation/r1-continuation-20260907`.
Owner instruction: finish R1. Scope: merchant-required refund reservation, release,
creation and status writes, both implementations and their sole runtime route.
Transaction creation/board association is S2b2; public/provider writes remain separate.

## Verification of Prior Fixes

Read S2a's actual diff, storage implementations, sole refund route and generated
inventory. Recovery independently passed 44 focused, 372 affected and 14 real
PostgreSQL checks, typecheck/build. These are this conversation's checks on S2a,
not independent security approval. Existing refund balance update is atomic SQL.

## Blocking Issues

None for scoped writes with initiation still disabled. R4's durable refund record,
idempotency, exact provider outcome and unknown reconciliation remain open gates.

## High-Risk Concerns

Tenant predicates belong in every write. Creation/status lock the parent to prevent
ownership changes between check and persistence. Scope must come from arguments,
not an insert object. A persistence refusal after a provider request is uncertain:
return a fixed reconciliation-required error and publish no success. Never
compensate a different tenant or assume no provider movement.

## Missing Steps

Failing memory/SQL and HTTP races first; scoped implementations; isolated SQL
ownership races; route/matrix/financial regression; regenerate facts; typecheck/build.
Remove unused global refund mutators after all caller searches. Keep global fixture
creation/read methods explicit; no authenticated registration may call them.

## Unsafe Assumptions

Current HTTP checks already refuse normal foreign records; this hardens a storage
boundary, not proof of a remote transfer exploit. A scoped reservation is not a
durable operation and releasing an amount is not idempotent; R4 must replace this
legacy choreography before enablement. Keep existing balance and state semantics.

## Required Ordering Changes

Tests first, then code, SQL races, route facts and evidence. No live DB or migration.

## Open Product / Provider / Legal Questions

None for this bounded change. Existing Apple and scanner/retention decisions apply;
private object storage and real-device/provider acceptance remain separate gates.

## Compliance and Data-Handling Notes

Synthetic fixtures only; isolated loopback PostgreSQL with ambient credentials cleared.
No client source, provider, production capability, schema or deployment change.

## Test and Rollback Adequacy

Prove foreign/invalid scope unchanged; creation ignores malicious identity fields;
reservation preserves caps and concurrent serialization; release and status cannot
write foreign rows. HTTP races prohibit provider calls before persisted ownership,
and prohibit broadcasts/push on post-provider persistence refusal. Fix forward.

## Final Recommendation (Approve / Do not approve)

**Approve S2b1 on `8d535426` only**, with the tests-first sequence above.

## Separate source reread

Reread the route and both implementations separately from the proposed method names.
All four global mutators have only this runtime caller; after-refund arithmetic has
none. Capability/owner/body/lookup/provider ordering remains unchanged. Merchant-only
refund policy remains; no admin override is added. SQL must preserve the reservation's
current status and remaining-balance predicates. Completion refusal after a provider
call returns a fixed 503 reconciliation-required response without money status events.
No unresolved blocker for this scope. **Approve the same S2b1 scope.**
