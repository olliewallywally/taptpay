-- Per-subscription notification preferences and durable scheduled-delivery
-- claims. This migration is additive, idempotent, and stores no push endpoint
-- credentials in the delivery table.

BEGIN;

-- push_subscriptions pre-dates the checked-in migration history on deployed
-- databases. Reconcile its complete Drizzle shape so a clean install can apply
-- this migration instead of failing at the preferences ALTER below.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL REFERENCES merchants(id),
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now()
);

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT
    '{"paymentReceived":true,"dailyPayoutSummary":true,"failedPaymentAlerts":false}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'push_subscriptions_preferences_shape_check'
      AND conrelid = 'push_subscriptions'::regclass
  ) THEN
    ALTER TABLE push_subscriptions
      ADD CONSTRAINT push_subscriptions_preferences_shape_check
      CHECK (
        jsonb_typeof(preferences) = 'object'
        AND preferences ? 'paymentReceived'
        AND preferences ? 'dailyPayoutSummary'
        AND preferences ? 'failedPaymentAlerts'
        AND (preferences - 'paymentReceived' - 'dailyPayoutSummary' - 'failedPaymentAlerts') = '{}'::jsonb
        AND jsonb_typeof(preferences -> 'paymentReceived') = 'boolean'
        AND jsonb_typeof(preferences -> 'dailyPayoutSummary') = 'boolean'
        AND jsonb_typeof(preferences -> 'failedPaymentAlerts') = 'boolean'
      );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS push_notification_deliveries (
  id serial PRIMARY KEY,
  merchant_id integer NOT NULL
    REFERENCES merchants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_key text NOT NULL,
  status text NOT NULL DEFAULT 'claimed',
  claim_token uuid NOT NULL DEFAULT gen_random_uuid(),
  claimed_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'push_notification_deliveries_event_type_check'
      AND conrelid = 'push_notification_deliveries'::regclass
  ) THEN
    ALTER TABLE push_notification_deliveries
      ADD CONSTRAINT push_notification_deliveries_event_type_check
      CHECK (
        event_type IN (
          'transaction_created',
          'payment_received',
          'payment_failed',
          'refund_processed',
          'daily_payout_summary'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'push_notification_deliveries_status_check'
      AND conrelid = 'push_notification_deliveries'::regclass
  ) THEN
    ALTER TABLE push_notification_deliveries
      ADD CONSTRAINT push_notification_deliveries_status_check
      CHECK (status IN ('claimed', 'processed', 'skipped', 'failed'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS push_notification_deliveries_merchant_event_key_uq
  ON push_notification_deliveries (merchant_id, event_type, event_key);

COMMIT;
