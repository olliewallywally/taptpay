# Plan — Safe per-payment links and no-board retail payments

Date: 2026-08-06
Branch: `feat/tablet-desktop-app`
Status: **reviewed and corrected; implementation not started**
Supersedes: the earlier version of this file saved in commit `52012f1`

This is the implementation plan for Oliver's approved retail-terminal change:

> A merchant can select an existing payment board, create another board, or choose
> no board and receive a new payment link for that individual sale.

The token direction is sound, but the previous plan was not safe to implement as
written. It discarded the token before checkout, allowed the client to choose a
future token, and would have exposed that credential through current REST/SSE row
spreads. It also treated commit `2f8a7bd` as a complete cross-board fix when the
SSE path and the production database insert path are still wrong.

Do not begin token work until Phase 0 is green.

---

## 1. Non-negotiable product and architecture rules

1. The phone merchant app keeps its existing UI and shared-link behaviour. Security-
   only transport changes are permitted where Phase 0 requires authenticated SSE or
   a dedicated owner-profile endpoint, but they must preserve the phone's rendered
   UI, allowed data, transaction body, and customer flow exactly.
2. Tablet and desktop share the same retail terminal implementation. Desktop stays
   inside the centred rounded 13-inch frame; tablet stays full-bleed.
3. Onboarding, signup, login, and the current tutorial remain unchanged. P5 tutorial
   adaptation is a separate queue item after this work.
4. A no-board sale created with per-payment mode receives one unguessable bearer
   URL. The token remains the credential through resolve, split, checkout,
   completion, and receipt. It must never be exchanged for an unprotected numeric
   transaction URL.
5. Existing board URLs and legacy merchant-level URLs remain compatible. Tokenized
   no-board rows must not appear on the legacy shared link or its SSE stream.
6. Request bodies, public responses, SSE payloads, and webhooks use allowlists.
   Database rows are not public DTOs.
7. Every terminal control uses real authenticated APIs. No mock data or client-side
   fake board/link state ships.
8. Schema changes use a hand-written numbered migration. Never run `db:push`.

---

## 2. Review of Claude's seven fixes

All seven commits implement the intended normal case. None directly changes the
phone-only render path. The follow-ups below are based on the current source, not
only on the commit messages.

| Commit | Intended fix | Review verdict | Required follow-up |
|---|---|---|---|
| `4ade651` | Put the retail/trades peak marker on the curve | Interior buckets are correct | First/last-bucket markers are clipped by the chart container. Put data endpoints inside a visible plot domain, keep the CSS dot circular, and clamp only the label chip; add a period/peak/value accessible summary and test every endpoint bucket. |
| `5cadc4d` | Make the property client count follow property scope | Count/list now agree | Build scope choices from active tenants so archived-only properties do not lead to a misleading zero view; announce the changed count with `aria-live`. |
| `6067bd4` | Centre decimal/backspace as glyphs in 4c | Correct for the ruled retail screen | Property and trades terminals still use literal `.`/`<`. Reuse the glyph treatment across desktop terminals and assert both visual glyphs and key behaviour. |
| `cfe5fe5` | Label trades outstanding invoices as all-time | Label is correct | The amount still sums the full value of partially paid split invoices. Introduce one split-aware remaining-balance helper and use it in analytics, terminal, and home health totals. |
| `6ec20f7` | Remove payout account from shared desktop settings | UI removal is correct | Saving Business Details still returns a raw merchant row containing bank data and server secrets. Replace all raw merchant mutation responses with an owner allowlist and add response-contract tests. |
| `e3a6daa` | Put trades client name/site on separate lines | The strings are separated | Both lines still ellipsize at valid schema maxima, the old title was removed, and the row's `aria-label` hides site/status/amount. Allow wrapping/word breaking and expose a complete accessible description. |
| `2f8a7bd` | Strict no-board/board REST scoping | The Postgres `IS NULL` query itself is correct | The SSE audience is still cross-scoped, DatabaseStorage does not persist `selectedStoneId`, MemStorage scoped caches stay stale, and the cited HPP helper is dead code. Phase 0 replaces these assumptions. |

Current verification is encouraging but not proof of these paths: TypeScript passes,
the desktop P0 verifier passes, and the focused Jest run passes 30/30. The cited
smoke suite imports no desktop pages, existing screenshot scripts do not assert the
changed values/geometry, and Jest reports existing React `act(...)` and open-handle
warnings. Phase 6 closes those gaps.

---

## 3. Blocking findings in the current payment path

### 3.1 Board selection is not persisted by DatabaseStorage

Both merchant terminals submit `selectedStoneId`. MemStorage maps it to
`taptStoneId`; DatabaseStorage spreads the request object into Drizzle and never
assigns the table column. In the real Postgres path, board sales are therefore
likely stored with `tapt_stone_id = NULL`. The create route also does not verify
that the chosen board is active and belongs to the merchant.

This is a correctness and isolation blocker. It also contaminates the future
Revenue-by-Board report. Existing null-board rows cannot be reliably reconstructed,
because the intended board ID was never persisted.

