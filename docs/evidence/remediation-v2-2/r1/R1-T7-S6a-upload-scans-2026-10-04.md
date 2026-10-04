# R1-T7 S6a — a document is readable only with a clean scan on record

Exact branch `remediation/r1-continuation-20260907`, code `34faf453`, base `d1eb5fb4`.
[Preflight and separate reread](../../../PLAN-2026-10-04-r1-t7-s6-uploads.md).
S6a is code-complete; independent review is owed. S6b, R1-T7 and R1 remain active.
Owner decision 2026-09-29 (answer 3, "Add ClamAV on the server") governs; the
October 3 authorization directs continuation.

## What changed

- **The scanner boundary** (`server/malware-scanner.ts`). ClamAV's daemon over TCP,
  by its INSTREAM command: the document is streamed, never written to the daemon's
  disk, and one line comes back. `stream: OK` is clean; `stream: <name> FOUND` is
  infected with that name; anything else, a daemon that cannot be reached, one that
  does not answer within 30 seconds, or an answer longer than a verdict line is **no
  verdict**, and no verdict is never clean.
- **Configuration.** `UPLOAD_SCANNER` is `clamav` (the default) or `simulation`;
  `CLAMAV_HOST` and `CLAMAV_PORT` (3310) say where the daemon is. ClamAV with no host
  is no scanner. The stand-in is for development and tests: it calls everything clean
  but the standard antivirus test file, records its verdicts under its own name, and
  is refused at start-up in staging and production, as the simulated email provider
  is.
- **The upload** (`POST /api/property/invoices/document`). After the existing type,
  signature and size refusals, in their existing order, the document is scanned
  before anything is stored. Clean: the file and its verdict are written in one
  transaction. Blocked: 400 "This file was blocked because it may be harmful.", a
  security log line (the business, the scanner, the signature's name; never the
  bytes), nothing stored. No scanner, a scanner fault, or an answer that is no
  verdict: 503 "Document scanning is temporarily unavailable. Please try again.",
  nothing stored. The property and trades screens already show a failed upload's
  message; no client code changed.
- **Every reader requires the verdict, in its own query.** The business's read, the
  audited admin read, the payer's link, the payment page's "has a document" check,
  the attach check on property invoice, trades quote and trades invoice creation,
  and the two storage holds under their share lock. A document with no verdict, or an
  infected one, is not found by any of them, and cannot be attached.
- **Storage.** Migration `0032` adds `uploaded_file_scans` (one row per scanned
  file: verdict, scanner, signature name, time; gone with its file). The two readers
  that asked for no scan are retired; the unscanned reader and save remain for logos
  only, pinned to the public uploads route and the logo upload. Bytes stored
  unscanned over a scanned file drop its verdict in the same transaction: a verdict
  never outlives the bytes it judged.

## What this means for existing documents and environments

- **Documents uploaded before this change have no verdict**, so they are not
  readable or attachable until S6b's pass scans them. This is the owner's rule
  ("kept from every reader until the scan says it is clean") applied to old files.
- **A scanner is now a prerequisite for attaching a document.** In production that is
  ClamAV, which is the owner's deployment setup. In development the stand-in can be
  switched on with `UPLOAD_SCANNER=simulation`. With neither, the upload answers 503.
- **Migration `0032` is not applied to any application database.** Once this code
  runs somewhere, document upload, document reads and the logo upload fail there
  until it is.

## Verification

- Original red, replayed on an archived copy of `d1eb5fb4`: the scanner suite and
  the HTTP suite **cannot load** (the scanner boundary does not exist); storage **24
  of 24 fail** (12 memory, 12 captured SQL); the configuration suite's **12 new
  tests fail** while its 76 existing ones pass; and the two pins fail.
- Focused green: scanner **13**, storage **24**, HTTP **14**, configuration **88**
  (12 new), the inventory test **19** with its new pin.
- Affected regression **103 suites / 3,314 tests pass**: every upload, document,
  checkout, property, trades, configuration, migration and served-route suite, with
  the older document tests moved to the scanned save and the clean readers.
