# R0-H5 — tracked uploads/local dumps: deletion disposition

Date: 2026-09-14 UTC
Owner: Oliver
Execution lineage: `remediation/r1-continuation-20260907`.

Asked about tracked uploads/local dumps in the repository, Oliver answered:
**"Just delete them if they have not been currently used."**

## What was found and investigated before acting

The only path under the repository's actual runtime uploads directory
(`uploads/`, which `.gitignore` now covers going forward) carrying any
tracked content was `uploads/invoices/`, with three tracked entries:

| File | Content (viewed) | Verdict |
|---|---|---|
| `uploads/invoices/invoice-1780568113073-f9271eb365f984b2.png` | A generic dark rounded-square terminal/shell icon (`>_` glyph) — not customer content | Not currently used |
| `uploads/invoices/invoice-1780814813425-46f344ab381d4b7e.png` | The TaptPay wordmark/logo itself | Not currently used |
| `uploads/invoices/*.png` (literal filename, asterisk included) | 0 bytes — an accidental unquoted-shell-glob artifact committed literally | Not currently used |

Confirmed before deletion:

- **No reference anywhere in the repository.** `grep -r` across code, tests,
  and docs for both real filenames returns no hits except the prior
  session's own handoff document (`docs/HANDOFF-2026-09-14-session-checkpoint.md`),
  which is informational, not a functional reference.
- **These predate the current upload path and cannot be reproduced by the
  live app.** The serve route (`GET /uploads/:folder/:name`,
  `server/routes.ts:7003`) treats the on-disk fallback explicitly as legacy:
  "a local-disk fallback for any legacy file that predates DB-backed
  storage." Confirmed `saveUploadedFile` (the only write path for uploads
  today) never writes to disk — it writes to the `uploaded_files` DB table
  exclusively. So these three files are artifacts of an earlier storage
  scheme, not something the current code path can create.
- **A broader repository-wide check** for other tracked upload/dump/backup
  paths (`git ls-files | grep -iE "uploads/|dump|backup|\.sql$|\.env"`) found
  nothing else in scope: `migrations/*.sql` and `scripts/db-backup*` are
  legitimate tracked source, not data dumps; `docs/designs/motion-tablet-desktop/uploads/`
  is an unrelated design-mockup asset tree from a different epic, not
  runtime upload data; `.env.example` is a template, not a real secret. The
  three files above are the entire scope of this disposition.

## Action taken

`git rm` on all three files, this commit. Both real images were clearly
dev/test fixtures (a generic icon and the company's own logo), not real
tenant/customer invoice content, despite living under a path
(`uploads/invoices/`) and filename pattern matching the real
property-invoice-document upload feature — combined with the storage-path
reasoning above and this being a dev workspace (production is confirmed a
separate Neon project per existing R0 decision records), there is no
plausible reading under which these were live tenant financial documents.

## What this does and does not close

**Closed:** disposition of the three tracked files identified above, per
explicit owner instruction.

**Not resolved, and not claimed resolved:** the prior handoff record noted
an unsourced historical figure — "41 tracked entries, now 38 ignored" —
quoted in `docs/evidence/remediation-v2-2/r0/R0-exit-gate-assessment-2026-09-12.md:35`
and (unrelated, a red herring about backup-script test output, not the same
"38")
`docs/evidence/remediation-v2-2/r0/R0-T6-backup-handoff-2026-09-07.md:49`.
No inventory script producing that figure was found. Given the broader
repository-wide check above turned up nothing else answering to "tracked
uploads or local dumps," this figure is very likely stale, from a different
inventory method, or already resolved by unrelated `.gitignore` changes —
but that is not independently confirmed here, and the figure itself remains
unsourced. This is flagged as an open curiosity, not a known outstanding
security gap.
