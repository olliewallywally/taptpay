-- R2-T4 — expected provider values on payment_attempts (plan v2.2 §9.4).
--
-- See docs/decisions/2026-10-12-r2-t4-expected-values-schema.md (ADR) and
-- docs/evidence/remediation-v2-2/r2/R2-T4-review-2026-10-12.md (§21.1 review).
--
-- What it adds
-- ------------
-- Seven nullable columns, five CHECK constraints and one partial unique index on
-- payment_attempts. Additive only: no column is dropped, renamed, recomputed or
-- backfilled, and no existing row changes.
--
--   expected_amount_cents, expected_currency, expected_merchant_reference and
--   provider_environment are what the provider must confirm. The service records
--   them on a claimed attempt before its provider session is created, refuses to
--   attach a session without them, and never changes them once a session is
--   attached. They are all set or all null (payment_attempts_expected_pair_check).
--   They stay nullable: attempts claimed before this migration have no trustworthy
--   values, and a NOT NULL or NOT VALID constraint would fail their next update
--   (finalization) while they are in flight.
--
--   provider_transaction_id is written at finalization; the partial unique index
--   stops a second attempt recording the same provider transaction.
--
--   last_reconciliation_code and last_reconciled_at are written by R2-T5's
--   verifier (sanitized codes only).
--
-- Preflight
-- ---------
-- The new columns are null on every existing row, so the CHECKs cannot fail and
-- the unique index cannot find a duplicate when this runs. For the production
-- rehearsal (plan §10.6 rules 1-2, owner action), run count-only queries before
-- applying: total payment_attempts rows; live attempts (claiming/ready/finalizing),
-- which will finish without expected values; and table/index size with the SHARE
-- lock duration of the index build on a restored clone.
--
-- Locks
-- -----
-- ADD COLUMN without a default and ADD CONSTRAINT CHECK on new null columns are
-- catalogue changes plus a scan for the CHECKs; CREATE UNIQUE INDEX takes a SHARE
-- lock for its build. Deliberately not CONCURRENTLY: the runner (server/migrate.ts)
-- wraps each migration in a transaction (see 0021/0022), and it already sets
-- lock_timeout and statement_timeout for every migration, so the wait is bounded
-- instead of queueing behind live traffic.
--
-- Rollback: a code revert. The columns may stay; nothing older reads or requires
-- them. The runner's ledger is forward-only, so no down migration is provided.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'payment_attempts'
       AND column_name IN (
         'expected_amount_cents', 'expected_currency', 'expected_merchant_reference',
         'provider_environment', 'provider_transaction_id',
         'last_reconciliation_code', 'last_reconciled_at'
       )
  ) THEN
    RAISE EXCEPTION '0034: payment_attempts already has an R2-T4 column; refusing to guess its shape';
  END IF;
END $$;

ALTER TABLE payment_attempts
  ADD COLUMN expected_amount_cents bigint,
  ADD COLUMN expected_currency text,
  ADD COLUMN expected_merchant_reference text,
  ADD COLUMN provider_environment text,
  ADD COLUMN provider_transaction_id text,
  ADD COLUMN last_reconciliation_code text,
  ADD COLUMN last_reconciled_at timestamp;

ALTER TABLE payment_attempts
  ADD CONSTRAINT payment_attempts_expected_pair_check CHECK (
    (expected_amount_cents IS NULL) = (expected_currency IS NULL)
    AND (expected_amount_cents IS NULL) = (expected_merchant_reference IS NULL)
    AND (expected_amount_cents IS NULL) = (provider_environment IS NULL)
  ),
  ADD CONSTRAINT payment_attempts_expected_amount_check CHECK (
    expected_amount_cents IS NULL
    OR (expected_amount_cents >= 0 AND expected_amount_cents <= 9999999999)
  ),
  ADD CONSTRAINT payment_attempts_expected_currency_check CHECK (
    expected_currency IS NULL OR expected_currency ~ '^[A-Z]{3}$'
  ),
  ADD CONSTRAINT payment_attempts_expected_reference_check CHECK (
    expected_merchant_reference IS NULL
    OR length(expected_merchant_reference) BETWEEN 1 AND 64
  ),
  ADD CONSTRAINT payment_attempts_provider_environment_check CHECK (
    provider_environment IS NULL OR provider_environment IN ('uat', 'production')
  );

CREATE UNIQUE INDEX payment_attempts_provider_transaction_id_uq
  ON payment_attempts (provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

COMMIT;