- Fresh actual PostgreSQL 16 **14 pass / 0 fail** on a new empty database through
  the existing runner, 0032 included: the file and its verdict written together; a
  file with no verdict and one with an infected verdict found by no document
  reader, the logo reader unchanged; the table refusing a verdict that is neither, a
  nameless finding and a named clean one; one verdict per file; the verdict going
  with its file; another business unable to replace a document or its verdict; a
  rescan replacing an infected verdict; unscanned bytes over a scanned file dropping
  its verdict; a verdict that cannot be written storing no file; six rounds of two
  businesses saving one path at once; invalid businesses; and the two storage attach
  holds (property invoice and trades quote) refusing an unscanned, an infected and
  another business's document and taking a clean one.
- That verifier found one real gap before commit: the database's unscanned save
  replaced a file's bytes and left its earlier clean verdict in place, where the
  memory implementation dropped it. Closed (the verdict is deleted in the save's
  transaction) and held by a unit test, the verifier and a planted defect.
- Earlier verifiers rerun on new empty databases: property invoice send **24**,
  trades creation **34**, trades invoices **27**, property invoices **18**, all
  passing (two seed their documents with a clean verdict now). The gap-13 verifier's
  five ownership checks were re-expressed under the clean-scan rule and pass; the
  verifier as a whole is **12 pass / 2 fail, identical on the base commit**: the two
  that fail shell out to the `tsx` command, which this sandbox refuses (EPERM), and
  are not touched by this change.
- Mutation check, on a scratch copy only: **47 of 47 planted defects caught**: 13
  by both the unit tests and PostgreSQL, 32 by the unit tests only (seven in the
  memory implementation, eleven in the scanner boundary, three in configuration,
  eleven in the routes) and two by PostgreSQL only (each storage attach hold without
  its clean-scan requirement, which no fake can see).
- Typecheck, production build and whitespace pass. Inventories: **187 registrations
  / 0 unclassified / 0 gaps; 257 storage contracts**.
- **Full server: 168 suites / 4,171 tests pass**, exit 0, 621.016 seconds, run on
  `34faf453` with a clean tree apart from untracked documentation. No new client or
  browser run is claimed.

## Phase handoff record

- Scope/files: `git show --stat 34faf453`.
- Migrations/target: `0032_uploaded_file_scans.sql`, additive (one new table). Applied
  only to new empty disposable loopback databases through the existing runner. The
  empty-database convergence was rehearsed as CI runs it (dry run, release, status:
  34 applied, 0 pending, 0 drifted, 0 orphaned) and the recorded fingerprint moved to
  `R1-T7-S6a-upload-scans-empty-fingerprint-2026-10-04.json`: 1 table, 5 columns, 4
  constraints (2 checks, its key, 1 foreign key) and 1 index added, nothing removed.
  No application database was contacted.
- Commands/logs: the base replay, focused and affected runs, the SQL verifiers, the
  convergence rehearsal, the mutation script, typecheck/build, both generators, the
  full server run. Synthetic logs under `.local/claude-scratch/session-2026-10-04/`
  (git-ignored; no application rows or contact data).
- Negative/effect proof: a refused upload stores nothing (storage contents before and
  after); an unreadable document sends no bytes and writes no admin audit line.
- Provider/UAT, devices, external actions, deploy: none. ClamAV itself was not
  available here: the daemon's protocol was exercised against a loopback stand-in
  only. No app DB/provider, live migration, client UI, push or deployment.
- Security/privacy: reviewed the fail-closed paths of the scanner boundary, the
  configuration refusal, the transaction boundary of the scanned save, each reader's
  predicate, the attach holds and response disclosure (fixed messages; the signature
  name goes to the log only).
- In-flight: none. Every disposable PostgreSQL was stopped and deleted by the command
  that started it.
- Rollback/constraints: no rollback commit; fix forward. The new table can stay if
  the code is reverted; nothing else in the schema changed.
- Approvals/stops: the S6a preflight and separate reread approve exactly this scope
  on `d1eb5fb4`; the owner's answer 3 of 2026-09-29 is the product decision. No
  application, provider or production gate was crossed.
- Owner actions this creates (recorded, not requested as permission): run ClamAV
  where the app runs and set `CLAMAV_HOST`; apply `0032` with the other pending
  development migrations; in development without ClamAV, set
  `UPLOAD_SCANNER=simulation` to keep attaching documents.
- Deferred/next: S6b (the pass that scans earlier documents, and the 12-month
  deletion of uploads no invoice uses); then Apple and R1-T10. Independent review of
  S1–S6 is owed.
