-- Subscription-only pricing: seat-priced monthly plans replace per-transaction
-- fees, and users become the canonical login identities behind those seats.
--
-- This migration is additive and safe to re-run. Historical fee/accounting
-- columns and rows remain in place; only defaults for future writes change.

BEGIN;

-- Remember which subscription rows pre-date the plan columns. The plan columns
-- are deliberately introduced nullable and receive defaults only after this
-- snapshot, so a rerun cannot reset a customer who subsequently chose Team or
-- Crew back to Solo.
CREATE TEMP TABLE _taptpay_0013_legacy_subscriptions (
  id integer PRIMARY KEY
) ON COMMIT DROP;

-- ---------------------------------------------------------------------------
-- 1. Merchant subscriptions and monthly billing reconciliation
-- ---------------------------------------------------------------------------

ALTER TABLE merchant_subscriptions
  ADD COLUMN IF NOT EXISTS plan_id text,
  ADD COLUMN IF NOT EXISTS seat_limit integer,
  ADD COLUMN IF NOT EXISTS price_cents integer,
  ADD COLUMN IF NOT EXISTS current_period_start timestamp,
  ADD COLUMN IF NOT EXISTS current_period_end timestamp,
  ADD COLUMN IF NOT EXISTS pending_plan_id text,
  ADD COLUMN IF NOT EXISTS pending_plan_effective_at timestamp,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean,
  ADD COLUMN IF NOT EXISTS windcave_card_id text,
  ADD COLUMN IF NOT EXISTS windcave_billing_ref text,
  ADD COLUMN IF NOT EXISTS card_brand text,
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS card_expiry text,
  ADD COLUMN IF NOT EXISTS failed_payment_count integer,
  ADD COLUMN IF NOT EXISTS last_payment_failure_at timestamp,
  ADD COLUMN IF NOT EXISTS last_payment_failure_reason text,
  ADD COLUMN IF NOT EXISTS billing_claim_token text,
  ADD COLUMN IF NOT EXISTS billing_claimed_at timestamp;

INSERT INTO _taptpay_0013_legacy_subscriptions (id)
SELECT id
FROM merchant_subscriptions
WHERE plan_id IS NULL OR seat_limit IS NULL OR price_cents IS NULL;

-- A previous version of this migration briefly gave current_period_start a
-- default. Periods begin only after an initial successful subscription charge.
ALTER TABLE merchant_subscriptions
  ALTER COLUMN current_period_start DROP DEFAULT;

-- An older status constraint did not include pending. Remove it before moving
-- unverified merchants into the pending state; the complete constraint is added
-- back after all data is normalised.
ALTER TABLE merchant_subscriptions
  DROP CONSTRAINT IF EXISTS merchant_subscriptions_status_check;

UPDATE merchant_subscriptions AS subscription
SET plan_id = 'solo',
    seat_limit = 1,
    price_cents = 799,
    status = 'pending',
    last_billing_date = NULL,
    current_period_start = NULL,
    current_period_end = NULL,
    next_billing_date = NULL,
    pending_plan_id = NULL,
    pending_plan_effective_at = NULL,
    cancel_at_period_end = false,
    cancellation_requested_at = NULL,
    cancellation_effective_date = NULL,
    cancellation_reason = NULL,
    failed_payment_count = 0,
    last_payment_failure_at = NULL,
    last_payment_failure_reason = NULL,
    billing_claim_token = NULL,
    billing_claimed_at = NULL
FROM _taptpay_0013_legacy_subscriptions AS legacy
WHERE subscription.id = legacy.id;

-- Legacy rows belonged to the retired per-transaction fee sweeper. Their
-- status, last_billing_date and cancellation dates do not describe a paid seat
-- subscription and must never grant access, skip the initial charge, or inherit
-- a cancellation. Every captured row starts a fresh paid period only after card
-- activation succeeds.

-- Repair only invalid/incomplete rows. Valid rows are never re-priced on a
-- rerun, which is essential once merchants can change plan after deployment.
UPDATE merchant_subscriptions
SET plan_id = 'solo', seat_limit = 1, price_cents = 799
WHERE plan_id IS NULL
   OR plan_id NOT IN ('solo', 'team', 'crew')
   OR seat_limit IS NULL
   OR seat_limit < 1
   OR price_cents IS NULL
   OR price_cents < 0;

