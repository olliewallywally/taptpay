# R1-T6 — transaction/payment/checkout/refund identifier batch — 2026-09-06

Branch: `remediation/r1-foundation`. Scope for this slice: every remaining
`parseInt(req.params.*)`/`parseInt(req.query.*)` identifier site under the
transaction/payment/checkout/refund route families — `/api/transactions/*`,
`/api/split-payments/:id`, `/api/refunds/:refundId`, `/api/v1/transactions/:id`
— plus a judgment-call review (not a blind migration) of the receipt-qr
route's `size` query param. As with the two prior slices
(`R1-T6-strict-numeric-parsing-2026-09-06.md`,
`R1-T6-nfc-tapt-stone-and-days-clamp-2026-09-06.md`), this is one batch of an
open-ended set, not "batch N/7" of the original planning table — that table's
own weights already drifted by the second slice, and this one draws its
boundary from the route family named in the task rather than from that
table's line items.

## Regenerated count on this SHA (evidence, not a timeless constant)

Fresh `grep -n 'parseInt(req\.params'`/`'parseInt(req\.query'` against
`server/routes.ts` at the start of this batch: 27 params + 6 query = 33 sites
(matches exactly what `R1-T6-nfc-tapt-stone-and-days-clamp-2026-09-06.md`'s
"Still open" section left off at — confirmed by fresh grep, not assumed).
After this batch: 13 params + 5 query = 18. The 15 sites removed are all in
the families named above; nothing outside them was touched. Everything left
is `/api/admin/merchants/*` (8 params), `/api/admin/api-keys/:keyId/revoke`
(1 param), `/api/team/:userId/*` (4 params), and the size/days query-tuning
sites already reviewed by the prior slice (the two `/api/merchants/.../qr`
sizes, `/api/pay/t/:token/qr`'s size, and `/api/merchants/:id/revenue-over-time`'s
days clamp) — none of which this batch's scope named.

## Migrated (strict parse, reject-with-400) — 14 path-param sites + 1 optional query-param site

Every site matched the exact line read at its real current location
(line numbers had drifted from the planning snapshot, as the task itself
warned — confirmed by content match immediately before editing each one, not
assumed from a stale grep). All fifteen:

| Route | Param | Message |
|---|---|---|
| `POST /api/transactions/:id/split` | `req.params.id` → `transactionId` | `Invalid id` |
| `PATCH /api/transactions/:id/split-enabled` | `req.params.id` → `transactionId` | `Invalid id` |
| `GET /api/split-payments/:id` | `req.params.id` → `splitId` | `Invalid id` |
| `POST /api/transactions/:id/cancel` | `req.params.id` → `transactionId` | `Invalid id` |
| `POST /api/transactions/:id/pay` | `req.params.id` → `transactionId` | `Invalid id` |
| `POST /api/transactions/:id/hosted-fields-complete` | `req.params.id` → `transactionId` | `Invalid id` |
| `POST /api/transactions/:id/googlepay-complete` | `req.params.id` → `transactionId` | `Invalid id` |
| `GET /api/transactions/:id` | `req.params.id` → `transactionId` | `Invalid id` |
| `POST /api/transactions/:id/receipt-pdf` | `req.params.id` → `transactionId` | `Invalid id` |
| `POST /api/transactions/:id/receipt-pdf` | `req.query.splitId` → `splitIdParam` (optional) | `Invalid splitId` |
| `GET /api/transactions/:id/receipt-qr` | `req.params.id` → `transactionId` | `Invalid id` |
| `POST /api/transactions/:transactionId/refunds` | `req.params.transactionId` | `Invalid transactionId` |
| `GET /api/transactions/:transactionId/refunds` | `req.params.transactionId` | `Invalid transactionId` |
| `GET /api/refunds/:refundId` | `req.params.refundId` | `Invalid refundId` |
| `GET /api/v1/transactions/:id` | `req.params.id` → `transactionId` | `Invalid id` (see judgment call below — `error` key, not `message`) |

Standard shape for every path param:

```ts
const transactionId = strictPositiveIntegerParam(req.params.id);
if (transactionId === null) return res.status(400).json({ message: "Invalid id" });
```

