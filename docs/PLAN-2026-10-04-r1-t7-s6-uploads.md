# R1-T7 S6 — the private upload lifecycle

Branch `remediation/r1-continuation-20260907`. Authority: v2.2 §8.5 and §22.8 ("secure
file uploads … malware scanning/quarantine … retention/deletion audit"), the supplied
integration plan's R1-T7 upload boundary, the gap-13 Option C decision of 2026-09-14
(preserved, not reopened), the retention rule of 2026-09-21, and the owner's answers
of 2026-09-29 (3 and 4), which are not asked again:

> **"Add ClamAV on the server"** — a document is kept from every reader until the
> scan says it is clean; tests use a stand-in scanner. Running ClamAV where the app
> runs is part of the deployment and needs the owner's setup.
>
> **"KEEP for 12 months"** — an upload no invoice uses is deleted 12 months after it
> was uploaded; attached documents are not touched by this.

The owner's finish-R1 authorization of 2026-10-03 persists.

## What is already in place (gap 13, read again on `7efc3f03`)

Authorization before the body is parsed; a 20 MB limit; a declared type from a fixed
list, held to the bytes' own signature for four of the five; a random generated name
that is not a fetchable address; every document stamped with its business and read
only through that business, the invoice's own payer link, or the audited admin
branch; private, no-store, nosniff responses; the public folder limited to logos.
What is missing is exactly the owner's two answers: nothing scans a document, and
nothing ever deletes an unattached one.

Written once: `POST /api/property/invoices/document` (the trades screens use it too).
Read by: `GET /api/invoice-documents/:name`, `GET /api/checkout/document/:token`, the
payment page's "has a document" check, and the attach checks on property invoice,
trades quote and trades invoice creation (in the routes and again in storage, under
a share lock). Referenced by `documentUrl` on those three records.

## Decomposition

- **S6a — a document is readable only with a clean scan on record.** The scanner
  boundary and its configuration; the upload scanned before anything is stored; the
  verdict kept with the file; every reader and every attach requires it.
- **S6b — the two scheduler passes.** Documents from before S6a get their verdict;
  an upload no invoice uses is deleted 12 months after it was uploaded.

## S6a preflight — a clean scan on record

Base `7efc3f03` (S5b code `587842cb`; the commit above it is documentation).

### Verification of Prior Fixes

S5b was verified at completion in this session: 165 suites / 4,107 tests on
`587842cb`. Reread for this scope: the upload route and its two checks, the four
readers, the two storage attach holds, both implementations of the uploaded-file
methods, the gap-13 evidence and its review brief, the configuration module's
optional-provider and simulation rules, and migrations 0023–0025 and 0030–0031 with
their contract, test list and recorded fingerprint.

### Blocking Issues

None for the code. One prerequisite is the owner's and is recorded, not waited for:
ClamAV is not installed here (`clamd`, `clamscan` not found), so the real daemon is
exercised only against a stand-in that speaks its protocol on loopback. Running it in
production is his setup. Applying the new migration to any application database is
his too.

### High-Risk Concerns

- **Fail closed, everywhere.** No scanner configured, a scanner that cannot be
  reached, times out or answers anything but "clean" or "found": the upload is
  refused (503) and nothing is stored. An infected upload is refused (400) and never
  stored. A stored document with no clean verdict is not found by any reader and
  cannot be attached.
- **No fake success.** A stand-in scanner exists for development and tests only
  (`UPLOAD_SCANNER=simulation`), refused at start-up in staging and production, as
  the email simulation is. It blocks the standard antivirus test file so the refusal
  path can be seen.
- **The verdict travels with the file.** The file and its clean verdict are written
  in one transaction; a reader's query requires the verdict in the same statement as
  the business. There is no window in which a stored document is readable unscanned.
- **Documents from before this change have no verdict**, so they stop being readable
  until S6b's pass scans them. That is the owner's rule applied to old files.

### Missing Steps

Tests red first (the scanner boundary against a loopback stand-in daemon; storage in
both implementations and the captured SQL; HTTP for the upload, the four readers and
the three attaches); migration 0032 (a new table, additive) with its contract entry,
test list entry, schema declaration and regenerated empty-database fingerprint; the
configuration keys and their documentation; the routes; the harness's default
stand-in so the existing upload suites keep their meaning; actual PostgreSQL; the
mutation check; route reviews and both inventories; affected and full runs,
typecheck, build, evidence.

### Unsafe Assumptions

A scan is a point-in-time verdict from the signatures the daemon had; it is recorded
with the scanner's name so a later rescan policy has something to compare. Logos are
a separate public folder, PNG by signature, and are not part of the owner's scanning
answer: unchanged. The upload is still read into memory (the existing recorded
finding). ClamAV's own stream limit (25 MB by default) is above the route's 20 MB. A
business sees its own unscanned or blocked document as not found, as a payer does: no
new screen state is added under the feature freeze.

### Required Ordering Changes

The migration and schema first (nothing reads the table yet), then the scanner
boundary and configuration, then storage, then the upload route, then the readers
and attaches. S6b only after S6a is committed and verified.

### Open Product / Provider / Legal Questions

None that block. Recorded for the owner, not asked: (1) attaching a document needs a
scanner once this ships, so ClamAV (or, in development only, the stand-in) must be
set up first; (2) a blocked upload answers "This file was blocked because it may be
harmful", and an unavailable scanner "Document scanning is temporarily unavailable.
Please try again."; both use statuses the upload screen already shows a message for.

### Compliance and Data-Handling Notes

An infected upload's bytes are never stored; only the business, the time and the
signature name are logged. Synthetic loopback PostgreSQL and a loopback stand-in
daemon only; no application database, provider, live migration, client UI, push or
deployment. No contact data in evidence.

### Test and Rollback Adequacy

Clean stores the file and its verdict together; infected, unreachable, timed out,
malformed and not configured each store nothing. A file with no verdict, an infected
verdict or another business's verdict is not found by the business, the payer, the
admin or an attach. Two businesses throughout. Fix forward; the migration is a new
table and can stay if the code is reverted.

### Final Recommendation (Approve / Do not approve)

**Approve S6a on `7efc3f03`**, failing tests first. It does not close S6, R1-T7 or R1.

### Separate reread

Retraced by call site. `saveUploadedFile` has two callers: the logo upload (public
folder, unchanged) and the document upload (moves to the scanned save).
`getUploadedFile` has two: the public uploads route (logos) and the admin branch of
the document read, which must not share a reader once one of them needs a verdict.
`getUploadedFileForMerchant` has two: the business's document read and the payer's.
`uploadedFileOwnedByMerchant` has two: the route attach check and the payment page's
link check. The two storage holds (property create, and the shared trades one) select
the file's id under a share lock. So six read sites and one write site change, and
the logo's three (save, public read, delete) do not. What must not move: every
refusal the readers give today (404 "Document not found", 400 "Invalid document
attachment", the payment page hiding its link and never failing), the 429 and 410
order on the payer's read, the admin read's audit-before-bytes rule, and the upload's
existing 400s in their existing order before any scan is attempted. **Approve the
same S6a scope.**

## S6a completion

Code `34faf453`. On `d1eb5fb4` the scanner and HTTP suites could not load, 24 of 24
storage tests and the 12 new configuration tests failed, and both pins failed; then
scanner 13, storage 24, HTTP 14, configuration 88; affected 103 suites / 3,314
tests; actual PostgreSQL 14 of 14 with migration 0032 through the runner, and the
convergence rehearsal (34 applied) with a new recorded fingerprint; 47 of 47 planted
defects caught; full server 168 suites / 4,171 tests on the commit.
[Evidence](evidence/remediation-v2-2/r1/R1-T7-S6a-upload-scans-2026-10-04.md),
[operations note](operations/upload-scanning.md).
The PostgreSQL verifier found one gap before commit (an unscanned save kept the
file's old verdict in the database); it is closed and held three ways.

## S6b preflight — the two scheduler passes

Base `34faf453` (the S6a code).

### Verification of Prior Fixes

S6a was checked at completion in this session (counts in its evidence): red on the
base, focused and affected suites, actual PostgreSQL with migration 0032 through the
runner, the convergence rehearsal and new fingerprint, the planted defects, typecheck,
build and the full server suite on its commit. Reread for this scope: the scheduler
route and how it isolates and reports its passes, the three tables that name a
document (`invoices_rent_requests`, `quotes`, `job_invoices`), the two storage attach
holds and the lock they take (a share lock on the file's row), the scanner boundary,
and the owner's answer 4 of 2026-09-29 with the 7-year rule of 2026-09-21.

### Blocking Issues

None. Two things are true after S6a and are what S6b is for:

- A document uploaded before S6a has no verdict and is readable by nobody. Nothing
  will ever give it one.
- An upload no invoice uses stays forever. The owner's answer is 12 months.

### High-Risk Concerns

- **The scan pass** takes documents with no verdict, oldest first, a few per run
  (each is read into memory, up to 20 MB), scans each, and records the verdict only
  if the file still has none. Clean makes it readable again. Infected is recorded and
  the bytes stay where they are, unreadable (S6a's readers already refuse it): that
  is the quarantine. A scanner that gives no verdict stops the pass and records
  nothing: no document becomes readable without a verdict, and none is condemned
  without one.
- **The deletion pass** removes a document only when all of these hold in the
  database at the moment of deletion: it is in the documents folder; it was uploaded
  more than 12 calendar months ago; no property invoice, trades quote or trades
  invoice names it. It takes the same row lock an attach takes, so a document being
  attached at that moment is either attached first (and kept) or deleted first (and
  the attach is refused as an invalid document). It never touches a logo, and never
  an attached document, however old: those follow the 7-year rule.
- Both passes are isolated like every other scheduler pass: a failure is reported
  and stops nothing else.

### Missing Steps

Tests red first (storage in both implementations and the captured SQL; the two pass
functions with a stand-in scanner; the scheduler route's report); the storage
contracts; the passes; the route wiring and its review; actual PostgreSQL for the
pass's bounded oldest-first selection, the one-verdict rule under two passes at once,
the deletion's three reference kinds, its 12-month boundary and both orders of the
attach race; the mutation check; inventories; affected and full runs, typecheck,
build, evidence, the handoff.

### Unsafe Assumptions

"12 months" is calendar months from the upload's stored time, in UTC. An infected
document is unattached by construction, so it is deleted with the others at 12
months; until then its bytes are kept and never served. Deletion is a hard delete of
the row and its verdict; there is no undo, which is the decision. Nothing here reads
or deletes a document that an invoice names, so no legal-hold question arises in
this pass; the wider retention policy stays with A-H3. The memory implementation
mirrors the rules for the harness; the SQL is proved on PostgreSQL.

### Required Ordering Changes

The storage contracts first, then the two passes, then the scheduler wiring.

### Open Product / Provider / Legal Questions

None. Both behaviours are the owner's recorded answers.

### Compliance and Data-Handling Notes

The deletion logs a count only; the scan pass logs a blocked document's business and
signature name, never bytes or names of people. Synthetic loopback PostgreSQL and a
stand-in scanner only; no application database, provider, live migration, client UI,
push or deployment.

### Test and Rollback Adequacy

A document one day short of 12 months, an attached one of any age and a logo are
kept; an unattached one a day past is deleted, with its verdict. A document attached
while the pass waits is kept; one deleted while an attach waits refuses the attach.
Two scan passes at once record one verdict per file. A scanner outage records
nothing. Fix forward; a deleted upload cannot be restored, by design.

### Final Recommendation (Approve / Do not approve)

**Approve S6b on the S6a commit**, failing tests first. With it S6's engineering
scope, and R1-T7's, is implemented; neither is independently closed by it.

### Separate reread

Retraced by reference. A document's address is stored as `/uploads/invoices/<name>`
on three tables and nowhere else; the storage attach holds resolve it to the file's
path `invoices/<name>` and lock that row `FOR SHARE` inside the create's transaction.
A deletion that locks the row `FOR UPDATE` first therefore serializes with every
attach, and a separate statement after the lock sees any invoice committed before it.
Recurring invoices carry no document. The scheduler runs one pass at a time behind
its own in-process guard, but two instances can run at once, so both passes must be
safe run twice: the verdict insert takes no second row for a file, and a second
deletion finds nothing left. **Approve the same S6b scope.**

## S6b completion

Code `382de840`. On `910c89b1` the 20 storage tests failed, the passes suite could
not load and the pin failed; then storage 20, passes and scheduler 18; affected 102
suites / 3,115 tests; actual PostgreSQL 13 of 13; 47 of 47 planted defects caught on
the final code; full server 170 suites / 4,210 tests on the commit.
[Evidence](evidence/remediation-v2-2/r1/R1-T7-S6b-upload-passes-2026-10-04.md).
One rule was widened before commit: because a deletion cannot be undone, a document
counts as named by an invoice if its path appears anywhere in the stored address.
With this, S6's engineering scope and R1-T7's (S0–S6) are implemented; independent
review is owed. The immediate handoff is `docs/HANDOFF-2026-10-04-r1-t7-s6.md`.
