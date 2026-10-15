# R1-T7 S2a — transaction/refund storage, 2026-10-03

Branch: `remediation/r1-continuation-20260907`. Base:
`31f64efc2d405d60e071f364a29d918cde66137b`. Code commit:
`ea4759cfc41bf92ffcd6f5bba125d72d93641489` (local).
**S2a is code-complete, awaiting independent review. R1-T7 and R1 remain open.**

Authority: supplied full integration plan R1-T7/P2/P8.5 and
[S2 preflight and separate reread](../../../PLAN-2026-10-03-r1-t7-s2-transactions-refunds.md).
[R1 exit assessment](R1-exit-assessment-2026-10-03.md) identifies every remaining task/gate.

## Changed behavior and boundaries

- `getTransactionForMerchant` requires id AND merchant in both storage implementations.
- `getRefundsForTransactionForMerchant` requires transaction id, refund merchant AND current parent
  merchant. PostgreSQL checks the parent through an EXISTS predicate in the same query. The old
  unscoped refund-by-transaction reader is removed from the interface and both implementations.
- `cancelTransactionForMerchant` checks current ownership and pending/processing status atomically.
  PostgreSQL locks the scoped parent row, rechecks after waiting and also constrains the UPDATE
  by id, tenant and allowed state. Memory checks/replaces without yielding. Financial fields,
  row identity, completion metadata and provider identities are preserved.
- Four registrations migrated: cancellation, refund-by-transaction read, refund-initiation lookup,
  and the disabled ecommerce transaction read. Only the validated admin branch may resolve a
  cancellation target by global id; merchant callers cannot fall back to it. The route publishes
  the persisted cancellation row, with no post-write global read.

Preserved: owner/member cancellation; the explicitly permitted platform admin cancellation;
400 for a terminal-state cancellation/repeat; identical 404 for missing/foreign transactions;
merchant-only refund-by-sale and owner-only refund initiation; capability/body-validation order;
DTO shapes; all public-token/provider/payment-attempt authority. No client, schema, migration,
feature-default or product-design change.

This closes a storage-boundary race, not a demonstrated remote ownership-transfer API exploit.
Legacy public/provider transitions, durable events/outbox and refund unknown-outcome recovery
remain R3/R4 work. S2a does not make the remaining refund writes tenant-scoped or production-safe.

## Failing tests first — durable excerpts

Before production edits, ran:

```text
npx jest --selectProjects server --runInBand --runTestsByPath
  server/__tests__/tenant-transaction-refund-storage.test.ts
  server/__tests__/tenant-transaction-refund-http.test.ts
Test Suites: 2 failed, 2 total
Tests:       37 failed, 3 passed, 40 total
```

Thirty storage failures prove the required methods were absent. Seven HTTP failures additionally
prove actual pre-change behavior. The race tests use the old reader as a fallback on the base:

```text
cancellation refuses a concurrent ownership change after the route read
Expected: 404
Received: 200

cancellation refuses a concurrent completed change after the route read
Expected: 400
Received: 200
```

The refund race also returned a refund after its parent moved to the other business. The owner/member
positive tests detected use of global transaction reads. The final cases pass without those fallbacks
being needed; the inventory guard prevents restoring the unscoped mutation/refund reader.
Original synthetic log: `/tmp/taptpay-s2a-red.log`; excerpts here survive environment resets.

## Final verification

| Check | Result |
|---|---|
| Yesterday's S1 focused storage/HTTP/inventory | 3 suites / 40 tests pass |
| Yesterday's S1, independently repeated on fresh PostgreSQL | 10 checks pass, including all five ownership-change refusals |
| S2a memory/SQL/HTTP regressions | 2 suites / 40 tests pass |
| Affected route-policy/matrix, served business/provider, financial state, parsing and old-bearer regressions | 14 suites / 416 tests pass |
| Full server: `npm run test:server -- --runInBand` | 138 suites / 3,631 tests pass (642.271s) |
| S2a actual PostgreSQL | 14 checks pass |
| Typecheck | pass |
| Production build | pass |
| Whitespace | pass |
| Route inventory | 187 registrations / 0 unclassified / 0 suspected gaps |
| Tenant/storage inventory | 187 registrations; 119 session/admin-authenticated; 219 declared + 8 inherited methods |

