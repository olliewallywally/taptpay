# R1-T7 S0/S1 — stock and board tenant storage, 2026-10-02

Code commit: **`47fdab71a48e71c4ea834bb7754a60ab2e1640a8`**, local, on
`remediation/r1-continuation-20260907`. Base: `bc5eba3c55ed95c360b08b6545dc748f0911aab0`.
S0/S1 is code-complete and awaits independent review; **R1-T7 and the full integration remain open**.
The owner asked to commit the completed work and continue. E3 was already committed as `8d5bad38`
with its documentation in `bc5eba3c`; this batch implements the next tenant-storage work.

Authority: supplied full integration plan R1-T7, P2 and P8.5; v2.2 §8.5 and §22.9.
The [batch plan and preflight](../../../PLAN-2026-10-02-r1-t7-tenant-storage.md) record the ten-heading
review, separate reread, failing-tests-first sequence and later S2–S6 decomposition. This evidence
does not turn the implementer's reread into an independent security or release review.

## Change and preserved behavior

Seven storage operations require an explicit merchantId in IStorage, MemStorage and DatabaseStorage:

| Family | Methods |
|---|---|
| Stock | getStockItemForMerchant, updateStockItemForMerchant, deleteStockItemForMerchant |
| Board management | getTaptStoneForMerchant, updateTaptStoneForMerchant, updateTaptStoneUrlsForMerchant, deleteTaptStoneForMerchant |

Every database read and write puts **record id AND merchant id in the same SQL predicate**. The memory
implementation checks both immediately before changing the map. Missing, nonpositive, fractional,
nonfinite or out-of-PostgreSQL-integer-range tenant arguments are refused before a query or mutation.
Stock patches can change only name, description, cost, emoji and variations. Board rename can change
only name. Runtime projection protects ownership, identity, active state and creation metadata even
if an internal caller bypasses the TypeScript type. Omitted fields and explicit nullable values survive.

Five HTTP registrations use these operations: board create (URL completion), rename and delete,
stock update and delete. Existing path authorization remains first. A foreign path still returns 403;
a foreign record under an authorized path returns the same 404 as a missing record. Stock lookup
still precedes body validation; board name validation still precedes lookup. Owner/member/admin
permissions, inactive management reads, repeatable soft deletion and board-number reuse are preserved.
The old unscoped mutations and stock getter are removed. The global board getter remains available
for the separately reviewed public/payment flows; S1 does not certify those callers.

## S0 inventory

The new [generated tenant/storage inventory](R1-T7-tenant-storage-inventory.md) uses actual route
facts, reviewed branches and IStorage plus its inherited PaymentAttemptRepository contract:

- 187 registrations; 119 contain session/admin authentication (middleware or handler checks).
- 25 registrations directly call checkMerchantOwnership.
- 217 declared IStorage methods plus 8 inherited methods; all route storage-call names resolve.
- Every route branch has a scope classification. The required-merchantId column describes the
  signature only; structured-input, account, admin, token and provider operations need their own review.

The inventory is an execution aid, not a claim that the whole contract is tenant-safe. The existing
R1-T2 route inventory was also regenerated: 187 registrations, 0 unclassified, 0 suspected gaps under
that extractor. Both artifacts name the generation base; the code commit above contains the reviewed
working-tree changes. Tests re-derive the contents to detect drift.

## Verification

All checks used synthetic fixtures. HTTP tests use the existing isolated harness; the PostgreSQL
verifier used a new empty loopback database, with ambient database/provider credentials removed,
the test marker and existing verifier safety checks. It applied the existing migration chain only
inside that disposable database. The PostgreSQL instance was stopped afterward. No development or
production database, provider or migration was touched.

| Check | Result |
|---|---|
| Re-verify base: bearer regressions, session source guard, C10 business and storage suites | 4 suites / 84 tests pass |
| New focused tests before production edits | 33 fail / 6 pass, 3 suites; 39 total |
| First actual PostgreSQL run | 9 pass / 1 fail; oversized tenant ID reached SQL |
| Added SQL boundary regressions before correction | 7 fail / 22 pass |
| Final stock/board storage, HTTP and inventory suites | 3 suites / 40 tests pass, 10.960s |
| Final actual PostgreSQL verifier | 10 checks pass / 0 fail |
| Full server suite | 136 suites / 3,590 tests pass, 613.426s |
| Inventory checks after final review-text correction/regeneration | 2 suites / 26 tests pass, 10.513s |
| npm run check | Pass |
| npm run build | Pass; existing chunk-size warnings |
| git diff --check and staged whitespace check | Pass |

