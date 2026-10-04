# R1-T7 S6b — the two scheduled passes of the upload lifecycle

Exact branch `remediation/r1-continuation-20260907`, code `382de840`, base `910c89b1`
(S6a code `34faf453`).
[Preflight and separate reread](../../../PLAN-2026-10-04-r1-t7-s6-uploads.md).
S6b is code-complete, and with it the S6 engineering scope (S6a, S6b) and R1-T7's
(S0–S6); independent review is owed. R1 remains active. Owner decisions of
2026-09-29 (answers 3 and 4) govern; the October 3 authorization directs
continuation.

## What changed

Two passes run at the end of each scheduler run (`POST /api/internal/cron`), each
isolated like the others: a failure is reported in `failedPasses` and stops nothing
else. They are last so a slow scanner delays no billing or invoice pass.

**The scan pass** (`runUploadScanPass`). After S6a a document with no scan on record
is readable by nobody, and every document uploaded before S6a is in that state. Each
run takes up to five of them (each is read into memory, up to 20 MB), scans each and
records its verdict:

- clean: the document is readable and attachable again;
- infected: the verdict and the signature's name are recorded, a security log line
  names the business and what was found, and the bytes stay where they are,
  unreadable. That is the quarantine: S6a's readers already refuse it;
- no verdict (no scanner, a fault, a timeout, an answer that is neither): the pass
  stops and records nothing. No document becomes readable without a verdict, and
  none is condemned without one.

A verdict is recorded only if the file still has none and still holds the bytes that
were scanned, under the file's row lock, so two instances running at once leave one
verdict per file. Documents are taken in no fixed order, so one the scanner can
never judge does not hold the others back.

**The deletion pass** (`runUploadRetentionPass`). A document is deleted only when, in
the database at that moment, it is in the documents folder, was uploaded more than
12 calendar months ago (UTC), and no property invoice, trades quote or trades invoice
names it. Its verdict goes with it. It never touches a logo, and never an attached
document, however old: those follow the 7-year rule of 2026-09-21. A run deletes at
most 50 and logs the count alone.

Because a deletion cannot be undone, "names it" is read widely: a stored address
that contains the file's path anywhere counts (the usual `/uploads/invoices/<name>`,
a full web address, one with a query string). Document names are random, so nothing
else contains one. The upload route has returned the usual form since its first
commit; the wide reading is for rows written by hand or by an older client.

The pass takes the same row lock an attach takes. A document being attached at that
moment is skipped and kept; an attach that arrives while the pass holds a document
waits, finds no document, and is refused as an invalid attachment with no invoice
made.

Three storage contracts carry this (`listUnscannedInvoiceDocuments`,
`recordUploadedFileScan`, `deleteUnattachedInvoiceDocuments`). A test pins that no
route calls them: they are the scheduler's alone.

## What this means in practice

- Once ClamAV is reachable and `0032` is applied, each scheduler run restores up to
  five earlier documents. A business with many earlier documents sees them return
  over several runs.
- An infected earlier document simply stays "not found" for everyone. Nothing tells
  the business why; the log line is the record. That is a product gap worth a
  decision later, and is recorded here rather than decided.
- Deletion is permanent, by the owner's decision.

## Verification

- Original red, replayed on an archived copy of `910c89b1`: storage **20 of 20
  fail**; the passes suite **cannot load** (the module does not exist); the pin
  fails.
- Focused green on the final code: storage **20**, passes and scheduler **18**, the
  inventory test **20** with its new pin.
- Affected regression **102 suites / 3,115 tests pass**. That run predates two small
  later changes (the wide reading of "names it", and one added bound test); the
  focused suites, the verifier, the mutation check and the full server run below are
  all on the final code.
- Fresh actual PostgreSQL 16 **13 pass / 0 fail** on a new empty database through
  the existing runner: the list is exactly the documents with no verdict (not a
  scanned one, not a logo), bounded, and bounded runs still reach every document; a
  recorded verdict makes a clean one readable and keeps an infected one from every
  reader; one verdict per file (a repeat, a wrong version, a missing file and a bad
  verdict record nothing); six rounds of two passes recording one file at once; a
  verdict for bytes replaced while it waited is not recorded; the 12-month boundary
  to the day, with the verdict going too; documents named by a property invoice, a
  trades quote and a trades invoice kept at eight years; a document named by a
  longer form of its address kept, and a lookalike deleted; a logo and a file outside
  the documents folder never deleted; a bounded pass that attached documents ahead of
  it do not hold back; a document being attached skipped and kept; an attach that
  waited for the deletion refused with no invoice made; and a document freed once
  nothing names it.
- Mutation check, on a scratch copy of the final code: **47 of 47 planted defects
  caught**: 19 by both the unit tests and PostgreSQL, 27 by the unit tests only
  (seven in the memory implementation, two in storage that only a statement capture
  can see, fourteen in the passes, four in the scheduler wiring) and one by
  PostgreSQL only (a record that reports a verdict it did not write). An earlier run
  of this check was stopped unfinished when the deletion's rule was widened; this is
  the rerun, complete, on the final code.
- Typecheck, production build and whitespace pass. Inventories: **187 registrations
  / 0 unclassified / 0 gaps; 260 storage contracts**.
- **Full server: 170 suites / 4,210 tests pass**, exit 0, 597.954 seconds, run on
  `382de840` with a clean tree apart from untracked documentation. No new client or
  browser run is claimed.

## Phase handoff record

- Scope/files: `git show --stat 382de840`.
- Migrations/target: none new (S6a's `0032` is what the passes use). The existing
  runner only on new empty disposable loopback databases. No application database
  was contacted.
- Commands/logs: the base replay, focused and affected runs, the SQL verifier, the
  mutation script, typecheck/build, both generators, the full server run. Synthetic
  logs under `.local/claude-scratch/session-2026-10-04/` (git-ignored; no application
  rows or contact data).
- Negative/effect proof: a scanner that gives no verdict records nothing (row counts
  and each file's verdict before and after); a refused attach makes no invoice; a
  pass without the scheduler's secret reads and deletes nothing.
- Provider/UAT, devices, external actions, deploy: none. ClamAV itself was not
  available here; the passes ran against the stand-in scanner. No app DB/provider,
  live migration, client UI, push or deployment.
- Security/privacy: reviewed the one-verdict rule and its lock, the fail-closed stop,
  the deletion's three reference kinds and folder bound, the lock order against an
  attach, and what is logged (a business and a signature name; a count).
- In-flight: none. Every disposable PostgreSQL was stopped and deleted by the command
  that started it.
- Rollback/constraints: no rollback commit; fix forward. A deleted upload cannot be
  restored, by design.
- Approvals/stops: the S6b preflight and separate reread approve exactly this scope
  on `34faf453`; the owner's answers 3 and 4 of 2026-09-29 are the product
  decisions. No application, provider or production gate was crossed.
- Deferred/next: R1-T5 Sign in with Apple (server and app side with stand-ins; the
  owner's Apple setup and a real iPhone to go live) and R1-T10 (typed route
  constants and the device, tutorial and accessibility matrix). Independent review
  of S1–S6 is owed.