No full client/browser run is claimed: no client source changed. Existing build warnings concern
stale browser data and large bundles; the server test runner reports its existing ts-jest deprecation.

The focused command names are the two new test files above plus tenant-storage-inventory,
route-policy-inventory, route-matrix-inventory, route-matrix-served-business,
route-matrix-served-provider, route-matrix-own-gates, route-matrix-roles, route-matrix-records,
http-params-transactions-refunds-batch, c10-batch-6b-sales, payment-attempt-service and
account-bearer-retired (all under `server/__tests__/`, with `.test.ts`).
Typecheck/build: `npm run check`, `npm run build`; policy regeneration:
`npx tsx scripts/generate-route-policy.ts`,
`node --import tsx scripts/generate-tenant-storage-inventory.ts`.

## PostgreSQL isolation and concurrency proof

Started a new PostgreSQL 16 instance bound to loopback under `/tmp`; created separate empty,
named S1 and S2 verifier databases. Invoked each verifier with `env -i`, only PATH and the explicitly
synthetic TEST_DATABASE_URL/marker. Both use the existing migration runner and a verified empty
upload-ownership inventory. The new S2 verifier additionally requires loopback and an S2 test
database name before connecting. No application database/provider credentials entered it.

`node --import tsx scripts/verify-tenant-transactions-postgres.ts` proves actual SQL scoping,
inconsistent refund/parent refusal, all seven existing cancellation states and financial field
preservation, invalid tenant refusal, both concurrent ownership/completion races, and two
simultaneous cancellations producing exactly one success. The race verifier asserts PostgreSQL's
writer really waited for the other connection's row lock before that change committed.
The existing S1 verifier ran separately against its new empty database. Both exited 0.
The disposable PostgreSQL instance was stopped. No financial data was deleted for these checks.

Temporary logs: `/tmp/taptpay-s1-reverify-postgres.log`, `/tmp/taptpay-s2a-postgres.log`,
`/tmp/taptpay-s2a-green.log`, `/tmp/taptpay-s2a-regression.log`, `/tmp/taptpay-s2a-full-server.log`,
`/tmp/taptpay-s2a-final-check.log`, `/tmp/taptpay-s2a-build.log`. These may disappear after a reset.

## Independent review brief and continuation

### Timeout recovery verification (2026-10-03)

Recovered the uncommitted batch on the same `31f64efc` base. Prior temporary logs had
disappeared; the full-server and S1 PostgreSQL counts above are preserved prior-session
claims, not new full runs. Independently reread the diff and all three new files, and
repeated the focused storage/HTTP/inventory suites: **3 suites / 44 tests pass**.
Affected route/payment regressions: **11 suites / 372 tests pass** (72.074s).
Typecheck, production build and whitespace pass. Regenerated both inventories:
**187 registrations / 0 unclassified / 0 gaps; 227 storage methods**.
Repeated the actual S2 PostgreSQL verifier on a newly initialized, empty loopback
database with ambient credentials removed: **14 pass / 0 fail**, including both
confirmed lock-wait races and simultaneous cancellation. The instance was stopped.
Sandbox socket/subprocess restrictions required authorized local reruns; no application
database or provider was contacted. Recovery logs use `/tmp/taptpay-s2a-recovery-*`.

Review base `31f64efc` to this batch's recorded code commit. Read the preflight, generated inventory,
four changed registrations, both storage implementations and new regressions/verifier. Recheck the
admin-only global resolution, tenant AND state predicates at the write, locking order against
payment-attempt finalization, refund parent EXISTS predicate, unchanged valid DTOs/statuses, and
zero effects on failed/raced/repeated cancellations. The implementer's separate reread and these
tests do not close the outstanding independent security reviews.

Next: S2b refund mutation preflight/tests, then S3 property, S4 trades, S5 settings/exports and S6
upload lifecycle. Keep gap 11 C2–C5 at the recorded R3 schema gate. R1-T5 Apple provisioning/device
and R1-T10 acceptance remain open; native Keychain stays A-T4. Development 0030/0031 remain recorded
owner actions and were not inspected/applied here. Production remains closed.

Rollback point is the recorded base for scope comparison, not authorization to restore unscoped
merchant writes. Fix forward with payment initiation disabled. No deployment, push, live migration,
external provider action or independent release approval is performed or implied by this batch.
