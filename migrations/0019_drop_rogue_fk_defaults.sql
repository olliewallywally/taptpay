-- Remove auto-increment defaults from foreign-key columns.
--
-- Why this exists
-- ---------------
-- The first object-level comparison of a live database against a clean build
-- (docs/evidence/remediation-v2-2/r0/R0-T6A-live-drift-2026-09-09.md) found six
-- foreign-key columns carrying `nextval(...)` defaults:
--
--   transactions.merchant_id          refunds.merchant_id
--   refunds.transaction_id            platform_fees.merchant_id
--   platform_fees.transaction_id      merchant_settlements.merchant_id
--
-- A foreign key must never auto-increment. An INSERT that omits one of these
-- silently receives 1, 2, 3 … and links the row to whatever merchant or
-- transaction happens to own that id — a wrong-tenant write that raises no
-- error. Verified harmless so far (the sequences have never fired), which is
-- luck, not a control.
--
-- The repository could not repair this. `0000_vengeful_zaladane.sql:31,43`
-- created two of them as `serial`; `0010a:25` and `0013:222` drop those two
-- defaults. The other four were never declared with a default by any migration
-- at all — `0017` and shared/schema.ts both declare them plain `integer` — so a
-- fresh build has always been correct and **no migration anywhere drops the
-- default from a database that already has it.** Replaying the entire history
-- would not have fixed them. This migration is the repair.
--
-- Consequently this is a NO-OP on a clean build: every statement below drops a
-- default that a freshly built database does not have, so the R0-T6A empty
-- database fingerprint is unchanged. It only does work on a database that
-- drifted — which is every database built by `drizzle-kit push`.
--
-- Non-destructive and idempotent. `ALTER COLUMN … DROP DEFAULT` destroys no
-- rows (server/migrate.ts:566 classifies it so) and dropping an absent default
-- succeeds silently, so this may be replayed safely.
--
-- The owned sequences are deliberately left behind. There is no `DROP SEQUENCE`
-- anywhere in migrations/, a clean build already carries two such orphans, and
-- removing an object is not needed to close the defect — once the default is
-- gone the sequence can never be consumed.

BEGIN;

-- Repaired by 0010a:25 and 0013:222, repeated here because both were baselined
-- (recorded without executing) on the development database, so neither ran.
ALTER TABLE transactions          ALTER COLUMN merchant_id    DROP DEFAULT;
ALTER TABLE users                 ALTER COLUMN merchant_id    DROP DEFAULT;

-- Repaired nowhere before this migration.
ALTER TABLE refunds               ALTER COLUMN merchant_id    DROP DEFAULT;
ALTER TABLE refunds               ALTER COLUMN transaction_id DROP DEFAULT;
ALTER TABLE platform_fees         ALTER COLUMN merchant_id    DROP DEFAULT;
ALTER TABLE platform_fees         ALTER COLUMN transaction_id DROP DEFAULT;
ALTER TABLE merchant_settlements  ALTER COLUMN merchant_id    DROP DEFAULT;

COMMIT;
