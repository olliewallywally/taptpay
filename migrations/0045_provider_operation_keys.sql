BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE subscription_card_attempts ADD COLUMN amount_cents integer NOT NULL DEFAULT 0 CHECK(amount_cents=0);
ALTER TABLE subscription_card_attempts ADD COLUMN currency text NOT NULL DEFAULT 'NZD' CHECK(currency='NZD');
ALTER TABLE subscription_card_attempts ADD COLUMN provider_type text NOT NULL DEFAULT 'validate' CHECK(provider_type='validate');
DO $$ BEGIN
  IF EXISTS(SELECT processor_x_id FROM (
    SELECT processor_x_id FROM payment_attempts WHERE processor_x_id IS NOT NULL
    UNION ALL SELECT processor_x_id FROM invoice_payment_attempts
    UNION ALL SELECT processor_x_id FROM subscription_card_attempts
    UNION ALL SELECT processor_x_id FROM subscription_billing_attempts
  ) keys GROUP BY processor_x_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'cross-domain X-ID preflight failed';
  END IF;
END $$;
CREATE TABLE provider_operation_keys (
  processor_x_id text PRIMARY KEY CHECK(length(processor_x_id) BETWEEN 1 AND 200),
  payment_attempt_id uuid UNIQUE REFERENCES payment_attempts(id),
  invoice_attempt_id uuid UNIQUE REFERENCES invoice_payment_attempts(id),
  card_attempt_id uuid UNIQUE REFERENCES subscription_card_attempts(id),
  billing_attempt_id uuid UNIQUE REFERENCES subscription_billing_attempts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_operation_key_source_check CHECK(num_nonnulls(payment_attempt_id,invoice_attempt_id,card_attempt_id,billing_attempt_id)=1)
);
INSERT INTO provider_operation_keys(processor_x_id,payment_attempt_id) SELECT processor_x_id,id FROM payment_attempts WHERE processor_x_id IS NOT NULL;
INSERT INTO provider_operation_keys(processor_x_id,invoice_attempt_id) SELECT processor_x_id,id FROM invoice_payment_attempts;
INSERT INTO provider_operation_keys(processor_x_id,card_attempt_id) SELECT processor_x_id,id FROM subscription_card_attempts;
INSERT INTO provider_operation_keys(processor_x_id,billing_attempt_id) SELECT processor_x_id,id FROM subscription_billing_attempts;
CREATE FUNCTION taptpay_r3_claim_operation_key() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owned provider_operation_keys;
BEGIN
  IF NEW.processor_x_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='payment_attempts' THEN
    INSERT INTO provider_operation_keys(processor_x_id,payment_attempt_id) VALUES(NEW.processor_x_id,NEW.id) ON CONFLICT DO NOTHING;
  ELSIF TG_TABLE_NAME='invoice_payment_attempts' THEN
    INSERT INTO provider_operation_keys(processor_x_id,invoice_attempt_id) VALUES(NEW.processor_x_id,NEW.id) ON CONFLICT DO NOTHING;
  ELSIF TG_TABLE_NAME='subscription_card_attempts' THEN
    INSERT INTO provider_operation_keys(processor_x_id,card_attempt_id) VALUES(NEW.processor_x_id,NEW.id) ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO provider_operation_keys(processor_x_id,billing_attempt_id) VALUES(NEW.processor_x_id,NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  SELECT * INTO owned FROM provider_operation_keys WHERE processor_x_id=NEW.processor_x_id;
  IF (TG_TABLE_NAME='payment_attempts' AND owned.payment_attempt_id IS DISTINCT FROM NEW.id)
    OR (TG_TABLE_NAME='invoice_payment_attempts' AND owned.invoice_attempt_id IS DISTINCT FROM NEW.id)
    OR (TG_TABLE_NAME='subscription_card_attempts' AND owned.card_attempt_id IS DISTINCT FROM NEW.id)
    OR (TG_TABLE_NAME='subscription_billing_attempts' AND owned.billing_attempt_id IS DISTINCT FROM NEW.id) THEN
    RAISE EXCEPTION 'provider operation key belongs to another attempt' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER retail_operation_key AFTER INSERT OR UPDATE OF processor_x_id ON payment_attempts FOR EACH ROW EXECUTE FUNCTION taptpay_r3_claim_operation_key();
CREATE TRIGGER invoice_operation_key AFTER INSERT OR UPDATE OF processor_x_id ON invoice_payment_attempts FOR EACH ROW EXECUTE FUNCTION taptpay_r3_claim_operation_key();
CREATE TRIGGER card_operation_key AFTER INSERT OR UPDATE OF processor_x_id ON subscription_card_attempts FOR EACH ROW EXECUTE FUNCTION taptpay_r3_claim_operation_key();
CREATE TRIGGER billing_operation_key AFTER INSERT OR UPDATE OF processor_x_id ON subscription_billing_attempts FOR EACH ROW EXECUTE FUNCTION taptpay_r3_claim_operation_key();
CREATE TRIGGER provider_operation_key_immutable BEFORE UPDATE ON provider_operation_keys FOR EACH ROW EXECUTE FUNCTION taptpay_r3_immutable_identity('{}');
COMMIT;