### 3.2 The cross-board bug remains reachable over SSE

The REST query now scopes no-board reads with `IS NULL`, but `broadcastToStone`
still forwards every board event to the `null` connection bucket. That bucket is
used by both authenticated merchant-wide subscribers and anonymous customers on
the shared no-board page. `customer-payment.tsx` filters only when `stoneNumber` is
truthy, so a board event can still trigger its automatic numeric checkout redirect.

### 3.3 MemStorage's scoped cache is permanently stale

Reads now use separate any/no-board/board keys, but transaction creation, status,
split, cancellation, and clear operations invalidate only the merchant-wide key.
Negative and positive scoped results have no TTL. MemStorage is for dev/tests and a
map scan is cheap; removing this cache is safer than maintaining parallel invalidation.

### 3.4 Current schemas and serializers are unsafe for a bearer token

- `insertTransactionSchema` is table-derived and accepts server-owned columns such
  as `taptStoneId`; adding a token column would make it caller-controlled unless it
  is explicitly omitted.
- Public active-transaction and numeric transaction routes spread full database rows.
- Anonymous SSE uses a denylist, so every future sensitive field is exposed until
  someone remembers to add it.
- Merchant mutations return raw merchant rows in several routes.
- The old plan redirected `/pay/t/:token` to `/split/:id` or `/checkout/:id`,
  discarding the only credential before any payment mutation.

### 3.5 The previous plan contains factual contradictions

- It says the merchant-level bug is both fixed and expected to remain broken.
- It claims there is no board rename endpoint; authenticated rename already exists.
- Its cross-merchant token test has no merchant context and cannot prove isolation.
- It adds a partial SQL unique index but models a different uniqueness rule in
  Drizzle.
- It says `handleHppRedirect` fixed a second route, but that helper is never called.

---

## 4. Target model

### 4.1 Explicit transaction destination and link mode

Replace falsy/optional interpretation at the authenticated create boundary with a
strict request DTO:

```ts
type RetailTransactionCreateRequest = {
  merchantId: number;
  itemName: string;
  price: string;
  splitEnabled?: boolean;
  selectedStoneId?: number | null;
  linkMode?: "legacy" | "per_payment";
  status?: "pending"; // temporary compatibility adapter; ignored server-side
};
```

The Zod schema is explicit and `.strict()`. It rejects `taptStoneId`, fees,
processor/session fields, split progress, token/hash, and every caller-owned status
except the temporary literal `status: "pending"` adapter shown above. All live phone/desktop
callers currently send that redundant literal; accept and discard only that value
so the strict cutover is compatible, while rejecting every other caller-owned
status. Inventory all callers in the same commit and migrate reachable demo code
that still sends `taptStoneId` to `selectedStoneId`.

Rules:

- `selectedStoneId = number`: load the board, require active + same merchant, and
  persist that ID as `taptStoneId` in both storage implementations.
- omitted `linkMode` defaults server-side to `legacy`; this preserves every existing
  phone payload without relying on a client update.
- missing/null board + `linkMode = "legacy"`: current mobile/shared-link behaviour.
- missing/null board + `linkMode = "per_payment"`: mint the per-sale payment link.
- board + `per_payment`: reject with 400; board links already provide the address.
- API-v1 transactions use per-payment mode because their existing
  `?transaction=<id>` URL is presented as transaction-specific but is ignored by
  the customer page.
- Cash, NFC, Tap-to-Pay, and already-completed rows never receive a payment token.

Use a separate internal storage input containing canonical `taptStoneId` and, when
needed, `paymentTokenHash`. Never pass request-only `selectedStoneId` to Drizzle.

### 4.2 Store a digest, not the bearer secret

Add nullable `transactions.payment_token_hash`, not a plaintext public token.

- Generate 32 random bytes and encode with base64url.
- Store `SHA-256(rawToken)` behind a partial unique index.
- Look up an incoming token by hashing it and querying the digest.
- Return the raw value only inside the authenticated create response's
  `paymentUrl`/`qrCodeUrl`; never as a transaction field, SSE field, webhook field,
  or log value.
- Do not backfill historical rows. A token represents an intentionally created live
  customer credential, not a migration artefact.

The raw token is intentionally not recoverable after the create response. The
terminal must keep the returned URL in its current-sale state. If that state is
lost, the merchant cancels/recreates the pending request rather than asking the
server to reveal a stored credential.

### 4.3 Explicit active-transaction scopes

Replace nullable/undefined semantics at the storage boundary with named staged
unions:

```ts
type Phase0ActiveTransactionScope =
  | { kind: "merchant-any" }
  | { kind: "no-board" }
  | { kind: "board"; stoneId: number };

type FinalActiveTransactionScope =
  | { kind: "merchant-any" }
  | { kind: "legacy-no-board" }
  | { kind: "board"; stoneId: number };
```

