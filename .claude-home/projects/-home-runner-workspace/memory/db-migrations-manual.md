---
name: db-migrations-manual
description: "TaptPay applies migrations 0003+ manually via psql; drizzle journal only tracks 0000-0002, so adding a schema column without running its .sql breaks all SELECTs"
metadata: 
  node_type: memory
  type: project
  originSessionId: 361b1ee2-a3b8-4274-94fa-79a7cb4dcf61
---

TaptPay uses `drizzle-kit push` (`npm run db:push`), and `migrations/meta/_journal.json` only records 0000–0002. The `migrations/000[3-7]*.sql` files are applied **manually** (e.g. `psql "$DATABASE_URL" -f migrations/000X.sql`).

**Why:** Drizzle generates `SELECT col1, col2, …` naming every column in `shared/schema.ts`. If schema declares a column whose DB column was never added, **every query on that table 500s** with `column "x" does not exist` — looks like "all the data is gone" across every page using that table.

**How to apply:** After any `shared/schema.ts` column add, run the matching `.sql` against the live DB (or `db:push`) before shipping. To diagnose suspected data loss, first check row counts + `\d <table>` in psql — the rows are usually intact; it's a missing column breaking the query. Real case (2026-06-16): `scheduled_send_at` (migration 0007) was unapplied, breaking the whole property dashboard + terminal. See [[session-state-landing-seo]].
