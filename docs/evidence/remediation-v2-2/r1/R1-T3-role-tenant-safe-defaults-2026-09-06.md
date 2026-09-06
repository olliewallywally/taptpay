# R1-T3 — explicit role and tenant matrix: safe-default fixes — 2026-09-06

Branch: `remediation/r1-foundation`. This covers the plan's six explicitly
named "safe default" decisions in R1-T3. It does **not** cover an
authoritative per-route classification of all 218 inventoried routes, or the
client route-guard tests — see "Still open" below; recording that honestly
rather than claiming the full task is done.

## Found and fixed (failing test first on each)

Four routes checked only tenant membership (`req.user.merchantId === merchantId`,
via `checkMerchantOwnership` or an inline equivalent), letting any teammate —
not just the account owner — perform an owner-only action:

| Route | Was | Now |
|---|---|---|
| `PUT /api/merchants/:id/theme` | `checkMerchantOwnership` (any role) | `checkAccountOwnership` (owner/admin) |
| `PUT /api/merchants/:id/daily-goal` | inline tenant-only check | `checkAccountOwnership` |
| `POST /api/merchants/:id/logo` | inline tenant-only check | `checkAccountOwnership` |
| `DELETE /api/merchants/:id/logo` | inline tenant-only check | `checkAccountOwnership` |
| `POST /api/transactions/:transactionId/refunds` | tenant-only (no role check at all) | `isAccountOwner(req.user)`, placed after the capability gate per this plan's own documented middleware order (authenticate → parse → capability → role/tenant) |

Payout configuration has no route — already removed per the 2026-08-06
deviation ruling in `docs/HANDOFF-2026-07-28-tablet-desktop-app.md` §6
("bank details are Windcave's"); nothing to gate.

Each was proven red first: a fresh member principal (via the R1-T1 harness)
hit the route and got 200 (or, for refunds, cleared straight to the
tenant-ownership check) before the fix, then 403 after.

### Two unrelated bugs found and fixed along the way (not the point of T3, but blocking its own tests)

1. **`MemStorage.clearAllMerchants()` only cleared `merchants`/`transactions`**,
   leaving `users`, `subscriptions` and every lock map live. `currentMerchantId`
   resets to 1 on every call, so a "fresh" merchant in a later test can reuse
   an id whose stale team/subscription state is still sitting in those
   uncleared maps — surfaced here as a phantom `seat-limit` error on a
   brand-new merchant. Now mirrors the constructor field-for-field. This is a
   test-support fix with no production code path affected (`clearAllMerchants`
   has no caller outside tests).
2. **The logo-upload route's ownership-rejection branch called
   `fs.unlinkSync(req.file.path)`**, but `logoUpload` is `multer.memoryStorage()`
   (see the route's own comment: files are never written to disk). `req.file.path`
   is always `undefined` there, so the call threw and turned every rejection
   of that branch into a `500` instead of the intended `403` — true for a
   cross-tenant caller today, not only for the member case this task added.
   Removed the dead unlink call.

## Verified already correct (added a runtime test, no code change)

- **Admin routes require the validated `authenticateAdmin` principal.** Every
  `/api/admin/*` route (28 of them) already uses it consistently — grepped
  the full list, only `/api/admin/auth/login` (the login route itself) is
  unauthenticated, correctly. Added a test proving a hand-signed JWT with
  `role: "admin"` but the wrong email is rejected (`generateToken` itself
  refuses to mint that combination — proving the server independently
  re-validates, not just that the client-side helper is careful), and that a
  genuine merchant-owner token is rejected on an admin route.
- **Password change never trusts the path merchant id.** `PUT
  /api/merchants/:id/change-password` parses `:id` but never uses it — it
  reads and writes only `req.user.userId`'s own row. Added a test proving
  owner A can call the route with owner B's id in the path and only A's
  password changes; B's is untouched. (The plan offered "move to
  /api/account/password" as an alternative; not done — the current shape is
  already safe by never consulting the path id, and renaming the route is a
  URL-contract change with its own client-coordination cost that a pure
  security fix doesn't need.)

## Verification

- Each fix proven red-then-green individually (see `server/__tests__/route-policy-role-defaults.test.ts`,
  8 tests).
- `npm run check`: pass.
- `npx jest --selectProjects server --runInBand`: 33 suites / 427 tests pass
  (was 32/419 — 8 new tests here).
- `npx jest --selectProjects client`: 52 suites / 486 tests pass (unchanged).
- `npm run build`: pass.

## Still open for R1-T3

- **97 of 218 routes remain "unclassified"** in `route-policy.ts` (no known
  gate marker detected) — R1-T2's evidence already flagged this as T3's job.
  Only the six explicitly named decisions above were read and fixed; the
  rest were not individually audited for role/tenant correctness in this
  pass. The theme/daily-goal/logo/refund pattern found here (tenant-only
  check where an owner-only check was warranted) is exactly the shape a full
  read of the other 97 could still surface elsewhere — most plausibly among
  the ~40 other `/api/merchants/:id/*` and settings-shaped routes that share
  the same handler style.
- **Client route guards** (`/terminal`, `/stack`, `/smart-terminal`,
  `/property/*`, `/trades/*`, `/admin/*` — unauthenticated/member/owner/
  other-tenant/admin × phone/tablet/desktop) are not built. This is a
  distinct, client-side test surface from everything above.
- Per-API-row runtime tests for the full 218-route inventory (the plan's
  literal T3 check) are not attempted at that scale in this pass — flagging
  per rule 8 rather than claiming a shortcut satisfies it.

T4/T5/T8/T10 remain blocked on R1-H1 owner acceptance.
