# R0-T6A — empty-database convergence on an isolated PostgreSQL 16

Base: `ec2072795fa3adc48b508e227884b3837685a3aa`.
Branch: `remediation/r1-continuation-20260907`; changes uncommitted.

This is the first R0-T6A evidence in this continuation produced against a **real
database** rather than fake clients. It covers the empty-database half of the
convergence requirement. The restored-snapshot half remains open: it needs an
authorised snapshot, which an agent must not obtain for itself.

## What was run

An isolated PostgreSQL 16.10 cluster, created by `initdb` in a temporary
directory, listening only on `127.0.0.1:55433`, with Unix sockets disabled and
no relationship to any Replit, Neon, development or production database. The
whole run was local, disposable, and deleted afterwards.

The full runner stack was exercised end to end — target validation, server
identity comparison, advisory lock with bounded budgets, the safety gate, the
apply loop, and the new release verification:

```text
node dist/migrate.mjs --target=local --expected-host=127.0.0.1 \
  --expected-port=55433 --expected-database=convergence [--dry-run|--release|--status]
```

(`dist/migrate.mjs` is an esbuild bundle of `server/migrate.ts`, used because
`tsx` cannot create its IPC pipe under the agent sandbox. The bundle was deleted
afterwards. No source behaviour differs.)

## Result

```text
--dry-run   19 migration(s) listed, zero safety findings, nothing executed
--release   19 applied, 0 failures
            ✅ Release verified: 19 migration(s) recorded, 0 pending.
--status    19 applied, 0 pending, 0 drifted, 0 orphaned
```

Post-conditions on the clean database:

| Check | Result |
| --- | --- |
| Public base tables | **29** |
| `drizzle.applied_migrations` rows | **19** |
| Migrations applied out of order | none |
| Safety-gate findings across all 19 files | **none** |
| Schema fingerprint | `sha256:4b709a2c9632f260fdbfc61c3ffe1459b2a0267127663ae968a2b618c96743ce` |

A full object-level fingerprint — 29 tables, 470 columns, 107 constraints (29
primary key, 8 unique, 21 check, 49 foreign key), 80 indexes, 20 sequences, and
0 foreign-key column defaults — is recorded in
[`R0-T6A-empty-fingerprint-2026-09-08.json`](R0-T6A-empty-fingerprint-2026-09-08.json)
and produced by `scripts/schema-fingerprint.mjs`. It records object names and
definitions only; no row data is read.

> **Superseded for gating purposes on 2026-09-09, and left unmodified as the
> record of this run.** The restore rehearsal found one table in production that
> no migration created; `0018_adopt_crypto_transactions.sql` adopted it, so a
> clean build is now **30 tables**, fingerprint
> `sha256:964f4251beea3ba52d1e23d973ae354d3bee9aac3539392c27aa04b7c59398b0`,
> recorded in [`R0-T6A-empty-fingerprint-2026-09-09.json`](R0-T6A-empty-fingerprint-2026-09-09.json)
> — which is what `verify.yml` now gates against. The diff between the two is
> exactly that one table: 30 objects added, 0 removed. Every count and claim
> below remains true of the migration set as it stood on 2026-09-08.

**The fingerprint was reproduced two independent ways and is byte-identical**:
once applying the migrations with `psql -f` directly, and once applying them
through the migration runner into a database with a different name and a
different login. That the runner's statement splitting, comment stripping,
transaction wrapping and ledger writes produce exactly the same schema as raw
`psql` is itself a result worth having. It also confirms the document carries no
database name, user, OID, size, statistic or timestamp, which is what lets CI
compare a throwaway container against a recorded artefact at all.

29 tables and 19 migrations match the counts the source plan records for the
approved SHA, so this run corroborates that number rather than restating it from
documentation.

## The two recorded disagreements, re-checked

The source plan requires re-checking the two differences recorded by `8c22dc9`.
Both were queried on the clean database by object name and definition only; no
row data was read.

**1. Rogue `nextval(...)` defaults on foreign-key columns — DOES NOT REPRODUCE,
and the history already repairs it.** On a database built purely from the
checked-in migrations, no foreign-key column carries any default at all. All 18
`nextval(...)` defaults sit on `<table>.id` primary keys, where they belong.

Traced to source rather than left as an observation:

| Where | What |
| --- | --- |
| `migrations/0000_vengeful_zaladane.sql:31,43` | declares `merchant_id serial NOT NULL` on `transactions` and `users` — the origin |
| `migrations/0010a_reconcile_retail_payment_baseline.sql:25` | drops the default on `transactions.merchant_id` |
| `migrations/0013_subscription_plans.sql:222` | drops the default on `users.merchant_id` |

So the defect is **migration lag, not a repository defect**. A live database
still showing `nextval(...)` on those columns has simply not applied 0010a and
0013. The correct response is to bring that database current — **not** to invent
a catch-up migration, which the source plan explicitly forbids.

`DROP DEFAULT` does not drop the sequence object, so two orphan sequences
(`transactions_merchant_id_seq`, `users_merchant_id_seq`) exist even on a
correct database. The fingerprint records sequence names, so they are visible
rather than silently absorbed.

Which live databases are affected still needs the owner-supplied schema
metadata; this run deliberately obtained none.

**2. `merchant_subscriptions.tier` — clean-database state recorded.** On the
clean database the column is `text`, `NOT NULL`, default `'free'::text`. Whether
the live databases agree still needs the owner-supplied schema metadata.

## What this does not prove

- No restored snapshot was involved, so empty/restored convergence is **not**
  established.
- The restored-snapshot fingerprint has no counterpart to compare against yet.
- Lock timings, N/N+1 application compatibility and restore rehearsal remain
  untested.
- Nothing was run against any real target. No production or development
  database was contacted, and no row data was read from anything.

## Reproducing it in CI

`.github/workflows/verify.yml` now carries a `migration-convergence` job that
performs the same run against a `postgres:16` service container on loopback,
declared `--target=local`. It needs **no secrets**, so it is green on forks and
on every pull request. The app's Neon WebSocket driver is not involved, because
the migration runner talks plain `pg`.