UPDATE merchant_subscriptions
SET status = 'pending'
WHERE status IS NULL
   OR status NOT IN ('pending', 'active', 'past_due', 'suspended', 'cancelled');

UPDATE merchant_subscriptions
SET cancel_at_period_end = false
WHERE cancel_at_period_end IS NULL;

UPDATE merchant_subscriptions
SET failed_payment_count = 0
WHERE failed_payment_count IS NULL OR failed_payment_count < 0;

ALTER TABLE merchant_subscriptions
  ALTER COLUMN plan_id SET DEFAULT 'solo',
  ALTER COLUMN plan_id SET NOT NULL,
  ALTER COLUMN seat_limit SET DEFAULT 1,
  ALTER COLUMN seat_limit SET NOT NULL,
  ALTER COLUMN price_cents SET DEFAULT 799,
  ALTER COLUMN price_cents SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN cancel_at_period_end SET DEFAULT false,
  ALTER COLUMN cancel_at_period_end SET NOT NULL,
  ALTER COLUMN failed_payment_count SET DEFAULT 0,
  ALTER COLUMN failed_payment_count SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_subscriptions_plan_id_check'
      AND conrelid = 'merchant_subscriptions'::regclass
  ) THEN
    ALTER TABLE merchant_subscriptions
      ADD CONSTRAINT merchant_subscriptions_plan_id_check
      CHECK (plan_id IN ('solo', 'team', 'crew'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_subscriptions_pending_plan_id_check'
      AND conrelid = 'merchant_subscriptions'::regclass
  ) THEN
    ALTER TABLE merchant_subscriptions
      ADD CONSTRAINT merchant_subscriptions_pending_plan_id_check
      CHECK (pending_plan_id IS NULL OR pending_plan_id IN ('solo', 'team', 'crew'));
  END IF;

  ALTER TABLE merchant_subscriptions
    ADD CONSTRAINT merchant_subscriptions_status_check
    CHECK (status IN ('pending', 'active', 'past_due', 'suspended', 'cancelled'));

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_subscriptions_seat_limit_check'
      AND conrelid = 'merchant_subscriptions'::regclass
  ) THEN
    ALTER TABLE merchant_subscriptions
      ADD CONSTRAINT merchant_subscriptions_seat_limit_check CHECK (seat_limit >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_subscriptions_price_cents_check'
      AND conrelid = 'merchant_subscriptions'::regclass
  ) THEN
    ALTER TABLE merchant_subscriptions
      ADD CONSTRAINT merchant_subscriptions_price_cents_check CHECK (price_cents >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS subscription_billing_history (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  subscription_id integer REFERENCES merchant_subscriptions(id),
  billing_type text NOT NULL,
  amount numeric(10, 2) NOT NULL,
  transaction_count integer DEFAULT 0,
  billing_period_start timestamp,
  billing_period_end timestamp,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  windcave_transaction_id text,
  idempotency_key text,
  attempt_number integer,
  status text NOT NULL DEFAULT 'pending',
  description text,
  failure_reason text,
  paid_at timestamp,
  created_at timestamp DEFAULT now()
);

ALTER TABLE subscription_billing_history
  ADD COLUMN IF NOT EXISTS windcave_transaction_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS attempt_number integer;

CREATE INDEX IF NOT EXISTS subscription_billing_history_merchant_created_idx
  ON subscription_billing_history (merchant_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_billing_history_idempotency_key_uq
  ON subscription_billing_history (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The transaction fee is historical only. Preserve old values but make every
-- future transaction default to zero if a caller omits the explicit rate.
ALTER TABLE transactions
  ALTER COLUMN platform_fee_rate SET DEFAULT '0.0000';

-- ---------------------------------------------------------------------------
-- 2. Users: canonical login identity and one deterministic owner per merchant
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS invite_token_hash text,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamp,
  ADD COLUMN IF NOT EXISTS last_login_at timestamp,
  ADD COLUMN IF NOT EXISTS reset_token text,
  ADD COLUMN IF NOT EXISTS reset_token_expiry timestamp;

-- Migration 0000 accidentally made this foreign key serial/not-null. Platform
-- administrators have no merchant and must not consume a merchant sequence.
ALTER TABLE users
  ALTER COLUMN merchant_id DROP DEFAULT,
  ALTER COLUMN merchant_id DROP NOT NULL,
  ALTER COLUMN role SET DEFAULT 'member';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check,
  DROP CONSTRAINT IF EXISTS users_status_check;

UPDATE users
SET role = 'member'
WHERE role IS NULL OR role NOT IN ('owner', 'member', 'admin');

UPDATE users
SET status = 'active'
WHERE status IS NULL OR status NOT IN ('active', 'invited', 'disabled');

ALTER TABLE users
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;

-- Fail safely instead of letting a case-only duplicate make login routing
-- ambiguous. The exception identifies the data cleanup needed before retrying.
DO $$
BEGIN
  IF EXISTS (
    SELECT lower(email)
    FROM users
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '0013 cannot enforce case-insensitive user email uniqueness: duplicate lower(email) values exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq
  ON users (lower(email));

-- Retain exactly one existing non-admin identity as owner for each merchant.
-- Password-enabled merchants must use the identity matching the merchant email;
-- otherwise the old merchant credentials would stop working. For a legacy
-- merchant without a password, prefer an email match, then an existing owner,
-- then the oldest row. The CTE snapshots the old roles before the update.
WITH ranked AS (
  SELECT user_row.id,
         merchant.password_hash,
         lower(user_row.email) = lower(merchant.email) AS email_matches,
         row_number() OVER (
           PARTITION BY user_row.merchant_id
           ORDER BY
             (lower(user_row.email) = lower(merchant.email)) DESC,
             (user_row.role = 'owner') DESC,
             user_row.id
         ) AS owner_rank
  FROM users AS user_row
  JOIN merchants AS merchant ON merchant.id = user_row.merchant_id
  WHERE user_row.role <> 'admin'
)
UPDATE users AS user_row
SET role = CASE
  WHEN ranked.password_hash IS NOT NULL AND ranked.email_matches THEN 'owner'
  WHEN ranked.password_hash IS NULL AND ranked.owner_rank = 1 THEN 'owner'
  ELSE 'member'
END
FROM ranked
WHERE user_row.id = ranked.id;

-- Keep a pre-existing matching identity's password aligned with the merchant
-- credential. Missing matching identities are inserted immediately below.
UPDATE users AS owner_row
SET password = merchant.password_hash,
    status = 'active',
    name = COALESCE(owner_row.name, merchant.name)
FROM merchants AS merchant
WHERE owner_row.merchant_id = merchant.id
  AND owner_row.role = 'owner'
  AND merchant.password_hash IS NOT NULL
  AND lower(owner_row.email) = lower(merchant.email);

-- Merchants already able to sign in receive the owner identity they previously
-- used implicitly. ON CONFLICT makes the insert re-runnable; the assertion below
-- prevents a cross-merchant email collision from silently leaving no owner.
INSERT INTO users (email, password, merchant_id, role, status, name, created_at)
SELECT merchant.email,
       merchant.password_hash,
       merchant.id,
       'owner',
       'active',
       merchant.name,
       COALESCE(merchant.created_at, now())
FROM merchants AS merchant
WHERE merchant.password_hash IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM users AS owner_row
    WHERE owner_row.merchant_id = merchant.id AND owner_row.role = 'owner'
  )
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM merchants AS merchant
    WHERE merchant.password_hash IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM users AS owner_row
        WHERE owner_row.merchant_id = merchant.id AND owner_row.role = 'owner'
      )
  ) THEN
    RAISE EXCEPTION '0013 could not create an owner identity for every password-enabled merchant';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_merchant_id_idx ON users (merchant_id);

CREATE UNIQUE INDEX IF NOT EXISTS users_invite_token_hash_uq
  ON users (invite_token_hash)
  WHERE invite_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_reset_token_hash_uq
  ON users (reset_token)
  WHERE reset_token IS NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'member', 'admin')),
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'invited', 'disabled'));

-- ---------------------------------------------------------------------------
-- 3. Seed a subscription for every merchant that still lacks one
-- ---------------------------------------------------------------------------

INSERT INTO merchant_subscriptions (
  merchant_id, plan_id, seat_limit, price_cents, status,
  current_period_start, current_period_end, next_billing_date,
  cancel_at_period_end, failed_payment_count,
  month_start_date, created_at, updated_at
)
SELECT merchant.id,
       'solo',
       1,
       799,
       'pending',
       NULL,
       NULL,
       NULL,
       false,
       0,
       now(),
       now(),
       now()
FROM merchants AS merchant
WHERE NOT EXISTS (
  SELECT 1 FROM merchant_subscriptions AS subscription
  WHERE subscription.merchant_id = merchant.id
);

COMMIT;
