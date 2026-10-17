## Verification of Prior Fixes

All6772 unit tests pass;24 expanded PG stages including upload ownership pass.
The remaining legacy server-storage harness fails on missing cash_idempotency_key:
it stops fixture migrations at0016 while executing today's runtime. SQL fixtures
must advance without inventing columns or weakening real constraints.

## Blocking Issues

Modern frozen migrations contain intentional public-schema qualification, including
R5/R6 trigger bodies. The historical random-schema SQL transformer correctly
refuses these. Do not broaden that transformer, rewrite frozen SQL, rename public
or fabricate schema columns to make the old worker pass.

## High-Risk Concerns

Keep all historical pre-index/index/subscription/rerun checks in their original
random owned schema. Run current post-index storage on a separate fresh CI-owned
R8 database after actual full canonical migration/repeat and exact0049b fingerprint.
An explicit internal canonical flag may select public only for post-index after
strict assertCIDatabase URL/marker/application collision validation. Original
random-schema worker path stays unchanged. Verify canonical fingerprint and zero
merchant/user/transaction rows before loading app modules. No public fallback.

## Missing Steps

New actual worker refusal regression fails on the old missing canonical mode.
Require unsafe canonical targets and unflagged public both fail with zero recorded
connection attempts. Then actual positive full canonical/storage checks, original
legacy schema isolation, cleanup and complete tool/types regression. If fixtures
encode superseded R2/R3 semantics, independently review documented current
contract and strengthen effects rather than changing application behavior.

## Unsafe Assumptions

A schema rename would break public-qualified trigger bodies. Copying tables would
lose constraints/triggers. Shared TEST_DATABASE_URL is insufficient permission for
current public writes. Only the coordinator's successfully created fresh random
R8 database qualifies; existing data or canonical drift must refuse before effects.

## Required Ordering Changes

Reuse the actual canonical migration/fingerprint helper for a second separately
owned DB. Give the internal legacy harness its explicit flag only from that
coordinator; it still creates/drops its own random historical schema. Route public
npm test:server:postgres through guarded verify:postgres, avoiding recursion by
having coordinator call the internal .mjs harness directly. Document CREATEDB/
ephemeral-loopback requirement; no application URL fallback or shared target.

## Open Product / Provider / Legal Questions

This changes only operator test setup to owned ephemeral PG17. No customer/payment
policy changes. R4 remains Claude's; strict R3/R5/R6 source rehearsals and all real
restore/provider/device/professional/security approvals remain explicit.

## Compliance and Data-Handling Notes

Synthetic fixtures only; root/environment credentials are not forwarded. Private
logs may show synthetic SQL values and must not be uploaded. Publish stage names,
counts and fingerprints only. No customer data, shared schemas or live migration.

## Test and Rollback Adequacy

Actual fail-first missing-column result and worker refusal test, then full positive
canonical SQL cases with unchanged original budgets/constraints/isolation prove
setup repair. Additive canonical checks must not skip any legacy assertions.
Rollback coordinator/internal-worker/package dispatch together; no SQL rollback.

## Final Recommendation (Approve / Do not approve)

Approve this explicit stricter CI-owned canonical mode and default guarded test
entry only with the stated refusal/actual-native proofs. No global public-schema
permission, historical transformer relaxation, deployment or phase-exit approval.
