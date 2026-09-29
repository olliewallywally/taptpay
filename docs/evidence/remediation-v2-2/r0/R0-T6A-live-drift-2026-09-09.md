# The live database does not match the migration history

Date: 2026-09-09 UTC.
Status: **Findings only. Nothing was changed in any database.**
Scope: the **development** database (`helium`/`heliumdb`), forked from production
~2026-06-30 and diverged since. This does not establish production's state.

## How this was found

Widening the schema fingerprint to views, triggers and permissions
([the widening](R0-T6A-fingerprint-widening-2026-09-09.md)) made it cheap to run
the tool against a live database and diff it against one built from
`migrations/` alone. Nobody had ever run that comparison. The restore rehearsal
had compared **table counts** only — 33 against 29 — which is why it concluded
the drift was a single orphan table.

Both documents are `fingerprintVersion: 2`. Built:
`sha256:3d5c0937…`. Dev: `sha256:fa941b79…`.

## The root cause, and it explains almost everything

```
SELECT filename, baselined FROM drizzle.applied_migrations ORDER BY filename;
```

**Dev's ledger has 19 rows, and `0000` through `0013` — all fifteen files — are
`baselined = true`.** `server/migrate.ts:54` defines `--baseline` as recording
migrations as applied **without executing them**.

So on the development database those fifteen migrations never ran. Its schema was
created by `drizzle-kit push` and stamped as migrated on 2026-08-09. Only
`0014`–`0017` actually executed. `0018` is not in the ledger yet.

That is not a defect in the baseline mechanism — adopting the runner on an
existing database is exactly what it is for. It does mean **the checked-in
migration history has never been executed against this database**, so every
place where push's output differs from the SQL is invisible to the ledger, which
reports `0 drifted`.

## What differs

| Section | dev | built | |
| --- | ---: | ---: | --- |
| tables, constraints, foreign keys, views, triggers, routines, policies, types, extensions, privileges | — | — | ✅ identical |
| sequences | 26 | 21 | 5 extra in dev |
| columns | 497 | 490 | 7 extra in dev; 99 more differ in position or default |
| indexes | 81 | 82 | 1 missing in dev |
| **foreign-key column defaults** | **6** | **0** | 🔴 |

### 1. Seven orphan columns — the crypto removal left more than a table

Verified directly: none of these appears anywhere in `migrations/` or
`shared/schema.ts`.

| Column | Type |
| --- | --- |
| `merchants.coinbase_commerce_api_key` | text |
| `merchants.coinbase_webhook_secret` | text |
| `merchants.crypto_enabled` | boolean |
| `merchants.enabled_cryptocurrencies` | text[] |
| `merchants.auto_convert_to_fiat` | boolean |
| `merchants.min_confirmations` | integer |
| `invoices_rent_requests.scheduled_send_at` | timestamp |

The first six are the removed crypto-payment feature — the same removal that
stranded `crypto_transactions`. **This revises the restore rehearsal's
conclusion**: that comparison was table-level, so "the real drift is exactly one
table" was true of tables and only of tables. The crypto residue is one table
**and six columns**.

**Two of them are credential columns, and they are empty.** Checked by count
only, never by value: `coinbase_commerce_api_key` and `coinbase_webhook_secret`
are non-null on **0 of 9** merchants, `crypto_enabled` is true for **0**, and
`crypto_transactions` holds **0 rows**. So this residue carries no unrotated
secret and no retained payment record — which also settles the question the
adoption decision left open, in that database.

`invoices_rent_requests.scheduled_send_at` is unrelated, and it is **traced**.
Today the repository puts `scheduled_send_at` only on a *different* table,
`job_invoices` (`migrations/0007_trades_vertical.sql:93`,
`shared/schema.ts:1306`) — but it did once live on `invoices_rent_requests`:

