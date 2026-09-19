# R1-T7 / gap 13 — uploads tenant authorization (Option C)

Date: 2026-09-19. Branch: `remediation/r1-continuation-20260907`. HEAD at start: `454f4120`
(tree clean; baseline independently re-run this session — see §6).

Owner decision being implemented: **Option C, "Full tenant-scoped auth"**
([disposition](../../../decisions/2026-09-14-uploads-tenant-authorization-option-c-disposition.md),
[options memo](../../../decisions/2026-09-14-uploads-tenant-authorization-escalation.md)).
Plan anchors: §8.5 (tenant-scoped storage for "uploads"), §22.8 last bullet ("authenticate and
tenant-authorize before streaming … private object storage … retention/deletion audit"), §18 stop
condition "merchant A can read, mutate, export, upload for … merchant B data".

This file is the **proposed phase and its reviewer pass (§21.1), written before any code**. Results
and the §21.2 handoff are appended below once implementation is verified.

---

## 1. What the code actually does today (re-read live, not taken from prior evidence)

- `shared/schema.ts` — `uploaded_files(id, path unique, mime_type, data bytea, created_at)`. No tenant column.
- `GET /uploads/:folder/:name` (`server/routes.ts`, "Serve uploads from the uploaded_files table") — no
  authentication; serves any `folder/name` row, then falls back to `process.cwd()/uploads/<folder>/<name>` on disk.
- Writers of `uploaded_files` (grep of every `saveUploadedFile` call): exactly two —
  the logo route (`logos/merchant-<id>.png`, owner-only, ownership checked before multer) and
  `POST /api/property/invoices/document` (`invoices/invoice-<ms>-<8 random bytes hex><client ext>`, any
  authenticated merchant principal, **no tenant recorded**).
- Readers/consumers of a stored `documentUrl` (grep of `documentUrl` across `server/`, `shared/`, `client/src/`):
  1. **The public checkout page** — `client/src/pages/checkout.tsx` fetches `/api/checkout/resolve/:token`
     and, for `kind === "charge"`, does `window.open(invoiceData.documentUrl, …)`. The reader is the
     **unauthenticated tenant**, authorized only by holding the invoice's checkout token.
  2. Nothing else. The merchant UIs (`PropertyTerminalView`, both `property-terminal.tsx`) show the document
     **name** in a chip and only echo `documentUrl` back to the create call; no server email/WhatsApp/PDF
     code references it.
- Three tables carry `document_url`/`document_name`: `invoices_rent_requests`, `quotes`, `job_invoices`. All
  three create schemas accept it as a free `z.string().trim().max(500)` — **nothing checks that it names an
  upload the caller owns** (or is even a URL of ours).

### Correction to prior evidence

`R1-T3-settings-uploads-exports-tenant-scoping-2026-09-14.md` says documents "are currently linked to
directly by URL from the property invoicing UI and PDF exports". That is **not what the code shows**: only
the public checkout page dereferences the URL; there is no merchant-side link and no PDF/email export that
embeds it. This matters to the design (the sole reader is not a merchant session) and is why the memo's
Option-B concern about "every caller reissuing links" largely doesn't apply, while a session-only Option C
route would have silently broken the tenant's "View invoice".

---

## 2. Proposed change

**P1 — Schema + migration `0023_uploaded_files_tenant_column.sql`** (additive, forward-only, never edits an
applied migration):
`uploaded_files.merchant_id integer REFERENCES merchants(id)` (nullable; plain FK, matching the dominant
convention in this schema — deleting a merchant that still owns uploads is blocked until retention policy
A-H3 is decided, rather than silently cascading financial documents away) and
`uploaded_files_merchant_id_idx`. Deterministic backfill only:
logos by their own path (`logos/merchant-<n>.png` where merchant `n` exists); invoice documents from
`document_url` references across the three tables **only where every referencing row belongs to one
merchant**. Ambiguous (multi-merchant) and unreferenced rows stay `NULL` — **fail closed**: no tenant-scoped
route serves a NULL-tenant row, and nothing is deleted. A count-only preflight script (C0-style) reports the
classification before the migration is ever run anywhere.

**P2 — Tenant-scoped storage** (`IStorage`, `MemStorage`, `DatabaseStorage`):
`saveUploadedFile(path, mime, data, merchantId)` stamps the tenant and **refuses to overwrite a row owned by
a different tenant** (conditional upsert); `getUploadedFileForMerchant(path, merchantId)`;
`uploadedFileOwnedByMerchant(path, merchantId)` (metadata-only, no blob read — used per checkout resolve);
`deleteUploadedFile(path, merchantId)`. `getUploadedFile(path)` stays unscoped **for the public logo route
only** and is documented as such.

**P3 — Routes**
- `GET /uploads/:folder/:name` → allowlist of public folders = `{logos}`; everything else (including the disk
  fallback) → the same 404 as "not found". Invoice documents are no longer served here.
- `GET /api/invoice-documents/:name` (new, `authenticateToken`, tenant-scoped by the principal's own
  `merchantId`): the merchant-side authenticated, ownership-checked download Oliver decided on.
  Cross-tenant, unknown, NULL-tenant and malformed names are indistinguishable 404s.
- `GET /api/checkout/document/:token` (new, public, checkout-token authorized): serves **only the document
  attached to that token's own invoice**, and only if the stored file's tenant equals the invoice's merchant.
  Mirrors `GET /api/checkout/resolve/:token` guards (unknown → 404, voided → 410) and is rate-limited under a
  distinct key so viewing a bill cannot exhaust the page's own request budget.
- `GET /api/checkout/resolve/:token` returns `documentUrl` = that token route (never the raw storage path)
  and only when the document is valid and tenant-consistent; otherwise `null`. **The checkout client needs no
  change** — it already opens whatever `documentUrl` the API returns.
- Attach-time validation on the three creates (`POST /api/property/invoices`, `POST /api/trades/quotes`,
  `POST /api/trades/invoices`): a non-empty `documentUrl` must be `/uploads/invoices/<generated-name>` **and**
  owned by the caller's merchant, else `400` and nothing is written.
- Upload routes stamp the tenant; logo delete is tenant-scoped.

**P4 — Route policy**: regenerate `server/route-policy.ts` / the inventory table for the two new routes and
rewrite the `GET /uploads/:folder/:name` rationale (it currently documents "filename unguessability" as the
access model, which this change makes false).

**Not changed, deliberately:** filename generation (extension is still client-derived — bounded by the strict
name pattern and by serving the *stored* MIME with `nosniff`; recorded as a follow-up, not folded in);
retention/deletion of orphaned documents (A-H3 is an open owner gate); any client file; the reference format
stored in `document_url` (still `/uploads/invoices/<name>` — an opaque reference from now on, not a fetchable
URL, so no data migration and legacy rows keep working).

### Sub-decisions I took at their most restrictive default — flagged for Oliver, each a one-line change

| # | Question | Default taken | Why it is safe to default |
|---|---|---|---|
| S1 | Does the platform **admin** bypass tenant scoping for invoice documents (as `checkMerchantOwnership` does elsewhere)? | **No.** Admin (`merchantId 0`) matches no tenant; the route's `!merchantId` guard — the same one every tenant-bound route uses — answers 401. | Nothing new is exposed; adding a bypass later is one branch. The options memo listed this as open and Oliver's answer did not address it. |
| S2 | Legacy documents that cannot be attributed unambiguously | Stay `NULL`, served by nothing, retained. | Fail closed; no deletion (plan: never delete retained financial data). Preflight counts them so production impact is known before apply. |
| S3 | How the tenant keeps their "View invoice" link | Checkout **token** authorizes that invoice's own document. | Preserves a shipped product feature; grants no more than the token already grants (the same page shows the amount, address, name). Strictly narrower than today (any holder of the unguessable file URL). |
| S4 | Creates that reference a foreign/external/`javascript:` `documentUrl` | Now `400`. | Was accepted verbatim and rendered to customers. Only the upload endpoint ever legitimately produced values. |
| S5 | Cross-tenant response | `404`, not `403`. | No existence oracle on document names. |

---

## 3. Reviewer pass (plan §21.1) — **author self-review, NOT independent**

The plan asks for a reviewer other than the author, or "a separately recorded independent reread". This
session did not spawn reviewers; this is the author adversarially rereading their own proposal. **An
independent second pass has not happened and is recommended before merge/production.** Findings below are
things that were wrong in the author's *first* draft of the design, now resolved in §2.

### Verification of Prior Fixes
- UPL-1/2/3/5 present in the live tree (re-read): ownership-before-multer on the logo route, magic-byte
  checks, `.png`-only logo name, `nosniff` on both `/uploads` response paths.
- Prior claim "no other route saves through `saveUploadedFile`": re-verified by grep — two call sites only.
- Prior claim "documents are linked from the invoicing UI and PDF exports": **not confirmed** (see §1).
- Baseline claims (56/1063 server, 57/511 client, `tsc` clean): reproduced this session (§6).

### Blocking Issues (author's draft → resolution)
1. A session-gated download route alone breaks the tenant's "View invoice" (sole real consumer is
   unauthenticated). → token-authorized route + resolve rewrite (P3, S3).
