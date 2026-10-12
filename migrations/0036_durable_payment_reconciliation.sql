-- R3 expansion only. No automatic provider/worker activation.
-- Production-sized restored rehearsal and owner migration approval are separate.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE transactions ADD CONSTRAINT transactions_id_merchant_uq UNIQUE (id, merchant_id);
ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_id_transaction_uq UNIQUE (id, transaction_id);
ALTER TABLE payment_attempts ADD COLUMN processor_transaction_id text;
CREATE UNIQUE INDEX payment_attempts_processor_transaction_id_uq ON payment_attempts(processor_transaction_id) WHERE processor_transaction_id IS NOT NULL;
ALTER TABLE invoices_rent_requests ADD CONSTRAINT invoices_id_merchant_uq UNIQUE (id, merchant_id);
ALTER TABLE job_invoices ADD CONSTRAINT job_invoices_id_merchant_uq UNIQUE (id, merchant_id);
ALTER TABLE invoices_rent_requests ADD COLUMN token_hash text;
ALTER TABLE job_invoices ADD COLUMN token_hash text;
ALTER TABLE quotes ADD COLUMN token_hash text;
ALTER TABLE invoices_rent_requests ADD CONSTRAINT invoices_token_hash_check CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE job_invoices ADD CONSTRAINT job_invoices_token_hash_check CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX invoices_token_hash_uq ON invoices_rent_requests(token_hash) WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX job_invoices_token_hash_uq ON job_invoices(token_hash) WHERE token_hash IS NOT NULL;
ALTER TABLE quotes ADD CONSTRAINT quotes_token_hash_check CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX quotes_token_hash_uq ON quotes(token_hash) WHERE token_hash IS NOT NULL;

CREATE TABLE payment_attempt_expectations (
  payment_attempt_id uuid PRIMARY KEY,
  transaction_id integer NOT NULL,
  merchant_id integer NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 200),
  environment text NOT NULL CHECK (environment IN ('uat','production')),
  provider_account text NOT NULL CHECK (length(provider_account) BETWEEN 1 AND 200),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  processor_x_id text NOT NULL UNIQUE CHECK (length(processor_x_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (payment_attempt_id, transaction_id) REFERENCES payment_attempts(id, transaction_id),
  FOREIGN KEY (transaction_id, merchant_id) REFERENCES transactions(id, merchant_id)
);

CREATE TABLE invoice_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  rent_invoice_id uuid,
  job_invoice_id uuid,
  share_index integer NOT NULL CHECK (share_index >= 0),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  idempotency_key uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  processor_x_id text NOT NULL UNIQUE CHECK (length(processor_x_id) BETWEEN 1 AND 200),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 200),
  environment text NOT NULL CHECK (environment IN ('uat','production')),
  provider_account text NOT NULL CHECK (length(provider_account) BETWEEN 1 AND 200),
  state text NOT NULL DEFAULT 'claiming' CHECK (state IN ('claiming','ready','finalizing','approved','declined','cancelled','abandoned')),
  outcome text CHECK (outcome IN ('approved','declined','cancelled')),
  lease_expires_at timestamptz NOT NULL,
  send_started_at timestamptz,
  return_state_hash text UNIQUE CHECK (return_state_hash IS NULL OR return_state_hash ~ '^[0-9a-f]{64}$'),
  return_state_expires_at timestamptz,
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_attempt_one_invoice_check CHECK ((rent_invoice_id IS NULL) <> (job_invoice_id IS NULL)),
  CONSTRAINT invoice_attempt_rent_tenant_fk FOREIGN KEY (rent_invoice_id, merchant_id) REFERENCES invoices_rent_requests(id, merchant_id),
  CONSTRAINT invoice_attempt_job_tenant_fk FOREIGN KEY (job_invoice_id, merchant_id) REFERENCES job_invoices(id, merchant_id),
  CONSTRAINT invoice_attempt_lease_check CHECK (lease_expires_at > created_at AND lease_expires_at <= created_at + interval '5 minutes'),
  CONSTRAINT invoice_attempt_send_started_check CHECK (send_started_at IS NULL OR (send_started_at >= created_at AND send_started_at <= lease_expires_at)),
  CONSTRAINT invoice_attempt_return_check CHECK ((return_state_hash IS NULL) = (return_state_expires_at IS NULL) AND (return_state_expires_at IS NULL OR (return_state_expires_at > created_at AND return_state_expires_at <= created_at + interval '30 minutes'))),
  CONSTRAINT invoice_attempt_outcome_check CHECK ((state IN ('approved','declined','cancelled') AND outcome IS NOT NULL AND state = outcome) OR (state IN ('claiming','ready','finalizing','abandoned') AND outcome IS NULL))
);
CREATE UNIQUE INDEX invoice_attempt_rent_key_uq ON invoice_payment_attempts(rent_invoice_id, share_index, idempotency_key) WHERE rent_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX invoice_attempt_job_key_uq ON invoice_payment_attempts(job_invoice_id, share_index, idempotency_key) WHERE job_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX invoice_attempt_rent_live_uq ON invoice_payment_attempts(rent_invoice_id, share_index) WHERE rent_invoice_id IS NOT NULL AND state IN ('claiming','ready','finalizing');
CREATE UNIQUE INDEX invoice_attempt_job_live_uq ON invoice_payment_attempts(job_invoice_id, share_index) WHERE job_invoice_id IS NOT NULL AND state IN ('claiming','ready','finalizing');
CREATE UNIQUE INDEX invoice_attempt_rent_paid_uq ON invoice_payment_attempts(rent_invoice_id, share_index) WHERE rent_invoice_id IS NOT NULL AND state = 'approved';
CREATE UNIQUE INDEX invoice_attempt_job_paid_uq ON invoice_payment_attempts(job_invoice_id, share_index) WHERE job_invoice_id IS NOT NULL AND state = 'approved';

