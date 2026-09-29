-- Per-payment credentials, durable payment attempts, and concurrency-safe board
-- numbering. Apply only after the Phase 0 first-free allocator is deployed.
-- This migration is additive and intentionally performs no data remediation.

BEGIN;

-- The additive 0010a baseline reconciliation must run first. Refuse to partially
-- apply 0011 if the two existing tables this migration must constrain are absent.
DO $$
BEGIN
  IF to_regclass('tapt_stones') IS NULL OR to_regclass('split_payments') IS NULL THEN
    RAISE EXCEPTION
      '0011 prerequisites are missing (tapt_stones and/or split_payments)'
      USING HINT =
        'Reconcile the pre-0011 migration baseline with the deployed schema; do not use db:push.';
  END IF;
END
$$;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_token_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_payment_token_hash_shape_check'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_payment_token_hash_shape_check
      CHECK (
        payment_token_hash IS NULL
        OR payment_token_hash ~ '^[0-9a-f]{64}$'
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_payment_token_hash_uq
  ON transactions (payment_token_hash)
  WHERE payment_token_hash IS NOT NULL;

-- This is a new security-sensitive table. Plain CREATE is intentional: an
-- unexpected pre-existing table must abort instead of silently keeping a shape
-- that lacks one of the constraints below.
CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id integer NOT NULL
    REFERENCES transactions(id) ON DELETE CASCADE,
  share_index integer NOT NULL DEFAULT 0,
  idempotency_key uuid NOT NULL,
  state text NOT NULL DEFAULT 'claiming',
  lease_expires_at timestamp NOT NULL,
  processor_session_id text,
  processor_x_id text,
  return_state_hash text,
  return_state_expires_at timestamp,
  outcome text,
  receipt_share integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT payment_attempts_share_index_check
    CHECK (share_index >= 0),
  CONSTRAINT payment_attempts_state_check
    CHECK (
      state IN (
        'claiming',
        'ready',
        'finalizing',
        'approved',
        'declined',
        'cancelled',
        'abandoned'
      )
    ),
  CONSTRAINT payment_attempts_lease_expiry_check
    CHECK (
      lease_expires_at > created_at
      AND lease_expires_at <= created_at + interval '5 minutes'
    ),
  CONSTRAINT payment_attempts_return_state_pair_check
    CHECK (
      (return_state_hash IS NULL) = (return_state_expires_at IS NULL)
    ),
  CONSTRAINT payment_attempts_return_state_hash_shape_check
    CHECK (
      return_state_hash IS NULL
      OR return_state_hash ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT payment_attempts_return_state_expiry_check
    CHECK (
      return_state_expires_at IS NULL
      OR (
        return_state_expires_at > created_at
        AND return_state_expires_at <= created_at + interval '30 minutes'
      )
    ),
  CONSTRAINT payment_attempts_outcome_check
    CHECK (
      outcome IS NULL
      OR (
        outcome IN ('approved', 'declined', 'cancelled')
        AND state = outcome
      )
    ),
  CONSTRAINT payment_attempts_receipt_share_check
    CHECK (
      receipt_share IS NULL
      OR (share_index >= 1 AND receipt_share = share_index)
    )
);

CREATE INDEX IF NOT EXISTS payment_attempts_transaction_idx
  ON payment_attempts (transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_transaction_share_key_uq
  ON payment_attempts (transaction_id, share_index, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_live_transaction_share_uq
  ON payment_attempts (transaction_id, share_index)
  WHERE state IN ('claiming', 'ready', 'finalizing');

CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_return_state_hash_uq
  ON payment_attempts (return_state_hash)
  WHERE return_state_hash IS NOT NULL;

-- Freeze parent/share membership while the read-only audit, NOT NULL hardening,
-- and unique-index build run. Existing rows are never modified or removed.
LOCK TABLE split_payments IN SHARE MODE;

DO $$
DECLARE
  null_parent_count bigint;
  duplicate_detail text;
BEGIN
  SELECT count(*)
  INTO null_parent_count
  FROM split_payments
  WHERE transaction_id IS NULL;

  IF null_parent_count > 0 THEN
    RAISE EXCEPTION
      '0011 aborted: split payment rows without a transaction parent exist'
      USING DETAIL = format('rows=%s', null_parent_count),
            HINT =
              'Reconcile these monetary rows from evidence; this migration performs no remediation.';
  END IF;

  SELECT string_agg(
    format(
      'transaction_id=%s split_index=%s rows=%s',
      transaction_id,
      split_index,
      duplicate_count
    ),
    '; ' ORDER BY transaction_id, split_index
  )
  INTO duplicate_detail
  FROM (
    SELECT transaction_id, split_index, count(*) AS duplicate_count
    FROM split_payments
    GROUP BY transaction_id, split_index
    HAVING count(*) > 1
    ORDER BY transaction_id, split_index
    LIMIT 20
  ) duplicates;

  IF duplicate_detail IS NOT NULL THEN
    RAISE EXCEPTION
      '0011 aborted: duplicate transaction-local split indexes exist'
      USING DETAIL = duplicate_detail,
            HINT =
              'Reconcile these monetary rows from evidence; this migration performs no remediation.';
  END IF;
END
$$;

ALTER TABLE split_payments
  ALTER COLUMN transaction_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS split_payments_transaction_split_uq
  ON split_payments (transaction_id, split_index);

-- Read-only duplicate-active-board preflight. The index below treats NULL
-- merchant IDs as distinct, so the audit matches its exact conflict domain.
-- No row is renamed, renumbered, deactivated, or deleted by this migration.
LOCK TABLE tapt_stones IN SHARE MODE;

DO $$
DECLARE
  duplicate_detail text;
BEGIN
  SELECT string_agg(
    format(
      'merchant_id=%s stone_number=%s rows=%s',
      merchant_id,
      stone_number,
      duplicate_count
    ),
    '; ' ORDER BY merchant_id, stone_number
  )
  INTO duplicate_detail
  FROM (
    SELECT merchant_id, stone_number, count(*) AS duplicate_count
    FROM tapt_stones
    WHERE is_active IS TRUE
      AND merchant_id IS NOT NULL
    GROUP BY merchant_id, stone_number
    HAVING count(*) > 1
    ORDER BY merchant_id, stone_number
    LIMIT 20
  ) duplicates;

  IF duplicate_detail IS NOT NULL THEN
    RAISE EXCEPTION
      '0011 aborted: duplicate active payment-board numbers exist'
      USING DETAIL = duplicate_detail,
            HINT =
              'Run the read-only audit, reconcile from evidence, then retry. This migration performs no remediation.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS tapt_stones_active_merchant_number_uq
  ON tapt_stones (merchant_id, stone_number)
  WHERE is_active IS TRUE;

COMMIT;
