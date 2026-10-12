-- R2-T7 — unique provider X-ID per payment attempt (plan v2.2 §9.4).
--
-- See docs/decisions/2026-10-12-r2-t7-processor-x-id-index-owner-direction.md and
-- docs/evidence/remediation-v2-2/r2/R2-T7-review-2026-10-12.md (§21.1 review).
--
-- What it adds
-- ------------
-- One partial unique index on payment_attempts (processor_x_id) where it is not null.
-- Plan §9.4 asks for unique indexes on the processor session ID (0022), the provider
-- transaction ID (0034) and the processor X-ID; this is the third. The X-ID is Windcave's
-- idempotency key: two attempts sharing one would let the provider treat the second as
-- a repeat of the first. The service already refuses a duplicate at attach time with a
-- read-then-write check; this index is the database's final guard for two attaches that
-- race past it. Additive only: no column, constraint or row changes.
--
-- Preflight (in the migration)
-- ----------------------------
-- The table is locked in SHARE mode, then duplicate non-null X-IDs are counted. If any
-- exist the migration aborts with counts only (no X-ID values: R2-T6 keeps provider
-- identifiers out of logs) and performs no remediation: duplicates mean an attempt was
-- attached twice under one idempotency key and must be reconciled from evidence first.
-- An existing index with this name is refused rather than trusted, as 0034 refuses
-- existing columns.
--
-- For the production rehearsal (plan §10.6 rules 1-2, owner action), run count-only
-- queries on a restored clone first: total payment_attempts rows, rows with a non-null
-- processor_x_id, duplicate groups (expected 0), and the SHARE lock duration of the
-- index build.
--
-- Locks
-- -----
-- LOCK TABLE ... IN SHARE MODE blocks writes, not reads, for the check and the build.
-- Deliberately not CONCURRENTLY: the runner (server/migrate.ts) wraps each migration in
-- a transaction and sets lock_timeout and statement_timeout, so the wait is bounded
-- rather than queued behind live traffic (as 0022 and 0034).
--
-- Rollback: a code revert. The index may stay; nothing reads it except the database's
-- own uniqueness check. The runner's ledger is forward-only, so no down migration.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname = 'payment_attempts_processor_x_id_uq'
  ) THEN
    RAISE EXCEPTION
      '0035 aborted: an index named payment_attempts_processor_x_id_uq already exists'
      USING HINT = 'This migration does not trust an existing shape. Compare it with this file and resolve by hand.';
  END IF;
END
$$;

LOCK TABLE payment_attempts IN SHARE MODE;

DO $$
DECLARE
  duplicate_groups integer;
  duplicate_rows integer;
BEGIN
  SELECT count(*), coalesce(sum(attempts), 0)
    INTO duplicate_groups, duplicate_rows
    FROM (
      SELECT count(*) AS attempts
        FROM payment_attempts
       WHERE processor_x_id IS NOT NULL
       GROUP BY processor_x_id
      HAVING count(*) > 1
    ) duplicates;

  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION
      '0035 aborted: duplicate non-null processor_x_id values exist in payment_attempts'
      USING DETAIL = format('%s duplicated X-IDs across %s attempts (values not shown)', duplicate_groups, duplicate_rows),
            HINT = 'Two attempts share one provider idempotency key. Reconcile them from evidence before retrying; this migration performs no remediation.';
  END IF;
END
$$;

CREATE UNIQUE INDEX payment_attempts_processor_x_id_uq
  ON payment_attempts (processor_x_id)
  WHERE processor_x_id IS NOT NULL;

COMMIT;
