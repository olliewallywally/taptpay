BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE payment_delivery_outbox ADD COLUMN targets_prepared_at timestamptz;
CREATE TABLE payment_delivery_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES payment_delivery_outbox(id),
  merchant_id integer NOT NULL REFERENCES merchants(id),
  kind text NOT NULL CHECK(kind IN ('email','push','sse','skip')),
  target_key text NOT NULL CHECK(length(target_key) BETWEEN 1 AND 200),
  push_subscription_id integer REFERENCES push_subscriptions(id),
  payload jsonb NOT NULL,
  payload_hash text NOT NULL CHECK(payload_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','complete','held')),
  first_send_at timestamptz,
  lease_owner uuid,
  lease_expires_at timestamptz,
  lease_generation integer NOT NULL DEFAULT 0 CHECK(lease_generation>=0),
  last_error_code text CHECK(last_error_code IN ('delivery_unknown','credentials_unavailable','dedup_window_expired','destination_changed')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(outbox_id,target_key),
  CONSTRAINT delivery_target_push_check CHECK((kind='push')=(push_subscription_id IS NOT NULL)),
  CONSTRAINT delivery_target_lease_check CHECK((state='sending' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL
    AND lease_expires_at>updated_at AND lease_expires_at<=updated_at+interval '1 minute') OR
    (state<>'sending' AND lease_owner IS NULL AND lease_expires_at IS NULL)),
  CONSTRAINT delivery_target_complete_check CHECK((state='complete')=(completed_at IS NOT NULL))
);
CREATE INDEX payment_delivery_targets_outbox_idx ON payment_delivery_targets(outbox_id);
CREATE INDEX payment_delivery_targets_realtime_idx ON payment_delivery_targets(created_at,id) WHERE kind='sse';
CREATE TRIGGER delivery_target_immutable BEFORE UPDATE ON payment_delivery_targets FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_immutable_identity('{state,first_send_at,lease_owner,lease_expires_at,lease_generation,last_error_code,completed_at,updated_at}');
CREATE TRIGGER delivery_target_first_send_once BEFORE UPDATE ON payment_delivery_targets FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_attached_identity('{first_send_at}');
-- Existing outbox identity trigger intentionally allows only mutable delivery
-- fields. Extend it to allow one preparation marker, without relaxing identity.
DROP TRIGGER payment_outbox_identity ON payment_delivery_outbox;
CREATE TRIGGER payment_outbox_identity BEFORE UPDATE ON payment_delivery_outbox FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_immutable_identity('{status,attempt_count,next_attempt_at,lease_owner,lease_started_at,lease_expires_at,completed_at,targets_prepared_at}');
CREATE TRIGGER payment_outbox_preparation_once BEFORE UPDATE ON payment_delivery_outbox FOR EACH ROW
  EXECUTE FUNCTION taptpay_r3_attached_identity('{targets_prepared_at}');
COMMIT;
