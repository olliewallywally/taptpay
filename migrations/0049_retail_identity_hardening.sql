-- R3 integration (docs/evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md §5): two database
-- checks 0037 left open. 0037 and every earlier migration are unchanged.
--  1. An attempt's provider account and request fingerprint are written only before it is
--     attached, like its expected amount; an attached or finished R2-era attempt cannot be given
--     inferred values that would let R3 bind and settle it.
--  2. Send intent (timestamptz) is compared with created_at and lease_expires_at (timestamp, UTC
--     wall time) in UTC, not in the database session's time zone.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'taptpay_r3_retail_identity_written_once')
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_attempts_send_started_utc_check') THEN
    RAISE EXCEPTION '0049 aborted: its objects already exist';
  END IF;
END $$;

CREATE FUNCTION taptpay_r3_retail_identity_written_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ((OLD.expected_provider_account IS NULL AND NEW.expected_provider_account IS NOT NULL)
      OR (OLD.request_fingerprint IS NULL AND NEW.request_fingerprint IS NOT NULL))
    AND (OLD.state <> 'claiming' OR OLD.processor_session_id IS NOT NULL) THEN
    RAISE EXCEPTION 'cannot infer historical retail identity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retail_identity_written_once BEFORE UPDATE ON payment_attempts FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_retail_identity_written_once();

ALTER TABLE payment_attempts DROP CONSTRAINT payment_attempts_send_started_check;
ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_send_started_utc_check CHECK (
  send_started_at IS NULL OR (send_started_at >= created_at AT TIME ZONE 'UTC'
    AND send_started_at <= lease_expires_at AT TIME ZONE 'UTC')
);
COMMIT;
