-- Additive-only Phase 3c fixes. ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS only.
-- No DROP, no ALTER COLUMN TYPE -> zero data loss.
BEGIN;

-- Trades reminders get their own on/off switch so disabling rent reminders does
-- not silently stop trades job-invoice reminders.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS trade_reminders_enabled boolean NOT NULL DEFAULT true;

-- One recurring invoice per (schedule, due date): makes cron generation
-- idempotent under concurrent/retried runs. Partial so non-recurring invoices
-- (null schedule_id) never collide.
CREATE UNIQUE INDEX IF NOT EXISTS job_invoices_schedule_due_uq
  ON job_invoices (schedule_id, due_at)
  WHERE schedule_id IS NOT NULL;

COMMIT;
