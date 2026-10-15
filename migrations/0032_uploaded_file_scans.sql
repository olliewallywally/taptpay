-- R1-T7 S6a — a document is kept from every reader until a scan says it is clean (owner decision
-- 2026-09-29, docs/decisions/2026-09-29-finish-r1-owner-answers.md, answer 3: "Add ClamAV on the
-- server").
--
-- One row per scanned file: the verdict, the scanner that gave it and, when it found something, the
-- name it gave. A document's row is written in the same transaction as the document, so a stored
-- document is never readable unscanned. A file with no row has no verdict: every document reader
-- treats it as not found. Logos (the public folder) are not scanned and are not read through it.
-- The row goes when its file goes.
-- Additive: a new table. Documents uploaded before it exists have no verdict until they are scanned.
BEGIN;

CREATE TABLE uploaded_file_scans (
  file_id integer PRIMARY KEY REFERENCES uploaded_files(id) ON DELETE CASCADE,
  verdict text NOT NULL,
  signature text,
  scanner text NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uploaded_file_scans_verdict_chk CHECK (verdict IN ('clean', 'infected')),
  CONSTRAINT uploaded_file_scans_signature_chk CHECK ((verdict = 'infected') = (signature IS NOT NULL))
);

COMMIT;
