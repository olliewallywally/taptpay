# Independent review brief — gap 13 (uploads tenant authorization)

You are the **independent reviewer** the remediation plan requires (plan §21.1) for one change set. The author
(Claude) reviewed it themselves and says so; that is *not* independent. Your job is to try to break it, not
to confirm it.

## 1. The marker — exactly what to review

| | |
|---|---|
| Branch | `remediation/r1-continuation-20260907` |
| **Base (before the work)** | `454f4120` |
| **Code tip (review up to here)** | `b0da2f08` |
| Code commits | `94f24635` (the Option C implementation) · `b0da2f08` (S1: admin may read merchant documents) |
| Documentation commits | `f2bc0015` and the commit that adds this brief — **documentation only, not under review** |
| Tag (convenience) | `review/gap13-uploads-2026-09-19` → the tip that contains this file |
| In-code marker | every changed block carries a comment containing `Gap 13` (routes, storage, schema, migration) or `S1` (admin path) — `grep -rn "Gap 13\|S1 (" server shared migrations` |

**The whole code change** (16 files, ~2,045 insertions) is:

```
git diff 454f4120..b0da2f08 -- server shared migrations scripts
```

Nothing under `client/` changed. Ignore everything under `docs/` except this file and (for context)
`docs/evidence/remediation-v2-2/r1/R1-T7-gap13-uploads-tenant-authorization-2026-09-19.md` and
`docs/decisions/2026-09-19-gap13-*.md` — those are the author's claims; **verify them, don't trust them.**

If you cannot read the repository, ask the human to paste that `git diff` output (and the migration file).

## 2. Prompt to give the reviewer (paste-ready)

> You are the independent security and correctness reviewer for TaptPay, a payment-terminal SaaS. Review ONE
> change set, the "gap 13 — uploads tenant authorization" work, on branch `remediation/r1-continuation-20260907`:
> base `454f4120`, code tip `b0da2f08` (tag `review/gap13-uploads-2026-09-19`), code paths only
> (`server shared migrations scripts`). Start by reading
> `docs/evidence/remediation-v2-2/r1/R1-T7-gap13-INDEPENDENT-REVIEW-BRIEF-2026-09-19.md` at that tag: it says
> what changed, what the owner already decided, where to attack, how to verify, and the exact output format.
> Rules: do not trust the author's evidence — re-derive every claim from the code; label anything you cannot
> verify UNVERIFIED rather than assuming; no feature suggestions; cite `file:line` for every finding and, for
> each Blocking issue, give a concrete failing request or test. Return EXACTLY the ten headings in section 8 of
> the brief and end with Approve / Do not approve naming the commit range you approve.

## 3. What the change does (one minute)

**Problem.** `uploaded_files` had no tenant column, and `GET /uploads/:folder/:name` served any row with no
authentication — including tenants' invoice documents, protected only by an unguessable filename. Also, the
three create routes (`POST /api/property/invoices`, `POST /api/trades/quotes`, `POST /api/trades/invoices`)
accepted *any string* as `documentUrl`, which the public checkout page then opened for the customer.

**Owner decision (Oliver, 2026-09-14): "Option C"** — a tenant column plus an authenticated, ownership-checked
download route for invoice documents; logos stay public.

**What now happens**

| Route | Caller | Result |
|---|---|---|
| `GET /uploads/:folder/:name` | anyone | serves the `logos` folder **only** (checked before the DB *or* the disk fallback); everything else 404 |
| `GET /api/invoice-documents/:name` | merchant owner / teammate | only their own merchant's documents; foreign, missing, unattributed or malformed name → identical 404; no login → 401 |
| same | **validated platform admin** (S1) | any invoice document by name, **including unattributed ones**; each read is written to the security audit log |
| `GET /api/checkout/document/:token` | anyone holding an invoice's checkout token | only *that invoice's* document, and only if the file belongs to the invoice's merchant; unknown token 404, voided 410, paid 404; own rate-limit key (10/min/token) |
| `GET /api/checkout/resolve/:token` | token holder | `documentUrl` is now the token route (or `null` if the document is invalid/foreign/absent); a failing document lookup hides the link but never fails the payment page |
| the three create routes | merchant | a non-empty `documentUrl` must be `/uploads/invoices/<generated-name>` **and** owned by the caller, else `400` with nothing written (incl. the hidden prospect the trades routes create) |
| `POST /api/property/invoices/document`, logo routes | merchant | uploads are stamped with the merchant; the storage layer refuses to overwrite another tenant's row; logo delete is tenant-scoped |

