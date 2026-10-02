# R1-T7 tenant storage — continuation and batch S1 (2026-10-02)

Base: `bc5eba3c55ed95c360b08b6545dc748f0911aab0`, branch
`remediation/r1-continuation-20260907`. The owner asked to commit the completed E3 work and move
to the next step. E3 and its handoff were already committed (`8d5bad38`, `bc5eba3c`).

Authority: supplied integration plan R1-T7, P2, P8.5; v2.2 §8.5 and §22.9's route/tenant controls.
This is an engineering implementation of the required scoped-storage contract. No new product,
role, retention, provider, schema, deployment or live-data decision is made here.

## Scope and decomposition

- **S0 — execution inventory:** regenerate all route scope classifications from the reviewed
  branches and the actual storage interface. Keep account, validated admin, public-resource,
  provider, cron and API-key scopes explicit. Required merchantId parameters are structural
  evidence only; predicates still need runtime tests. Artifact:
  `docs/evidence/remediation-v2-2/r1/R1-T7-tenant-storage-inventory.md`.
- **S1 — stock and board management (this batch):** require merchantId in stock read/update/soft
  delete and board management read/rename/URL-update/soft-delete methods. Update IStorage,
  MemStorage and DatabaseStorage, then the five affected routes (board create/rename/delete,
  stock update/delete). Remove unused unscoped mutators; keep the existing global board read
  only for the other, separately reviewed public/payment routes. Narrow stock update fields
  and board rename fields so a malformed internal caller cannot move a record between tenants.
- **S2 — transactions/refunds:** audit and scope authenticated reads/mutations, retaining separate
  provider/public-token operations and existing financial state gates. Gap 11 C2–C5 needs the
  recorded R3 schema decision; S1 does not select or implement that model.
- **S3 — property; S4 — trades; S5 — settings/exports:** migrate each family with both storage
  implementations and its own two-merchant, allowed-caller and no-effect tests. Preserve the
  existing matrix; any behavior change goes through the owner where required.
- **S6 — upload lifecycle:** remaining private storage, content/quarantine/scanning, download,
  retention/legal-hold and cleanup requirements stay open. Reconcile existing gap-13 decisions
  before proposing changes. Provider and retention choices require their own concrete decisions.

S1 preserves path authorization and validation order: a foreign business path stays 403, a record
outside the authorized path's business stays the same 404 as a missing record. Stock validation
still follows the record lookup; board name validation still precedes it. Admins retain their
explicitly authorized business path. Inactive records remain readable by these internal management
methods; deletes remain soft and repeatable. No arbitrary new active-only filter.

The DatabaseStorage mutations must put both record id and merchant id in the **same UPDATE
predicate**; a prior read is insufficient. MemStorage checks the same pair immediately before
changing its map. Reads and writes fail closed for invalid tenant ids. S1 bounds its tenant argument
to the PostgreSQL serial/integer range as well as using the existing positive-integer guard (see
the verification finding below). Storage methods do not trust a tenant value supplied in the update object.

## Verification of Prior Fixes

Re-read CLAUDE, the latest ledger/handoff, the superseded September handoff warning, plan R1-T7,
P2/P8.5, existing route guards, MemStorage/DatabaseStorage and the matrix's stock/board recipes.
On the exact base, isolated tests passed: account bearer regressions/source guard, C10 business
batch and storage tests, **4 suites / 84 tests**. No provider or database was contacted. This
re-verifies the prior behavior needed by S1; outstanding external E1/E2/E3 reviews remain owed.

## Blocking Issues

None for S0/S1 as bounded above. Upload provider/retention choices and financial replay schema
work are outside S1 and remain explicit later gates. Do not claim whole R1-T7 completion.

## High-Risk Concerns

Avoid replacing a checked read with a globally keyed write. Do not let a partial update change
merchantId, id, activity or creation metadata. Preserve admin scope, tenant-safe 404, validation
ordering and inactive-row behavior. A global board read is still needed by reviewed public/payment
flows; removing it indiscriminately would broaden this batch.

## Missing Steps

