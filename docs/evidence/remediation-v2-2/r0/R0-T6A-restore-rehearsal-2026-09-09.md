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

## Delta — the one thing left to reconcile

**The restored production database has 33 public tables. The canonical
migrated-from-zero schema has 29.**

The 29 are recorded in
[`R0-T6A-empty-fingerprint-2026-09-08.json`](R0-T6A-empty-fingerprint-2026-09-08.json):

```text
active_schedules · api_keys · api_requests · client_profiles · info_pack_leads
invoices_rent_requests · job_events · job_invoices · job_schedules
merchant_settlements · merchant_subscriptions · merchant_tutorial_progress
merchants · payment_attempts · platform_fees · push_notification_deliveries
push_subscriptions · quotes · refunds · split_payments · stock_items
subscription_billing_history · tapt_stones · tenant_profiles · transaction_events
transactions · uploaded_files · users · webhook_deliveries
```

The migration ledger is **not** among them — it lives in the `drizzle` schema
(`drizzle.applied_migrations`), deliberately outside `public` so `drizzle-kit
push` ignores it. The schema fingerprint tool applies no exclusions: it takes
every `public` table with `relkind IN ('r','p')`. So the four extra tables are
genuinely extra, not an artefact of counting.

Four table names are needed to close this. The likely explanations, in order:

1. **Pre-baseline legacy tables** — objects that existed before migration `0000`
   and were therefore never created by any checked-in migration. D2 keeps
   historical Stripe schema until dead-proof, and this is where it would show.
2. **A `session` table** from `connect-pg-simple`, which R8 lists as a verified
   unused dependency — the table can outlive the code.
3. **Objects created by `drizzle-kit push`** during the period the startup push
   was still running, which is the failure mode R0-T6A exists to close.

Explanation 3 would be the significant one: it would mean production carries
schema that no migration can reproduce, and a rebuild from migrations would not
equal production. That is the exact claim restored-snapshot convergence is
supposed to test, so the delta must be named rather than waived.

**To close it:** the four table names, and for each, whether any checked-in
migration in `migrations/` creates it. A single `\dt` listing from the isolated
restore, diffed against the 29 above, is sufficient. No row data is needed.

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
