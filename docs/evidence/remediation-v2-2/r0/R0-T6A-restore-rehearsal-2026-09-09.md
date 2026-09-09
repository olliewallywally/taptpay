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

An orphan. Verified in this workspace:

- **No checked-in migration creates it** — nothing in `migrations/` mentions it.
- **It is not in the current Drizzle schema** — no definition in `shared/`.
- **No live source touches it.** The only hit anywhere in `server/`, `client/` or
  `scripts/` is `client/public/app/assets/schema-h7-17eaE.js`, a **built bundle**
  — stale compiled output from before the crypto removal, not live code.
- `FEATURE_CRYPTO` remains a false-only kill switch: `server/config.ts:267`
  throws `ConfigValidationError` if it is ever set true.

So it predates migration `0000`, survived the crypto-payment removal that the
2026-07-20 handoff records, and is now a table the application cannot recreate
and does not read.

### Why this is recorded rather than fixed

It holds payment records. Deleting retained financial data is on the
agent-never list, and D8's retention question is explicitly unresolved, so
dropping it is not a cleanup an agent may perform — nor a decision to take
casually. The options are the owner's:

1. **Leave it.** Costs nothing, and the drift is now named rather than unknown.
2. **Add a forward migration that creates it**, so a rebuild-from-migrations
   reproduces production exactly. This is the honest fix if the rows are being
   kept: it makes the migration history true.
3. **Archive and drop it**, under a dated retention decision. Requires
   `--allow-destructive` and a reviewed change, by design.

Option 2 is the one that closes R0-T6A's convergence claim, because until then
"rebuild from migrations equals production" is false by one table.

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