Write failing direct-storage and HTTP race regressions before production edits. Test actual generated
SQL predicates and an isolated PostgreSQL run, plus both tenants and allowed owner/member/admin
callers. Update route review/facts and generated inventory, typecheck, run relevant regression and
build, commit exact paths, then record the results and next batch.

## Unsafe Assumptions

The pre-change HTTP route already rejects a foreign record. This is storage-boundary hardening;
do not describe a hypothetical concurrent ownership change as a demonstrated remote exploit.
An interface's merchantId parameter does not prove the implementation uses it. The new inventory
must include direct authentication middleware, not only calls in handler bodies.

## Required Ordering Changes

S0 inventory → tests first → S1 scoped implementations and callers → SQL/HTTP regression → regenerated
policy/evidence. No migration or deployment is part of that sequence.

## Open Product / Provider / Legal Questions

None for S1. S6 must resolve its actual storage/scanner/retention decisions separately. Existing
0030/0031 development migration actions remain with the owner. Keychain remains A-T4.

## Compliance and Data-Handling Notes

Synthetic fixtures only. Real PostgreSQL verification, if run, must start from a new disposable
loopback instance with ambient database/provider credentials removed and the existing verifier
safety checks. Keep raw data, hashes and secrets out of committed evidence. No production action.

## Test and Rollback Adequacy

Direct two-tenant storage tests, invalid-scope tests, update-field projection, SQL predicate tests,
and HTTP read/write-race tests hold the boundary. Existing route matrix and served recipes hold
roles, status codes and positive behavior. Fix forward if this batch fails; do not restore an
unscoped mutation simply to make a caller work. No schema rollback is needed.

## Final Recommendation (Approve / Do not approve)

**Approve S0/S1 only on `bc5eba3c`**, based on the source review and 84-test baseline above.
This is the implementer's preflight, not release approval or the outstanding external security review.

## Separate reread before production edits

Re-read the five registrations and both implementations independently of the proposed method names.
Confirmed: stock missing/foreign lookup occurs before body validation; board rename validates its name
first; both deletions are soft and do not require isActive=true; board creation updates URLs after
allocating its number. Existing stock documentation incorrectly says a repeated delete is 404, while
both implementations return success for an inactive existing row. Correct the documentation to the
observed behavior, without changing that behavior. A runtime projection must preserve omitted stock
fields and explicit nullable values. No additional blocker. **Approve the same S0/S1 scope.**

## Verification finding and scoped correction

First real PostgreSQL pass: nine checks pass, including all five concurrent-write refusals; the
invalid-tenant check fails because the existing isTenantId helper accepts integers larger than the
database's integer range. Added SQL-capture cases before correction: **seven fail / 22 pass**. S1's
new isManagementTenantId guard adds the actual `merchants.id` upper bound, 2,147,483,647; the unrelated
upload helper behavior is unchanged. This is an input-boundary correction within S1, with no schema
or HTTP-contract change. Re-read both implementations: every one of the seven scoped methods uses
the guard before issuing SQL or touching its map. **Approve the corrected S1 scope**, then repeat the
focused tests and real PostgreSQL verification. Logs: `/tmp/taptpay-t7-scope-bound-red.log` and
`/tmp/taptpay-t7-postgres-before-bound-fix.log` (synthetic, temporary).

## Implementation verification

S0/S1 implemented. Initial regressions: **33 fail / 6 pass** before production edits, including
four HTTP writes that incorrectly succeeded after the test changed ownership between lookup and
write. Final focused tests: **3 suites / 40 tests pass**. Real PostgreSQL: **10 checks pass**, including
all five mutations waiting on a concurrent ownership change, then refusing the write after it commits.
The disposable instance was stopped; no application database was contacted.

Full server: **136 suites / 3,590 tests pass** (613.426s). Typecheck and build pass. Route inventory:
**187 registrations / 0 unclassified / 0 suspected gaps**. Tenant inventory: **187 registrations,
119 session/admin-authenticated registrations, 25 direct checkMerchantOwnership calls, 217 declared
plus 8 inherited storage methods**. These structural counts do not certify every storage method.
The evidence document records the final code commit and limitations; S2–S6 and independent review
remain open. No frontend or schema change is included.
