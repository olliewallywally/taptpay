-- Preserve the exact R3 email rule while making pg_dump/restore catalog text
-- stable: BETWEEN builds a nested AND; expanded comparisons parse identically.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.invoice_payment_attempts DROP CONSTRAINT invoice_attempt_payer_email_check;
ALTER TABLE public.invoice_payment_attempts ADD CONSTRAINT invoice_attempt_payer_email_check
  CHECK (payer_email IS NULL OR (length(payer_email)>=3 AND length(payer_email)<=254 AND position('@' in payer_email)>1));
COMMIT;
