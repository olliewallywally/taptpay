# R1-T2 — route-policy classifier extension, and a new suspected access-control gap

Date: 2026-09-12/13 UTC. Branch: `remediation/r1-continuation-20260907`.

## Context: recovering an interrupted session

The prior working session on this branch crashed while this work was uncommitted.
This record picks it up: verifies what it left in the tree, regenerates the derived
artifacts, runs full regression, and writes up the one finding it had already
identified in code comments but never turned into an evidence file.

What was found uncommitted:
- `server/route-inventory.ts` and `scripts/generate-route-policy.ts` — the R1-T2
  classifier extended from four principal categories (`merchant-user`, `cron`,
  `api-key`, `unclassified`) to eight, adding `admin`, `public`, `provider-webhook`,
  and `unauthenticated-suspect`. The extension's own code comments describe "seven
  analysis passes over server/routes.ts's then-96 unclassified routes" performed by
  that session; this continuation did not redo those seven passes from scratch, but
  did independently regenerate the output and verify the one flagged finding below
  by reading the actual runtime code.
- `scripts/capture-r1-h1-auth-baseline.mjs` — a new R1-H1 visual-baseline capture
  script, created but never successfully run (its output directory existed and was
  empty).
- Both derived artifacts (`server/route-policy.ts` and the R1-T2 table below) were
  stale relative to the edited generator — last regenerated 2026-09-11 against a
  different classifier.

## What this continuation did

1. Ran `npx tsx scripts/generate-route-policy.ts` to regenerate both derived files
   against the extended classifier.
2. Ran the R1-T2 completeness suite
   (`server/__tests__/route-policy-inventory.test.ts`) — 5/5 pass. This suite checks
   completeness (every runtime route has a policy entry, no stale entries, no
   duplicates, no mounted sub-routers), not classification accuracy.
3. Ran `npm run check` — clean.
4. Ran the full server suite (`npm run test:server`) — **52/52 suites, 1019/1019
   tests pass**, matching the pre-existing baseline exactly. This generator only
   produces documentation/policy-table output; it does not change any route's
   runtime behavior, so an unchanged test count is the expected result, not
   independent proof the new classifications are correct.
5. Read the actual handler and broker source for the one route the extension
   flags as `unauthenticated-suspect`, to verify the finding independently rather
   than take the code comment's word for it. See below.

## Result

`218` registrations, **`0` unclassified** (was 96/97 across prior continuations),
`1` suspected gap. By principal (this run):

merchant-user, cron, api-key, admin, public, provider-webhook,
unauthenticated-suspect, unclassified=0 — exact per-category counts are in the
regenerated [R1-T2-route-inventory-table.md](R1-T2-route-inventory-table.md).

This is a real reduction in the unclassified backlog gap 4 (in
`CONTINUATION-2026-09-07.md`) calls out, but it remains a **labeling** pass over
existing behavior — R1-T3's actual role/tenant matrix and the required policy
fields (capabilityGate, entitlementGate, idempotencyScope, storageMethods,
successDto, errorDisclosure) are still not populated, exactly as the file's own
header says.

## Verified finding: unauthenticated live SSE stream on `GET /api/merchants/:id/events`

**Confirmed real, not fixed, flagged for the owner** — consistent with how gap 11's
split-payment replay finding was handled: documented and left open rather than
patched under time pressure, because the correct fix needs a design decision this
session should not make unilaterally.

### Mechanism

`server/routes.ts` (~line 5289-5360). The handler branches three ways:

1. `Authorization` header present → `authenticateToken` + `checkMerchantOwnership`
   gate a `{ kind: "merchant" }` audience. Properly scoped.
2. No header, but `?stoneId=` present → the stone is loaded and its
   `merchantId` is checked against the path `:id` before granting a
   `{ kind: "board", stoneId }` audience. Properly scoped.
