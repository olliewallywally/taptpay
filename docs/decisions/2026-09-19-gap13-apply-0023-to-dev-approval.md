# Gap 13 — apply migration 0023 to the development database: approved

Date: 2026-09-19 UTC.
Owner: Oliver (answered in the interactive session).
Execution lineage: `remediation/r1-continuation-20260907`.
Evidence: [R1-T7-gap13-uploads-tenant-authorization-2026-09-19](../evidence/remediation-v2-2/r1/R1-T7-gap13-uploads-tenant-authorization-2026-09-19.md).

## The question and the answer

Shown the exact effect — migration `0023_uploaded_files_tenant_column.sql` is an additive nullable column plus
an index on `uploaded_files`, and, per the read-only preflight, would attribute exactly one document and leave
one orphan NULL; run through the project's runner with the target declared
(`--target=workspace --expected-host=helium --expected-database=heliumdb`); and that it keeps the dev database
consistent with the code so a dev-server restart does not break logo/document endpoints — the owner was asked
"Apply migration 0023 to the shared dev database (heliumdb) now?" and answered **"Yes, apply it
(Recommended)"**.

## Effect authorized — and nothing wider

- **Authorized:** applying `0023` to `helium/heliumdb`, once, through `server/migrate.ts` with the target
  declared and verified.
- **Not authorized by this answer:** production (still owner-run, after its own count-only preflight); any other
  migration; restarting the dev server; deleting any file; anything about S1–S5.
  (The separate question "commit this work on the branch now?" was answered "Yes, two commits" and is
  recorded in the evidence's approvals line, not here.)

## What was done

Read-only first (`--status` 24 applied / 1 pending; `--dry-run` listing only `0023`; a fresh count-only
preflight; a schema fingerprint), then applied: `0023 (6 statement(s), 257ms)`, `--status` **25 applied, 0
pending, 0 drifted, 0 orphaned**. Verified afterwards from the catalogue rather than the exit code: column,
foreign key and a valid index present, ledger checksum equal to the file's sha256, attribution counts exactly
as predicted (2 files, 1 attributed, 1 NULL), and a schema fingerprint that moved by exactly one column, one
constraint, one foreign key and one index. Full numbers are in the evidence file.

## Consequences

The development database is at migration 0023. Code in the working tree that reads
`uploaded_files.merchant_id` now has its column. The still-running dev server is on the old code, which works
unchanged against the new column; restarting it puts uploads on the new code. Rollback of the migration (drop
the FK, index, column) discards attribution only, never a document.