2. `documentUrl` on the three creates is an unvalidated string, so a tenant column alone would not stop
   merchant B attaching merchant A's document by name, nor attaching arbitrary external URLs. → attach-time
   ownership validation (P3, S4).
3. A plain upsert on `path` could overwrite/re-stamp another tenant's row. → conditional upsert that refuses
   (P2).
4. Restricting only the DB-backed branch of the public route would leave the disk-fallback branch serving
   `uploads/invoices/*` from a legacy filesystem. → allowlist applies before both branches (P3).

### High-Risk Concerns
- **Deploy order.** `drizzle` `select()` enumerates every declared column; deploying this code before `0023`
  would take the app down exactly the way `migrate.ts`'s header describes for `billing_claim_token`.
  Migration first, then code. Rollback of code after the migration is safe (extra nullable column is ignored
  by old code) but old code writes NULL-tenant rows; re-running the idempotent backfill re-attributes them.
- **MemStorage ≠ DatabaseStorage.** Jest runs on MemStorage, so the real SQL is untested by it. Mitigation:
  rehearse the full migration chain and every new `DatabaseStorage` method on a throwaway local Postgres
  through the project's own runner (`--target=local`), never the shared dev database.
- The new token route is unauthenticated: it must not become an enumeration or bandwidth amplifier — 404 for
  unknown token, per-token rate limit under its own key, stored MIME + `nosniff`, `private, no-store`.