**Migration `0023`** adds nullable `uploaded_files.merchant_id` (plain FK, index) and backfills *only where
deterministic*: logos from their own path; invoice documents from the `document_url` references of
`invoices_rent_requests`/`quotes`/`job_invoices` when every referencing row is one merchant. Ambiguous or
orphaned rows stay `NULL` = served by no tenant-scoped route; nothing is deleted.

## 4. Already decided by the owner — do not re-litigate, but DO flag any risk a decision creates

- **S1** the platform admin may open merchants' invoice documents (owner's words: "i want to see merchant
  documents"). *The author first defaulted to the opposite and was corrected.*
- **S2** unattributable legacy documents stay `NULL`, unserved, retained (no deletion).
- **S3** the tenant's "View invoice" link is authorized by the invoice's checkout token.
- **S4** a create route rejects a `documentUrl` that is not the caller's own upload (`400`).
- **S5** cross-tenant/missing/malformed → `404`, not `403`.
- Out of scope by design: filename generation (extension is still client-derived), retention/deletion of
  orphans, a per-merchant upload quota, any client file, an admin *screen* for browsing documents.

## 5. Where to attack (the author's least-certain areas)

1. **The unauthenticated token route** `GET /api/checkout/document/:token` (`server/routes.ts`). Can a token
   holder reach any document other than their own invoice's? Cross-vertical (property vs trades) handling via
   `getCheckoutInvoiceByToken`; status guards; the rate limiter is the existing **in-memory, per-process**
   `tokenRateLimit` (not shared across instances) — is that acceptable here?
2. **The public route** `GET /uploads/:folder/:name`: the `PUBLIC_UPLOAD_FOLDERS` allowlist runs before the DB
   and the disk fallback; look for encoded-slash, `..`, case, trailing-dot and Unicode tricks around
   `isPublicUploadFolder` and `name.includes('..')`.
3. **The admin path (S1)** in `GET /api/invoice-documents/:name`. `isValidatedPlatformAdmin()` deliberately
   duplicates `authenticateAdmin`'s predicate (the middleware's exact shape is pinned by a source guard in
   `subscription-route-security.test.ts`, so it was left byte-identical); a tripwire test compares the two —
   is that arrangement sound? Is the audit event (`ADMIN_INVOICE_DOCUMENT_READ`, via the file-based
   `logSecurityEvent`) adequate, given that file lives on the server filesystem? Does the admin gain any reach
   beyond `invoices/<generated-name>`?
4. **Attach-time validation** `requireOwnedInvoiceDocument` + `parseInvoiceDocumentRef` (`server/upload-policy.ts`):
   can a `documentUrl` that is not the caller's own upload still get through (encoding, case, whitespace,
   query/fragment, the accepted `[a-z0-9]{1,10}` extension)? Is it checked *before* every side effect on all
   three routes? Are there other places that write `document_url` that the author missed
   (`grep -rn "documentUrl\|document_url" server shared`)?
5. **Storage** (`server/storage.ts`, both `MemStorage` and `DatabaseStorage`): the conditional upsert
   (`onConflictDoUpdate … setWhere` + `.returning()`) that must refuse a cross-tenant overwrite *and* refuse to
   adopt a `NULL`-tenant row; `isTenantId`; tenant-scoped delete; `getUploadedFile` is **unscoped** and now has
   exactly two authorized callers. Do the two implementations have the same semantics?
6. **Migration `0023`**: idempotency, the backfill regexes (digit cap of 9, `[a-z0-9]{1,10}` vs logos'
   `[A-Za-z0-9]{1,10}`), the `count(DISTINCT …) = 1 AND count(*) = (subquery)` ambiguity rule, the wrong-shape
   refusal, locks/timeouts under the runner's single transaction, and that a plain FK (`NO ACTION`) means a
   merchant that still owns uploads cannot be hard-deleted (`DatabaseStorage.deleteMerchant` returns false).
