-- Canonical processor-payment completion time. Daily payout summaries must be
-- driven by when money completed, not when an unpaid request was created.

BEGIN;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS completed_at timestamp;


CREATE INDEX IF NOT EXISTS transactions_merchant_completed_at_idx
  ON transactions (merchant_id, completed_at)
  WHERE completed_at IS NOT NULL;

COMMIT;
