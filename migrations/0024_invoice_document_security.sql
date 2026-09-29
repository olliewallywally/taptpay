-- Gap 13 review: durable admin-read audit and shared, bounded read budgets.
-- Apply before the corresponding code. Audit failure / limiter failure must
-- fail closed; do not roll back to the old public invoice download handler.
-- Document contents, bearer tokens and IP addresses are never stored here.
-- Audit retention is unchanged/pending: this migration deletes no audit data.
BEGIN;

CREATE TABLE invoice_document_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id integer NOT NULL,
  document_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoice_document_read_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);

COMMIT;
