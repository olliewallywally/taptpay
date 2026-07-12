---
name: db-schema-drift-fk-sequences
description: Latent DB bug — FK columns have rogue auto-increment sequences; db:push unsafe (drift vs main)
metadata: 
  node_type: memory
  type: project
  originSessionId: db0c107b-d45d-4610-b215-84091dd80729
---

Discovered 2026-06-17 while trying to `db:push` the trades schema. Two drift issues in the live Postgres DB:

**1. Latent bug — foreign-key columns created as `serial` (own auto-increment sequence):**
- `transactions.merchant_id` → `nextval('transactions_merchant_id_seq')`
- `platform_fees.transaction_id` → `nextval('platform_fees_transaction_id_seq')`
- `refunds.transaction_id` → `nextval('refunds_transaction_id_seq')`
A FK should never auto-increment. Schema correctly declares them plain `integer().references(...)`, so drizzle-kit flags a "serial→integer" change (its fix is right, but db:push does it destructively → truncate warning). **Impact verified harmless so far:** transactions_merchant_id_seq is at last_value=1, is_called=false (never fired); 0 orphan transactions — every insert has supplied merchant_id explicitly. Dormant landmine: a future insert omitting merchant_id would silently get 1,2,3… mis-linking to the wrong merchant.
**Safe fix (zero data loss, own small PR against main):** `ALTER TABLE transactions ALTER COLUMN merchant_id DROP DEFAULT;` (+ the other two). Drops only the sequence default.

**2. `main` is behind the live DB:** `invoices_rent_requests.scheduled_send_at` exists in the DB (applied by split-bill work) but not in main's schema. So main-based branches are behind reality.

**Consequence / rule:** do NOT run `npm run db:push` from a main-based branch — it wants to drop scheduled_send_at + truncate tables for the serial→integer changes. Apply schema changes via explicit additive numbered migrations in `migrations/` instead. Get main current with split-bill before any push. Related: [[trades-vertical-project]].
