BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE payment_settlement_events ADD COLUMN previous_aggregate_status text;
ALTER TABLE payment_delivery_outbox ADD COLUMN job_event_id uuid REFERENCES job_events(id);
ALTER TABLE payment_delivery_outbox DROP CONSTRAINT payment_outbox_event_source_check;
ALTER TABLE payment_delivery_outbox ADD CONSTRAINT payment_outbox_event_source_check
  CHECK (num_nonnulls(event_id,transaction_event_id,job_event_id)=1);
CREATE UNIQUE INDEX payment_outbox_job_event_channel_uq ON payment_delivery_outbox(job_event_id,channel);
CREATE TRIGGER transaction_event_append_only BEFORE UPDATE ON transaction_events
  FOR EACH ROW EXECUTE FUNCTION taptpay_r3_immutable_identity('{}');
CREATE TRIGGER job_event_append_only BEFORE UPDATE ON job_events
  FOR EACH ROW EXECUTE FUNCTION taptpay_r3_immutable_identity('{}');
COMMIT;
