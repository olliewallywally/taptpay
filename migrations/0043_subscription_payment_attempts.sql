BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE merchant_subscriptions ADD CONSTRAINT subscription_id_merchant_uq UNIQUE(id,merchant_id);
CREATE TABLE subscription_card_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id integer NOT NULL,
  merchant_id integer NOT NULL,
  idempotency_key uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
  processor_x_id text NOT NULL UNIQUE CHECK(length(processor_x_id) BETWEEN 1 AND 200),
  reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 200),
  environment text NOT NULL CHECK(environment IN ('uat','production')),
  provider_account text NOT NULL CHECK(length(provider_account) BETWEEN 1 AND 200),
  state text NOT NULL DEFAULT 'claiming' CHECK(state IN ('claiming','ready','approved','declined','abandoned')),
  lease_expires_at timestamptz NOT NULL,
  send_started_at timestamptz,
  session_id text UNIQUE CHECK(session_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$'),
  provider_transaction_id text UNIQUE CHECK(provider_transaction_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$'),
  return_state_hash text UNIQUE CHECK(return_state_hash ~ '^[0-9a-f]{64}$'),
  return_state_expires_at timestamptz,
  card_digest text CHECK(card_digest ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_attempt_tenant_fk FOREIGN KEY(subscription_id,merchant_id) REFERENCES merchant_subscriptions(id,merchant_id),
  CONSTRAINT card_attempt_merchant_fk FOREIGN KEY(merchant_id) REFERENCES merchants(id),
  CONSTRAINT card_attempt_id_merchant_uq UNIQUE(id,merchant_id),
  CONSTRAINT card_attempt_command_uq UNIQUE(subscription_id,idempotency_key),
  CONSTRAINT card_attempt_lease_check CHECK(lease_expires_at>created_at AND lease_expires_at<=created_at+interval '5 minutes'),
  CONSTRAINT card_attempt_send_check CHECK(send_started_at IS NULL OR (send_started_at>=created_at AND send_started_at<=lease_expires_at)),
  CONSTRAINT card_attempt_return_check CHECK((return_state_hash IS NULL)=(return_state_expires_at IS NULL))
);
CREATE UNIQUE INDEX card_attempt_live_uq ON subscription_card_attempts(subscription_id)
  WHERE applied_at IS NULL AND state<>'abandoned';
CREATE TABLE subscription_billing_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id integer NOT NULL,
  merchant_id integer NOT NULL,
  card_attempt_id uuid,
  kind text NOT NULL CHECK(kind IN ('activation','renewal','upgrade')),
  idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 200),
  request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
  processor_x_id text NOT NULL UNIQUE CHECK(length(processor_x_id) BETWEEN 1 AND 200),
  amount_cents integer NOT NULL CHECK(amount_cents>0),
  currency text NOT NULL DEFAULT 'NZD' CHECK(currency='NZD'),
  reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 200),
  environment text NOT NULL CHECK(environment IN ('uat','production')),
  provider_account text NOT NULL CHECK(length(provider_account) BETWEEN 1 AND 200),
  card_digest text NOT NULL CHECK(card_digest ~ '^[0-9a-f]{64}$'),
  plan_id text NOT NULL CHECK(plan_id IN ('solo','team','crew')),
  prior_plan_id text NOT NULL CHECK(prior_plan_id IN ('solo','team','crew')),
  prior_status text NOT NULL CHECK(prior_status IN ('pending','active','past_due','suspended','cancelled')),
  actor jsonb NOT NULL DEFAULT '{"service":"billing"}',
  price_cents integer NOT NULL CHECK(price_cents>=0),
  seat_limit integer NOT NULL CHECK(seat_limit>=1),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL CHECK(period_end>period_start),
  attempt_number integer NOT NULL CHECK(attempt_number>=1),
  state text NOT NULL DEFAULT 'claiming' CHECK(state IN ('claiming','unknown','approved','declined','abandoned')),
  send_started_at timestamptz,
  provider_transaction_id text UNIQUE CHECK(provider_transaction_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$'),
  lease_owner uuid,
  lease_expires_at timestamptz,
  lease_generation integer NOT NULL DEFAULT 0 CHECK(lease_generation>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  reconciliation_count integer NOT NULL DEFAULT 0 CHECK(reconciliation_count>=0),
  last_error_code text,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_attempt_tenant_fk FOREIGN KEY(subscription_id,merchant_id) REFERENCES merchant_subscriptions(id,merchant_id),
  CONSTRAINT billing_attempt_card_tenant_fk FOREIGN KEY(card_attempt_id,merchant_id) REFERENCES subscription_card_attempts(id,merchant_id),
  CONSTRAINT billing_attempt_merchant_fk FOREIGN KEY(merchant_id) REFERENCES merchants(id),
  CONSTRAINT billing_attempt_id_merchant_uq UNIQUE(id,merchant_id),
  CONSTRAINT billing_attempt_command_uq UNIQUE(subscription_id,idempotency_key),
  CONSTRAINT billing_attempt_lease_check CHECK((lease_owner IS NULL)=(lease_expires_at IS NULL))
);
CREATE UNIQUE INDEX billing_attempt_unapplied_uq ON subscription_billing_attempts(subscription_id)
  WHERE applied_at IS NULL AND state<>'abandoned';
CREATE INDEX billing_attempt_due_idx ON subscription_billing_attempts(next_attempt_at)
  WHERE applied_at IS NULL AND state<>'abandoned';
CREATE TABLE subscription_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  card_attempt_id uuid,
  billing_attempt_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_event_source_check CHECK(num_nonnulls(card_attempt_id,billing_attempt_id)=1),
  CONSTRAINT subscription_event_card_fk FOREIGN KEY(card_attempt_id,merchant_id) REFERENCES subscription_card_attempts(id,merchant_id),
  CONSTRAINT subscription_event_billing_fk FOREIGN KEY(billing_attempt_id,merchant_id) REFERENCES subscription_billing_attempts(id,merchant_id),
  CONSTRAINT subscription_event_card_uq UNIQUE(card_attempt_id,event_type),
  CONSTRAINT subscription_event_billing_uq UNIQUE(billing_attempt_id,event_type)
);
ALTER TABLE payment_delivery_outbox ADD COLUMN subscription_event_id uuid REFERENCES subscription_payment_events(id);
ALTER TABLE payment_delivery_outbox DROP CONSTRAINT payment_outbox_event_source_check;
ALTER TABLE payment_delivery_outbox ADD CONSTRAINT payment_outbox_event_source_check CHECK(num_nonnulls(event_id,transaction_event_id,job_event_id,subscription_event_id)=1);
CREATE UNIQUE INDEX payment_outbox_subscription_event_channel_uq ON payment_delivery_outbox(subscription_event_id,channel);
CREATE TRIGGER subscription_card_identity BEFORE UPDATE ON subscription_card_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_immutable_identity('{state,send_started_at,session_id,provider_transaction_id,card_digest,applied_at,updated_at}');
CREATE TRIGGER subscription_card_send_identity BEFORE UPDATE ON subscription_card_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_attached_identity('{send_started_at,session_id,provider_transaction_id,card_digest,applied_at}');
CREATE TRIGGER subscription_billing_identity BEFORE UPDATE ON subscription_billing_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_immutable_identity('{state,send_started_at,provider_transaction_id,lease_owner,lease_expires_at,lease_generation,next_attempt_at,reconciliation_count,last_error_code,applied_at,updated_at}');
CREATE TRIGGER subscription_billing_send_identity BEFORE UPDATE ON subscription_billing_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_attached_identity('{send_started_at,provider_transaction_id,applied_at}');
CREATE TRIGGER subscription_event_append_only BEFORE UPDATE ON subscription_payment_events FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_immutable_identity('{}');
COMMIT;
