-- C10 route review, batch 3a — each share of a split invoice remembers its own
-- payment session, and only that session can pay it (owner decision 2026-09-26,
-- docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 1).
--
-- One row per provider session opened for a split rent or trades invoice, with
-- the amount it was opened for and the email its payer gave. A completion is
-- believed only for a session recorded here for that invoice; paid_at marks the
-- one share it paid. Before, no session was recorded, so any approved session on
-- the platform's provider account could pay a share. Additive: a new table; the
-- code that writes it arrives with it, and split checkouts fail until it exists.
BEGIN;

CREATE TABLE invoice_split_sessions (
  windcave_session_id text PRIMARY KEY,
  rent_invoice_id uuid REFERENCES invoices_rent_requests(id) ON DELETE CASCADE,
  job_invoice_id uuid REFERENCES job_invoices(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  payer_email text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CONSTRAINT invoice_split_sessions_one_invoice_chk
    CHECK ((rent_invoice_id IS NULL) <> (job_invoice_id IS NULL)),
  CONSTRAINT invoice_split_sessions_amount_chk CHECK (amount_cents > 0)
);

CREATE INDEX invoice_split_sessions_rent_invoice_idx ON invoice_split_sessions (rent_invoice_id);
CREATE INDEX invoice_split_sessions_job_invoice_idx ON invoice_split_sessions (job_invoice_id);

COMMIT;