`legacy-no-board` means `tapt_stone_id IS NULL AND payment_token_hash IS NULL`.
Tokenized rows are addressed only by token. The explicit type prevents future code
from collapsing `null` and `undefined` again.

Stage this around the migration: Phase 0 implements an explicit `no-board` scope as
`tapt_stone_id IS NULL`; after Phase 2 adds the nullable hash, Phase 3 tightens it to
the final `legacy-no-board` predicate before per-payment mode is enabled. In both
storage implementations, deterministically choose newest pending/processing by
`createdAt` then ID, followed by newest completed within the existing three-minute
window. Do not let MemStorage insertion order define a different winner.

### 4.4 Allowlisted response contracts

Introduce central projection functions and test them:

- `ownerMerchantDto`: only fields used by authenticated merchant screens. It may
  include billing-card display metadata, but never password/reset/verification
  material, processor API keys, or bank/payout fields.
- `adminMerchantSummaryDto`: the narrow fields needed by the admin collection.
- `adminMerchantDto`: the explicit operational fields used by admin detail/review,
  but never authentication secrets, processor API keys, or full financial values.
- `ownerTransactionDto`: authenticated merchant fields needed by terminal/history/
  analytics, but never the payment token/hash or processor credentials.
- `publicMerchantBrandDto`: display name, logo/theme, and customer-facing contact
  fields only.
- `publicTransactionDto`: the minimum legacy customer fields. No fee/margin,
  processor session/X-ID, NFC/device, token/hash, or refund internals.
- `tokenPaymentDto`: status, amount/item/split progress, and narrow merchant brand;
  no numeric ID is required by the token client.

Use these for public REST, authenticated REST, SSE, public split responses, create
webhooks, and every raw mutation response. Denylists are not sufficient. Derive
each positive allowlist from actual consumers and test exact allowed-key equality as
well as forbidden-key absence.

Endpoint contract:

| Endpoint/audience | Projection |
|---|---|
| public `GET /api/merchants/:id` | `publicMerchantBrandDto` only |
| new authenticated `GET /api/merchants/:id/profile` + owner merchant mutations | `ownerMerchantDto` |
| authenticated `/api/merchants/:id/transactions` and merchant SSE | `ownerTransactionDto` |
| `GET /api/admin/merchants` | `adminMerchantSummaryDto[]` |
| `/api/admin/merchants/:id` and admin mutations | `adminMerchantDto` |
| public legacy active/numeric reads and anonymous board/no-board SSE | `publicTransactionDto` |
| token resolve/receipt | `tokenPaymentDto` plus narrow receipt fields |

Migrate every owner/admin consumer atomically to its dedicated endpoint and a
distinct React Query key; this includes phone screens but is data-preserving. Do
not vary public `/api/merchants/:id` by optional auth. Dedicated endpoints avoid
cache confusion and make owner/admin authorization mandatory.

### 4.5 SSE audiences

Model connection audiences independently from board IDs:

- `merchant`: JWT-authenticated owner/admin; receives all merchant transactions.
- `legacy-no-board`: anonymous shared-link customer; receives only un-tokenized,
  stoneless transactions.
- `board:<id>`: anonymous board customer; receives only that active board.

Board broadcasts go to that board plus `merchant`. Legacy no-board broadcasts go
to `legacy-no-board` plus `merchant`. Tokenized no-board broadcasts go only to
`merchant`; token customers use their token endpoint, never merchant-wide SSE.

At connect time, require a requested board to be active and belong to the merchant.
Replace native EventSource for merchant streams with authenticated fetch-readable
SSE so the JWT travels in an `Authorization` header, never a URL query. Invalid or
expired merchant auth returns 401; it must not silently downgrade to anonymous.
Customer callers remain explicitly anonymous. Put a safe server-derived
`addressingMode: "legacy-no-board" | "board"` and board ID, when applicable, in
the anonymous SSE envelope so the reciprocal client guard can reject a mismatched
event without seeing a token/hash. Assert the merchant JWT is absent from URLs and
captured logs.

### 4.6 Token endpoint and route matrix

| Client route | Server route | Purpose |
|---|---|---|
| `/pay/t/:token` | `GET /api/pay/t/:token` | Resolve safe display/status and choose split or checkout without dropping the token |
| `/pay/t/:token` | `GET /api/pay/t/:token/qr` | No-store QR of the exact token URL |
| `/split/t/:token` | `POST /api/pay/t/:token/split` | Configure retail split under token authorization |
| `/checkout/t/:token` | `POST /api/pay/t/:token/session` | Create the Windcave session for that transaction |
| `/checkout/t/:token` | `POST /api/pay/t/:token/hosted-fields-complete` | Complete card/Apple Pay with token + stored session match |
| `/checkout/t/:token` | `POST /api/pay/t/:token/googlepay-complete` | Complete Google Pay with token + stored session match |
| `/receipt/t/:token` | `GET /api/pay/t/:token/receipt?share=N` | Render a transaction or completed split-share receipt |
| `/receipt/t/:token` | `POST /api/pay/t/:token/receipt-pdf?share=N` | Generate the token-authorized receipt PDF |
| `/receipt/t/:token` | `GET /api/pay/t/:token/receipt-qr?share=N` | Generate any receipt QR/share artifact without numeric access |
| `/pay/return/:state` | `GET /api/pay/return/:state` | Resolve a short-lived HPP outcome without exposing a transaction ID |

