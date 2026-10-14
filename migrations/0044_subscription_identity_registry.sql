BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM payment_session_bindings b JOIN subscription_billing_attempts a
    ON a.provider_transaction_id=b.provider_transaction_id WHERE b.provider_transaction_id IS NOT NULL) THEN
    RAISE EXCEPTION 'cross-domain provider identity preflight failed';
  END IF;
END $$;
ALTER TABLE payment_session_bindings ADD COLUMN card_attempt_id uuid REFERENCES subscription_card_attempts(id);
ALTER TABLE payment_session_bindings DROP CONSTRAINT payment_binding_one_attempt_check;
ALTER TABLE payment_session_bindings ADD CONSTRAINT payment_binding_one_attempt_check
  CHECK(num_nonnulls(payment_attempt_id,invoice_attempt_id,card_attempt_id)=1);
CREATE UNIQUE INDEX payment_binding_card_attempt_uq ON payment_session_bindings(card_attempt_id);
ALTER TABLE subscription_billing_attempts ADD CONSTRAINT billing_approved_identity_check
  CHECK(state<>'approved' OR (send_started_at IS NOT NULL AND provider_transaction_id IS NOT NULL));
ALTER TABLE subscription_card_attempts ADD CONSTRAINT card_approved_identity_check
  CHECK(state<>'approved' OR (send_started_at IS NOT NULL AND provider_transaction_id IS NOT NULL AND card_digest IS NOT NULL));
ALTER TABLE subscription_billing_attempts ADD CONSTRAINT billing_finite_lease_check
  CHECK(lease_expires_at IS NULL OR (lease_generation>0 AND lease_expires_at<=updated_at+interval '1 minute'));
CREATE TABLE provider_transaction_claims (
  provider_transaction_id text PRIMARY KEY,
  binding_session_id text UNIQUE REFERENCES payment_session_bindings(session_id),
  billing_attempt_id uuid UNIQUE REFERENCES subscription_billing_attempts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_transaction_claim_source_check CHECK(num_nonnulls(binding_session_id,billing_attempt_id)=1)
);
INSERT INTO provider_transaction_claims(provider_transaction_id,binding_session_id)
  SELECT provider_transaction_id,session_id FROM payment_session_bindings WHERE provider_transaction_id IS NOT NULL;
INSERT INTO provider_transaction_claims(provider_transaction_id,billing_attempt_id)
  SELECT provider_transaction_id,id FROM subscription_billing_attempts WHERE provider_transaction_id IS NOT NULL;
CREATE FUNCTION taptpay_r3_claim_provider_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owned provider_transaction_claims;
BEGIN
  IF NEW.provider_transaction_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='payment_session_bindings' THEN
    INSERT INTO provider_transaction_claims(provider_transaction_id,binding_session_id)
      VALUES(NEW.provider_transaction_id,NEW.session_id) ON CONFLICT DO NOTHING;
    SELECT * INTO owned FROM provider_transaction_claims WHERE provider_transaction_id=NEW.provider_transaction_id;
    IF owned.binding_session_id IS DISTINCT FROM NEW.session_id THEN
      RAISE EXCEPTION 'provider transaction belongs to another attempt' USING ERRCODE='23505';
    END IF;
  ELSE
    INSERT INTO provider_transaction_claims(provider_transaction_id,billing_attempt_id)
      VALUES(NEW.provider_transaction_id,NEW.id) ON CONFLICT DO NOTHING;
    SELECT * INTO owned FROM provider_transaction_claims WHERE provider_transaction_id=NEW.provider_transaction_id;
    IF owned.billing_attempt_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'provider transaction belongs to another attempt' USING ERRCODE='23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER binding_provider_transaction_claim AFTER INSERT OR UPDATE OF provider_transaction_id ON payment_session_bindings
  FOR EACH ROW EXECUTE FUNCTION taptpay_r3_claim_provider_transaction();
CREATE TRIGGER billing_provider_transaction_claim AFTER INSERT OR UPDATE OF provider_transaction_id ON subscription_billing_attempts
  FOR EACH ROW EXECUTE FUNCTION taptpay_r3_claim_provider_transaction();
CREATE TRIGGER provider_transaction_claim_immutable BEFORE UPDATE ON provider_transaction_claims
  FOR EACH ROW EXECUTE FUNCTION taptpay_r3_immutable_identity('{}');
CREATE TRIGGER payment_outbox_identity BEFORE UPDATE ON payment_delivery_outbox
  FOR EACH ROW EXECUTE FUNCTION taptpay_r3_immutable_identity('{status,attempt_count,next_attempt_at,lease_owner,lease_started_at,lease_expires_at,completed_at}');
COMMIT;
