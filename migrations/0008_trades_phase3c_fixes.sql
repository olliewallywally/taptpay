-- Additive + non-destructive Phase 3c fixes.
-- ADD COLUMN IF NOT EXISTS, a guarded remediation UPDATE, and CREATE INDEX IF NOT
-- EXISTS only. No DROP, no DELETE, no ALTER COLUMN TYPE -> no row is ever lost.
BEGIN;

-- Trades reminders get their own on/off switch so disabling rent reminders does
-- not silently stop trades job-invoice reminders.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS trade_reminders_enabled boolean NOT NULL DEFAULT true;

-- Remediate any pre-existing duplicate recurring invoices (erroneous double-bills
-- from the pre-fix cron) so the unique index below can be created. For each
-- (schedule_id, due_at) group we keep one row and VOID the surplus — a reversible
-- status change, not a delete. Safety rails:
--   * never void a paid / paid_external invoice (no payment record is touched);
--   * only auto-resolve groups with at most one paid invoice. Groups with two or
--     more paid invoices are a genuine double-payment that needs human
--     reconciliation, so we leave them and let the index creation fail loudly.
WITH ranked AS (
  SELECT
    id,
    status,
    row_number() OVER (
      PARTITION BY schedule_id, due_at
      ORDER BY (status IN ('paid', 'paid_external')) DESC, created_at, id
    ) AS rn,
    count(*) FILTER (WHERE status IN ('paid', 'paid_external'))
      OVER (PARTITION BY schedule_id, due_at) AS paid_in_group
  FROM job_invoices
  WHERE schedule_id IS NOT NULL
    AND status <> 'voided'
)
UPDATE job_invoices ji
SET status = 'voided', voided_at = now()
FROM ranked
WHERE ji.id = ranked.id
  AND ranked.rn > 1
  AND ranked.paid_in_group <= 1
  AND ji.status NOT IN ('paid', 'paid_external');

-- One live recurring invoice per (schedule, due date): makes cron generation
-- idempotent under concurrent/retried runs. Partial so non-recurring invoices
-- (null schedule_id) and voided rows never collide.
CREATE UNIQUE INDEX IF NOT EXISTS job_invoices_schedule_due_uq
  ON job_invoices (schedule_id, due_at)
  WHERE schedule_id IS NOT NULL AND status <> 'voided';

COMMIT;