Refactor existing numeric handlers into shared internal payment services; token and
legacy routes resolve their address differently but must not duplicate Windcave,
split, fee, or idempotency logic.

For a row with `paymentTokenHash != null`, every public numeric derivative returns
the same not-found response: transaction GET/pay/split/hosted-fields/Google Pay,
split-payment GET, receipt PDF/QR, payment-result/receipt loaders, and any redirect
produced for a public browser. Merchant-authenticated mutations and verified
processor callbacks may remain ID-based internally. Maintain this as an explicit
route inventory test, not a prose-only guard. It closes the otherwise trivial
`token -> numeric id -> unprotected endpoint` bypass.

For split receipts, `share=N` is the transaction-local split index returned by the
authorized completion/return response. Resolve it only after the token resolves the
parent transaction, require that share to be completed, and never accept a global
`split_payments.id`. Token holders may see transaction-level split progress but no
payer identity.

### 4.7 Windcave HPP return state

A hash-only payment token cannot be reconstructed by a server callback. Preserve it
without storing plaintext:

1. Token session creation also creates a 32-byte random return state. Store only its
   hash with transaction, Windcave session, split index, expiry, and outcome on the
   durable `payment_attempts` row defined in Phase 2.
2. Return the raw state to the token checkout, which stores `state -> rawToken` in
   `sessionStorage`. Put the raw state—not transaction ID or payment token—in the
   Windcave approved/declined/cancelled callback URLs.
3. The verified callback resolves the state, finalizes idempotently, records outcome
   + receipt share, and redirects to `/pay/return/:state`.
4. That client route resolves only the narrow outcome, recovers the original token
   from `sessionStorage`, and uses replacement navigation to reach
   `/receipt/t/:token?share=N` for a split success, `/receipt/t/:token` for a non-
   split success, or `/pay/t/:token` on decline/cancel. If browser state is missing,
   show a safe “reopen the original link” result; never fall back to a numeric route.
5. Return states are short-lived, read-only after finalization, hashed at rest, and
   redacted from logs like payment tokens. Test approved, declined, cancelled,
   expired, replayed, and split-share callbacks.

Known token state behaviour:

| Transaction state | Customer result |
|---|---|
| pending | Resolve and permit split/session creation |
| processing | Show in-progress; do not create a second session |
| completed/partially refunded/refunded | Read-only token receipt/status |
| failed/cancelled | Gone/closed state; no new session |
| malformed/unknown token | Identical generic 404 |

Every token response, including QR, sets `Cache-Control: private, no-store` and
`Referrer-Policy: no-referrer`. Apply both headers explicitly to
`/pay/return/:state` and `/api/pay/return/:state` too. Set the same referrer policy
on every HTML token route before third-party checkout scripts load, and redact token
and return-state path segments in HTTP, error, analytics, and tracing logs. Apply a
dedicated payment-token rate limiter by IP and endpoint family; do not share one
small counter across normal resolve, QR, session, and completion traffic.

---

## 5. Implementation phases

### Phase 0 — repair the addressing and response foundation

This phase ships before schema/token work.

1. Add the merchant and transaction projection functions. Replace every raw
   `res.json(updatedMerchant)`, public transaction row spread, anonymous SSE row,
   and API-v1 webhook row with the correct projection. Add dedicated owner/admin
   profile endpoints and migrate all consumers/query keys atomically.
2. Add the strict external retail-create schema and canonical internal transaction
   input, including the literal-pending compatibility adapter from §4.1. Verify
   board ownership/activity in the route and persist `taptStoneId` in both
   MemStorage and DatabaseStorage. Omitted mode is legacy; keep per-payment mode
   feature-gated until Phase 3 is live.
3. Make `createNextTaptStone(merchantId)` one atomic storage operation before its
   unique index exists. DatabaseStorage must open a transaction, take a stable
   merchant-scoped transaction advisory lock, re-read the active numbers, and insert
   the first unused number 1–10 while still holding that lock. MemStorage uses a
   per-merchant mutex around the same operation. Translate a later unique-index
   conflict to 409. Add gap/cap tests plus a real concurrent Postgres proof against
   the pre-index schema; a route-level `count + insert` is not sufficient.
4. Replace the storage tri-state argument with the staged explicit scope in §4.3;
   add the reciprocal no-board guard; remove the MemStorage active-transaction cache.
5. Extract a testable SSE broker with the three audiences in §4.5. Use header-
   authenticated streaming for merchants, explicitly mark customer subscribers,
   and add the safe addressing envelope.
6. Replace the global request/response logger's raw `req.path` and captured JSON
   logging with route templates plus recursive sensitive-key/path redaction. Cover
   payment URLs, return states, JWTs, merchant secrets, and processor values in log
   capture tests; document equivalent proxy/tracing redaction.