Initial red included four HTTP write races returning 200 instead of 404, the missing scoped APIs/SQL
contracts, and the no-unscoped-method source guard. The existing foreign-record HTTP checks passed
before this change: a read-then-write defense already existed. The race tests deliberately change
ownership between those operations to prove the new storage boundary; this is not a claim of a
demonstrated remotely exploitable ownership-transfer feature.

PostgreSQL independently exercised all five mutations while a second transaction held an ownership
change uncommitted. Each mutation was observed waiting on a real row lock. After the ownership change
committed, PostgreSQL re-evaluated the tenant predicate, refused the write, and preserved every field
other than the deliberate ownership change. Direct foreign-tenant reads/writes also left stored rows
identical. Positive updates, projection, soft deletion, number reuse and invalid scopes passed.

The first PostgreSQL run found that the existing positive-integer helper allowed IDs outside the
database's integer range. Seven new SQL-capture cases failed before the scoped correction. S1 now
uses a bounded management guard in both implementations; unrelated upload validation was not changed.

Full server execution began before this final boundary correction. The full run passed with 3,590
tests, including the new boundary cases, and the final focused run plus actual PostgreSQL verifier
passed after the correction. After the full run, the only remaining change was review text accurately
describing updatedAt refresh on repeated board rename, followed by regeneration and the 26 inventory
tests. There was no later production-code change. Client tests/browser checks were not repeated for
this server-only batch; E3's browser/client evidence remains separately recorded.

Reproduce from the repository root:

```sh
npm run test:server -- --runTestsByPath server/__tests__/tenant-stock-board-storage.test.ts server/__tests__/tenant-stock-board-http.test.ts server/__tests__/tenant-storage-inventory.test.ts
npm run test:server
npm run check
npm run build
node --import tsx scripts/generate-route-policy.ts
node --import tsx scripts/generate-tenant-storage-inventory.ts
```

For actual SQL/concurrency verification, run
`node --import tsx scripts/verify-tenant-stock-board-postgres.ts` with TEST_DATABASE_URL pointing to a
new, empty disposable database and TAPTPAY_TEST_DATABASE=1. Clear ambient application database and
provider credentials first; do not target an application database. The committed script refuses a
nonempty database and uses the existing safety guard. It leaves synthetic rows for inspection and
does not drop the database. Temporary logs used this turn: `/tmp/taptpay-t7-baseline.log`,
`/tmp/taptpay-t7-s1-red.log`, `/tmp/taptpay-t7-scope-bound-red.log`,
`/tmp/taptpay-t7-postgres-before-bound-fix.log`, `/tmp/taptpay-t7-postgres.log`,
`/tmp/taptpay-t7-s1-final.log`, `/tmp/taptpay-t7-server.log`, `/tmp/taptpay-t7-inventory-final.log`,
`/tmp/taptpay-t7-check-final.log` and `/tmp/taptpay-t7-build-final.log`. These may disappear after a reset;
only sanitized counts and source-controlled verifiers are durable evidence.

## Control mapping and review brief

| Requirement | Evidence and limit |
|---|---|
| R1-T7 / P2 / v2.2 §8.5 tenant-required storage | Seven scoped operations in both implementations; stock/board S1 only |
| P8.5 / §22.9 storage authorization | SQL id+merchant predicates, runtime patch projection and invalid-scope refusal |
| Two-merchant negative and allowed-caller coverage | Direct memory/SQL tests; foreign-record HTTP tests with unchanged snapshots and no external effects; existing served role matrix passes |
| Recheck authorization at mutation | Four HTTP races plus five actual PostgreSQL concurrent-write checks |
| Generated route classification and contract tracking | 187 classified registrations; source/contract and checked-in inventory guards |
| Product continuity | Full server role/validation/payment regression; repeatable soft deletion and allocation tests |

Independent reviewer: compare `bc5eba3c..47fdab71`, rerun the focused tests and disposable PostgreSQL
verifier, verify both implementations and every remaining call site, and check field omission/null
behavior, admin paths, foreign-record 404 and the SQL concurrency schedule. Apply the supplied plan's
reviewer template and record a separate reread. No independent review is claimed here.

## Remaining work and handoff

Next is S2: transaction/refund authenticated storage reads and mutations. Inventory callers and
separate public-token/provider state transitions before proposing the batch; preserve financial state
gates. Gap 11 C2–C5 replay work remains subject to its R3 schema decision. Then S3 property, S4 trades,
S5 settings/exports and S6 upload lifecycle, each with its own preflight and regression evidence.
Upload scanning/private storage/retention choices are not selected by this batch.

Independent reviews of E1/E2/E3 and older external-review/deadlock work remain owed. Apple provisioning
and device evidence gate R1-T5; T5/T7 and full device/tutorial/accessibility evidence gate R1-T10.
Keychain remains A-T4. Applying development migrations 0030/0031 remains the recorded owner action.
No push, deployment, UI change or schema change. Production remains closed.
