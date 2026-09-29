# R1-T7 — uploaded files behind storage; T6 duplicate-utility fix — 2026-09-06

Branch: `remediation/r1-foundation`. This is one slice of T7 (the plan's
"biggest tenant gap" task, scoped to transactions/refunds/boards/stock/
property/trades/settings/uploads/exports in full) — the named `uploadedFiles`
bypass, plus a broader authenticated-route audit that found no new gaps. Not
the full T7 surface; see "Still open."

## Self-correction: consolidated a duplicate strict-parser utility

While wiring `saveUploadedFile` through `storage`, found `server/http-params.ts`
already existed with `strictPositiveIntegerParam` — added by R0-T4
(`93cd300c`, 2026-09-02) for the cross-tenant-clearing fix, used at
`/api/merchants/:id/clear-transactions`. R1-T6's own `server/strict-params.ts`
duplicated this exact logic under a different name, in violation of the
plan's own rule 2 ("never invent a convention — find an existing example and
copy it"). Fixed by:

- Extending `http-params.ts` with `strictPositiveIntegerQueryParam` and
  `strictUuidParam` (batches 3/5 need UUID parsing — property/trades use
  `uuid` primary keys, confirmed against `shared/schema.ts`).
- Renaming all 39 T6-batch-1 call sites from `parsePositiveIntParam` to
  `strictPositiveIntegerParam` and deleting the redundant `./strict-params`
  import.
- Deleting `server/strict-params.ts`; merging its 28 unit tests into a new
  `server/__tests__/http-params.test.ts` against the real (consolidated)
  module. `server/__tests__/r0-t4.test.ts`'s existing narrower check of the
  same function is untouched — it asserts the route uses this parser, not an
  exhaustive rejection-class test, so it is not redundant with the new file.

Net effect on the codebase: identical to what T6 batch 1 already shipped,
now on the one real utility instead of two. Full suite re-verified after
(see below) — no regression.

## Broader authenticated-route scan (part of T7's "audit every authenticated registration")

Extended R1-T2's marker-based scan: of 145 `authenticateToken`/`authenticateAdmin`-gated
registrations, 80 have a `:param` in their path. Of those, 7 showed no
ownership-check marker of any kind — checked each by hand:

| Route | Verdict |
|---|---|
| `PATCH /api/tutorial/pages/:pageKey` | Safe — `:pageKey` is a tutorial page identifier, not a tenant id; the handler scopes entirely off `req.user.merchantId`, never the path. |
| `PUT /api/merchants/:id/rates` | Safe — tombstoned, returns 410 unconditionally, touches no data. |
| `PUT /api/merchants/:id/change-password` | Safe — confirmed already in R1-T3; ignores `:id` entirely. |
| `PUT /api/merchants/:id/bank-account` | Safe — tombstoned, returns 410 unconditionally. |
| `GET /api/merchants/:merchantId/refunds` | Safe — false positive; checks `userMerchantId !== merchantId` (no leading dot, so missed by the `.merchantId !==` marker pattern). |
| `DELETE /api/team/:userId/invite` | Safe — scopes the storage call to `req.user.merchantId` (the caller's own), and `storage.revokeTeamInvite`/`setTeamMemberStatus` verify the target row belongs to that merchant internally — exactly the "prefer a tenant-scoped storage method" pattern T7 asks for elsewhere. |
| `PUT /api/team/:userId/status` | Same as above — safe. |

No new cross-tenant gap found beyond what R1-T3 already fixed. Recorded as
evidence the T3 fixes were the main instances of this specific shape on this
SHA, not proof the remaining ~138 authenticated registrations are clean —
see "Still open."

## Uploaded files moved behind `IStorage`

Three sites in `server/routes.ts` queried the `uploaded_files` table directly
via the raw `db` import (bypassing `storage`, per the plan's own named list):
`saveUploadedFile`'s insert, the logo-upload failure-cleanup delete, and the
public `/uploads/:folder/:name` serve route's select. `db` is always `null`
in MemStorage/no-database mode (`server/db.ts`) — this is *why* R1-T3's logo
tests could only assert "not 403" instead of a real 200, and why the owner's
own logo upload silently 500s in dev without a live Postgres connection.

Added `IStorage.saveUploadedFile` / `getUploadedFile` / `deleteUploadedFile`
(three edits per P2 convention 1): `MemStorage` gets a real
`Map<path, {mimeType, data}>` — not a stub that throws, since a blob map is
a perfectly adequate in-memory equivalent, unlike a genuinely
Postgres-specific feature — folded into the R1-T1 `clearAllMerchants()` full
reset; `DatabaseStorage` wraps the original `db.insert/select/delete` calls
unchanged, using the class's existing `getDb()`-then-null-check pattern
(safer than the module-level `db` import routes.ts used, which assumes a
non-null connection). All three `routes.ts` call sites now go through
`storage.*`. `db`, `uploadedFiles` and `eq` are no longer imported by
`routes.ts` at all — it makes zero direct SQL calls now.

### A second, related bug found and fixed

`DELETE /api/merchants/:id/logo` never removed the actual blob — it only
tried an `fs.unlinkSync` against a legacy disk path (always a no-op for any
logo uploaded through the current DB-backed `POST /logo`, which never writes
to disk) and cleared the merchant's `customLogoUrl` pointer. The blob stayed
in storage, orphaned but still served forever at its old public URL. Proven
red (delete then re-fetch the old URL: got `200`, not `404`) before adding
the missing `storage.deleteUploadedFile(relPath)` call.

## Verification

- `server/__tests__/uploaded-file-storage.test.ts` (new, 3 tests): upload
  then fetch back through the real public route; delete then confirm the
  public route 404s (proven red before the delete-route fix); 404 for a
  path never uploaded.
- `server/__tests__/route-policy-role-defaults.test.ts`'s logo-upload test
  updated — it documented a `not.toBe(403)` workaround for the 500 this
  task fixes; now asserts a real `200`, matching current behaviour.
- `npm run check`: pass.
- `npx jest --selectProjects server --runInBand`: 36 suites / 468 tests pass
  (was 35/465 — net +3 from the new upload test, with http-params.test.ts's
  28 tests replacing strict-params.test.ts's 28 one-for-one).
- `npx jest --selectProjects client`: 52 suites / 486 tests pass (unchanged).
- `npm run build`: pass.

## Still open for R1-T7

This slice covered the named `uploadedFiles` bypass and one broad
authenticated-route scan. Not done, per the plan's full T7 scope:

- Tenant-scoped storage methods for transactions, refunds, boards, stock,
  property clients/invoices, trades clients/quotes/invoices, settings,
  exports (the `uploadedFiles` fix covers uploads specifically).
- Upload hardening beyond storage-abstraction: non-guessable object keys,
  quarantine/malware checks, magic-byte vs. declared-MIME validation beyond
  the existing PNG check, signed tenant-bound download authorization,
  retention/orphan-cleanup policy. `uploaded_files` has no `merchantId`
  column at all — tenant scoping today is entirely by construction (paths
  embed the merchant id, e.g. `logos/merchant-5.png`) rather than a real
  per-row check; adding a real column is a schema change with its own ADR,
  not attempted here.
- Two-merchant cross-tenant runtime tests across the full authenticated
  route set (145 registrations) — only the 7 marker-less candidates above
  were individually checked; the other ~138 were not re-audited beyond
  R1-T2's heuristic classification and R1-T3's named fixes.

R1-T6 batches 2–7 (36+31+28+21+32+20 remaining sites) are independent of
this and still open. T4/T5/T8/T10 remain blocked on R1-H1 owner acceptance.