7. Delete the unused `handleHppRedirect` helper unless a separately approved route
   intentionally wires and tests it.
8. Add server tests for request rejection, DatabaseStorage insert shape, every
   active scope, response projections, and the SSE delivery matrix.

Before deployment, run a read-only data audit for merchants that have active boards
and transactions with `tapt_stone_id IS NULL`. Do not infer/backfill a board. For
ambiguous pending/processing rows, operations must explicitly choose leave,
cancel/recreate, or investigate using external evidence. Record the decision. The
Revenue-by-Board report must label historical nulls as unassigned and document this
known contamination.

**Gate:** a board sale persists its board in Postgres; an anonymous no-board client
cannot receive/read it over REST or SSE; authenticated terminals still receive all
their updates; each public, owner, and admin response contains exactly its tested
allowlisted DTO and no token, secret, or processor internals.

### Phase 1 — close the post-fix audit findings

1. Retail/trades analytics: define a visible plot-domain inset for real data points
   and let only decorative line/fill extensions overscan it. Use a shared pure
   mapper for curve points and the CSS marker so non-uniform SVG stretching cannot
   turn the dot into an ellipse; never clamp X without recomputing Y. Clamp the
   value chip separately using its measured width. Fixture peaks at first, interior,
   and last buckets for every period, then assert the dot is fully visible and its
   centre lies on the rendered stroke within a declared tolerance. Add a live chart
   summary containing selected period, peak bucket, and peak value; hide the
   duplicate visual chip from assistive technology.
2. Property clients: derive property choices from active tenants, add an archived-
   only fixture, and make the scoped count `role="status" aria-live="polite"
   aria-atomic="true"`. Preserve Oliver's rule that property scope changes the hero
   count but search text changes only visible rows. Assert the archived property is
   absent from the menu and active rows/count agree.
3. Desktop keypads: share a pure keypad reducer and the centred decimal/backspace
   glyph component across retail, property, and trades. Decorative glyphs are
   `aria-hidden`; buttons retain `decimal point`/`backspace` names. In all three
   terminals test empty decimal -> `0.`, duplicate decimal ignored, one-character
   backspace, committed amount, centring, and accessible names.
4. Trades money: add `tradesInvoiceRemainingCents`/`tradesOutstandingCents` with
   exact remainder handling, then use it in 3d analytics, 3c terminal, and home
   health detail rows, reports/PDFs, and client statements wherever the semantic is
   owed/outstanding. Closed invoices return 0; open unsplit/invalid-count invoices
   return their full amount; otherwise clamp paid shares to 0..count and compute
   `remaining = paid >= count ? 0 : total - floor(total / count) * paid`. Keep gross
   `sumInvoiceCents` for settled revenue. Test open/closed unsplit, 0/1/penultimate/
   final/corrupt-overcount shares, and non-divisible cents.
5. Trades clients: remove the overriding row `aria-label`; connect visible name with
   `aria-labelledby` and visible site/status/amount with `aria-describedby` (or an
   equivalent non-hover DOM contract). Mark initials/status dot decorative, retain
   native button keyboard behavior, and use `white-space: normal` plus
   `overflow-wrap: anywhere`. Test maximum 80+80 names, 200-character addresses,
   unbroken tokens, no horizontal clipping, 10+ row scrolling, focus, Enter/Space,
   accessible name, and description.
6. Settings: add a save-path test proving payout text is absent and the returned
   merchant payload contains none of the forbidden fields from Phase 0.

**Gate:** all six normal and boundary cases have assertions, not screenshot-only
coverage, and desktop/touch-tablet screenshots still match the accepted design.

### Queue checkpoint — Revenue by Board

After Phases 0 and 1 pass, pause this plan and implement the already-agreed b4
Revenue-by-Board report. It may rely on newly correct board persistence, but must
keep historical unknown rows in an explicit `Unassigned` bucket. Resume Phase 2
only after that report and its tests are complete; this preserves the handoff's
agreed queue order.

### Phase 2 — add the credential schema and storage API

1. Add `paymentTokenHash` to the Drizzle transactions model and the matching partial
   unique index in `migrations/0011_payment_links_and_board_numbers.sql`. In the same
   migration add `payment_attempts`: transaction FK, transaction-local `shareIndex`
   (`0` for unsplit), validated UUID idempotency key, state (`claiming`, `ready`,
   `finalizing`, `approved`, `declined`, `cancelled`, or `abandoned`), bounded
   lease expiry, processor session/X-ID, unique hashed return state + expiry,
   outcome, receipt share, and timestamps. Enforce one row per `(transactionId,
   shareIndex, idempotencyKey)` and at most one live
   (`claiming`/`ready`/`finalizing`) attempt per transaction/share with a partial
   unique index. Also enforce one `split_payments` row per
   `(transactionId, splitIndex)`.