No import changes were needed — `server/http-params.ts`'s
`strictPositiveIntegerParam`/`strictPositiveIntegerQueryParam` were already
imported into `routes.ts` by the batch-1 merchant migration. `strictUuidParam`
was not needed: every table in this family (`transactions`, `splitPayments`,
`refunds`) is `serial`-keyed, confirmed against `shared/schema.ts` before
starting, matching what R1-T6's first slice already established for this
kind of family.

### Two sites kept their pre-existing `isNaN` check as dead code below the new guard

`GET /api/split-payments/:id` and `GET /api/transactions/:id/receipt-qr` each
already had a hand-written `if (isNaN(splitId)/(transactionId)) return
res.status(400).json({ message: "..." })` immediately after their `parseInt`
line, with a route-specific message (`"Invalid split payment ID"`,
`"Invalid transaction ID"`). Rather than deleting these, this batch followed
the exact precedent already on this branch at
`GET /api/merchants/:id/email-status` and
`PUT /api/merchants/:id/business-details` (both migrated in an earlier
batch): insert the new `=== null` guard immediately above, and leave the old
`isNaN` check exactly as it was. It is now unreachable dead code (a value
`strictPositiveIntegerParam` accepted can never make `Number.isNaN` true),
but touching it would mean editing "the immediately following null-check"
into something it wasn't asked to be, for two sites, when the established
branch convention (checked by grep across the file, not assumed) is
uniformly to leave it. Consistency with the rest of the file mattered more
here than deleting two lines of now-inert code.

### `receipt-pdf`'s optional `?splitId` query param

`req.query.splitId ? parseInt(req.query.splitId as string) : null` — this is
the exact "genuinely optional today, guarded by `req.query.x ? parseInt(...)
: undefined/null`" shape the task named explicitly, so it stayed optional.
Because the omitted-case sentinel here is `null` (not `undefined`, unlike the
`stoneId` example in the previous slice), the value returned by
`strictPositiveIntegerQueryParam` cannot by itself distinguish "omitted" from
"present but invalid" — both collapse to `null`. So the presence check has
to test `req.query.splitId` directly (its original truthiness gate), not the
parsed result:

```ts
const splitIdParam = req.query.splitId
  ? strictPositiveIntegerQueryParam(req.query.splitId as string)
  : null;
