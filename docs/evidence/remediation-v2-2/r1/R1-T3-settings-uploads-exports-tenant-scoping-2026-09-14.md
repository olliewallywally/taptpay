# R1-T3 — tenant-scoping and upload-security gaps in Settings, Uploads & Exports: five fixes landed, one escalated

Date: 2026-09-14. Branch: `remediation/r1-continuation-20260907`.

This is the fifth and final R1-T3 tenant-scoping domain. The other four
(Transactions & Refunds, Boards & Stock, Property, Trades) were each
investigated with no gap found — see their sibling evidence files in this
directory. This domain differs: it found and fixed three real gaps, closed
two test-coverage gaps, and escalates one structural gap rather than fixing
it same-day.

## Continuity note on how this evidence file came to exist

A prior session in this branch launched a background Workflow
(`r1-t3-settings-uploads-exports`, task `wo8x9rcxj`, run `wf_8e0b21e5-16e`)
to investigate this domain with the established plan → reviewer-panel →
implement → skeptic-verify → writeup pipeline the four sibling domains used,
then hit its usage limit mid-session and committed an emergency checkpoint
(`a1cca2c5`) with a handoff document
(`docs/HANDOFF-2026-09-14-session-checkpoint.md`) describing the workflow as
still in progress. **That workflow's task/run IDs are not resolvable in this
session's environment** (`TaskOutput` returns "No task found"; the journal
path the handoff cited does not exist under this session's project
directory) — background Workflow state does not survive a session boundary,
consistent with the note the sibling Trades investigation's own resume-point
record already made about background Workflow runs generally.

Because the workflow's own state is unrecoverable, this session independently
re-verified ground truth by reading the actual committed diff in `a1cca2c5`
rather than trusting the handoff document's own summary of what it had
produced — **and found the handoff document itself was stale/incomplete on
this point**: it described only UPL-1 as landed and UPL-2/UPL-5 as still
pending, but the commit's actual `server/routes.ts` diff shows all three
were implemented and committed. This discrepancy is recorded here as a
finding about session-handoff hygiene, not acted on further (the code is
correct; the description of it was momentarily wrong and this file
supersedes that description).

## Domain inventory

Routes covering Settings (merchant profile/config), Uploads (logo,
invoice-document), and Exports (CSV/PDF/analytics), read live in
`server/routes.ts` at HEAD before this session's changes:

