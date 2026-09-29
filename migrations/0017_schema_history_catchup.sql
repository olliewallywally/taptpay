-- Catch-up so that `migrations/` alone can rebuild a database matching
-- shared/schema.ts. Six tables and fifteen columns are declared by Drizzle but
-- were never created by a numbered migration — they reached dev and prod by
-- hand or by an old `drizzle-kit push`, so provisioning a new environment from
-- the checked-in history produced a database the app could not run against
-- (Drizzle's `select()` enumerates every declared column).
--
-- Every statement is IF NOT EXISTS: this migration is a no-op against dev and
-- prod, which already have all of it. It records history, it does not change
-- either database. Nothing here backfills or infers data.
--
-- windcave_api_key / windcave_merchant_id are credential columns. They are
-- created empty and are never seeded.

BEGIN;

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS google_id text,
  ADD COLUMN IF NOT EXISTS director text,
  ADD COLUMN IF NOT EXISTS nzbn text,
  ADD COLUMN IF NOT EXISTS custom_logo_url text,
  ADD COLUMN IF NOT EXISTS windcave_api_key text,
  ADD COLUMN IF NOT EXISTS windcave_merchant_id text,
  ADD COLUMN IF NOT EXISTS theme_id text DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS daily_goal numeric(10, 2) DEFAULT '500.00',
  ADD COLUMN IF NOT EXISTS reset_token text,
  ADD COLUMN IF NOT EXISTS reset_token_expiry timestamp;

-- One-off non-rent charges: `kind` distinguishes them from rent, `charge_type`
-- and `description` label them, and the two document_* columns carry the
-- optional attachment shown to the tenant at checkout.
ALTER TABLE invoices_rent_requests
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'rent',
  ADD COLUMN IF NOT EXISTS charge_type text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS document_url text,
  ADD COLUMN IF NOT EXISTS document_name text;

CREATE TABLE IF NOT EXISTS refunds (
  id serial PRIMARY KEY,
  transaction_id integer,
  merchant_id integer,
  refund_amount numeric(10, 2) NOT NULL,
  refund_reason text,
  refund_method text DEFAULT 'original_payment_method',
  status text NOT NULL DEFAULT 'pending',
  windcave_refund_id text,
  windcave_fee_refunded numeric(10, 2) DEFAULT '0.00',
  platform_fee_refunded numeric(10, 2) DEFAULT '0.00',
  initiated_by text,
  customer_notified boolean DEFAULT false,
  completed_at timestamp,
  created_at timestamp DEFAULT now(),
  CONSTRAINT refunds_transaction_id_transactions_id_fk
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  CONSTRAINT refunds_merchant_id_merchants_id_fk
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

CREATE INDEX IF NOT EXISTS refunds_transaction_id_idx
  ON refunds (transaction_id);
CREATE INDEX IF NOT EXISTS refunds_merchant_id_idx
  ON refunds (merchant_id);

CREATE TABLE IF NOT EXISTS merchant_settlements (
  id serial PRIMARY KEY,
  merchant_id integer,
  settlement_period text NOT NULL,
  total_transaction_amount numeric(10, 2) NOT NULL,
  total_windcave_fees numeric(10, 2) NOT NULL,
  total_platform_fees numeric(10, 2) NOT NULL,
  net_settlement_amount numeric(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  settlement_date timestamp,
  created_at timestamp DEFAULT now(),
  CONSTRAINT merchant_settlements_merchant_id_merchants_id_fk
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

CREATE TABLE IF NOT EXISTS stock_items (
  id serial PRIMARY KEY,
  merchant_id integer,
  name text NOT NULL,
  description text,
  cost numeric(10, 2) NOT NULL,
  emoji text,
  variations jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT stock_items_merchant_id_merchants_id_fk
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

-- api_keys must precede api_requests and webhook_deliveries, which reference it.
CREATE TABLE IF NOT EXISTS api_keys (
  id serial PRIMARY KEY,
  merchant_id integer,
  key_name text NOT NULL,
  api_key text NOT NULL,
  key_prefix text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  status text NOT NULL DEFAULT 'active',
  permissions text NOT NULL DEFAULT 'create_transactions,read_transactions',
  webhook_url text,
  webhook_secret text,
  last_used_at timestamp,
  rate_limit_per_hour integer DEFAULT 1000,
  created_at timestamp DEFAULT now(),
  expires_at timestamp,
  CONSTRAINT api_keys_api_key_unique UNIQUE (api_key),
  CONSTRAINT api_keys_merchant_id_merchants_id_fk
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

CREATE TABLE IF NOT EXISTS api_requests (
  id serial PRIMARY KEY,
  api_key_id integer,
  merchant_id integer,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer NOT NULL,
  response_time integer,
  ip_address text,
  user_agent text,
  request_size integer,
  response_size integer,
  error_message text,
  created_at timestamp DEFAULT now(),
  CONSTRAINT api_requests_api_key_id_api_keys_id_fk
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id),
  CONSTRAINT api_requests_merchant_id_merchants_id_fk
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id serial PRIMARY KEY,
  api_key_id integer,
  merchant_id integer,
  transaction_id integer,
  event_type text NOT NULL,
  webhook_url text NOT NULL,
  payload text NOT NULL,
  http_status integer,
  response_body text,
  attempt_count integer DEFAULT 1,
  max_attempts integer DEFAULT 3,
  next_retry_at timestamp,
  delivered_at timestamp,
  failed_at timestamp,
  created_at timestamp DEFAULT now(),
  CONSTRAINT webhook_deliveries_api_key_id_api_keys_id_fk
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id),
  CONSTRAINT webhook_deliveries_merchant_id_merchants_id_fk
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
  CONSTRAINT webhook_deliveries_transaction_id_transactions_id_fk
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

COMMIT;
