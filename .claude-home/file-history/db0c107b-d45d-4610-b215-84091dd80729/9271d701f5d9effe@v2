-- Additive-only trades DDL. CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS only.
-- No DROP, no ALTER COLUMN TYPE -> zero data loss. Mirrors shared/schema.ts Task 1 block.
BEGIN;

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS gst_registered boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  site_address text NOT NULL,
  notes text,
  preferred_channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'active',
  archived_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  client_profile_id uuid NOT NULL REFERENCES client_profiles(id),
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  line_items jsonb NOT NULL,
  subtotal_cents integer NOT NULL,
  gst_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL,
  deposit_enabled boolean NOT NULL DEFAULT false,
  deposit_type text,
  deposit_value integer,
  deposit_cents integer,
  delivery_channel text NOT NULL DEFAULT 'email',
  valid_until timestamp,
  notes text,
  document_url text,
  document_name text,
  sent_at timestamp,
  viewed_at timestamp,
  accepted_at timestamp,
  declined_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotes_merchant_status_idx ON quotes (merchant_id, status);
CREATE INDEX IF NOT EXISTS quotes_token_idx ON quotes (token);

CREATE TABLE IF NOT EXISTS job_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  client_profile_id uuid NOT NULL REFERENCES client_profiles(id),
  amount_cents integer NOT NULL,
  frequency text NOT NULL,
  delivery_channel text NOT NULL DEFAULT 'email',
  start_date timestamp NOT NULL,
  end_date timestamp,
  next_run_date timestamp NOT NULL,
  last_run_date timestamp,
  status text NOT NULL DEFAULT 'active',
  terminated_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_schedules_next_run_date_idx ON job_schedules (next_run_date);
CREATE INDEX IF NOT EXISTS job_schedules_merchant_status_idx ON job_schedules (merchant_id, status);

CREATE TABLE IF NOT EXISTS job_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  client_profile_id uuid NOT NULL REFERENCES client_profiles(id),
  quote_id uuid REFERENCES quotes(id),
  schedule_id uuid REFERENCES job_schedules(id),
  kind text NOT NULL DEFAULT 'full',
  amount_cents integer NOT NULL,
  token text NOT NULL UNIQUE,
  delivery_channel text NOT NULL,
  job_details text,
  status text NOT NULL DEFAULT 'pending_dispatch',
  due_at timestamp NOT NULL,
  dispatched_at timestamp,
  sent_at timestamp,
  viewed_at timestamp,
  paid_at timestamp,
  voided_at timestamp,
  completed_at timestamp,
  external_payment_reference text,
  last_reminder_sent_at timestamp,
  scheduled_send_at timestamp,
  reminder_count integer NOT NULL DEFAULT 0,
  document_url text,
  document_name text,
  windcave_session_id text,
  windcave_transaction_id text,
  split_enabled boolean NOT NULL DEFAULT false,
  split_count integer,
  split_paid_count integer NOT NULL DEFAULT 0,
  split_paid_sessions text[],
  split_payer_emails text[],
  whatsapp_message_id text,
  whatsapp_delivered_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_invoices_status_due_idx ON job_invoices (status, due_at);
CREATE INDEX IF NOT EXISTS job_invoices_merchant_status_idx ON job_invoices (merchant_id, status);
CREATE INDEX IF NOT EXISTS job_invoices_token_idx ON job_invoices (token);

CREATE TABLE IF NOT EXISTS job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  client_profile_id uuid REFERENCES client_profiles(id),
  quote_id uuid REFERENCES quotes(id),
  job_invoice_id uuid REFERENCES job_invoices(id),
  schedule_id uuid REFERENCES job_schedules(id),
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_events_client_created_idx ON job_events (client_profile_id, created_at);
CREATE INDEX IF NOT EXISTS job_events_merchant_created_idx ON job_events (merchant_id, created_at);

COMMIT;
