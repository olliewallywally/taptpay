# R1-T6 — `/api/admin/*` identifiers — 2026-09-06

Branch: `remediation/r1-foundation`. Scope for this slice: every remaining
`parseInt(req.params.*)` site under `/api/admin/*` — the batch this task was
handed explicitly, re-derived by a fresh grep rather than trusted from any
earlier batch's "Still open" table (per that table's own warning that line
numbers and even family membership drift as the branch moves).

## Regenerated count on this SHA (evidence, not a timeless constant)

Fresh `grep -n 'parseInt(req\.params'` / `'parseInt(req\.query'` against
`server/routes.ts` at the start of this batch: 18 sites (matches the
transactions/refunds batch's own "Still open" tally —13 params + 5 query).
Of the 13 remaining path-param sites, 9 sit under `/api/admin/*`:

- `POST /api/admin/merchants/:id/verify` — `merchantId`
- `POST /api/admin/merchants/:id/set-active` — `merchantId`
- `GET /api/admin/merchants/:id/transactions` — `merchantId`
- `PATCH /api/admin/merchants/:id/windcave-merchant-id` — `merchantId`
- `POST /api/admin/merchants/:id/activate` — `merchantId`
- `PUT /api/admin/merchants/:id` — `merchantId`
- `GET /api/admin/merchants/:id` — `merchantId`
- `DELETE /api/admin/merchants/:id` — `merchantId`
- `POST /api/admin/api-keys/:keyId/revoke` — `keyId`

The other 4 params (`/api/team/:userId/*` — resend/invite/status/delete) and
all 5 query sites (four `size` QR-rendering clamps, one `days` revenue clamp)
are out of this batch's scope and untouched. `merchants.id` and `api_keys.id`
are both `serial` in `shared/schema.ts` (confirmed by reading the table
definitions directly, not assumed), so every site here takes
`strictPositiveIntegerParam`, not `strictUuidParam` — this batch needed no
UUID sites and added none.

After this batch: 9 sites remain (4 params + 5 query) — all outside
`/api/admin`, none of them this batch's scope.

## Migrated — 9 sites across 9 route registrations

Every site matched `const NAME = parseInt(req.params.FIELD);` (or, for two
routes, that line immediately followed by a pre-existing `if
(isNaN(NAME)) return res.status(400)...` half-guard) — each read at its
real current line before editing, not assumed from any prior batch's line
numbers. `strictPositiveIntegerParam`/the `http-params` import were already
present at the top of `server/routes.ts` from earlier batches, so no new
import was needed.

Two shapes of edit:

1. **7 of the 9 sites had no existing validity check at all** (`verify`,
   `set-active`, `activate`, the plain `PUT`/`GET`/`DELETE
   /api/admin/merchants/:id`, and `api-keys/:keyId/revoke`) — a garbage id
   fell straight through to `storage.getMerchant(NaN)` (or, for `revoke`,
   straight into `storage.revokeApiKey(NaN)`), silently resolving to a 404
   (or, for revoke, a false-positive 200 — see "Judgment calls" below) rather
   than a 400. These got the standard two-line replacement with no other
   reordering needed, since the parse was already the first statement in the
   handler:

   ```ts
   const merchantId = strictPositiveIntegerParam(req.params.id);
   if (merchantId === null) return res.status(400).json({ message: "Invalid id" });
   ```

2. **2 of the 9 sites** (`GET .../transactions` and `PATCH
   .../windcave-merchant-id`) **already had a same-purpose `isNaN` guard**,
   just a weaker one (`parseInt` still silently accepts `"1abc"`, `"+1"`,
   `"1e3"`, decimals, and 22-digit overflow — exactly the classes this
   family's parser exists to close). These two got the old `parseInt` +
   `isNaN` pair replaced by the strict parse + null-check pair in place. For
   `windcave-merchant-id` specifically, the old order was `parseInt` → body
   destructure → `isNaN` check — i.e. the half-guard ran *after* reading
   `req.body`. The task's own rule ("insert the parse+400 guard as the first
   thing in the handler if it is not already first") means the guard moves
   ahead of the body destructure; that's a one-line reorder of a variable
   extraction, not of any check, so it doesn't touch the "do not reorder any
   other existing checks" rule — no check runs in a different order than
   before, `req.body` access just happens slightly later, which is
   observationally identical since nothing reads `windcaveMerchantId` before
   the merchant lookup either way.

Message text: 8 of the 9 sites use `req.params.id`, so the message is
`"Invalid id"`, matching the ~40 already-migrated sites elsewhere in the file
that also parse `req.params.id` (not the two admin sites' own pre-existing
`"Invalid merchant ID"` wording, which was leftover pre-migration text tied
to the weaker `isNaN` check being replaced, not this family's actual
convention — see the batch-1 and transactions/refunds evidence docs, which
both standardised on `"Invalid id"` for `req.params.id` and only vary the
noun for a differently-named param). The one `keyId`-named site gets
`"Invalid keyId"`, per the task's own instruction to match the message noun
to the actual param name when it isn't literally `id`.

No ownership/role check needed reordering relative to the new guard on any
of these 9 routes: all nine sit only behind `authenticateAdmin` (role +
tenant-zero + admin-email check) with no further per-request ownership
comparison against the path id — admin routes are trusted-caller routes by
construction, so "parse before ownership check" reduces here to "parse
before the merchant/key lookup," which was already true at every site except
the one reorder described above.

## Judgment calls

- **`POST /api/admin/api-keys/:keyId/revoke`'s "real id" test settles for a
  well-formed-but-arbitrary id, not a genuinely existing key.**
  `MemStorage.createApiKey` doesn't persist anything (returns a constructed
  object without storing it in any map — see `server/storage.ts` around line
  2431) and `MemStorage.revokeApiKey` is an unconditional `return true` stub
  regardless of `id`. There is no way, in this harness, to create a key and
  then prove revoking *that* key specifically succeeds where a bogus one
  wouldn't — the stub can't distinguish them. The test that exists proves
  what this batch is actually responsible for (a well-formed numeric id
  reaches `storage.revokeApiKey` and gets a 200, i.e. the id guard doesn't
  block a legitimate call) and documents the stub limitation inline rather
  than silently asserting something stronger than the fixture can support.
  This is a pre-existing gap in `MemStorage`'s API-key fidelity, not
  something this batch's scope (identifier parsing) is positioned to fix.
- **`activate`'s happy path is proven indirectly, not end-to-end.** A fresh
  `storage.createMerchant(...)` fixture has `verificationToken: null`
  (confirmed by reading `MemStorage.createMerchant`), and the handler's
  fallback (`merchant.verificationToken || ''`) then looks up a merchant by
  the empty string, which never matches — so a genuine 200 through this
  route requires reproducing the real email-verification token flow, well
  outside this batch's identifier-parsing scope. Instead, the test proves
  the id guard passed and control reached the next real check by sending a
  well-formed id with no password and asserting the route's own
  `"Password is required for activation"` 400 (not the id-invalid one) —
  the same "prove-you-got-past-the-guard-via-the-next-real-error" pattern
  the transactions/refunds batch used for `hosted-fields-complete` and
  `googlepay-complete`. A well-formed-but-unknown id with a password
  supplied is separately asserted to 404, confirming the lookup runs.
- **`set-active` needed a fixture merchant that is genuinely not `"active"`
  yet**, since `createOwnerPrincipal`'s merchant is already activated by the
  harness. Used a bare `storage.createMerchant(...)` (status defaults to
  `"pending"`) instead, which is a legitimate not-yet-active target for the
  handler's own `merchant.status === 'active'` guard — this is exactly the
  scenario the route exists to handle (a merchant admin is activating for
  the first time), not a workaround.
- **No source guard against new `parseInt(req.params`/`parseInt(req.query`
  usage was added**, for the same reason the three prior T6 slices gave:
  9 sites' worth of a scoped batch is not "T6 complete" (4 params + 5 query
  still remain, all outside this batch's stated scope), and the plan frames
  that guard as a completion gate, not something to land red mid-migration.

## Verification

- `server/__tests__/http-params-admin-batch.test.ts` (new, 80 tests) —
  through the real app (R1-T1 harness), every one of the 9 sites is checked
  against `["abc", "1abc", "1.5", "-1", "0", "+1", "1e3"]` (7 garbage values
  × 9 routes = 63 tests, each asserting 400 with the expected message), plus
  two further behavioural tests for 8 of the 9 routes — one proving a
  well-formed id that fails the *next* real check (unknown merchant, or for
  `activate`, a missing password) behaves as that check dictates rather than
  400ing, and one proving a genuinely usable id reaches a real 200 — and one
  further test for `api-keys/:keyId/revoke` alone (no separate unknown-id
  case, since `MemStorage`'s revoke stub can't distinguish a real key from an
  arbitrary one — see "Judgment calls"): 63 + 8×2 + 1 = 80. Every request
  carries a real `createAdminPrincipal()` bearer token, since all 9 routes
  sit behind `authenticateAdmin` — a 400 in these tests can only be this
  batch's own guard, not the auth gate that runs before it.
- `npm run check`: pass.
- `npx jest --selectProjects server --runInBand`: **39 suites / 701 tests
  pass** (was 38/621 before this batch — the new file's 80 tests account for
  the entire delta; no existing test changed).
- `npx jest --selectProjects client`: 52 suites / 486 tests pass (unchanged —
  this batch is server-only).
- `npm run build`: pass.

## Still open

9 sites remain (4 params + 5 query, fresh grep above), all outside this
batch's `/api/admin` scope: `/api/team/:userId/*` (4 params —
resend/invite/status/delete) and the five size/days query-tuning sites the
NFC/tapt-stone slice already reviewed and closed out (left unchanged or
fixed there, not this batch's concern). The source guard forbidding new
`parseInt(req.params`/`parseInt(req.query` usage remains correctly
un-added, for the reason given above.

T4/T5/T8/T10 remain blocked on R1-H1 owner acceptance, unaffected by this
batch. T7's remaining scope (tenant-scoped storage methods for transactions,
refunds, boards, stock, property, trades, settings, exports; upload
hardening beyond storage-abstraction; the full two-merchant cross-tenant
runtime sweep) is independent of this batch and still open.
