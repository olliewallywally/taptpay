-- Gap 13 — replace inferred invoice-document owners with verified ones.
--
-- Owner decisions: 2026-09-19, "Require a trusted ownership inventory before
-- migration" (docs/decisions/2026-09-19-gap13-trusted-ownership-inventory.md), and
-- 2026-09-21, "please go ahead with all of your recommendations"
-- (docs/decisions/2026-09-21-gap13-ownership-rule-and-retention.md).
-- Migration 0023 attributed legacy invoice documents from the invoice, quote and
-- job-invoice rows that referenced them. A reference alone proves nothing about who
-- uploaded a file — before gap 13 any merchant could attach any string — so an owner
-- 0023 inferred is not trusted. This migration removes every one of them. It then
-- gives a document an owner only where an operator-approved inventory names one on
-- evidence, and leaves every other document LOCKED: kept, served to no merchant or
-- customer, readable only by the audited platform admin.
--
-- It cannot run on its own. The runner (server/migrate.ts) applies it only with
-- --upload-ownership-inventory and --upload-ownership-inventory-sha256. Inside this
-- migration's own transaction, before the first statement below, the runner locks
-- uploaded_files against writes, re-checks that the inventory lists every invoice
-- document exactly once and matches each by file id, path SHA-256 and content
-- SHA-256, that every owner is an existing merchant, and that every "TaptPay's own
-- records" claim (one merchant attached it within 24 hours of upload) is still true;
-- then it stages the inventory as pg_temp.gap13_upload_ownership_inventory
-- (server/upload-ownership-inventory.ts). Without that staged table the first
-- statement aborts the transaction, so neither psql nor a runner without the
-- inventory can apply it.
--
-- What it does
-- ------------
--   1. Records every entry in uploaded_file_ownership_evidence: file id, path and
--      content SHA-256, the disposition ('owner' with merchant and evidence kind,
--      reference and SHA-256, or 'locked' with its reason), who approved the
--      inventory and when, and the inventory's own SHA-256. No path, no content, no
--      token. It is audit data, so — like invoice_document_access_audit (0024) — it
--      has no foreign keys and outlives the file and the account it describes.
--   2. Clears merchant_id on every invoice document (path 'invoices/%').
--   3. Sets merchant_id for the 'owner' entries only. A locked document keeps no
--      owner: no merchant route and no checkout link serves it; the admin route does,
--      and audits each read.
--
-- Logos keep 0023's attribution: a logo's path (logos/merchant-<id>.png) is only
-- ever written by that merchant's own authenticated route, so it is not an
-- inference from someone else's reference.
--
-- It deletes, moves and rewrites no file and no document_url.
--
-- Locks: uploaded_files is held in SHARE ROW EXCLUSIVE mode (reads continue, writes
-- wait) from the runner's check until this transaction commits; the runner bounds
-- lock and statement time. Drain upload handlers before the release. Hashing every
-- invoice document's bytes is part of the check, so its duration grows with the
-- documents' total size: rehearse on a representative copy.

BEGIN;

DO $$
BEGIN
  IF to_regclass('pg_temp.gap13_upload_ownership_inventory') IS NULL THEN
    RAISE EXCEPTION '0025 aborted: no verified upload-ownership inventory is staged in this transaction'
      USING HINT = 'Apply it through server/migrate.ts with --upload-ownership-inventory and --upload-ownership-inventory-sha256; see docs/operations/migration-release.md.';
  END IF;
END
$$;

CREATE TABLE uploaded_file_ownership_evidence (
  file_id integer PRIMARY KEY,
  path_sha256 text NOT NULL,
  content_sha256 text NOT NULL,
  disposition text NOT NULL,
  merchant_id integer,
  evidence_kind text,
  evidence_ref text,
  evidence_sha256 text,
  locked_reason text,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL,
  inventory_sha256 text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uploaded_file_ownership_evidence_disposition_check CHECK (
    (disposition = 'owner'
      AND merchant_id IS NOT NULL
      AND evidence_kind IN ('system-record', 'authenticated-upload-log', 'merchant-attestation')
      AND evidence_ref IS NOT NULL
      AND evidence_sha256 IS NOT NULL
      AND locked_reason IS NULL)
    OR
    (disposition = 'locked'
      AND merchant_id IS NULL
      AND evidence_kind IS NULL
      AND evidence_ref IS NULL
      AND evidence_sha256 IS NULL
      AND locked_reason IN ('never-attached', 'several-merchants', 'attached-outside-window',
                            'attach-time-unknown', 'unrecognised-name', 'merchant-missing',
                            'operator-decision'))
  )
);

INSERT INTO uploaded_file_ownership_evidence
       (file_id, path_sha256, content_sha256, disposition, merchant_id, evidence_kind,
        evidence_ref, evidence_sha256, locked_reason, approved_by, approved_at, inventory_sha256)
SELECT file_id, path_sha256, content_sha256, disposition, merchant_id, evidence_kind,
       evidence_ref, evidence_sha256, locked_reason, approved_by, approved_at, inventory_sha256
  FROM pg_temp.gap13_upload_ownership_inventory;

UPDATE uploaded_files
   SET merchant_id = NULL
 WHERE path LIKE 'invoices/%';

UPDATE uploaded_files AS f
   SET merchant_id = i.merchant_id
  FROM pg_temp.gap13_upload_ownership_inventory AS i
 WHERE f.id = i.file_id
   AND i.disposition = 'owner';

COMMIT;
