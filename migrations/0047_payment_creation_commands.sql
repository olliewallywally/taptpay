BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE payment_creation_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  idempotency_key uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
  transaction_id integer,
  rent_invoice_id uuid,
  job_invoice_id uuid,
  actor jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creation_command_source_check CHECK(num_nonnulls(transaction_id,rent_invoice_id,job_invoice_id)=1),
  CONSTRAINT creation_command_retail_fk FOREIGN KEY(transaction_id,merchant_id) REFERENCES transactions(id,merchant_id),
  CONSTRAINT creation_command_property_fk FOREIGN KEY(rent_invoice_id,merchant_id) REFERENCES invoices_rent_requests(id,merchant_id),
  CONSTRAINT creation_command_trades_fk FOREIGN KEY(job_invoice_id,merchant_id) REFERENCES job_invoices(id,merchant_id),
  CONSTRAINT creation_command_key_uq UNIQUE(merchant_id,idempotency_key)
);
CREATE TRIGGER creation_command_immutable BEFORE UPDATE ON payment_creation_commands FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_immutable_identity('{}');
ALTER TABLE subscription_payment_events ADD COLUMN subscription_id integer,
  ADD COLUMN idempotency_key uuid,ADD COLUMN request_fingerprint text;
ALTER TABLE subscription_payment_events ADD CONSTRAINT subscription_event_parent_fk
  FOREIGN KEY(subscription_id,merchant_id) REFERENCES merchant_subscriptions(id,merchant_id);
ALTER TABLE subscription_payment_events DROP CONSTRAINT subscription_event_source_check;
ALTER TABLE subscription_payment_events ADD CONSTRAINT subscription_event_source_check
  CHECK(num_nonnulls(subscription_id,card_attempt_id,billing_attempt_id)=1),
  ADD CONSTRAINT subscription_manual_command_check CHECK(
    (subscription_id IS NULL AND idempotency_key IS NULL AND request_fingerprint IS NULL) OR
    (subscription_id IS NOT NULL AND idempotency_key IS NOT NULL AND request_fingerprint IS NOT NULL AND request_fingerprint ~ '^[0-9a-f]{64}$'));
CREATE UNIQUE INDEX subscription_event_command_uq ON subscription_payment_events(subscription_id,idempotency_key) WHERE subscription_id IS NOT NULL;
COMMIT;