7. **Deploy order and rollback**: code without the column fails on the first `uploaded_files` query; only the
   checkout *resolve* page is protected. Rolling code back after the migration makes older code write
   `NULL`-tenant rows, after which a logo re-upload by that merchant would throw `UploadPathOwnershipError`.
8. **Information disclosure**: 404 vs 403 uniformity, response headers (`Cache-Control: private, no-store`,
   `nosniff`, stored MIME, no `Content-Disposition`), what is logged (document *name* only), the
   client-supplied `documentName` returned to tenants.
9. **The tests themselves**: everything runs on `MemStorage`. Which single-line mutations of the production
   code would *not* be caught? The author's mutation check covered only the admin-predicate tripwire. Thirteen
   negative tests passed vacuously while the routes did not exist (documented in the evidence) — do the
   negatives bind now?
10. **Route policy**: `GET /api/invoice-documents/:name` is classified `merchant-user` although it also admits
    the admin (same convention as routes using `checkMerchantOwnership`); the checkout route is `public`.

## 6. How to verify independently

```bash
git checkout review/gap13-uploads-2026-09-19        # or: git checkout b0da2f08 for the code tip
npm ci                                              # if node_modules is absent
npm run check                                       # tsc — expect clean
npm run test:server                                 # expect 61 suites / 1189 tests
npx jest --selectProjects client                    # expect 57 suites / 511 tests (no client change)
node --test scripts/count-gap13-uploaded-files-attribution.test.mjs \
            scripts/count-gap11-session-replay-duplicates.test.mjs \
            scripts/schema-fingerprint.test.mjs scripts/postgres-verifier-safety.test.mjs   # expect 51 pass
```

To see the new tests fail on the old code (the "red" the author claims), check the *test* files out on top of
the base commit's source:

```bash
git checkout 454f4120 -- server/routes.ts server/storage.ts shared/schema.ts \
  server/route-inventory.ts server/route-policy.ts server/migration-baseline-contract.ts
npx jest --selectProjects server --runInBand server/__tests__/uploaded-file-tenancy.test.ts \
  server/__tests__/invoice-document-attach-ownership.test.ts \
  server/__tests__/checkout-document-token.test.ts      # the author saw 46 failed / 25 passed of 71
git checkout b0da2f08 -- server shared                 # restore
```

(`server/__tests__/upload-policy.test.ts` is deliberately not in that list: `server/upload-policy.ts` is a
*new* file, so it is not removed by the checkout above and that test passes either way. The author's own
red run was on a tree where that module did not exist yet, so it failed at import.)

**Not reproducible from the repo alone (treat as claims):** the migration was rehearsed on a throwaway
PostgreSQL 16 through the project runner (`npx tsx server/migrate.ts --target=local --expected-host=127.0.0.1
--expected-port=<p> --expected-database=<db>`, which needs a URL with a user *and* password) using synthetic
fixtures, and the real `DatabaseStorage` was exercised against it (18 checks) via a scratch script that is
**not committed**; the migration was then applied to the development database. Results are in §7 of the
author's evidence file. Anything about real-Postgres behaviour you cannot check yourself: mark **UNVERIFIED**.

## 7. What the author did NOT verify

No browser check of the checkout "View invoice" link (server-level only); nothing about production; the
admin route was tested on `MemStorage`, not against Postgres (its storage call is the same unscoped
`getUploadedFile` exercised on real Postgres, including a `NULL`-tenant row); no independent review before
you; no load or multi-instance testing.

## 8. Output format — return exactly this (plan §21.1)

```text
## Verification of Prior Fixes
## Blocking Issues
## High-Risk Concerns
## Missing Steps
## Unsafe Assumptions
## Required Ordering Changes
## Open Product / Provider / Legal Questions
## Compliance and Data-Handling Notes
## Test and Rollback Adequacy
## Final Recommendation (Approve / Do not approve)
```

Rules for the output: every finding cites `file:line`; every Blocking issue includes a concrete failing
request or test; an **Approve** must state the exact commit range approved and cite evidence for each area in
section 5; "Approve with unresolved blockers" is not approval. Severity words: *Blocking* = merge must wait;
*High-risk* = fix or explicitly accept before production.
