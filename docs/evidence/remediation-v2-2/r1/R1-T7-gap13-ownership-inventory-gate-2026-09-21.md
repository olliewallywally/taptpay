# Gap 13 — the trusted-ownership-inventory gate (migration 0025)

Date: 2026-09-21. Branch: `remediation/r1-continuation-20260907`. Base: `8d271733` (the
independently re-verified review fixes — see
[R1-T7-gap13-review-fixes-2026-09-19](R1-T7-gap13-review-fixes-2026-09-19.md#re-verification--claude-2026-09-21)).
Implements the owner's decision of 2026-09-19, verbatim **"Require a trusted ownership
inventory before migration"** ([decision](../../../decisions/2026-09-19-gap13-trusted-ownership-inventory.md)).
That decision authorizes preparing and testing this repair; **it authorizes applying it to no
database**, and none was touched.

## 1. The problem it closes

Migration `0023` gave each legacy invoice document to the merchant whose invoices or quotes
referenced it. Before gap 13 any merchant could put any string in `documentUrl`, so a reference is
not evidence of who uploaded a file: the independent review reproduced merchant B being handed
merchant A's document because B's quote pointed at it. `0023`'s bytes are immutable (it is applied
on development), so the repair has to come after it.

## 2. What was built

Codex had started this and left it incomplete (validator, coverage check and in-transaction staging
in `server/upload-ownership-inventory.ts`, plus eight tests, two of them red; no runner wiring, no
`0025`, `tsc` failing). Its design is kept; the rest is new.

| Piece | Where | What it does |
|---|---|---|
| Runner gate | `server/migrate.ts` `runPendingMigrations` | If `0023`, `0024` or `0025` is pending, refuses **before the ledger is created or any migration runs** unless an inventory is supplied and matches the database exactly. So a run can never stop between `0023` (guessed owners) and `0025` (verified owners) for want of an inventory. `--dry-run` reports instead of refusing. |
| In-transaction re-check | `applyMigration`'s new `prepare` hook → `stageUploadOwnershipInventory` | Inside `0025`'s own transaction: `LOCK TABLE uploaded_files IN SHARE ROW EXCLUSIVE MODE`, the same coverage check again, then the inventory staged as `pg_temp.gap13_upload_ownership_inventory` (dropped at commit). An upload landing after approval makes the approval stale instead of slipping through. |
| `0025_verified_upload_ownership.sql` | `migrations/` | First statement aborts unless the staged table exists (so neither psql nor a runner without the inventory can apply it). Creates `uploaded_file_ownership_evidence`, records every approved entry there, clears `merchant_id` on **every** invoice document, then sets it from the inventory. Deletes, moves and rewrites no file and no `document_url`. Logos keep `0023`'s path-derived owner (only the owner's own authenticated route writes `logos/merchant-<id>.png`). |
| CLI | `--upload-ownership-inventory=<file>` + `--upload-ownership-inventory-sha256=<hex>` | Both or neither. The file is read, pinned to the approved SHA-256, schema-checked and bound to the declared target (host, port, database) before any ledger work. Errors are fixed text naming what to do next; no path, digest or row value is printed. |
| Coverage rule | `assertUploadInventoryCoverage` | Every `invoices/%` row listed; every entry matches a real invoice document by id, path SHA-256 **and content SHA-256**, and names an existing merchant; the connected database's name matches the inventory's. |
| CI | `.github/upload-ownership-inventory.ci-convergence.json`, `verify.yml` | An approved **empty** inventory bound to `127.0.0.1:5432/convergence`; the dry-run and release steps pass it. |
| CI fingerprint | `R1-T7-gap13-empty-fingerprint-2026-09-21.json`, `verify.yml` | Repointed — it had predated `0022`–`0024` (see §5). |
| Operator guide | [`docs/operations/migration-release.md`](../../../operations/migration-release.md#the-upload-ownership-inventory-gap-13) | The file format, the checks, what software cannot check. |

Engineering choice to note: an inventory is required even for an **empty** database (Codex's red
test pinned this). It costs CI one committed file and makes every target's operator state
explicitly what the target holds, rather than the runner inferring "nothing to prove".

## 3. Failing tests first

15 new tests in `server/__tests__/upload-ownership-inventory.test.ts` were written before the runner
wiring and `0025` existed and failed for the stated reason (missing exports, gate absent, file
absent, CI inventory absent), with Codex's two red tests. One further test, "asks for nothing when
no gated migration is pending", guards against an over-broad gate and passes by design either way.
After implementation: **28 / 28 pass**.

**Mutation checks — each guard removed in a scratch copy, a test goes red (7 of 7):** apply-path
gate removed (5 fail); staging hook never invoked (1); staging on every migration (1); database-name
check removed (1); coverage result ignored (1); lock taken after the check (1); redaction swallowing
inventory errors (1). The scratch copy was restored byte-identical.

## 4. Real PostgreSQL — `scripts/verify-gap13-postgres.ts`

Throwaway PostgreSQL 16.10 on loopback, empty database, the project runner. **11 / 11 PASS**, exit 0.
Before this, the same verifier gave 5 PASS / 2 FAIL (the two legacy-ownership checks). New checks:

1. `0025` applied directly with no staged inventory aborts; not in the ledger; no evidence table.
2. Starting state reproduced: `0023` attributed A's document to **B** (B's quote referenced it).
3. The runner refuses `0025` with: no inventory (`UPLOAD_INVENTORY_REQUIRED`); an empty one; a false
   content hash; a merchant that does not exist; and a **stale** approval (an upload inserted after
   it was built) — refused both by the pre-check and, applied directly, under the lock inside `0025`'s
   transaction. Ownership unchanged throughout.