- Legacy rows where backfill is ambiguous silently lose their tenant link. Count first (preflight); if the
  production count is non-zero that is an owner decision, not a code change.

### Missing Steps
Route-policy regeneration and rationale rewrite (P4); `migrate.test.ts` migration list;
`migration-baseline-contract.ts` requirement for the new column/index; schema test; preflight script + its
unit test; ledger and decision-record updates; handoff.

### Unsafe Assumptions
- "Old `/uploads/invoices/...` URLs are safe to 404 because nothing links them": true for server code (grep),
  but I cannot see already-delivered messages. Delivery code sends the **checkout page** link (token URL), not
  the document URL, so the deliverable a tenant holds is the token link, which keeps working.
- "Invoice-document filenames are `invoice-<ms>-<16 hex>.<ext>`": true of current code; the ext is
  client-derived, so the reference parser accepts `[a-z0-9]{1,10}` rather than a fixed set.

### Required Ordering Changes
`0023` on an isolated DB (rehearsal) → tests green → owner-approved apply to the dev DB → code deploy →
owner-run production preflight → owner-run production apply. This session does none of the last three.

### Open Product / Provider / Legal Questions
S1–S5 above; retention/deletion of unreferenced documents (A-H3); whether extension derivation from the
validated MIME should be folded into a later upload-hardening pass.

### Compliance and Data-Handling Notes
Invoice documents may contain tenant PII/financial information. This work reads no document contents:
fixtures are synthetic bytes, the preflight is count-only and never selects a path, id or content, and this
file records counts only.

### Test and Rollback Adequacy
Failing-tests-first list in §4; rollback in §5. Adequate for a local/dev change; **not** sufficient for
production without the owner-run preflight and an independent second pass.

### Final Recommendation
**Approve — author self-review only.** Scope approved: P1–P4 exactly as written; nothing that touches
client files, filename generation, retention, or any production system.

---

## 4. Failing tests written first (plan §1.3 item 2)

