-- Manual cash commands: no gateway authorization or usage charge.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE transactions ADD COLUMN cash_idempotency_key uuid,
  ADD COLUMN cash_request_fingerprint text;
ALTER TABLE transactions ADD CONSTRAINT transactions_cash_identity_check CHECK (
  (cash_idempotency_key IS NULL AND cash_request_fingerprint IS NULL)
  OR (cash_idempotency_key IS NOT NULL AND cash_request_fingerprint IS NOT NULL
    AND cash_request_fingerprint ~ '^[0-9a-f]{64}$' AND payment_method='cash')
);
CREATE UNIQUE INDEX transactions_cash_key_uq ON transactions(merchant_id,cash_idempotency_key)
  WHERE cash_idempotency_key IS NOT NULL;
ALTER TABLE transaction_events ADD COLUMN transaction_id integer;
ALTER TABLE transaction_events ADD CONSTRAINT transaction_events_transaction_merchant_fk
  FOREIGN KEY(transaction_id,merchant_id) REFERENCES transactions(id,merchant_id);
CREATE UNIQUE INDEX transaction_events_cash_record_uq ON transaction_events(transaction_id)
  WHERE event_type='Cash_Recorded';
ALTER TABLE payment_delivery_outbox ALTER COLUMN event_id DROP NOT NULL,
  ADD COLUMN transaction_event_id uuid REFERENCES transaction_events(id);
ALTER TABLE payment_delivery_outbox ADD CONSTRAINT payment_outbox_event_source_check
  CHECK ((event_id IS NOT NULL)::integer+(transaction_event_id IS NOT NULL)::integer=1),
  ADD CONSTRAINT payment_outbox_transaction_event_channel_uq UNIQUE(transaction_event_id,channel);
CREATE FUNCTION taptpay_cash_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.cash_idempotency_key IS NULL AND NEW.cash_idempotency_key IS NOT NULL THEN
    RAISE EXCEPTION 'cash command identity requires atomic creation' USING ERRCODE='23514';
  END IF;
  IF OLD.cash_idempotency_key IS NOT NULL AND
    (NEW.merchant_id,NEW.cash_idempotency_key,NEW.cash_request_fingerprint,NEW.price,
      NEW.item_name,NEW.tapt_stone_id,NEW.payment_method,NEW.created_at)
    IS DISTINCT FROM
    (OLD.merchant_id,OLD.cash_idempotency_key,OLD.cash_request_fingerprint,OLD.price,
      OLD.item_name,OLD.tapt_stone_id,OLD.payment_method,OLD.created_at) THEN
    RAISE EXCEPTION 'immutable cash command identity' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cash_command_immutable BEFORE UPDATE ON transactions FOR EACH ROW
  EXECUTE FUNCTION taptpay_cash_identity();
COMMIT;
