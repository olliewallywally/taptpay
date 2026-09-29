# R1-T6 — NFC + tapt-stone identifiers, and the revenue-over-time `days`
# clamp — 2026-09-06

Branch: `remediation/r1-foundation`. This slice migrates the NFC-tag and
tapt-stone identifier sites named for this batch, plus reviews (and, in one
case, fixes) four query-tuning `parseInt` sites the batch scope asked to be
judged rather than blind-replaced. This is not "batch 2/7" of the family
breakdown in `R1-T6-strict-numeric-parsing-2026-09-06.md`'s "Still open"
table — those weights (`/api/transactions`+…, `/api/trades`, `/api/admin`,
`/api/property`, `/api/push`+…, the remainder) don't actually sum to the 38
sites that doc said were left, and it says so itself ("these weights are the
review-snapshot's planning estimate, not this SHA's actual count"). NFC and
the standalone `/api/tapt-stones/:id` route sit outside all six of those
named families (they're not under `/api/merchants`), so this is best read as
a separate, small, explicitly-scoped batch rather than a numbered
continuation of that table.

## Regenerated count on this SHA (evidence, not a timeless constant)

Fresh `grep -n 'parseInt(req\.params'` / `'parseInt(req\.query'` against
`server/routes.ts` at the start of this batch: 31 params + 7 query = 38 sites
(matches the "38 of 77 remain" figure batch 1 left off at). After this
batch: 27 params + 6 query = 33. The `days` site (below) still contains the
literal text `parseInt(req.query.days` — it kept `parseInt` as the inner
call inside a new `Math.min(...)` clamp rather than being replaced by a
strict-rejection parser, per the batch's own instruction to treat free-form
tuning parameters differently from identity lookups — so it does not
disappear from that grep, even though it was genuinely hardened.

## Migrated (strict parse, reject-with-400) — 5 sites

All five matched the exact line the batch scope named; each was read at its
real current location before editing (line numbers drift — see the task's
own warning — so this was done by content match, not by assumed line
number):

- **`GET /nfc/:merchantId/stone/:stoneId`** (both `merchantId` and `stoneId`
  path params) and **`GET /nfc/:merchantId`** (`merchantId`) — the physical
  NFC-tag redirect pages. Neither route has any auth or ownership check (by
  design — a tapped tag has no session), so this wasn't closing a
  cross-tenant hole; it was closing a "garbage in, garbage out" bug. Before
  this fix, `parseInt("abc")` → `NaN`, and `generatePaymentUrl`'s `if
  (stoneId)` guard treats `NaN` as falsy (so a garbage `stoneId` silently
  degraded to "no stone", not an error) while a garbage `merchantId` was
  interpolated straight into the URL as the literal string `NaN` —
  `${baseUrl}/pay/NaN` — because `generatePaymentUrl` only special-cases the
  *stone* id, not the merchant id (see `server/url-utils.ts`). A tag
  reprogrammed or tampered with a malformed id now gets a clean 400 instead
  of redirecting the tapping customer's phone to a broken `/pay/NaN` page.
- **`GET /api/tapt-stones/:id`** — the public "get one stone" lookup. Same
  shape as every other batch-1 site: `parseInt(req.params.id)` on its own
  line, no inline usage. Confirmed via `storage.getTaptStone`'s MemStorage
  implementation that a `NaN` id would have hit `Map.get(NaN)` (always
  `undefined`, so previously a silent 404, not a crash) — the fix is about
  input rejection consistency and matching the audit trail other batches
  established, not a newly-discovered crash.
- **`GET /api/merchants/:id/active-transaction`'s optional `?stoneId=`
  query param** — the one query-param identifier in this batch. Kept
  optional per the task's explicit instruction: the replacement only
  rejects with 400 when `req.query.stoneId` is *present* and fails to parse;
  omitting it entirely still reaches the handler exactly as before. Before
  this fix, `req.query.stoneId ? parseInt(...) : undefined` meant a garbage
  value like `?stoneId=abc` became `NaN`, which is `!== undefined`, so it
  fell through to `storage.getTaptStone(NaN)` → `undefined` → a 403 "Invalid
  stone access" response — a malformed *input* was indistinguishable from a
  well-formed but wrong one. Now a malformed value is a 400, matching the
  400-vs-403 ordering the rest of this task family established.

  One implementation note worth recording: the natural-looking guard
  ```ts
  const stoneId = req.query.stoneId !== undefined
    ? strictPositiveIntegerQueryParam(req.query.stoneId)
    : undefined;
  if (req.query.stoneId !== undefined && stoneId === null) {
    return res.status(400).json({ message: "Invalid stoneId" });
  }
  ```
  fails `npm run check` two call sites further down — `stoneId`'s inferred
  type stays `number | null | undefined` because TypeScript can't relate the
  outer `req.query.stoneId !== undefined` condition to the `stoneId === null`
  branch it's paired with in the `if`, so it can't narrow away `null`. The
  fix (also correct on its own terms, not just a type-checker workaround):
  `strictPositiveIntegerQueryParam` only ever returns `null` when its input
  wasn't `undefined` in the first place (that's the *only* way the ternary
  above can produce `null` rather than `undefined`), so `if (stoneId ===
  null)` alone is a complete and correct guard — no need to re-check
  `req.query.stoneId !== undefined` in the condition. Removing the redundant
  clause fixed the type error and reads better besides.

## Reviewed (judgment calls) — 4 query-tuning sites

The batch asked for a real decision per site, not a rubber stamp, on whether
each `parseInt(...) || default` already degrades safely or has a genuine gap
a bad-but-non-`NaN` number could slip through. Checked empirically, not by
assumption:

- **`/api/merchants/:id/qr` and `/api/merchants/:id/stone/:stoneId/qr`
  (`size`, `Math.min(parseInt(...) || 400, 1000)`, no lower bound) and
  `/api/pay/t/:token/qr` (`size`, `Math.min(Math.max(parseInt(...) || 300,
  100), 800)`, already bounded both ways) — left unchanged.** Ran the
  installed `qrcode@1.5.4` package directly (not assumed) against `width`
  values of `-1000000000, -100, -1, 0, 1, NaN`: every one of them resolves
  successfully and silently renders at the library's own natural minimum
  size (a ~919-byte PNG in every case) rather than throwing or producing
  anything unusually large — the library itself already treats any
  non-positive or invalid `width` as "no width given". So a negative size
  slipping through the `||` fallback (true for the two `/api/merchants/...`
  routes, since `||` only replaces falsy values and a negative number is
  truthy) cannot crash the handler or amplify resource use; it just renders
  a smaller-than-usual valid QR code. Confirmed with a new runtime test
  (`?size=-100` returns 200 with an `image/png` body) rather than only the
  standalone node probe. This is exactly the "already degrades safely, no
  genuine gap" outcome the task allows as a complete answer — left as is.
- **`/api/merchants/:id/revenue-over-time` (`days`, bare `parseInt(...) ||
  30`, no bound at all) — fixed.** This one is not like the size params: it
  has no `Math.min` wrapper of any kind, and unlike a rendered-image width,
  a bad `days` value doesn't get silently ignored downstream. Read
  `MemStorage.getRevenueOverTime` (and its `DatabaseStorage` twin,
  identical shape) in `server/storage.ts`: it runs `for (let i = 0; i <=
  days; i++)`, synchronously, building one `Map` entry per iteration with a
  `new Date()` + `.setDate()` + `.toISOString()` per day. A negative `days`
  degrades safely on its own (the loop's `0 <= days` condition is false
  immediately, so it just returns an empty-but-valid dataset) — that part
  needed no fix. But nothing stopped a huge *positive* value: `parseInt`
  doesn't cap magnitude, `||` doesn't touch a truthy non-`NaN` number no
  matter how large, and the loop has no upper bound, so `?days=999999999`
  (or larger — up to `Number.MAX_SAFE_INTEGER`) would have driven a
  fully-synchronous loop building hundreds of millions of `Map` entries.
  Node has one event-loop thread; a synchronous loop of that size blocks
  every other request the server is handling, for every tenant, not just
  the caller who owns the `:id` in the path — this is a real
  single-authenticated-account denial-of-service path, not merely a slow
  response to the caller. (Checked: no client code today ever sends a
  `days` query param to this route at all — `grep` across `client/src`
  found only `/api/admin/revenue-over-time`, a different, hardcoded-7-day
  admin route — so this was reachable only by someone calling the API
  directly with a valid merchant token, not through any UI path. That
  narrows who can trigger it, but an authenticated merchant account (a
  compromised one, or a malicious paying customer of the product) is not an
  esoteric threat model for a payments app.) Fixed with the same
  `Math.min(parseInt(...) || 30, 365)` shape already used for the `size`
  params elsewhere in this file — a generous one-year reporting window,
  clamping only the direction that was actually unbounded.

## Verification

- New runtime test file:
  `server/__tests__/http-params-nfc-tapt-stone-batch.test.ts` (32 tests,
  through the real app via the R1-T1 harness, not just parser unit tests):
  - both `/nfc/*` routes 400 on a garbage `merchantId` or `stoneId` (each
    checked against several of `abc`, `1abc`, `1.5`, `-1`, `0`, `+1`, `1e3`,
    a leading-space value — the exact rejection classes vary slightly test
    to test, matching what R1-T6 batch 1's own runtime test already covers
    rather than re-deriving the list) and still redirect (200,
    `Cache-Control: no-store`, no literal `"NaN"` in the response body) for
    a real merchant/stone created through the real
    `POST /api/merchants/:id/tapt-stones` route;
  - `/api/tapt-stones/:id` 400s on the same garbage-id table, 200s for a
    real active stone, and 404s (not 400) for a well-formed but unknown id
    — proving the parser only rejects malformed input, not merely-absent
    rows;
  - `/api/merchants/:id/active-transaction` still works with `?stoneId`
    omitted entirely (optionality preserved), 400s on `?stoneId=abc`, 403s
    (not 400) on a well-formed-but-wrong `?stoneId=999999` — proving parsing
    and the ownership-adjacent stone check are distinct stages — and still
    400s on a garbage path-param `merchantId` before the query string is
    even inspected;
  - `revenue-over-time` returns the expected 31-bucket default with no
    `days` param and a 366-bucket result (the 365-day cap, inclusive of day
    zero) for `?days=999999999`, proving the clamp actually bounds the
    response rather than just looking right in the diff;
  - `/api/merchants/:id/qr?size=-100` returns 200 with an `image/png` body,
    proving the "left unchanged" call for the size params in the writeup
    above instead of just asserting it.
- `npm run check`: pass (one real type error surfaced and fixed along the
  way — see the `active-transaction` implementation note above — this
  wasn't a pre-existing failure, it was introduced and then fixed within
  this same batch).
- `npx jest --selectProjects server --runInBand`: **37 suites / 500 tests
  pass** (was 36/468 before this batch — the new file's 32 tests account
  for the entire delta; no existing test changed).
- `npx jest --selectProjects client`: 52 suites / 486 tests pass
  (unchanged).
- `npm run build`: pass.
- `server/__tests__/route-policy-inventory.test.ts` (R1-T2's completeness
  gate): re-ran explicitly — 5/5 pass. This batch only rewrote handler
  bodies, registering no new routes and removing none, so the gate needed
  no regeneration; confirmed rather than assumed.

## Still open

The remaining `parseInt(req.params.*)`/`parseInt(req.query.*)` sites (27
params + 6 query = 33, per the fresh grep above) are outside this batch's
named scope — the `/api/transactions`+`/api/payments`+`/api/checkout`+
`/api/pay`, `/api/trades` (UUID-heavy), `/api/admin`, `/api/property`
(UUID-heavy), `/api/push`+`/api/auth`+`/api/team`+`/api/billing`, and
subscription/windcave/tutorial/v1/internal/webhooks families named in
`R1-T6-strict-numeric-parsing-2026-09-06.md`'s "Still open" section remain
exactly as open as that doc left them — this batch did not touch any site
in those families. The source guard forbidding new
`parseInt(req.params`/`parseInt(req.query` usage is still correctly not
added, for the same reason batch 1 gave: it's a completion gate for when
T6 is fully migrated, not something to land red partway through.

T4/T5/T8/T10 remain blocked on R1-H1 owner acceptance, unaffected by this
batch.