CREATE TABLE payment_session_bindings (
  session_id text PRIMARY KEY CHECK (session_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$'),
  provider text NOT NULL DEFAULT 'windcave' CHECK (provider = 'windcave'),
  processor_x_id text NOT NULL UNIQUE CHECK (length(processor_x_id) BETWEEN 1 AND 200),
  payment_attempt_id uuid UNIQUE REFERENCES payment_attempts(id),
  invoice_attempt_id uuid UNIQUE REFERENCES invoice_payment_attempts(id),
  provider_transaction_id text UNIQUE CHECK (provider_transaction_id IS NULL OR length(provider_transaction_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_binding_one_attempt_check CHECK ((payment_attempt_id IS NULL) <> (invoice_attempt_id IS NULL))
);

CREATE TABLE payment_notification_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider = 'windcave'),
  kind text NOT NULL CHECK (kind IN ('fprn','browser','poll')),
  session_id text NOT NULL CHECK (session_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retry','complete','dead_letter')),
  first_received_at timestamptz NOT NULL,
  last_received_at timestamptz NOT NULL,
  arrival_count integer NOT NULL DEFAULT 1 CHECK (arrival_count > 0),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL,
  lease_owner uuid,
  lease_started_at timestamptz,
  lease_expires_at timestamptz,
  last_error_code text CHECK (last_error_code IN ('provider_pending','provider_unknown','provider_unavailable','unbound_session','integrity_mismatch','settlement_conflict','internal_error','retry_exhausted')),
  observed_transaction_id text CHECK (observed_transaction_id IS NULL OR length(observed_transaction_id) BETWEEN 1 AND 200),
  completed_at timestamptz,
  UNIQUE (provider, kind, session_id),
  CONSTRAINT payment_inbox_lease_check CHECK ((status = 'processing' AND lease_owner IS NOT NULL AND lease_started_at IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_expires_at > lease_started_at AND lease_expires_at <= lease_started_at + interval '1 minute') OR (status <> 'processing' AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_expires_at IS NULL))
);
CREATE INDEX payment_inbox_due_idx ON payment_notification_inbox(next_attempt_at) WHERE status IN ('pending','retry','processing');

CREATE TABLE payment_settlement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE REFERENCES payment_session_bindings(session_id),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  outcome text NOT NULL CHECK (outcome IN ('approved','declined','cancelled')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL
);
CREATE TABLE payment_delivery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES payment_settlement_events(id),
  channel text NOT NULL CHECK (channel IN ('merchant_payment_update','payer_receipt')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retry','complete','dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL,
  lease_owner uuid,
  lease_started_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  UNIQUE (event_id, channel),
  CONSTRAINT payment_outbox_lease_check CHECK ((status = 'processing' AND lease_owner IS NOT NULL AND lease_started_at IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_expires_at > lease_started_at AND lease_expires_at <= lease_started_at + interval '1 minute') OR (status <> 'processing' AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_expires_at IS NULL))
);
CREATE INDEX payment_outbox_due_idx ON payment_delivery_outbox(next_attempt_at) WHERE status IN ('pending','retry','processing');

-- Identity immutability is enforced for SQL callers as well as service callers.
CREATE FUNCTION taptpay_r3_immutable_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - TG_ARGV[0]::text[]) IS DISTINCT FROM (to_jsonb(OLD) - TG_ARGV[0]::text[]) THEN
    RAISE EXCEPTION 'immutable payment identity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_attempt_immutable BEFORE UPDATE ON invoice_payment_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_immutable_identity('{state,outcome,send_started_at,return_state_hash,return_state_expires_at,reconciled_at,updated_at}');
CREATE TRIGGER retail_expectation_immutable BEFORE UPDATE ON payment_attempt_expectations FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_immutable_identity('{}');
CREATE TRIGGER retail_attempt_immutable BEFORE UPDATE ON payment_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_immutable_identity('{state,outcome,receipt_share,processor_session_id,processor_x_id,processor_transaction_id,return_state_hash,return_state_expires_at,updated_at}');
CREATE TRIGGER payment_binding_immutable BEFORE UPDATE ON payment_session_bindings FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_immutable_identity('{provider_transaction_id}');
CREATE FUNCTION taptpay_r3_transaction_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.provider_transaction_id IS NOT NULL AND NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id THEN
    RAISE EXCEPTION 'immutable provider transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_binding_transaction_immutable BEFORE UPDATE ON payment_session_bindings FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_transaction_identity();
CREATE FUNCTION taptpay_r3_attached_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field text;
BEGIN
  FOREACH field IN ARRAY TG_ARGV[0]::text[] LOOP
    IF to_jsonb(OLD)->field <> 'null'::jsonb AND (to_jsonb(NEW)->field) IS DISTINCT FROM (to_jsonb(OLD)->field) THEN
      RAISE EXCEPTION 'immutable attached identity' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retail_attached_immutable BEFORE UPDATE ON payment_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_attached_identity('{processor_session_id,processor_x_id,processor_transaction_id,return_state_hash,return_state_expires_at}');
CREATE TRIGGER invoice_attached_immutable BEFORE UPDATE ON invoice_payment_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_attached_identity('{send_started_at,return_state_hash,return_state_expires_at}');
COMMIT;
