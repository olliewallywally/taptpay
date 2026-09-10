# The five unrepairable foreign-key defaults are repaired; the seven orphan columns are adopted

Date: 2026-09-10 UTC.
Status: **Decided by the owner on 2026-09-10** ("fix all outstanding issues"),
implemented and verified the same session. **No live database was modified.**

## What was decided

The two open recommendations of
[the live-drift finding](../evidence/remediation-v2-2/r0/R0-T6A-live-drift-2026-09-09.md)
are closed by two migrations. Both reach a live database only through the normal
release path (`npm run db:release`), never by hand — the repository's own rule is
that schema changes are additive numbered migrations, and `db:push` is what
created every defect below.

### 1. `0019_drop_rogue_fk_defaults.sql` — the repair

Six foreign-key columns carry `nextval(...)` defaults on the development
database. A foreign key must never auto-increment: an INSERT that omits one
silently links the row to whatever merchant or transaction owns that id — a
wrong-tenant write that raises no error.

`0010a:25` and `0013:222` repair two of them. **The other four were repaired
nowhere**, and `merchant_settlements.merchant_id` makes five columns that no
amount of replaying the history would fix. `0017` and `shared/schema.ts` declare
them all as plain `integer`, so a fresh build has always been correct — the
repository built clean and could not repair.

All seven `DROP DEFAULT` statements are included, including the two already
covered, because both were **baselined** on the development database and
therefore never executed there.

### 2. `0020_adopt_orphan_columns.sql` — adopt, do not drop

Seven columns exist in the live database and in neither `migrations/` nor
`shared/schema.ts`. Six are crypto-payment residue; the seventh,
`invoices_rent_requests.scheduled_send_at`, is traced to a declaration made by
`988b4744` and withdrawn by `d9143f2a` two days later, with a `drizzle-kit push`
in between.

**Adopted, following the owner's 2026-09-09 decision on the identical question
for `crypto_transactions`** (option 2 of three: make the history true rather than
change a live database). Adoption is also the reversible option — a later dated
retention decision can still archive and drop these under `--allow-destructive`,
whereas dropping seven columns cannot be undone.

All seven are empty, so neither option risked data. Measured on the development
database: the two Coinbase credential columns are non-null on **0 of 9**
merchants, `crypto_enabled` and `auto_convert_to_fiat` are true for **0**,
`enabled_cryptocurrencies` is non-null on **0**, and `scheduled_send_at` is set
on **0 of 29** rent requests. `min_confirmations` reads 9 of 9 only because every
row carries its default of `1`; no merchant ever set it.

Neither migration resurrects the feature: `FEATURE_CRYPTO` remains a false-only
kill switch that throws if ever set true (`server/config.ts:267`).

## The exception this extends

`crypto_transactions` was the only table created by a migration and not declared
in `shared/schema.ts`. There are now also seven such **columns**. The consequence
is unchanged and already applied here: `drizzle-kit push` will offer to drop
them, and `npm run db:push` has always been unsafe in this repository.

`server/__tests__/migration-schema-parity.test.ts` now pins the column-level
invariant the way it already pinned the table: for `merchants` and
`invoices_rent_requests` it asserts that the migration-created columns Drizzle
omits are **exactly** the documented exceptions, each with its reason. The parser
was validated against a real catalogue rather than trusted — it finds 57 columns
on `merchants`, matching a clean build's 57 exactly, and misses nothing Drizzle
declares.

## Still open, deliberately

**D8's retention question is untouched.** Adopting records what the live database
has; it does not decide how long anything is kept. Archive-and-drop remains
available under a dated retention decision.

**Production has still never been fingerprinted.** Everything measured here is
the development fork, which diverged from production around 2026-06-30.
Recommendation 4 of the drift finding remains open, and these two migrations are
written against dev's observed state plus the checked-in history — if production
carries a defect dev does not, this does not close it.
