-- Fresh-schema reconciliation for the retail payment tables that pre-date the
-- numbered migration history. Existing deployments already have these objects;
-- every statement is additive/idempotent so this migration does not infer or
-- rewrite merchant data. It must run before 0011.

BEGIN;

CREATE TABLE IF NOT EXISTS tapt_stones (
  id serial PRIMARY KEY,
  merchant_id integer REFERENCES merchants(id),
  name text NOT NULL,
  stone_number integer NOT NULL,
  qr_code_url text,
  payment_url text,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tapt_stones_merchant_id_idx
  ON tapt_stones (merchant_id);

-- Migration 0000 used serial for this foreign key. Match the current Drizzle
-- model and prevent an unrelated sequence from inventing merchant IDs.
ALTER TABLE transactions ALTER COLUMN merchant_id DROP DEFAULT;
ALTER TABLE transactions ALTER COLUMN merchant_id DROP NOT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS tapt_stone_id integer REFERENCES tapt_stones(id),
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'qr_code',
  ADD COLUMN IF NOT EXISTS nfc_session_id text,
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS is_split boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_splits integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS completed_splits integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS split_amount numeric(10, 2),
  ADD COLUMN IF NOT EXISTS windcave_fee_rate numeric(5, 4) DEFAULT '0.0290',
  ADD COLUMN IF NOT EXISTS windcave_fee_amount numeric(10, 2),
  ADD COLUMN IF NOT EXISTS platform_fee_rate numeric(5, 4) DEFAULT '0.0050',
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric(10, 2),
  ADD COLUMN IF NOT EXISTS merchant_net numeric(10, 2),
  ADD COLUMN IF NOT EXISTS total_refunded numeric(10, 2) DEFAULT '0.00',
  ADD COLUMN IF NOT EXISTS refundable_amount numeric(10, 2),
  ADD COLUMN IF NOT EXISTS windcave_session_id text,
  ADD COLUMN IF NOT EXISTS windcave_session_state text,
  ADD COLUMN IF NOT EXISTS windcave_x_id text,
  ADD COLUMN IF NOT EXISTS split_enabled boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS transactions_merchant_id_idx
  ON transactions (merchant_id);
CREATE INDEX IF NOT EXISTS transactions_tapt_stone_id_idx
  ON transactions (tapt_stone_id);

CREATE TABLE IF NOT EXISTS split_payments (
  id serial PRIMARY KEY,
  transaction_id integer REFERENCES transactions(id),
  merchant_id integer REFERENCES merchants(id),
  split_index integer NOT NULL,
  amount numeric(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  windcave_transaction_id text,
  payment_method text DEFAULT 'qr_code',
  windcave_fee_amount numeric(10, 2),
  platform_fee_amount numeric(10, 2),
  merchant_net numeric(10, 2),
  paid_at timestamp,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS split_payments_transaction_id_idx
  ON split_payments (transaction_id);
CREATE INDEX IF NOT EXISTS split_payments_merchant_id_idx
  ON split_payments (merchant_id);

-- These two tables also pre-date the checked-in migration history. The
-- approved-attempt transaction writes both of them, so a clean schema must
-- have their complete Drizzle shape before 0011 installs payment_attempts.
CREATE TABLE IF NOT EXISTS platform_fees (
  id serial PRIMARY KEY,
  transaction_id integer,
  merchant_id integer,
  fee_amount numeric(10, 2) NOT NULL,
  transaction_amount numeric(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  collected_at timestamp,
  created_at timestamp DEFAULT now(),
  CONSTRAINT platform_fees_transaction_id_transactions_id_fk
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  CONSTRAINT platform_fees_merchant_id_merchants_id_fk
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

CREATE TABLE IF NOT EXISTS merchant_subscriptions (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL,
  tier text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  current_month_transactions integer DEFAULT 0,
  total_lifetime_transactions integer DEFAULT 0,
  month_start_date timestamp DEFAULT now(),
  billing_frequency text DEFAULT 'monthly',
  next_billing_date timestamp,
  unbilled_transaction_count integer DEFAULT 0,
  unbilled_amount numeric(10, 2) DEFAULT '0.00',
  cancellation_requested_at timestamp,
  cancellation_effective_date timestamp,
  cancellation_reason text,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_payment_method_id text,
  last_billing_date text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT merchant_subscriptions_merchant_id_merchants_id_fk
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
  CONSTRAINT merchant_subscriptions_merchant_id_unique UNIQUE (merchant_id)
);

COMMIT;
