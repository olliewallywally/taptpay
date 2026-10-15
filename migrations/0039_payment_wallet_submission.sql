BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE payment_wallet_submissions (
  session_id text PRIMARY KEY REFERENCES payment_session_bindings(session_id),
  payment_method text NOT NULL CHECK (payment_method='google_pay'),
  send_started_at timestamptz NOT NULL
);
CREATE TRIGGER payment_wallet_submission_immutable BEFORE UPDATE ON payment_wallet_submissions
  FOR EACH ROW EXECUTE FUNCTION taptpay_r3_immutable_identity('{}');
COMMIT;