| # | Route | Guard | Prior test coverage |
|---|---|---|---|
| 1 | `PUT /api/merchants/:id/theme` | `checkAccountOwnership`/role default | Yes (pre-existing) |
| 2 | `PUT /api/merchants/:id/daily-goal` | `checkAccountOwnership` | Yes (pre-existing) |
| 3 | `POST/DELETE /api/merchants/:id/logo` | `checkAccountOwnership` | Yes (pre-existing + this session) |
| 4 | `PUT /api/merchants/:id/change-password` | `checkMerchantOwnership` | Yes (pre-existing) |
| 5 | `PUT /api/merchants/:id/details` | `checkAccountOwnership` | **None → added this session (UPL-6)** |
| 6 | `PUT /api/merchants/:id/business-details` | `checkAccountOwnership` | **None → added this session (UPL-6)** |
| 7 | `PUT /api/merchants/:id` (general) | `checkAccountOwnership` | **None → added this session (UPL-6)** |
| 8 | `PUT /api/merchants/:merchantId/sector` | `checkMerchantOwnership` | **None → added this session (UPL-6)** |
| 9 | `GET /api/merchants/:id/analytics/export` | `checkMerchantOwnership`, merchant-scoped query | **None → added this session (UPL-7)** |
| 10 | `GET /api/merchants/:id/export/csv` | `checkMerchantOwnership`, merchant-scoped query | **None → added this session (UPL-7)** |
| 11 | `GET /api/merchants/:id/export/pdf` | `checkMerchantOwnership`, merchant-scoped query | **None → added this session (UPL-7)** |
| 12 | `POST /api/property/invoices/document` | `authenticateToken` only, no path merchantId (scoped to caller's own session; not associated with a tenant until referenced later by `POST /api/property/invoices`, which itself checks `checkMerchantOwnership`) | N/A — no IDOR surface, nothing to add |
| 13 | `GET /uploads/:folder/:name` | **None (intentionally public — logos are customer-facing)** | See UPL-3/finding-3 below |

All of 1–11 already had the correct guard *before* this session (routes
5–11 were simply missing a committed regression test proving it, following
the exact pattern change-password already established) — this domain's real
findings are UPL-1, UPL-2, UPL-5 (upload-handling bugs, not tenant-scoping
compares) and finding candidate 3 (the download route's lack of any
authorization at all, which is a different class of gap than the other four
domains' IDOR question).

## Fixes landed

**UPL-1** (routes.ts, `requireLogoOwnership` middleware) — `POST
/api/merchants/:id/logo` ran `logoUpload.single('logo')` (multer,
memory-buffered) *before* `checkAccountOwnership`, violating the plan's
explicit "must not accept... a file before merchant ownership is known"
rule. Fixed by adding ownership-check middleware ahead of multer in the
route chain; the handler's own inline re-check stays as defense in depth.
Committed in `a1cca2c5`.

**UPL-2** (routes.ts, `INVOICE_DOC_MAGIC_CHECK`) — the invoice-document
upload only checked the client-supplied `Content-Type`, never the actual
bytes, unlike the logo route's existing PNG magic-byte check. Added real
signature checks for pdf/png/jpeg/webp; HEIC stays mimetype-only
(documented narrower interim scope — its box-based `ftyp` signature is
meaningfully fiddlier to parse correctly than a fixed byte prefix).
Committed in `a1cca2c5`.

**UPL-5** (routes.ts, logo filename) — the logo route derived its stored
filename's extension from the client-supplied original filename despite
always storing PNG bytes under `image/png`; a re-upload under a different
original name silently orphaned the previous blob (old path stays servable
forever, unreferenced by the merchant's `customLogoUrl`). Hardcoded to
`.png`, since the route already only accepts PNG bytes (verified by the
existing magic-byte check). Committed in `a1cca2c5`.

**UPL-3** (routes.ts, `X-Content-Type-Options: nosniff` — this session,
`server/routes.ts:7003`) — `GET /uploads/:folder/:name` sent no `nosniff`
header on either its DB-backed or disk-fallback response path. Without it,
a browser sniffing an uploaded file's bytes as `text/html` could execute
embedded script if the file were ever framed/loaded as a page. This is a
narrow, schema-free mitigation with no product decision — it does **not**
add authorization, and is not a fix for finding candidate 3 below, only a
content-type-confusion closure that is safe and correct regardless of how
that larger question is eventually resolved. Regression test:
`server/__tests__/uploaded-file-storage.test.ts` ("the public /uploads
route sends X-Content-Type-Options: nosniff").

**UPL-6 / UPL-7** (test-only, no source change — this session,
`server/__tests__/route-policy-role-defaults.test.ts`) — routes 5–8
(details/business-details/general-PUT/sector) and 9–11
(analytics-export/export-csv/export-pdf) already enforced the correct
ownership guard, independently re-confirmed by reading each handler live
before writing a single test, but had no committed cross-tenant regression
test even though sibling routes in the same file (theme, daily-goal, logo,
change-password) already did. Seven new tests added, each following the
established cross-tenant-attack-then-legitimate-owner-succeeds pattern; no
source line changed for any of them.

## Finding candidate 3 (escalated, not fixed): `uploaded_files` has no tenant column

Independently re-verified live at `shared/schema.ts:1476-1482`:

```ts
export const uploadedFiles = pgTable("uploaded_files", {
  id: serial("id").primaryKey(),
  path: text("path").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

No merchant/tenant column exists. `GET /uploads/:folder/:name`
(`server/routes.ts:7003`) is fully unauthenticated — no `authenticateToken`,
no ownership check of any kind — by path lookup only. Today this serves two
materially different kinds of content under one policy:

- **Logos** (`logos/merchant-<id>.png`) — a deterministic, enumerable path
  by design (unchanged by this session; it was already `merchant-<id>` pre-
  UPL-5, UPL-5 only fixed the extension). This is very likely *fine* as
  public — logos are merchant branding shown to customers on hosted
  checkout pages, so "public" is plausibly the intended policy, not a gap.
- **Property invoice documents** (`invoices/invoice-<timestamp>-<hex>.<ext>`)
  — filenames are unguessable (timestamp + 8 random bytes), so today's
  protection is filename secrecy (a bearer-capability-style URL), not
  authorization. These can carry real tenant financial information. There
  is no way to revoke access to a leaked URL, no expiry, and no audit trail
  of who fetched what.

This directly conflicts with the plan's uploads security requirements
(tenant-bound short-lived download auth, no public storage-key exposure).
**This is a product/schema decision, not a same-day fix** — narrowing it
requires deciding whether logos and invoice documents should have different
access policies, and if invoice documents need auth, adding a tenant column
and a short-lived signed-URL or session-gated download scheme is schema
work with migration and client implications (documents are currently linked
to directly by URL from the property invoicing UI and PDF exports).
Escalated as its own decision memo:
[`docs/decisions/2026-09-14-uploads-tenant-authorization-escalation.md`](../../decisions/2026-09-14-uploads-tenant-authorization-escalation.md).

## Minor observation, not acted on (out of this domain's scope)

`server/route-policy.ts:225` classifies `GET /uploads/:folder/:name` as
`principal: "public"` (correct) but with marker
`["getCheckoutInvoiceByToken("]` — a string that has nothing to do with this
route's actual guard logic, almost certainly a classifier scan artifact from
a nearby unrelated route. This is an R1-T2 (route-policy classifier)
correctness question, not an R1-T3 tenant-scoping one; flagged for whoever
next touches the classifier, not fixed here.

## Verification

- `npm run check` (tsc): clean, no output.
- `npm run test:server` (`jest --selectProjects server --runInBand`): **55
  suites / 1046 tests pass** (prior committed baseline in `a1cca2c5` was on
  its way to 55/1046 already given UPL-1/2/5 plus their tests; this session
  added the nosniff test, UPL-6's 4 tests, and UPL-7's 3 tests — 8 new tests
  total, all passing on first run after the source changes above).
- `git status` after this pass showed no unexpected files beyond the ones
  listed in this session's commits.

## What was deliberately not done, and why

- **No `IStorage` tenant-scoped method added for uploads.** There is no
  compare to scope — the gap is "no compare exists at all" for the download
  route, not "an unscoped global-fetch-then-compare," so the §8.5 idiom
  (`getXForMerchant`) doesn't directly apply until the schema/product
  decision above is made.
- **No schema migration.** Adding a `merchantId`/tenant column to
  `uploaded_files` is exactly the kind of change the escalation memo asks
  Oliver to weigh in on before it's built, given the client and API-shape
  implications.
- **HEIC magic-byte check left as mimetype-only** (UPL-2's documented
  narrower interim scope) — unchanged this session, still open as a small
  low-risk follow-up if HEIC uploads become higher-value to harden.
- **The route-policy classifier artifact above** — not this task's scope.
