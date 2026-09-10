-- Adopt the seven orphan columns into the migration history.
--
-- Why this exists
-- ---------------
-- These seven columns exist in the live database and in neither `migrations/`
-- nor `shared/schema.ts`, so nothing in the repository remembers them
-- (docs/evidence/remediation-v2-2/r0/R0-T6A-live-drift-2026-09-09.md). They are
-- the same defect `0018` closed for `crypto_transactions`, one level down:
-- `drizzle-kit push` wrote schema that no later artefact records.
--
-- Six are residue of the crypto-payment feature the 2026-07-20 handoff removed
-- — the same removal that stranded `crypto_transactions`. The seventh is
-- unrelated and fully traced: `988b4744` (2026-06-15) declared
-- `scheduledSendAt` on `invoicesRentRequests`, `d9143f2a` (2026-06-17) withdrew
-- the declaration, and a push in that two-day window left the column behind.
-- Today `scheduled_send_at` lives only on the *different* table `job_invoices`
-- (0007:93, shared/schema.ts:1306).
--
-- Adopted rather than dropped
-- ---------------------------
-- This follows the owner's 2026-09-09 decision on the identical question for
-- `crypto_transactions` (docs/decisions/2026-09-09-adopt-orphan-crypto-
-- transactions.md, option 2 of three): make the history true rather than change
-- a live database. Adoption is reversible — a later dated retention decision can
-- still archive and drop these under `--allow-destructive` — whereas dropping
-- seven columns is not. All seven are empty, so neither option risks data:
-- verified on the development database, `coinbase_commerce_api_key` and
-- `coinbase_webhook_secret` are non-null on 0 of 9 merchants, `crypto_enabled`
-- and `auto_convert_to_fiat` are true for 0, `enabled_cryptocurrencies` is
-- non-null on 0, and `scheduled_send_at` is set on 0 of 29 rent requests.
-- (`min_confirmations` reads 9 of 9 only because every row carries its
-- default of 1 — no merchant ever set it.)
--
-- This does not resurrect the feature. `FEATURE_CRYPTO` remains a false-only
-- kill switch that throws if ever set true (server/config.ts:267), and no live
-- source reads any of these columns.
--
-- Shape is copied from the live catalogue, not from any deleted declaration:
-- types, nullability and defaults match what the database actually carries, so
-- a rebuilt database matches it exactly rather than approximately. The columns
-- are appended in their existing relative order. Their absolute ordinal
-- positions will still differ from a pushed database — that database already
-- differs in 93 column positions from construction method alone, which is why
-- digest equality can never be a restore gate between the two.
--
-- Every statement is IF NOT EXISTS, so this is a no-op against dev and
-- production, which already have all seven. It reads no rows, backfills nothing
-- and deletes nothing.
--
-- Deliberate exception, do not "fix" it
-- ------------------------------------
-- Like `crypto_transactions`, these columns are created by a migration and are
-- NOT declared in shared/schema.ts, on purpose — declaring them would re-import
-- a removed feature's surface into the ORM. The consequence is the same and it
-- already applied to this repository: `drizzle-kit push` (npm run db:push)
-- diffs `public` against shared/schema.ts and WILL OFFER TO DROP THEM.
-- `npm run db:push` has always been unsafe here. The invariant is pinned by
-- migration-schema-parity.test.ts so it cannot drift silently.

BEGIN;

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS coinbase_commerce_api_key text,
  ADD COLUMN IF NOT EXISTS coinbase_webhook_secret text,
  ADD COLUMN IF NOT EXISTS crypto_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS enabled_cryptocurrencies text[],
  ADD COLUMN IF NOT EXISTS auto_convert_to_fiat boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_confirmations integer DEFAULT 1;

ALTER TABLE invoices_rent_requests
  ADD COLUMN IF NOT EXISTS scheduled_send_at timestamp;

COMMIT;
