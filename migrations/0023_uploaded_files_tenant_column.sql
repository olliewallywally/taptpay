-- Gap 13 / Option C — a tenant column on uploaded_files.
--
-- Oliver decided Option C on 2026-09-14
-- (docs/decisions/2026-09-14-uploads-tenant-authorization-option-c-disposition.md):
-- a tenant column on `uploaded_files` plus an authenticated, ownership-checked
-- download route for invoice documents, with logos staying public. Evidence and
-- the design review: docs/evidence/remediation-v2-2/r1/R1-T7-gap13-uploads-tenant-authorization-2026-09-19.md.
--
-- What this does
-- --------------
--   1. Adds `uploaded_files.merchant_id integer` — NULLABLE, plain foreign key
--      to merchants(id) (this schema's dominant convention: a merchant that
--      still owns uploads cannot be hard-deleted until retention policy, plan
--      A-H3, says what happens to its documents).
--   2. Adds `uploaded_files_merchant_id_idx`.
--   3. Backfills the tenant where — and only where — it is deterministic:
--        * logos, from their own path (`logos/merchant-<n>.<ext>`, where
--          merchant <n> exists);
--        * invoice documents, from the `document_url` references held by
--          `invoices_rent_requests`, `quotes` and `job_invoices`, and ONLY when
--          every referencing row belongs to one and the same merchant.
--
-- What it deliberately does NOT do
-- --------------------------------
--   * It never guesses. A document referenced by rows of two different
--     merchants (ambiguous), or by none (an orphan), stays NULL. The
--     application treats a NULL-tenant row as belonging to no merchant: no
--     tenant-scoped route serves it and the public /uploads route serves logos
--     only. That is fail-closed by construction, not a data-loss risk — nothing
--     is deleted, renamed or rewritten, and NULL rows stay available for the
--     owner's retention decision.
--   * It rewrites no `document_url` value. The stored reference format
--     (`/uploads/invoices/<name>`) is unchanged; it is now an opaque reference
--     validated against the row's owner, not a fetchable public URL.
--
-- Preflight (required before this is applied anywhere that holds real data)
-- --------------------------------------------------------------------------
-- scripts/count-gap13-uploaded-files-attribution.mjs is a count-only,
-- read-only report of how many rows this migration will attribute, leave
-- ambiguous, or leave orphaned. It selects no path, id, content or merchant
-- id. Run it first; a non-zero ambiguous/orphan invoice-document count against
-- production is an owner decision, not a reason to change this file.
--
-- Ordering: apply this migration BEFORE deploying the code that reads the
-- column. Drizzle's `select()` enumerates every declared column, so the new
-- code against a database without it fails on the first uploaded_files query —
-- the same failure mode server/migrate.ts's header describes for
-- billing_claim_token. Rolling the code back after this is safe: the extra
-- nullable column is invisible to older code. (Older code writes NULL-tenant
-- rows; re-running the backfill below, which only touches NULL rows and is
-- idempotent, re-attributes them.)
--
-- Locks: ADD COLUMN and the constraint/index take short locks on a table with
-- one row per upload; the runner (server/migrate.ts) bounds lock and statement
-- time. Deliberately not CREATE INDEX CONCURRENTLY — the runner wraps each
-- migration in a transaction, which CONCURRENTLY cannot run inside (same
-- reasoning as 0021/0022).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / guarded constraint / IF NOT EXISTS
-- index / NULL-only backfill. An already-present column of the WRONG shape is
-- not silently accepted — the DO block below refuses it, so IF NOT EXISTS
-- cannot hide a wrong existing shape.

BEGIN;

ALTER TABLE uploaded_files
  ADD COLUMN IF NOT EXISTS merchant_id integer;

DO $$
DECLARE
  column_type text;
  column_nullable text;
BEGIN
  SELECT data_type, is_nullable
    INTO column_type, column_nullable
    FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'uploaded_files'
     AND column_name = 'merchant_id';

  IF column_type IS DISTINCT FROM 'integer' OR column_nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION
      '0023 aborted: uploaded_files.merchant_id already exists with an unexpected shape'
      USING DETAIL = format('data_type=%s is_nullable=%s', column_type, column_nullable),
            HINT = 'Expected a nullable integer. Reconcile the drift from evidence before retrying; this migration will not reinterpret an existing column.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'uploaded_files_merchant_id_merchants_id_fk'
       AND conrelid = 'uploaded_files'::regclass
  ) THEN
    ALTER TABLE uploaded_files
      ADD CONSTRAINT uploaded_files_merchant_id_merchants_id_fk
      FOREIGN KEY (merchant_id) REFERENCES merchants (id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS uploaded_files_merchant_id_idx
  ON uploaded_files (merchant_id);

-- Backfill 1 of 2 — logos, from their own path. The digit run is capped at nine
-- so the integer cast cannot overflow, and the merchant must exist so the
-- foreign key cannot be violated. Older logos may carry a client-derived
-- extension (UPL-5 later fixed new ones to .png), so any short extension counts.
UPDATE uploaded_files AS f
   SET merchant_id = m.id
  FROM merchants AS m
 WHERE f.merchant_id IS NULL
   AND f.path ~ '^logos/merchant-[0-9]{1,9}\.[A-Za-z0-9]{1,10}$'
   AND m.id = substring(f.path from '^logos/merchant-([0-9]{1,9})\.[A-Za-z0-9]{1,10}$')::integer;

-- Backfill 2 of 2 — invoice documents, from every table that can reference one.
-- Only the exact reference shape the upload route ever produced is considered;
-- anything else (an external URL, a logo path, a malformed value) attributes
-- nothing. A document is attributed only when ALL of its referencing rows agree
-- on a single merchant that exists.
WITH refs AS (
  SELECT substring(document_url from '^/uploads/(invoices/invoice-[0-9]{10,16}-[0-9a-f]{16}(?:\.[a-z0-9]{1,10})?)$') AS path,
         merchant_id
    FROM invoices_rent_requests
   WHERE document_url IS NOT NULL
  UNION ALL
  SELECT substring(document_url from '^/uploads/(invoices/invoice-[0-9]{10,16}-[0-9a-f]{16}(?:\.[a-z0-9]{1,10})?)$'),
         merchant_id
    FROM quotes
   WHERE document_url IS NOT NULL
  UNION ALL
  SELECT substring(document_url from '^/uploads/(invoices/invoice-[0-9]{10,16}-[0-9a-f]{16}(?:\.[a-z0-9]{1,10})?)$'),
         merchant_id
    FROM job_invoices
   WHERE document_url IS NOT NULL
),
unambiguous AS (
  SELECT r.path, min(r.merchant_id) AS merchant_id
    FROM refs AS r
    JOIN merchants AS m ON m.id = r.merchant_id
   WHERE r.path IS NOT NULL
   GROUP BY r.path
  HAVING count(DISTINCT r.merchant_id) = 1
     AND count(*) = (SELECT count(*) FROM refs AS x WHERE x.path = r.path)
)
UPDATE uploaded_files AS f
   SET merchant_id = u.merchant_id
  FROM unambiguous AS u
 WHERE f.merchant_id IS NULL
   AND f.path = u.path;

COMMIT;