2. In the same migration, add a partial unique active-board index on
   `(merchant_id, stone_number) WHERE is_active IS TRUE`, but only after a read-only
   duplicate preflight is clean or explicit data remediation is approved. Phase 0's
   first-free allocator and 409 handling must already be deployed.
3. Add a shared `createPaymentCredential()` helper returning `{rawToken, hash}`;
   avoid the overloaded auth/invoice name `generateToken`.
4. Add `getTransactionByPaymentTokenHash` to `IStorage`, MemStorage, and
   DatabaseStorage.
5. Make token minting an explicit service decision under the rules in §4.1. Storage
   never silently tokenizes every transaction and never accepts a raw token.
6. Add migration, generation/shape, uniqueness-collision retry, lookup, and
   caller-supplied-field rejection tests.

Apply the migration after the Phase 0 allocator is deployed and before token-capable
code reads/writes the new tables/column. Do not backfill. Rollback is safe only to
the Phase 0 baseline (which understands the active-board constraint), not to the
older `activeCount + 1` allocator.

### Phase 3 — build the token-authorized server flow

1. Implement a single token resolver: validate shape, hash, look up, and return a
   generic not-found result for malformed/unknown values.
2. Extract shared session/split/completion/finalization services from the numeric
   handlers. Preserve existing idempotency, session-ID matching, server-side AJAX
   URL caches, fee creation, push notifications, and processor callbacks.
   Replace the current check-then-external-call race with one atomic payment-attempt
   claim per transaction/current split share. Use a client idempotency key, return
   the same active session for the same key, reject a conflicting live key, and use
   a bounded lease/reconciliation path after gateway failure. Completion uses a
   compare-and-set so a transaction/share, fee, and counter finalize once. Consolidate
   wallet/card pre-session creation around that one active attempt.
3. Make split configuration an atomic compare-and-set from pending/unconfigured to
   configured. Repeating the same split count is idempotent; a different count, or
   any paid/processing share, returns 409. The transaction and all indexed split
   rows are written in one transaction so retries cannot duplicate or partially
   configure shares.
4. Add all routes in §4.6 with token authorization on every read and mutation.
5. Guard legacy numeric public routes against tokenized rows.
6. Exclude tokenized rows from legacy active queries/SSE and project every response.
7. Implement the durable HPP return-state and token receipt/PDF/QR routes in §§4.6–
   4.7; no server/client redirect for a tokenized row may contain its numeric ID.
8. Return `paymentUrl` and `qrCodeUrl` only to the authenticated merchant or
   versioned API-v1 caller that created the transaction. Validate API-v1 with its own
   strict versioned schema, preserve its snake_case `payment_url`, and treat
   `qr_code_url` as additive. API-v1 and webhook bodies use narrow DTOs.
9. Add status, same-token concurrency/recovery, split, isolation, HPP outcome,
   no-cache/referrer, rate-limit, log-redaction, and no-leak tests.

**Gate:** two concurrent token sales for one merchant can be resolved, split, and
completed independently; neither token nor either numeric ID can access the other.

### Phase 4 — preserve token addressing through the customer client

Refactor checkout's current `isInvoice = !!token` shortcut into a discriminated
source:

```ts
type CheckoutSource =
  | { kind: "retail-legacy"; transactionId: number }
  | { kind: "retail-token"; token: string }
  | { kind: "invoice-token"; token: string }
  | { kind: "quote-token"; token: string };
```

1. Add `/pay/t/:token`, `/split/t/:token`, `/checkout/t/:token`, and
   `/receipt/t/:token` before generic routes.
2. Make the token entry page resolve once, retain the token in the route, and choose
   the token split/checkout component. Never navigate to `/split/:id` or
   `/checkout/:id`.
3. Route session and completion requests by `CheckoutSource` to the endpoints in
   §4.6. Keep invoice/quote behaviour unchanged.
4. Generate one idempotency UUID for the transaction/current split share and retain
   it in `sessionStorage` across retries and direct/HPP paths. Card, Apple Pay, and
   Google Pay request the same server attempt before invoking a processor. Reuse the
   key until the attempt reaches a reconciled terminal state; never mint a new key
   merely because a request timed out.
5. Token customers poll/refetch the token resolver for status/split progress and do
   not subscribe to merchant-wide SSE.
6. Preserve the token route through direct success. For HPP fallback, store the
   return-state mapping in sessionStorage, handle `/pay/return/:state`, and recover
   only token routes as specified in §4.7.
7. Refactor receipt into a discriminated source too. Token receipt/PDF/QR requests
   use token + transaction-local share index; legacy receipt keeps its current path.
8. Add component/integration tests for all source kinds, direct/HPP outcomes, split
   receipts, missing browser return state, and every redirect.

**Gate:** browser history/network logs for a token sale contain no public numeric
payment route, while every legacy phone/board/invoice/quote route behaves as before.

### Phase 5 — wire the desktop/tablet terminal and board creation

1. Replace the ambiguous `via + nullable stoneId + first-board fallback` with a
   discriminated destination: no-board or one concrete board ID. No-board is the
   first/default destination; preserve genuine Paywave method semantics separately.
