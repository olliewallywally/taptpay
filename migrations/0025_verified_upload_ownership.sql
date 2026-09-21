-- Gap 13 — replace inferred invoice-document owners with verified ones.
--
-- Owner decision, 2026-09-19: "Require a trusted ownership inventory before
-- migration" (docs/decisions/2026-09-19-gap13-trusted-ownership-inventory.md).
-- Migration 0023 attributed legacy invoice documents from the invoice, quote and
-- job-invoice rows that referenced them. A reference proves nothing about who
-- uploaded a file — before gap 13 any merchant could attach any string — so an
-- owner 0023 inferred is not trusted. This migration removes every one of them
-- and assigns an owner only where an operator-approved inventory names one on
-- evidence.
--
-- It cannot run on its own. The runner (server/migrate.ts) applies it only with
-- --upload-ownership-inventory and --upload-ownership-inventory-sha256. Inside
-- this migration's own transaction, before the first statement below, the runner
-- locks uploaded_files against writes, re-checks that the inventory matches every
-- invoice document exactly (file id, path SHA-256, content SHA-256, an existing
-- merchant) and stages it as pg_temp.gap13_upload_ownership_inventory
-- (server/upload-ownership-inventory.ts, stageUploadOwnershipInventory). Without
-- that staged table the first statement aborts the transaction, so neither psql
-- nor a runner without the inventory can apply it.
--
-- What it does
-- ------------
--   1. Records the approved evidence in uploaded_file_ownership_evidence: file id,
--      verified merchant, path and content SHA-256, evidence kind, reference and
--      SHA-256, who approved the inventory and when, and the inventory's own
--      SHA-256. No path, no content, no token. It is audit data, so — like
--      invoice_document_access_audit (0024) — it has no foreign keys and outlives
--      the file and the account it describes.
--   2. Clears merchant_id on every invoice document (path 'invoices/%').
--   3. Sets merchant_id from the inventory. The runner proved the inventory
--      complete under the lock, so every invoice document ends this migration
--      with a verified owner; a document without evidence blocks the migration
--      instead of losing or gaining an owner.
--
-- Logos keep 0023's attribution: a logo's path (logos/merchant-<id>.png) is only
-- ever written by that merchant's own authenticated route, so it is not an
-- inference from someone else's reference.
--
-- It deletes, moves and rewrites no file and no document_url.
--
-- Locks: uploaded_files is held in SHARE ROW EXCLUSIVE mode (reads continue,
-- writes wait) from the runner's check until this transaction commits; the runner
-- bounds lock and statement time. Drain upload handlers before the release.
-- Hashing every invoice document's bytes is part of the check, so its duration
-- grows with the documents' total size: rehearse on a representative copy.

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
  merchant_id integer NOT NULL,
  path_sha256 text NOT NULL,
  content_sha256 text NOT NULL,
  evidence_kind text NOT NULL
    CHECK (evidence_kind IN ('authenticated-upload-log', 'merchant-attestation')),
  evidence_ref text NOT NULL,
  evidence_sha256 text NOT NULL,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL,
  inventory_sha256 text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO uploaded_file_ownership_evidence
       (file_id, merchant_id, path_sha256, content_sha256, evidence_kind, evidence_ref,
        evidence_sha256, approved_by, approved_at, inventory_sha256)
SELECT file_id, merchant_id, path_sha256, content_sha256, evidence_kind, evidence_ref,
       evidence_sha256, approved_by, approved_at, inventory_sha256
  FROM pg_temp.gap13_upload_ownership_inventory;

UPDATE uploaded_files
   SET merchant_id = NULL
 WHERE path LIKE 'invoices/%';

UPDATE uploaded_files AS f
   SET merchant_id = i.merchant_id
  FROM pg_temp.gap13_upload_ownership_inventory AS i
 WHERE f.id = i.file_id;

COMMIT;
