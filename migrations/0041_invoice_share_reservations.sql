BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM invoice_payment_attempts WHERE rent_invoice_id IS NOT NULL
    GROUP BY rent_invoice_id,idempotency_key HAVING count(*)>1) OR
     EXISTS (SELECT 1 FROM invoice_payment_attempts WHERE job_invoice_id IS NOT NULL
    GROUP BY job_invoice_id,idempotency_key HAVING count(*)>1) THEN
    RAISE EXCEPTION 'invoice command identity requires reviewed reconciliation' USING ERRCODE='23514';
  END IF;
END $$;
CREATE UNIQUE INDEX invoice_attempt_rent_command_uq ON invoice_payment_attempts(rent_invoice_id,idempotency_key)
  WHERE rent_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX invoice_attempt_job_command_uq ON invoice_payment_attempts(job_invoice_id,idempotency_key)
  WHERE job_invoice_id IS NOT NULL;
COMMIT;