2. For no-board, send `linkMode: "per_payment"` and no board. For board, send only
   its ID and legacy mode.
3. Capture the create response. The current `onSuccess` discards it; instead store a
   current-sale `{item, amount, paymentUrl, qrCodeUrl, destination}` and move to the
   share panel.
4. The current-sale share panel uses only the returned per-sale URL/QR for no-board.
   Never fall back to `merchant.paymentUrl`. Clear the old credential when a new
   sale starts so a failed/second submission cannot show a stale link.
5. Add `+ New board` using the Phase 0-hardened authenticated POST. On a 409 refresh
   the board list; on success update/invalidate the query and select the returned
   board.
6. Surface the exact 10-board server error. Rename already exists but is not part of
   this requested terminal control.
7. Give destination, create, copy/share, QR, loading, error, and stale-link states
   explicit keyboard and screen-reader coverage.

**Gate:** successive no-board sales show distinct links; creating/selecting a board
persists that board; desktop and touch-tablet share the behaviour; phone UI and
legacy request payloads are unchanged.

### Phase 6 — verification and rollout

#### Required automated server coverage

- MemStorage and DatabaseStorage persist selected board IDs identically.
- Foreign, inactive, malformed, and cross-merchant board selections are rejected.
- Phase 0 `merchant-any`/`no-board`/`board` scopes and final
  `merchant-any`/`legacy-no-board`/`board`/token scopes are exact.
- MemStorage/Postgres use the same latest-created/ID tie-break for active and recent-
  completed rows.
- A negative lookup followed by create/status/split/cancel never returns stale data.
- SSE delivery matrix: merchant gets all; board gets its board only; legacy no-board
  gets legacy stoneless only; token customers use no merchant stream.
- Public/token DTO key contracts exclude bank/secrets, fees, processor/session,
  NFC/device, token/hash, and refund internals. Owner/admin contracts exclude their
  specified secrets and token hashes while retaining only explicitly allowed data.
- The create schema rejects caller token/hash, `taptStoneId`, non-pending status,
  fees, and processor-owned fields; omitted/literal-pending legacy payloads pass.
- Token A cannot read/mutate B; numeric routes cannot bypass token authorization.
- Concurrent session/completion calls for one token produce at most one charge for
  the transaction or current split share.
- Concurrent split setup creates one indexed share set; the same count is
  idempotent and a conflicting count returns 409. Same-token requests with the same
  idempotency key reuse an attempt, a conflicting live key is rejected, and a
  simulated gateway timeout can be reconciled without a second charge.
- Split setup plus card, Apple Pay, and Google Pay completion retain authorization
  and session-ID checks.
- Token lifecycle, generic 404, dedicated rate limits, and no-store/no-referrer
  headers are exact.
- Approved, declined, cancelled, replayed, expired, and split HPP return states never
  produce a numeric customer location.
- QR encodes the exact token URL and is never publicly cacheable.
- Board numbering handles gaps, cap, and concurrent-create conflict.

Replace the single client-only Jest config with named projects/separate configs:
client uses jsdom + `jest.setup.js`; server uses the Node environment and server-
specific setup. Remove the existing `forceExit: true`; use `--detectOpenHandles`
only as a diagnostic while fixing the underlying handle.

Add `scripts/verify-server-postgres.mjs` and `npm run test:server:postgres`. CI must
provide a dedicated disposable Postgres service through `TEST_DATABASE_URL`. The
verifier refuses a missing URL or a database not explicitly marked as test-only,
creates a uniquely named isolated schema, and applies migrations only through
`0010`. It then runs the Phase 0 board mapping/scoping tests and a concurrent
allocator proof with no active-board unique index present: every successful request
must receive a distinct first-free number, with no 409 or constraint failure masking
a broken lock. Only then does it run the duplicate preflight, apply `0011`, and test
the post-index conflict plus token lookup, return state, attempt
claim/finalization, and split compare-and-set. It drops the schema in cleanup; none
of these stages may silently skip. Mocked Drizzle call shape and MemStorage alone
cannot catch the production persistence bug. Never point this gate at a live
merchant database.

#### Required client/E2E coverage

- Desktop and touch-tablet: no-board default, per-sale share/QR, two successive
  unique links, existing board choice, create-board auto-select, cap error, split.
- Two independent customer contexts pay two concurrent no-board sales without
  collision while a board sale is also pending.
- Legacy merchant shared link sees only legacy stoneless rows; board link sees only
  its board.
- 390px phone regression: same route/component, layout, labels, and legacy API body.
- Analytics endpoint peaks, archived property scope, split outstanding values, long
  trades client text, keypad glyphs/actions, and settings secret absence.
- Owner/public/admin endpoint migrations return the same allowed UI data with exact
  DTO keys; existing phone create bodies containing literal pending still succeed,
  while every other caller-owned status/DB field is rejected.
- No uncaught browser/console errors.

#### Full command gate

