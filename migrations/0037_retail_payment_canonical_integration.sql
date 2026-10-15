-- Integrate R2's canonical retail fields with the original R3 expansion.
-- Preserve the byte-for-byte 0036 expansion and all R2 checksums. No activation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE payment_attempts
  ADD COLUMN expected_provider_account text,
  ADD COLUMN request_fingerprint text,
  ADD COLUMN send_started_at timestamptz;

ALTER TABLE payment_attempts
  ADD CONSTRAINT payment_attempts_account_fingerprint_check CHECK (
    (expected_provider_account IS NULL AND request_fingerprint IS NULL)
    OR (expected_provider_account IS NOT NULL AND length(expected_provider_account) BETWEEN 1 AND 200
      AND request_fingerprint IS NOT NULL AND request_fingerprint ~ '^[0-9a-f]{64}$'
      AND expected_amount_cents IS NOT NULL)
  ),
  ADD CONSTRAINT payment_attempts_send_started_check CHECK (
    send_started_at IS NULL OR (send_started_at >= created_at AND send_started_at <= lease_expires_at)
  ),
  ADD CONSTRAINT payment_attempts_reconciliation_code_check CHECK (
    last_reconciliation_code IS NULL OR last_reconciliation_code ~ '^[a-z][a-z0-9_:]{0,63}$'
  );

-- Fail on conflicting local expectations; do not resolve them from provider data.
DO $$
DECLARE conflicts bigint;
BEGIN
  SELECT count(*) INTO conflicts
  FROM payment_attempts a JOIN payment_attempt_expectations e ON e.payment_attempt_id=a.id
  WHERE (a.expected_amount_cents IS NOT NULL AND a.expected_amount_cents IS DISTINCT FROM e.amount_cents)
    OR (a.expected_currency IS NOT NULL AND a.expected_currency IS DISTINCT FROM e.currency)
    OR (a.expected_merchant_reference IS NOT NULL AND a.expected_merchant_reference IS DISTINCT FROM e.reference)
    OR (a.provider_environment IS NOT NULL AND a.provider_environment IS DISTINCT FROM e.environment)
    OR (a.processor_x_id IS NOT NULL AND a.processor_x_id IS DISTINCT FROM e.processor_x_id)
    OR length(e.reference)>64 OR e.created_at<a.created_at OR e.created_at>a.lease_expires_at;
  IF conflicts>0 THEN
    RAISE EXCEPTION 'conflicting retail expectation count: %', conflicts USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO conflicts FROM payment_attempts
  WHERE provider_transaction_id IS NOT NULL AND processor_transaction_id IS NOT NULL
    AND provider_transaction_id IS DISTINCT FROM processor_transaction_id;
  IF conflicts>0 THEN
    RAISE EXCEPTION 'conflicting retail provider transaction count: %', conflicts USING ERRCODE='23514';
  END IF;
END $$;

DROP TRIGGER retail_attempt_immutable ON payment_attempts;
DROP TRIGGER retail_attached_immutable ON payment_attempts;

-- The compatibility snapshot was independently committed before provider send.
UPDATE payment_attempts a SET
  expected_amount_cents=e.amount_cents, expected_currency=e.currency,
  expected_merchant_reference=e.reference, provider_environment=e.environment,
  expected_provider_account=e.provider_account, request_fingerprint=e.request_fingerprint,
  processor_x_id=e.processor_x_id, send_started_at=e.created_at
FROM payment_attempt_expectations e WHERE e.payment_attempt_id=a.id;
UPDATE payment_attempts SET provider_transaction_id=processor_transaction_id
WHERE provider_transaction_id IS NULL AND processor_transaction_id IS NOT NULL;

CREATE TRIGGER retail_attempt_immutable BEFORE UPDATE ON payment_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_immutable_identity('{state,outcome,receipt_share,processor_session_id,processor_x_id,return_state_hash,return_state_expires_at,updated_at,expected_amount_cents,expected_currency,expected_merchant_reference,provider_environment,provider_transaction_id,last_reconciliation_code,last_reconciled_at,expected_provider_account,request_fingerprint,send_started_at}');
CREATE TRIGGER retail_attached_immutable BEFORE UPDATE ON payment_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_attached_identity('{processor_session_id,processor_x_id,return_state_hash,return_state_expires_at,expected_amount_cents,expected_currency,expected_merchant_reference,provider_environment,provider_transaction_id,expected_provider_account,request_fingerprint,send_started_at}');

CREATE FUNCTION taptpay_r3_retail_expected_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.expected_amount_cents IS NULL AND NEW.expected_amount_cents IS NOT NULL
    AND (OLD.state<>'claiming' OR OLD.processor_session_id IS NOT NULL) THEN
    RAISE EXCEPTION 'cannot infer historical retail expectations' USING ERRCODE='23514';
  END IF;
  IF OLD.send_started_at IS NULL AND NEW.send_started_at IS NOT NULL
    AND (OLD.state<>'claiming' OR OLD.processor_session_id IS NOT NULL
      OR NEW.expected_provider_account IS NULL OR NEW.processor_x_id IS NULL) THEN
    RAISE EXCEPTION 'invalid retail send intent' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retail_expected_identity BEFORE UPDATE ON payment_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_retail_expected_identity();

-- Retail decimal(10,2) permits more cents than PostgreSQL integer.
ALTER TABLE payment_settlement_events ALTER COLUMN amount_cents TYPE bigint;
COMMIT;