if (req.query.splitId && splitIdParam === null) {
  return res.status(400).json({ message: "Invalid splitId" });
}
```

Downstream usage (`if (splitIdParam) { ... }`) is an unchanged plain
truthiness check, so no `strictPositiveIntegerQueryParam` return value is
ever treated as valid-but-falsy — a real split id is always a positive
integer, never `0`, so this loses nothing.

## Judgment call — `GET /api/v1/transactions/:id`'s response envelope uses `error`, not `message`

This route's every existing 400/403/404/503 response in this handler (and
its sibling `POST /api/v1/transactions`) uses `{ error: "..." }`, never
`{ message: "..." }` — checked by reading both handlers in full, not
assumed from one line. Introducing a `message`-keyed 400 here, purely to
match the generic template the rest of this batch uses, would make this one
response inconsistent with every other error this same endpoint (and its
sibling in the same API family) returns — a real regression risk for any
integrator parsing `body.error`. The fix keeps the established
`strictPositiveIntegerParam` + `null`-check shape but with the route's own
envelope: `res.status(400).json({ error: "Invalid id" })`. This is a
deliberate, documented deviation from the batch's literal message-field
template, not an oversight — the underlying parsing behaviour (reject,
400, before any auth/permission logic runs) is identical to every other
site in this batch.

## Judgment call — `receipt-qr`'s `size` query param (reviewed, left unchanged)

The task named this site specifically as one to judge rather than
blind-migrate, the same way the previous slice already judged four sibling
`size`/`days` sites. `GET /api/transactions/:id/receipt-qr`'s
`Math.min(parseInt(req.query.size as string) || 300, 800)` has the identical
unbounded-below shape as the two `/api/merchants/.../qr` sites the prior
slice already tested and left alone (no `Math.max`, so a negative number
survives the `||` fallback since it's truthy). Re-ran the exact empirical
check the prior slice used — the installed `qrcode@1.5.4` package directly,
not assumed — against `width` values of
`-1000000000, -100, -1, 0, 1, NaN`:

```
width=-1000000000 OK, bytes=1157
width=-100 OK, bytes=1157
width=-1 OK, bytes=1157
width=0 OK, bytes=1157
width=1 OK, bytes=1157
width=NaN OK, bytes=1157
```

Every value resolves successfully at the library's own natural minimum size
(a ~1157-byte PNG in every case here — the receipt URL this route encodes is
longer than the pay-URL the prior slice's probe used, hence the different
byte count from that doc's ~919-byte figure; the outcome that matters,
"never throws, never amplifies," is identical). Same conclusion as the prior
slice: the library itself already treats any non-positive or invalid width as
"no width given," so there is no crash and no resource-amplification path
here — left unchanged. Confirmed with a new runtime test
(`?size=-100` on a real transaction returns 200 with an `image/png` body)
rather than only the standalone probe.

## Judgment call — refund-initiation capability flag left off for this batch's tests

`POST /api/transactions/:transactionId/refunds` is capability-gated
(`config.features.refundInitiation`, off by default in the harness) and
owner-only (R1-T3). Proving "malformed id → 400" needs neither: the new
parse+400 guard is the literal first line in the handler, before the
capability check, the owner-role check, and the transaction lookup, so it
fires regardless of any of those. This batch's tests exercise that ordering
directly — a malformed `transactionId` returns 400 for both an owner
principal and (separately) proves the same 400 fires before the owner-only
gate would even apply — without needing
`FEATURE_REFUND_INITIATION`/`ENV_VALIDATION_MODE=enforce` at all. For the
complementary "a well-formed id is not rejected by parsing" proof, a
well-formed-but-unknown id with the capability left at its default (off)
reaches the capability gate and returns 503
`REFUND_INITIATION_DISABLED` — still conclusively "not a 400," which is all
this batch needs to prove. Enabling the capability flag globally for this
test file (as `route-policy-role-defaults.test.ts` already does, in its own
dedicated file) was deliberately avoided here to keep this batch's test file
narrowly scoped to parsing behaviour and not entangled with a second,
unrelated capability's on/off state across a dozen other routes in the same
file.

## A pre-existing harness gap this batch worked around, not fixed

`GET /api/v1/transactions/:id` sits behind `requireEcommerceApi` (a
`FEATURE_ECOMMERCE_API` feature-flag gate, 404-shut by default) and
`authenticateApiKey` (Express middleware, runs before the handler). Both had
to be satisfied for a request to ever reach this batch's new parse+400 check
at all. `FEATURE_ECOMMERCE_API=true` was flipped for this one test file (it
also requires `ENV_VALIDATION_MODE=enforce`, per `config.ts`'s own
"money-capability flags need enforce mode" rule — `PAYMENT_MODE` stays
`"disabled"` throughout, so this satisfies only that one check and enables no
other capability). But `authenticateApiKey` calls
`storage.getApiKeyByKey(apiKey)`, and `MemStorage.getApiKeyByKey` — along
with `createApiKey`, `getApiKey`, `getApiKeysByMerchant`, and
`updateApiKeyStatus` — is a pure stub that unconditionally returns `null`
(`server/storage.ts`, "Store in memory (would normally go to database)" — a
comment describing intent, not behaviour actually implemented). No API key
can ever be created and later retrieved through `MemStorage`, so no test
using only the harness's public HTTP surface can ever get past
`authenticateApiKey` for this route family — confirmed empirically: the
harness's own pre-existing test at `http-harness.test.ts:105` only ever
exercises the *feature-flag-shut* 404, never a real key. This is a
pre-existing gap in the ecommerce-API surface's testability, unrelated to
identifier parsing, and out of this batch's scope to fix (it would mean
actually implementing `MemStorage`'s API-key methods — a separate, real
piece of work). Worked around it narrowly instead: `jest.spyOn(storage,
"getApiKeyByKey")` returns a synthetic active key for the two tests that need
to reach the handler body. `jest.config` already sets `restoreMocks: true`
and `clearMocks: true` (`jest.server.config.cjs`), so the spy is
automatically undone after each test with no manual cleanup — this is a
test-only workaround, not a change to `MemStorage` itself, and a
still-unauthenticated request (no spy) is separately asserted to 401 before
ever reaching the parser, which is the harness's real, unworked-around
behaviour and worth keeping visible in the suite.

## Verification

- New runtime test file:
  `server/__tests__/http-params-transactions-refunds-batch.test.ts` — through
  the real app (R1-T1 harness), covers all fifteen migrated sites plus the
  `receipt-qr` judgment call:
  - every path-param site 400s on the standard garbage set (`abc`, `1abc`,
    `1.5`, `-1`, `0`, `+1`, `1e3`) and reaches its normal 200/403/404/503 for a
    real or well-formed-but-unknown id — proving parsing and
    business/ownership logic are distinct stages for every route, not just
    asserted for one representative route;
  - `split-enabled` additionally proves a well-formed id belonging to a
    *different* merchant is 403, not 400 (ownership check, unaffected by
    this batch, still runs after parsing);
  - `hosted-fields-complete`/`googlepay-complete` prove a well-formed id
    with no `sessionId` gets that route's own `"sessionId required"` 400 —
    a different 400 than the id-parsing one, distinguished by message, so the
    ordering is provably parse-then-body-validate rather than accidentally
    always 400;
  - `receipt-pdf` proves `?splitId=abc` on a real transaction 400s with
    `"Invalid splitId"` while omitting `?splitId` entirely still generates
    the whole-transaction PDF (optionality preserved);
  - `receipt-qr` proves a real transaction still renders a PNG, and that
    `?size=-100` also renders a PNG rather than crashing (the judgment-call
    site, verified through the real route, not just the standalone probe
    above);
  - the refunds POST proves 400-before-403/503 ordering explicitly (garbage
    id for both an owner and, separately, before the owner-only capability
    gate; well-formed-but-unknown id reaches 503, not 400);
  - `GET /api/refunds/:refundId` creates a real refund directly via
    `storage.createRefund` (bypassing the Windcave-dependent POST flow
    entirely, which is orthogonal to this batch) and fetches it back by id;
  - `/api/v1/transactions/:id` proves both the pre-existing
    unauthenticated-401-before-parsing behaviour and, via the `jest.spyOn`
    workaround above, the migrated 400/404 behaviour with the route's own
    `{ error: ... }` envelope — asserted with `toEqual`, not just a status
    code, so a stray `message` key would fail the test.
  - 121 tests, all passing on first run against the real handlers (no
    fixture had to be adjusted after the fact — the `transactionInput`-style
    fixture shapes were taken directly from `POST /api/transactions/cash-sale`
    and the existing `payment-attempt-service.test.ts` helper, both
    proven-working shapes already in the codebase, not guessed).
- `npm run check`: pass.
- `npx jest --selectProjects server --runInBand`: **38 suites / 621 tests
  pass** (was 37/500 before this batch — the new file's 121 tests account for
  the entire delta; no existing test changed).
- `npx jest --selectProjects client`: 52 suites / 486 tests pass (unchanged —
  this batch is server-only).
- `npm run build`: pass.

## Still open

18 sites remain (13 params + 5 query, fresh grep above): `/api/admin/merchants/*`
(8 params — verify/set-active/transactions/windcave-merchant-id/activate/PUT/GET/DELETE),
`/api/admin/api-keys/:keyId/revoke` (1 param), `/api/team/:userId/*` (4
params — resend/invite/status/delete), and the five size/days query-tuning
sites the prior slice already reviewed and closed out (left unchanged or
fixed, per that doc). None of these are in this batch's named scope
(transaction/payment/checkout/refund). The source guard forbidding new
`parseInt(req.params`/`parseInt(req.query` usage remains correctly
un-added, for the same reason the two prior slices gave: it is a completion
gate for when the whole T6 effort is done, not something to land red
mid-migration.

T4/T5/T8/T10 remain blocked on R1-H1 owner acceptance, unaffected by this
batch. T7's remaining scope (tenant-scoped storage methods for transactions,
refunds, boards, stock, property, trades, settings, exports; upload
hardening beyond storage-abstraction; the full two-merchant cross-tenant
runtime sweep) is independent of this batch and still open.