The first four files below were written before any implementation and captured red on the unmodified tree.
**The last two (`uploaded-files-schema.test.ts`, the preflight script's test) were written together with the
migration and script they pin and were not run red separately** — they are consistency guards, not
red-first evidence.

| File | What it pins |
|---|---|
| `server/__tests__/uploaded-file-tenancy.test.ts` | tenant stamped on upload; unscoped/foreign/NULL/invalid-tenant reads match nothing; cross-tenant overwrite refused; tenant-scoped delete (incl. a `customLogoUrl` pointing at another merchant's blob); public route serves logos only (DB **and** disk-fallback branch); `GET /api/invoice-documents/:name` owner/teammate 200, foreign = missing = 404, unauthenticated, no admin bypass, malformed names |
| `server/__tests__/invoice-document-attach-ownership.test.ts` | for all three create routes: own document accepted; absent/empty unchanged; another merchant's document, an external URL, a `javascript:` URI, a logo path, a never-uploaded name and a traversal → `400`, **and every other write the route makes (incl. the hidden prospect) untouched** |
| `server/__tests__/checkout-document-token.test.ts` | `resolve` returns the token route, never the raw path, and only for a same-merchant document; `GET /api/checkout/document/:token` (property and trades tokens): 200 unauthenticated, 404 unknown / no document / cross-tenant / logo / paid, 410 voided, own rate-limit budget; a failing document lookup hides the link but never blocks payment |
| `server/__tests__/upload-policy.test.ts` | the pure folder allowlist and reference parser (accepts only generator-shaped names; rejects external URLs, `javascript:`/`data:`, other folders, traversal, queries, fragments, whitespace, non-strings) |
| `server/__tests__/uploaded-files-schema.test.ts` | Drizzle column/FK/index and the migration declare the same thing; the migration never DELETEs/DROPs/TRUNCATEs and its two UPDATEs touch only NULL-tenant rows |
| `scripts/count-gap13-uploaded-files-attribution.test.mjs` | preflight target verification, read-only/rolled-back transaction, projects only counts, and **uses the same patterns as the migration** (fails if they drift) |

**Red run** (first four files, unmodified source): **40 failed / 24 passed** of the 64 tests that could run
(`upload-policy` cannot import its module, so it counts as a failed suite, not as tests). The failures were the
*right* ones: the unmodified code answered **`201`** for another merchant's document, an external URL and a
`javascript:` URI on all three create routes, and **`200`** for an invoice document at its old public URL;
the new storage methods were "not a function" and the new routes `404`.

Honest caveat: 24 tests passed while red. **Eleven** are intentional "unchanged behaviour" guards (own
document / no document / empty string on each of the three create routes = 9; a logo is still publicly served;
a checkout for an invoice without a document is unchanged). The other **thirteen** are *negative* tests
(foreign `404`, admin, logo-through-the-invoice-route, four malformed names; token-route `404` for unknown
token, paid ×2, no document, cross-tenant and logo) that pass *vacuously* while red because the route does not
exist yet — they cannot demonstrate "red first" on their own. Their positive siblings (owner reads own
document, token holder reads their document) fail red and prove the route was absent, and the negatives bind
once it exists.

## 5. Rollback

- **Code:** revert the working-tree change / commit. Nothing else depends on it.
- **Schema:** older code ignores the extra nullable column, so code can be rolled back with `0023` left in
  place. Older code then writes NULL-tenant rows; re-running `0023`'s NULL-only, idempotent backfill (or
  reapplying the same `UPDATE`s) re-attributes them before the new code is redeployed.
- **Reverting `0023` itself** (drop `uploaded_files_merchant_id_merchants_id_fk`,
  `uploaded_files_merchant_id_idx`, then the column) discards attribution only — never a document or a stored
  reference.
- **Constraint:** after rollback of the *code*, `/uploads/invoices/...` would serve documents publicly again
  (the behaviour being fixed). Roll back only with that in mind.

## 6. Baseline before any change (independently re-run 2026-09-19)

- `npm run check` (tsc): clean, exit 0.
- `npm run test:server`: **56 suites / 1063 tests pass.**
- `npx jest --selectProjects client`: **57 suites / 511 tests pass.**
- Both match the counts the 2026-09-16 ledger entry recorded; nothing was trusted from that entry.

## 7. Implementation record (plan §21.2 handoff)

```text
Phase / release:        R1 — gap 13 (uploads tenant authorization, Oliver's Option C)
Exact branch and commit: remediation/r1-continuation-20260907 @ 454f4120 + UNCOMMITTED working tree.
                         Nothing was committed or pushed this session.
Scope completed:        P1–P4 of §2 exactly as approved in §3. No client file changed.
Files changed:          shared/schema.ts (column + index) · server/storage.ts (IStorage, MemStorage,
                        DatabaseStorage) · server/routes.ts · server/upload-policy.ts (new) ·
                        server/route-inventory.ts (rationale) · server/route-policy.ts +
                        docs/.../R1-T2-route-inventory-table.md (regenerated: 220 registrations, 0
                        unclassified; was 218) · server/migration-baseline-contract.ts ·
                        server/__tests__/migrate.test.ts (+1 line) · 5 new server test files ·
                        migrations/0023_uploaded_files_tenant_column.sql (new) ·
                        scripts/count-gap13-uploaded-files-attribution.{mjs,test.mjs} (new) ·
                        docs/decisions/2026-09-19-gap13-uploads-option-c-implementation-defaults.md ·
                        this file · docs/HANDOFF-2026-09-14-workflows-in-flight.md (superseded banner).
Migrations:             0023_uploaded_files_tenant_column.sql,
                        sha256 1fa5d54cae9739083b3f1da51a7fff52169304f857f239286844a2791e0baafe
                        (identical to the runner's ledger checksum).
                        Applied to: (1) a THROWAWAY local PostgreSQL 16.10 cluster (rehearsal), and
                        (2) the DEVELOPMENT database (heliumdb), on the owner's explicit approval given
                        in this session — see "Development database" below. NOT to production.
Preflight (count-only):  the two sections below — synthetic fixtures on the throwaway cluster, and the real
                        dev database (read-only).
Negative/no-side-effect: §4 — every rejected create leaves the create call, the hidden prospect, the event
                        log and the delivery call untouched; foreign/missing/malformed all 404 at route
                        level. NULL-tenant rows matching no merchant is verified at STORAGE level on real
                        Postgres (MemStorage cannot create such a row), not through an HTTP route.
Provider/UAT activity:   none.
Device/browser evidence: NONE performed. No client file changed (the checkout page opens whatever
                        `documentUrl` the API returns), so the plan's phone/tablet/desktop matrix is not
                        triggered — but the tenant-facing flow is verified at HTTP level only, not in a
                        browser. Say so before anyone reads "verified" as "seen working".
Security/privacy review: author self-review only (§3). Fixtures are synthetic bytes; the preflight and this
                        file record counts only; no document content was read.
External actions:        one, on the owner's approval given in this session: `0023` applied to the
                        development database (heliumdb) through the project's runner. Nothing else. No
                        production system, secret, provider or customer was touched.
Feature flags/payment:   unchanged.
In-flight operations:    none.
Known warnings/deferred: (1) independent second review not done; (2) S1–S5 await Oliver; (3) client-derived
                        filename extension unchanged; (4) retention/deletion of orphaned documents (A-H3);
                        (5) the legacy on-disk unlink in the logo-delete route still derives its path from
                        `customLogoUrl` (server-set only; DB deletion is now tenant-scoped);
                        (6) a per-merchant upload quota is not implemented.
Rollback:                §5.
Approvals:               Oliver's Option C decision (2026-09-14). In this session, in answer to direct
                        questions: apply 0023 to the dev database — "Yes, apply it"; commit the work on
                        the branch — "Yes, two commits". S1, S2 (pending the storage answer) and S4
                        confirmed "yes"; S3 and S5 asked for an explanation and are UNCONFIRMED — see
                        the decision record's "Confirmation status".
Stop conditions checked: §18 "merchant A can read/upload for merchant B data" — closed for documents and
                        tested; target identity — every runner/preflight invocation named its target and
                        verified host + database before acting; ad-hoc `psql` touched only the loopback
                        throwaway cluster; "pending migrations" — the dev database's one pending
                        migration was this one; applied on approval and re-verified (25 applied, 0
                        pending, 0 drifted, 0 orphaned).
Next-phase prerequisites: see "What is left" below.
```

### Isolated-database rehearsal (plan §1.3 item 4) — throwaway PostgreSQL 16.10, loopback, scratch data dir

The project's own runner, `--target=local --expected-host=127.0.0.1 --expected-database=taptpay`:

1. `0000`–`0022` applied cleanly to an empty database (**24 applied**), from a temp working directory holding
   only those files, so synthetic fixtures could be loaded *before* `0023`.
2. **Fixtures** (synthetic; 2 merchants, 11 files, 8 referencing rows) covering every rule: a
   document referenced by one merchant; the same document referenced twice by the same merchant; a document
   referenced by two merchants (ambiguous); an orphan; a legacy `.jpeg`; a legacy `.jpg` logo; a logo for a
   merchant that does not exist; a logo whose id has 11 digits (must not overflow the cast); a non-logo
   path; an external URL; a reference to a file that does not exist.
3. **Preflight, before:** `files 11 (5 logos / 5 invoices / 1 other) · logos 2 attributable / 3 not ·
   invoice documents 3 attributable / 1 ambiguous / 1 orphan · referencing rows 8 (1 unrecognised, 1 dangling)
   · requiresOwnerReview true` — equal to the hand-computed expectation; counts only.
4. `--dry-run` → "Would apply 1 migration(s)"; apply → **6 statements, 21 ms; 25 applied, 0 pending,
   0 drifted, 0 orphaned.**
5. **Result, row by row:** `101.png→101`, `102.jpg→102`, doc A→101, doc B (two refs, same merchant)→102, doc
   E (`.jpeg`)→101; doc C (two merchants), orphan D, the nonexistent-merchant logo, the 11-digit logo, the
   non-merchant logo and the non-logo path all **NULL**. FK, index and `integer NULL` column as designed.
6. **Idempotency:** applying the SQL body twice more → exit 0, "already exists, skipping" notices only,
   identical `md5` of every `(path, merchant_id)`, still exactly one FK and one index.
7. **Wrong-shape refusal** (scratch copy, column dropped and re-added as `text`): the migration aborted with
   `0023 aborted: … unexpected shape (data_type=text …)` and did not reinterpret the column.
8. **The FK bites:** an insert naming a nonexistent merchant is rejected, and — on a merchant that owns *only*
   an upload — deleting the merchant is rejected by `uploaded_files_merchant_id_merchants_id_fk` specifically.
9. **The real `DatabaseStorage`, unmodified, over the Neon driver** (a 20-line WebSocket→TCP bridge in a
   scratch script — not committed — because `server/db.ts` is Neon-only), run in a clean environment:
   **18 checks passed**, including the conditional upsert refusing a cross-tenant overwrite
   (`ON CONFLICT … WHERE` false → no row → `UploadPathOwnershipError`), refusing to adopt a NULL-tenant row,
   **exactly one winner when two tenants race for one new path**, tenant-scoped delete never removing a
   NULL-tenant or foreign row, and `bytea` returning as a `Buffer`.

### Development database (`heliumdb`) — read-only first, then applied on the owner's approval

**Before (read-only):** `--status` **24 applied, 1 pending (`0023`), 0 drifted, 0 orphaned.** Count-only
preflight (read-only, `REPEATABLE READ`, rolled back, target verified), run twice: **2 stored files — 0 logos,
2 invoice documents (1 attributable, 0 ambiguous, 1 orphan); 1 referencing row (0 unrecognised, 0 dangling);
`requiresOwnerReview: false`.** Schema fingerprint
`sha256:672ed1d3ec686150fea9999bacf112c392b4ac240d87455f4182e1eb6de82604` — **identical to the digest gap 11's
C1 recorded on 2026-09-14**, i.e. no schema drift in between.

**Approval:** asked directly in this session, shown the exact effect (additive nullable column + index,
attributes exactly one document, leaves one orphan NULL, target declared), the owner answered **"Yes, apply
it"**. Recorded as its own decision file:
[2026-09-19-gap13-apply-0023-to-dev-approval](../../../decisions/2026-09-19-gap13-apply-0023-to-dev-approval.md).

**Applied:** `npm run db:migrate -- --target=workspace --expected-host=helium --expected-database=heliumdb`
→ `0023_uploaded_files_tenant_column.sql (6 statement(s), 257ms)`; `--status` **25 applied, 0 pending, 0
drifted, 0 orphaned.** No other migration was pending or applied.

**After — independently re-verified from the catalogue, not from the runner's exit code:**
`merchant_id integer NULL`; FK `uploaded_files_merchant_id_merchants_id_fk → merchants(id)`; index
`uploaded_files_merchant_id_idx` present and **valid**; the ledger checksum equals the file's sha256
(`1fa5d54c…baafe`). Attribution **counts only**: 2 files, 1 attributed, 1 NULL (the orphan) — exactly what the
preflight predicted. Schema fingerprint before → after:
`sha256:672ed1d3…` → `sha256:b93cd83a3533c17ec17067dbd061ed7d9ddab089a264a69705286c8ef180856e`; columns
497→498, constraints 111→112, foreign keys 51→52, indexes 84→85, **every other count identical** (tables 30,
sequences 26, primary keys 30, unique 9, checks 21, views/triggers/routines/policies 0).

**Storage effect (measured, sizes only — no content read):** `uploaded_files` holds **2 files / 62,735 bytes**;
the unattributed one is **9,076 bytes**. `0023` added one 4-byte integer per row and a **16,384-byte** index.
It deletes, copies and moves nothing. The only code that ever deletes an upload is the two logo routes
(`grep deleteUploadedFile`); no path deletes an invoice document.

**Read-only smoke of the new code against the real migrated column** (`DatabaseStorage`, the metadata-only
ownership query only — no document bytes read, booleans printed): the owner's merchant sees its document
(`true`); another merchant id (`false`); merchant id 0, the admin principal (`false`); the NULL-tenant row seen
by the owner (`false`). Scratch script deleted afterwards.

**Restarting the dev server is now safe.** The running server (`tsx server/index.ts`, started before these
edits, not in watch mode) still runs the *old* code, which works unchanged against the new column (it ignores
it) but writes NULL-tenant rows for uploads until it is restarted onto the new code.

### Second pass — author reread of the final diff (plan §21.1, second reviewer/pass)

Re-read `server/routes.ts`, `server/storage.ts`, `shared/schema.ts` and the migration line by line after
implementation, looking for interactions the first review missed. One real finding, fixed with a
failing-test-first: the checkout **resolve** page — the customer's *payment* page — had been made dependent
on the new uploads lookup, so any failure of it (e.g. code deployed before `0023`) would have returned `500`
and stopped payment for every invoice carrying a document. It now hides the link and logs instead. Also
confirmed: no path lets an unauthenticated caller reach `uploaded_files` except the `logos` allowlist and a
token that names the invoice whose own document it is; `getUploadedFile` (unscoped) has exactly one caller,
the public logo route. **This is still the author's reread, not an independent review.**

### What is left

1. **Oliver:** the rest of S1–S5 ([decision record](../../../decisions/2026-09-19-gap13-uploads-option-c-implementation-defaults.md),
   which records what has been confirmed so far and what is still open).
2. ~~Apply `0023` to the development database~~ — **done 2026-09-19 on the owner's approval** (above). Restart
   the dev server when convenient so uploads run on the new code.
3. **Owner-run, production:** `scripts/count-gap13-uploaded-files-attribution.mjs` first (a non-zero
   *ambiguous*, *unrecognised* or *dangling* count is an owner decision), then the same guarded invocation
   the [2026-09-10 record](../../../decisions/2026-09-10-owner-directions-and-live-migration.md) §1 uses for
   production, **before** deploying this code.
4. **An independent second review** of this diff (plan §21.1), before merge.
5. Commit (explicit paths only; never `git add -A`; exclude `.claude-home/**` and
   `.claude/settings.local.json`).
6. Follow-ups worth scheduling, not started: retention/deletion of unreferenced documents (A-H3); replace the
   client-derived filename extension with one derived from the validated MIME; a per-merchant upload quota;
   gap 12's remaining confidentiality half and gap 11 `C2`–`C5` are unchanged and still open.

## 8. Final verification, on the final source tree (2026-09-19)

Run once, sequentially, after the last source/test edit (only documentation changed afterwards):

| Command | Result |
|---|---|
| `npm run check` (tsc) | clean, exit 0 |
| `npm run test:server` | **61 suites / 1183 tests pass** (baseline 56 / 1063: +5 suites, +120 tests) |
| `npx jest --selectProjects client` | **57 suites / 511 tests pass** (unchanged — no client file changed) |
| `node --test` on the gap-13 preflight, gap-11 preflight, schema-fingerprint and postgres-verifier-safety tests | **51 / 51 pass** |
| route policy | generated earlier (`npx tsx scripts/generate-route-policy.ts`): 220 registrations, 0 unclassified; the 1 suspected-gap route is the pre-existing gap-12 SSE branch. The generator was **not** re-run in the final pass — `route-policy-inventory.test.ts`, inside the server run above, is what confirms the checked-in policy still matches `routes.ts` |

One process note for whoever audits this: an earlier full run showed `tsc` failing on a type error in
`uploaded-files-schema.test.ts` (jest, under `isolatedModules`, does not type-check, so the test itself
passed). It was fixed and `tsc` re-run clean before this final run; the earlier failure is not hidden by
this table.