4. With a complete inventory (A for the legacy document, B for the late one): `0025` applies; owners
   become A and B; the logo stays A's; two evidence rows carry the inventory's SHA-256 and approver
   and no path; a rerun is a no-op needing no inventory.
5. Codex's two legacy checks now pass — B has no authority over A's document and cannot overwrite it —
   and a new one: **A, the evidenced owner, keeps access.**

## 5. CI rehearsal and the fingerprint

The exact `migration-convergence` steps, run through the real CLI against an empty database on
`127.0.0.1:5432/convergence`, with the committed CI inventory and the digest read out of `verify.yml`:

| Step | Result |
|---|---|
| release **without** the flags | refused: `UPLOAD_INVENTORY_REQUIRED …`; 0 tables in `public`/`drizzle` — not even the ledger |
| `db:migrate --dry-run` + flags | `Would apply 27 migration(s)`; `✓ upload-ownership inventory matches all 0 invoice document(s)` |
| `db:release` + flags | `0025 … (5 statement(s))`; `Applied 27`; `Release verified: 27 … 0 pending` |
| `db:migrate:status` | `27 applied, 0 pending, 0 drifted, 0 orphaned`, exit 0 |
| `schema-fingerprint.mjs` | `sha256:b386faf0…`; a second run byte-identical |

CI's recorded fingerprint (`R0-T6A-empty-fingerprint-v2-2026-09-10.json`, `8c40c156…`) predated
`0022`. Section diff, old → new: **+3 tables, +19 columns, +5 constraints, +1 foreign key, +6
indexes; nothing removed.** Every object is accounted for: `0022` — the two partial unique indexes
`payment_attempts_processor_session_id_uq`, `split_payments_windcave_transaction_id_uq`; `0023` —
`uploaded_files.merchant_id` (nullable), `uploaded_files_merchant_id_merchants_id_fk`,
`uploaded_files_merchant_id_idx`; `0024` — `invoice_document_access_audit` (4 columns) and
`invoice_document_read_limits` (3), each with its primary key; `0025` —
`uploaded_file_ownership_evidence` (11 columns), primary key, and the `evidence_kind` check. The old
artefact is unmodified; `verify.yml` now names the new one.

## 6. Author's reviewer pass (plan §21.1) — **not independent**

Written by the author of the gate. It is not the independent review the plan requires.

### Verification of Prior Fixes
The review's four finished corrections were re-verified before this work and committed as
`8d271733` (red on old code 8/10, 4/4 mutations caught, PostgreSQL verifier, browser check).

### Blocking Issues
None known to the author.

### High-Risk Concerns
1. **A document nobody can evidence blocks the whole release.** That is the decision as written. Its
   consequence should be seen plainly: until every invoice document in production has evidence,
   gap 13 cannot ship there, and production keeps serving every invoice document publicly to anyone
   holding its link — the exposure gap 13 exists to close. See Q2.
