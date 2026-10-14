BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE invoice_payment_attempts ADD COLUMN payer_email text;
ALTER TABLE invoice_payment_attempts ADD CONSTRAINT invoice_attempt_payer_email_check
  CHECK (payer_email IS NULL OR (length(payer_email) BETWEEN 3 AND 254 AND position('@' in payer_email)>1));
COMMIT;