- `988b4744` (2026-06-15, *"feat(terminal): scheduled send date for rent
  requests"*) declared `scheduledSendAt` on `invoicesRentRequests` in
  `shared/schema.ts`.
- By `d9143f2a` (2026-06-17) the declaration was gone again.

A `drizzle-kit push` in that two-day window put the column in the database, the
declaration was then withdrawn, and the column stayed. It is the same failure
mode as the crypto residue and as `crypto_transactions` itself: **push writes
schema that nothing later remembers.** Every orphan on this page traces back to
it.

### 2. A missing index — genuine migration lag

`tapt_stones_merchant_id_idx` is created by
`migrations/0010a_reconcile_retail_payment_baseline.sql:20` and **is absent from
dev**, which has only `tapt_stones_pkey` and the partial
`tapt_stones_active_merchant_number_uq ... WHERE (is_active IS TRUE)`. The
partial index leads on `merchant_id` but cannot serve a query that includes
inactive stones. `0010a` was baselined, so its `CREATE INDEX` never ran.

### 3. Six foreign-key columns carry rogue auto-increment defaults

The repository's known latent defect, **observed on a live database for the first
time**. `R0-T6A-convergence-2026-09-08.md` established that it does not
reproduce on a clean build (0 there, confirmed again) and called it migration
lag. Both halves are now visible:

| Column | Repaired by a migration? |
| --- | --- |
| `transactions.merchant_id` | yes — `0010a:25`, which was baselined and never ran |
| `refunds.merchant_id` | **no repair exists** |
| `refunds.transaction_id` | **no repair exists** |
| `platform_fees.merchant_id` | **no repair exists** |
| `platform_fees.transaction_id` | **no repair exists** |
| `merchant_settlements.merchant_id` | **no repair exists** |

This is the part worth acting on. For one column, replaying the history would
fix it. **For the other five, nothing in the repository would** — `0017` and
`shared/schema.ts` both declare these columns as plain `integer`, so a fresh
build is correct, but no migration drops the default from a database that
already has it. The repository builds clean and cannot repair.

Each also owns a stray sequence, which is the 5-sequence difference.

An asymmetry, stated as undetermined: on dev, `users_merchant_id_seq` exists and
is owned by `users.merchant_id`, but that column has **no** default — so it was
dropped at some point even though `0013` (which drops it) never executed there.
What did it is not recoverable from the catalogue.

### 4. Renames and column order — construction-method residue, not damage

Eighteen constraints differ **in name only**. Every one of the 51 foreign keys
was paired by full signature — table, columns, referenced table and columns,
`ON UPDATE`, `ON DELETE`, `MATCH`, validated, deferrable, deferred — and **all 51
match semantically, with zero unmatched on either side**. Dev carries Drizzle's
generated `{table}_{col}_{reftable}_{refcol}_fk` form (including one truncated at
Postgres' 63-character identifier limit, which only that generator produces);
the migrations use bare inline `REFERENCES`, which Postgres auto-names `_fkey`.
Where a migration names constraints explicitly — `0000`, `0017`, `0018` — the
names match dev exactly.

Ninety-three columns differ **only in ordinal position**, and this is not
explained away by dev's seven extra columns: after removing them, six tables
still order differently. That is push laying columns out in `shared/schema.ts`
declaration order against migrations appending them in `ALTER TABLE` order.

Low practical risk — `scripts/db-backup.mjs:101` uses `pg_dump`, whose `COPY`
carries an explicit column list, and no column-list-free `INSERT`/`COPY` was
found in `server/`, `shared/` or `scripts/`. But it has a hard consequence:
**digest equality can never be a restore gate between these two databases.**
Comparing them requires a section-by-section diff, not a digest comparison.

### 5. The clean build is not perfectly clean either

`transactions_merchant_id_seq` and `users_merchant_id_seq` exist in a
freshly built database and own no default: `0010a:25` and `0013:222` drop the
defaults, and there is **no `DROP SEQUENCE` anywhere in `migrations/`**.
Harmless, but they are in the recorded fingerprint.

## Why the existing gates did not catch any of this

- **`server/migration-baseline-contract.ts`** gates a baseline stamp on
  observable effects, but only against a hand-picked existence list. For `0010a`
  — twelve statements — it checks four tables and one column
  (lines 61-66). It does not check `tapt_stones_merchant_id_idx`, and its
  `Requirement["kind"]` union has **no way to express "this column must have no
  default"**. The two effects actually missing on dev are exactly the two the
  contract cannot see, so the baseline passed honestly and wrongly.
- **`server/__tests__/migration-schema-parity.test.ts`** (added earlier today)
  compares only the *table-name* sets of `migrations/` and `shared/schema.ts`.
  Columns, indexes, constraint names and defaults are out of scope, and it never
  touches a live database. It would not have caught one of these.

## Recommended, not done

None of this was acted on: repairing a live schema is not an agent's call.

1. **A migration dropping the five unrepairable foreign-key defaults**
   (`refunds` ×2, `platform_fees` ×2, `merchant_settlements`). This is the only
   finding that no amount of replaying fixes. `ALTER COLUMN ... DROP DEFAULT` is
   safe and `IF EXISTS`-shaped, but it changes a live schema, so it is a
   decision.
2. **Decide the seven orphan columns** — same question `0018` answered for the
   table: adopt them into the history, or drop them under a dated decision. They
   are empty, so dropping them costs nothing but the decision.
3. **Extend the baseline contract** so it can express "no default on this
   column" and cover `0010a`'s index — the two blind spots proven above.
4. **Run the fingerprint against production**, not just dev. Everything here is
   about a fork that has diverged; production's real state is still unmeasured.

## Provenance

The object-by-object tracing was produced by a subagent working read-only. The
load-bearing claims were re-verified independently before publication: the
19-row ledger and its fifteen `baselined = true` rows, the seven orphan columns'
absence from both descriptions, `scheduled_send_at`'s real home, the missing
`tapt_stones` index in dev against its presence in a clean build, and the
credential columns' emptiness. Sequence, constraint-rename and column-position
tracing is reported as the subagent established it.