```bash
npx tsc --noEmit
npm run build
npx jest --selectProjects client server --runInBand
npm run test:server:postgres
node scripts/verify-desktop-p0.mjs
node scripts/desktop-shots/shot-retail-analytics.mjs
node scripts/desktop-shots/shot-trades-analytics.mjs
node scripts/desktop-shots/shot-trades-home.mjs
node scripts/desktop-shots/shot-property-clients.mjs
node scripts/desktop-shots/shot-retail-terminal.mjs
node scripts/desktop-shots/shot-property-terminal.mjs
node scripts/desktop-shots/shot-trades-terminal.mjs
node scripts/desktop-shots/shot-trades-clients.mjs
node scripts/desktop-shots/shot-retail-settings.mjs
node scripts/desktop-shots/shot-property-settings.mjs
node scripts/desktop-shots/shot-trades-settings.mjs
node scripts/verify-mobile-retail-regression.mjs
```

First change every listed screenshot script to throw on any collected page/console
error; some currently print errors and still exit zero. Each must exercise desktop
and touch-tablet sizes and assert its target values/geometry, not merely save PNGs.
The trades-home fixture must include a partially paid, non-divisible split invoice
and assert the split-aware outstanding total and detail row at both sizes.
Create the named 390px regression script to assert the phone component/layout and
legacy transaction body as well as its screenshot. Screenshot/manual commands
require one—and only one—dev server on `:5000`.

#### Deployment sequence

1. Run and record the read-only historical board/null audit; never guess a backfill.
2. Deploy and verify Phase 0, including the first-free board allocator, scope/
   SSE fixes, DTO consumers, and logger redaction. It references no token column.
3. Complete Phase 1 and Revenue by Board.
4. Run the duplicate-active-board preflight and resolve only cases backed by
   evidence.
5. Apply migration `0011` to staging/production.
6. Deploy the token-capable server plus customer token/return/receipt routes with
   per-payment creation feature-gated off; smoke the internal path, then enable the
   desktop terminal and API-v1 per-payment responses.
7. Smoke with two browsers: token A, token B, one board sale, split, cancellation,
   and receipt. Use controlled test merchants and clean up test rows deliberately.
8. Monitor token 404/410/429 rates, session creation/finalization errors, SSE audience
   counts, and board-create conflicts. Verify token path redaction in application and
   infrastructure logs.
9. If rollback is necessary, return only to the Phase 0 allocator-compatible build;
   leave the nullable column/tables/indexes in place.

---

## 6. Suggested commit order

Each commit must be independently reviewable and include its verification result.

1. Public/owner/admin DTO endpoints, atomic consumer/query-key migration, and
   response-contract tests.
2. Canonical board persistence + first-free allocator, explicit active scopes, and
   MemStorage cache removal.
3. Header-authenticated SSE audience broker, logger redaction, and dead HPP helper
   removal.
4. Post-fix boundary pass as small commits: retail chart, trades chart, property
   clients, shared keypad primitive then one terminal consumer per commit, trades
   remaining-balance helper then one consumer per commit, and trades client rows.
5. Revenue by Board report after every Phase 0/1 gate passes.
6. `0011` migration, Drizzle indexes/return states, token credential/storage API.
7. Atomic shared payment-attempt services and token resolve/QR routes.
8. Token split/session/completion/HPP-return/receipt routes plus exhaustive numeric-
   route guards.
9. Discriminated checkout/receipt sources and token-preserving client routes.
10. Desktop/tablet no-board destination and exact current-sale share state.
11. Terminal create-board auto-select and E2E/rollout checks.

After this plan, resume the handoff queue: desktop-frame ReportModal, shared push
hook, notification preferences, P5 tutorial adaptation, then P6 polish.

---

## 7. Definition of done

This work is complete only when all of the following are true:

- A real Postgres board sale stores the selected board and never appears to another
  board, a legacy no-board customer, or a token customer.
- A no-board per-payment sale returns a unique link and that same credential guards
  every customer read/mutation through direct or HPP completion and receipt/PDF.
- No unauthenticated, API-v1 webhook, or SSE response exposes raw rows, bearer
  material, merchant secrets, financial PII, processor IDs, or fee internals.
  Authenticated owner responses still exclude secrets and token hashes. The only
  payment-token disclosure is the just-created `paymentUrl`/`qrCodeUrl` to its
  creator; short-lived HPP return state follows §4.7.
- Existing mobile merchant/shared-link flows, board links, invoice/quote checkout,
  onboarding, login, and tutorial behaviour remain unchanged.
- All seven reviewed commits have boundary assertions and their outstanding
  correctness/accessibility issues are closed.
- Migration, full automated suite, desktop/tablet visuals, 390px mobile regression,
  and the three-concurrent-sale manual smoke are recorded as passing.

---

## 8. Repo hygiene

Per `CLAUDE.md`: never use `git add -A`. Exclude `.claude-home/**` and
`.claude/settings.local.json` from every commit. Do not mix existing Claude runtime
churn into application or documentation commits.
