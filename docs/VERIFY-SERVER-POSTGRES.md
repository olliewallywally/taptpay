# Disposable PostgreSQL server verifier

`npm run test:server:postgres` is the real-Postgres gate for retail payment
addressing, board allocation, per-payment credentials, durable attempts, and
transaction-local splits. It never uses `DATABASE_URL` as its target.

## Required environment

Use a dedicated disposable PostgreSQL database/service with permission to create
and drop schemas:

```bash
TAPTPAY_TEST_DATABASE=1 \
TEST_DATABASE_URL='postgresql://tester:password@localhost:5432/taptpay_test' \
npm run test:server:postgres
```

Both variables are mandatory. `TAPTPAY_TEST_DATABASE` must be exactly `1`; a
test-looking database name is not accepted as a substitute for that explicit
confirmation. If `DATABASE_URL` is also configured, the command compares
host/port/database identity while ignoring credentials and connection options and
refuses to run when the two URLs identify the same database.

Missing or unsafe configuration exits non-zero. The Postgres portion is never
silently skipped. The guard-only tests can be run without a database:

```bash
npm run test:server:postgres:safety
```

## What the gate does

The verifier:

1. Creates one cryptographically random schema named exactly
   `taptpay_verify_<32 lowercase hex characters>`.
2. Pins every connection's `search_path` to that schema plus `pg_catalog`.
3. Applies the numbered migrations explicitly from `0000` through `0010`, then
   the additive `0010a` retail baseline reconciliation.
4. Rewrites migration `0000`'s two historical
   `"public"."merchants"` foreign-key references in memory only, asserts their
   exact count, and refuses any other explicit `public` reference. Migration
   files on disk are not changed.
5. Before the unique board index exists, exercises the real
   `DatabaseStorage.createNextTaptStone` path with gaps and eight concurrent
   allocators. Every call must succeed with a distinct first-free number; no
   constraint error can disguise a broken advisory lock.
6. Verifies selected-board persistence, explicit no-board/board scopes, and the
   read-only duplicate preflight, then applies `0011`.
7. Exercises the post-index conflict, token hash shape/uniqueness/lookup, return
   state constraints and lookup, same-key attempt reuse, conflicting live claims,
   an effect-free concurrent declined-finalization compare-and-set, split
   idempotency, and isolation between two transactions through the
   database-backed storage implementation.
8. Finalizes one split share as approved through eight concurrent real
   `DatabaseStorage` calls. Exactly one call must own the attempt outcome,
   collected platform fee, and subscription counter increment; the other seven
   calls and an explicit later replay must report no new settlement effect.
9. In `finally`, validates the internally retained schema name again and drops
   only that exact schema with `CASCADE`, then closes every pool.

No migration is applied to the configured application database, and the command
does not invoke `db:push`.

## Approved settlement coverage

The additive `0010a` reconciliation creates the complete legacy
`platform_fees` and `merchant_subscriptions` shapes on a clean schema,
including their foreign keys and the unique merchant-subscription key. It does
not update, delete, truncate, or backfill merchant data. Existing deployments
where these legacy tables already exist retain their rows.

The gate verifies every expected column and named constraint before applying
`0011`. Its approved split proof then checks the persisted attempt outcome,
parent and sibling split states, exactly one collected fee, exactly one monthly
and lifetime subscription increment, and effect-free terminal replay. The
declined proof remains separate and asserts that no fee or subscription row is
created.

## CI

CI should provision a dedicated PostgreSQL service and set only the two test
variables above (or set `DATABASE_URL` to a clearly different database). A normal
test failure still runs schema cleanup. A hard process or machine kill can prevent
`finally` from running; any leftover object will retain the unique
`taptpay_verify_...` schema name and should be reviewed before deliberate cleanup.