2. **The shared document budget** (Codex's, committed in `8d271733`): ~600 junk requests a minute
   from one anonymous client switch off "View invoice" for every tenant. See Q1.
3. **Hashing time.** The coverage check hashes every invoice document's bytes, in `0025`'s
   transaction, while uploads wait on the lock; each statement is bounded by the runner's 60 s
   budget. Production's total document size is unknown: rehearse on a representative copy.

### Missing Steps
- No tool drafts an inventory. The ids and hashes can be read with
  `SELECT id, encode(sha256(convert_to(path,'UTF8')),'hex'), encode(sha256(data),'hex') FROM uploaded_files WHERE path LIKE 'invoices/%'`;
  owners and evidence come from people.
- No evidence source has been supplied (the decision records it as requested).
- Development: `0024` and `0025` are pending there; applying them needs an inventory for its
  invoice documents (two on 2026-09-19) and the owner's approval.
- Production: the read-only preflight, then an inventory, then target-specific approval.

### Unsafe Assumptions
- The inventory's `host` must be exactly the host the release command declares; a Neon pooled
  hostname and its direct hostname are different targets.
- `uploaded_files.id` is never reused (a serial; nothing resets it).

### Required Ordering Changes
None beyond the committed release guidance. The gate enforces what it could only ask before: `0023`
can no longer run without `0025` and an inventory in the same invocation, and production already
refuses to boot while any migration is pending.

### Open Product / Provider / Legal Questions
- **Q1** — accept the platform-wide document budget, or have the token looked up first so only real
  invoices are counted?
- **Q2** — for a document no one can evidence (an orphan, or a merchant since deleted), is
  "block the release" final, or should an operator be able to mark that one document as
  admin-only, retained, owner unknown?
- **Q3** — what evidence exists in practice (server logs from before gap 13? merchants' own copies?).
- **Q4** — retention for `invoice_document_access_audit` and `uploaded_file_ownership_evidence`.

### Compliance and Data-Handling Notes
The inventory and the evidence table hold hashes, ids and a free-text reference — no path, no
content, no token. `approvedBy` and `evidence.reference` are free text: use an identifier, not
personal data about a tenant.

### Test and Rollback Adequacy
Unit 28, mutation 7/7, PostgreSQL 11/11, CLI rehearsal, fingerprint diff. `0025` is forward-only;
code from `8d271733` runs unchanged after it (it never reads the new table). Undoing its effect
would be a new reviewed forward migration, never re-running `0023`'s backfill.

### Final Recommendation
Author's view: ready for **independent** review; not merge-ready until that review says Approve.

## 7. Independent re-review — brief

**Range:** `acef4e42..<the commit adding this file>` on this branch (two code commits: `8d271733`,
Codex's review fixes as re-verified by Claude; and this gate). Local only — nothing is pushed.

Paste-ready prompt:

> You are the independent security and correctness reviewer for TaptPay, a payment-terminal SaaS.
> Review the gap-13 follow-up on branch `remediation/r1-continuation-20260907`, range `acef4e42..HEAD`,
> code paths `server shared migrations scripts .github` only. An earlier review of `454f4120..b0da2f08`
> said "Do not approve"; `8d271733` fixes its findings and the latest commit implements the owner's
> decision "Require a trusted ownership inventory before migration". Start from
> `docs/evidence/remediation-v2-2/r1/R1-T7-gap13-ownership-inventory-gate-2026-09-21.md` and
> `R1-T7-gap13-review-fixes-2026-09-19.md`; treat them as claims, re-derive everything from the code.
> Attack especially: whether any path applies `0023`–`0025` without a complete, matching inventory
> (runner, CLI, direct `applyMigration`, baseline mode); whether an upload can land between the check
> and the ownership update; whether `0025` can leave any invoice document with an unverified owner;
> the target binding (host normalisation, pooled vs direct hosts); what the evidence table and error
> messages disclose; the shared document budget's failure modes; whether the tests would catch a
> one-line regression. Label anything you cannot verify UNVERIFIED. Cite `file:line`; give a failing
> request or test for every Blocking issue. Return exactly the ten headings of plan §21.1 and end with
> Approve / Do not approve naming the commit range.

Reproduce: `npm run check`; `npm run test:server`; `npx jest --selectProjects client`;
`node --test scripts/count-gap13-uploaded-files-attribution.test.mjs scripts/count-gap11-session-replay-duplicates.test.mjs scripts/schema-fingerprint.test.mjs scripts/postgres-verifier-safety.test.mjs`;
`TEST_DATABASE_URL=<empty disposable database> TAPTPAY_TEST_DATABASE=1 npx tsx scripts/verify-gap13-postgres.ts`;
`npx tsx scripts/verify-gap13-browser.ts`; and §5's CLI steps against an empty database named
`convergence` on `127.0.0.1:5432`.

## 8. Update — Q1 decided: count only real invoices (2026-09-21, later)

Owner, verbatim: **"1. go ahead"** ([decision](../../../decisions/2026-09-21-gap13-owner-directions.md)).
This closes High-Risk Concern 2 above. `GET /api/checkout/document/:token` now looks the link up
**first**: a made-up link is answered `404` without touching the budget; a real link has its own
database-shared budget of 10 a minute; the platform-wide pool of 600 (and its constants) is gone.
A budget outage still fails closed (`503`) — now after the lookup, still before any document byte
is read. The `0024` counter table is unchanged; rows exist only for real invoices opened in the
last minute, and each call first reclaims expired ones.

- **Tests first.** In `gap13-review-regressions.test.ts` three tests that pinned the old order were
  replaced and two added. Red on `e268d91e`: *a made-up link … never touches the shared budget*;
  *a flood of made-up links cannot switch off View invoice* (601 junk requests, then a real
  customer's link must still answer `200`); *the in-memory limiter … has no platform-wide cap*.
  Two guards pass before and after by design: a budget outage answers `503`, and a spent link
  answers `429` with `Retry-After`, neither reading the document.
- **Mutation checks:** counting before the lookup → the "never touches the budget" test fails;
  budget check removed → 2 tests fail. Restored byte-identical.
- **PostgreSQL 16.10:** the verifier's budget check now asserts 700 distinct links are all allowed
  (700 rows) and that expired counters are reclaimed (1 row after the window). On `e268d91e` it
  fails (600 allowed); on the new code **11 / 11 PASS**. Thirty concurrent requests across two
  storage instances still yield exactly 10 allowed — the per-link upsert is atomic without the
  removed global lock.

Open: Q2–Q4 (Q3 has a recommendation awaiting approval; Q4 is answered, the retention period is
not yet decided or implemented).

## 9. Update — the automatic rule; locked, not blocking (2026-09-21, evening)

Owner, verbatim: **"please go ahead with all of your recommendations"**
([decision](../../../decisions/2026-09-21-gap13-ownership-rule-and-retention.md)). This amends
the 2026-09-19 rule and closes High-Risk Concern 1 above (a document nobody could evidence no
longer blocks the release — it is locked).

**What changed**

- **List version 2** (`server/upload-ownership-inventory.ts`): each invoice document is listed once
  as `owner` (merchant + evidence) or `locked` (reason only). Version 1 is refused.
- **TaptPay's own records as evidence** (`system-record`): exactly one merchant attached the
  document, first between 5 minutes before and 24 hours after the upload time in its generated
  name. `classifyInvoiceDocument` is the single rule; `invoiceDocumentFactsSql` reads the facts
  (hashes only — no path or content leaves the database; `created_at` read as UTC).
- **The runner re-derives every `system-record` claim itself**, in the pre-check and again under
  the lock inside `0025`, and refuses the release on any mismatch
  (`UPLOAD_INVENTORY_EVIDENCE_MISMATCH`) — an edited or stale list cannot move a document.
- **`0025`**: `uploaded_file_ownership_evidence` now also records locked entries (`disposition`,
  `locked_reason`; owner and evidence columns nullable, tied together by one check constraint);
  only `owner` entries receive a `merchant_id`.
- **Drafting tool** `server/draft-upload-inventory.ts` (`npm run db:draft-upload-inventory`):
  validates the target exactly as the runner does, works in one READ ONLY transaction,
  `--count-only` prints numbers and the database's TimeZone; a draft is written `0600`, never
  over an existing file, and prints its SHA-256. `config-source-guard.test.ts` allowlists its two
  environment reads with reasons, as it does for `migrate.ts`.
- **CI**: the empty list moved to version 2 (new digest in `verify.yml`); fingerprint re-recorded
  as `R1-T7-gap13-empty-fingerprint-v2-2026-09-21.json` — the diff against this morning's record
  is confined to `0025`'s own table (+2 columns, 4 columns now nullable, the check constraint
  replaced); the morning artefact is unmodified.

**Verified**

- Tests first: the new tests failed for the stated reasons (the functions did not exist; the old
  code refused version 2). Now `upload-ownership-inventory.test.ts` **62 / 62**, migration suites
  **178 / 178**.
- **Mutations, 5 of 5 caught:** runner skipping the records check; window widened to 7 days; two
  merchants no longer locking; locked entries allowed an owner; `0025` giving owners to locked
  entries.
- **PostgreSQL 16.10, 14 / 14 PASS**, including: the rule sorts four purpose-built documents
  correctly (owner / several-merchants / never-attached / attached-outside-window); a list that
  forges a `system-record` claim is refused; **the real drafting command** counts
  (`total=6 owner=1 locked=5`), drafts a `0600` file carrying no path, refuses to overwrite it,
  and changes nothing; after `0025` only evidenced documents have owners, every row carries the
  approved list's SHA-256, and a locked document reaches no merchant while the admin's read
  still works.
- **CI rehearsal** with the version-2 list: dry run matches 0 documents; release applies 27 and
  verifies; status clean; fingerprint byte-identical on a second run.

**Read-only counts (approved)**

| Target | Result |
|---|---|
| Development (`heliumdb`) | `total=2 owner=1 locked=1 locked.never-attached=1`, TimeZone `GMT` — the same two documents the 2026-09-19 preflight found (1 attributable, 1 orphan); the attributable one passes the timing rule |
| Production | **Not counted.** The workspace's production address (`NEON_DATABASE_URL`) connects and verifies TLS, but Neon answers `28000 The endpoint has been disabled. Enable it using the API and retry.` Separately, `taptpay.co.nz` redirects every visitor to Replit sign-in (`privateDeployment=true`). No record in the repository explains either. Nothing was changed; both are owner questions. |

**Retention** — periods decided (see the decision), professional confirmation and the deletion job
outstanding; nothing deletes automatically.
