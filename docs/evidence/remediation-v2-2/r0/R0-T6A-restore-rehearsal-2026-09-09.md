# R0-T6A — restored-snapshot convergence, performed by the owner

Date: 2026-09-09 UTC.
Performed by: Oliver. **Owner-reported; not independently reproduced by an agent.**
Status: **The rehearsal is done. One reconciliation is outstanding — see §Delta.**

This closes the half of R0-T6A that
[the empty-database convergence](R0-T6A-convergence-2026-09-08.md) explicitly left
open: "the restored half needs an authorised snapshot, which an agent must not
obtain for itself."

## What was performed

As reported by the owner:

- An isolated PostgreSQL 16 Neon project was created.
- A real encrypted backup of production was taken.
- It was decrypted with the owner-held private key.
- It was restored into the isolated database.
- **33 of 33 tables and 172 of 172 rows verified.**
- Constraints, indexes, schema and tenant distributions verified.
- **Production remained untouched and read-only throughout.**

This satisfies the shape the plan asks for — a managed snapshot, an isolated
scratch project with no external jobs, messages or provider credentials, and
count-only validation without printing data — and it is the first time the backup
and restore path has been exercised end to end rather than tested synthetically.
It also retires the standing caveat on `scripts/db-backup.sh` that "a success
message proves both local tools exited successfully; it does not prove
completeness, decryptability, restore time or schema convergence." Decryptability
and restorability are now demonstrated.

The PostgreSQL major version matters and was correct: `pg_get_constraintdef` and
`pg_get_indexdef` deparse text can shift between major versions, so a fingerprint
comparison is only meaningful on 16.x, which is what was used.

## Delta — reconciled 2026-09-09

The owner supplied the table listing. The 33 resolve as **30 application tables
in `public`, 2 migration-tracking tables in `drizzle`, and 1 Replit bookkeeping
table in `_system`**. Three of the apparent four extras are bookkeeping outside
`public` and are expected:

| Table | Owner | Expected |
| --- | --- | --- |
| `drizzle.applied_migrations` | this runner's ledger | yes — deliberately outside `public` so `drizzle-kit push` ignores it |
| `drizzle.__drizzle_migrations` | drizzle-kit's own ledger | yes — legacy, from the era before this runner |
| `_system.replit_database_migrations_v1` | Replit platform | yes — not ours, not in `public` |

The fingerprint counts only `public`, so none of these was ever the difference.

**The real drift is exactly one table: `public.crypto_transactions`.**

30 application tables against the canonical 29, and the diff is that single name.
Everything else matches exactly.

### What `crypto_transactions` is

An orphan. Verified in this workspace **as at discovery** — the migration gap is
closed below, the rest still holds:

- **No checked-in migration created it** — nothing in `migrations/` mentioned it.
  Closed 2026-09-09 by `0018_adopt_crypto_transactions.sql`.
- **It is not in the current Drizzle schema** — no definition in `shared/`.
- **No live source touches it.** The only hit anywhere in `server/`, `client/` or
  `scripts/` is `client/public/app/assets/schema-h7-17eaE.js`, a **built bundle**
  — stale compiled output from before the crypto removal, not live code.
- `FEATURE_CRYPTO` remains a false-only kill switch: `server/config.ts:267`
  throws `ConfigValidationError` if it is ever set true.

So it predates migration `0000` and survived the crypto-payment removal that the
2026-07-20 handoff records. At discovery it was a table the application could
neither recreate nor read; it is now recreatable, and still unread.

### Resolved 2026-09-09 — the owner chose option 2, and it is implemented

Three options were put to the owner: leave it recorded, adopt it with a forward
migration, or archive and drop it. **The owner chose to adopt it.**

`migrations/0018_adopt_crypto_transactions.sql` now creates the table. It is a
single `CREATE TABLE IF NOT EXISTS`, so it is a no-op against dev and
production, which already have it; it reads no rows and deletes nothing. Its
shape was copied from the live catalogue rather than the deleted Drizzle
declaration, so a rebuild matches production exactly rather than approximately.

**The convergence claim is now true.** Re-running CI's convergence job on a
throwaway PostgreSQL 16 gives 20 applied / 0 pending / 0 drifted / 0 orphaned
and **30 public tables**, and the fingerprint diff against the 2026-09-08 record
is exactly this table — 30 objects added, **0 removed**, every one of them
naming `crypto_transactions`. Foreign-key column defaults remain **0**.

The built table was then compared against the live catalogue directly: its 20
columns (position, name, type, nullability, default), 4 constraint names and
definitions, 2 index definitions and owned sequence name are **identical**.

New recorded fingerprint
`sha256:964f4251beea3ba52d1e23d973ae354d3bee9aac3539392c27aa04b7c59398b0`
in [`R0-T6A-empty-fingerprint-2026-09-09.json`](R0-T6A-empty-fingerprint-2026-09-09.json).
(That artefact was superseded later the same day when the fingerprint was
widened to cover views, triggers and permissions — `verify.yml` now gates on
[`R0-T6A-empty-fingerprint-v2-2026-09-09.json`](R0-T6A-empty-fingerprint-v2-2026-09-09.json);
see [the widening](R0-T6A-fingerprint-widening-2026-09-09.md).) Rationale, the `db:push` hazard this creates, and
the retention question left open are recorded in
[the decision](../../../decisions/2026-09-09-adopt-orphan-crypto-transactions.md).

**One correction to what is written above:** this table was described as holding
payment records. That was not verified and appears to be wrong — the development
database (forked from production ~2026-06-30) holds **0 rows** in it.
Production's count remains unverified here. D8's retention question is still
open either way.

**Worth knowing separately:** the stale bundle
`client/public/app/assets/schema-h7-17eaE.js` still carries crypto schema
references. That is build output, not source, but it means a shipped asset
mentions a removed feature.

## What this still does not establish

## What this still does not establish

- **A schema fingerprint comparison.** Table and row counts are not a
  fingerprint. Running `scripts/schema-fingerprint.mjs` against the isolated
  restore and comparing to `sha256:4b709a2c…` would convert "33 tables verified"
  into a byte-level equality claim — or localise the drift precisely.
- **N/N+1 application compatibility** — untested.
- **Lock timings on a production-sized clone.** 172 rows is not production-sized,
  so the timing half of the rehearsal is not addressed by this run. The budgets
  remain proven only against fake clients.
- **RPO/RTO and rollback timing** were not reported and remain unrecorded.

Recorded as owner testimony. No agent connected to production or to the isolated
restore, and no snapshot identifier, credential or row value appears here.