3. **Neither is present** → falls straight through to
   `audience = { kind: "legacy-no-board" }` and opens the SSE stream
   (`sseBroker.subscribe`) with **no authentication check of any kind**. Any
   caller who knows or guesses a numeric merchant ID reaches this branch.

`server/sse-broker.ts`'s `isTarget()` scopes a `legacy-no-board` subscriber to
events for transactions where `taptStoneId == null` and `paymentTokenHash == null`
(so board-specific and token-addressed transactions are correctly excluded), and
`projectEvent()` sends the `publicTransactionDto` projection — `itemName`,
`price`, `status`, `paymentMethod`, split fields, `createdAt`. This is a
persistent, unbounded-duration stream: every future stoneless, non-token
transaction event for that merchant is pushed to the connection until it
disconnects.

### Why this isn't just the already-accepted `active-transaction` design

`GET /api/merchants/:id/active-transaction` has the identical no-stoneId
"legacy-no-board" access mode, and it's a deliberate, already-accepted design —
its own code comment explains why (a no-stoneId public pay link should see the
merchant's current stoneless sale). The new classifier correctly tags it
`public` via its `generatePaymentUrl(` marker. Two differences make the SSE
route materially worse rather than an equivalent, already-reviewed case:

- **No rate limiting.** `active-transaction` calls `checkRateLimit(clientIp)`
  before responding. The SSE route has no rate limit or open-connection cap of
  any kind — an anonymous caller can hold an unbounded number of persistent
  connections open indefinitely.
- **Continuous feed, not a single poll.** `active-transaction` returns one
  point-in-time snapshot per (rate-limited) request. The SSE route pushes every
  subsequent transaction event for the merchant's entire non-board, non-token
  sales activity for as long as the connection stays open — a materially larger
  and more valuable data exposure than the snapshot endpoint it mirrors.
- **Cross-customer bleed, not just anonymous access.** The legitimate current
  caller (`client/src/pages/customer-payment.tsx`, the no-stoneId `/pay/:merchantId`
  QR flow) has no per-transaction identifier to present — it relies on "the
  merchant's one active stoneless transaction" being unambiguous. If a merchant
  ever has two concurrent stoneless transactions (two staff terminals, a
  duplicate scan), every subscriber — including legitimate paying customers —
  receives every other concurrent transaction's data too, not just their own.

### Why this was not patched in this pass

A narrow "add `checkRateLimit`" hardening mirrors the sibling endpoint exactly and
would not change any client-visible behavior — that part is low-risk and could be
done on request. But the deeper issue (no per-transaction scoping for the
anonymous no-board flow at all) is an addressing-scheme gap, not a missing
`if`-check: the current URL contract (`/pay/:merchantId`, no board, no token) gives
the client nothing to scope to more narrowly than "merchant." A correct fix needs
either a per-transaction token added to that link (a client + link-generation
change) or a decision to fold this flow into the existing token-addressed path.
That is a design call belonging with R1-T3/R1-T7's tenant-scoping work, not a
same-day patch — consistent with how gap 11 (split-payment session replay) was
handled: found, proven, documented, explicitly left open.

**Not currently a live-funds risk**: no Windcave credentials are configured in
this environment, and the leak is metadata (item name/price/status), not payment
credentials or card data. It is a real confidentiality and tenant-isolation gap
that should not wait indefinitely — recorded here so it is not lost, per the
project's rule that a green test count never substitutes for closing a named gap.

## Recommendation for the owner/next engineering session

- **Immediate, low-risk option**: add `checkRateLimit(clientIp)` to the
  `/api/merchants/:id/events` legacy-no-board branch, matching its sibling. Bounds
  the abuse surface without changing any legitimate client behavior.
- **Full fix**: needs a decision on how the anonymous no-board customer flow
  should address "my transaction" without a session — e.g., mint the existing
  bearer/token-addressed mechanism for stoneless sales too, so this branch can be
  scoped to a single transaction (or removed) instead of a merchant-wide broadcast.
