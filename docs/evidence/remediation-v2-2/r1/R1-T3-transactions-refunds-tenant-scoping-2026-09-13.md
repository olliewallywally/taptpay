# R1-T3 — tenant-scoping gaps in Transactions & Refunds: investigated, no code change

Date: 2026-09-13. Branch: `remediation/r1-continuation-20260907`. HEAD at start
and end: `c1e42db1` (working tree clean before and after — no commit needed
beyond this evidence file).

## Docs read first

- `CLAUDE.md`
- `docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md` §1 (purpose/authority/
  reading order/hygiene), §4 (D1–D13 locked decisions), §8.5 (tenant-scoped
  storage rule: *"Prefer storage methods that require tenant scope, such as
  `getTransactionForMerchant(transactionId, merchantId)`, over global reads
  followed by route-level comparison. Implement them for transactions,
  refunds, boards, stock, property clients/invoices, trades clients/quotes/
  invoices, settings, uploads, and exports."*)
- `docs/evidence/remediation-v2-2/CONTINUATION-2026-09-07.md` — confirms
  R1-T7's own gap tracker still lists "tenant-scoped storage methods for
  transactions, refunds, boards, stock, property, trades, settings, exports"
  as explicitly open (row R1-T7, and gap-list item 7).
- Style/precedent: `r1/R1-T7-windcave-session-binding-2026-09-11.md` and
  `r1/R1-T6-transactions-refunds-batch-2026-09-06.md` (the prior batch that
  touched this exact route family for numeric-id parsing; its test file,
  `server/__tests__/http-params-transactions-refunds-batch.test.ts`, is what
  this pass read for existing cross-tenant coverage and then independently
  re-verified at runtime — see below).

This task was assigned as a pre-approved plan (the investigation summary
below, produced by a prior read-only pass against live `server/storage.ts`,
`server/routes.ts`, `shared/schema.ts` at `c1e42db1`) with the explicit
instruction: implement exactly that plan, failing-test-first; if the plan
concluded there was nothing to fix, record that finding here with no code
change. This pass first independently re-verified the plan's central claim
at runtime (new section below, not part of the original investigation) and
then followed its own conclusion.

## Domain inventory (from the approved plan, re-confirmed by reading the
live file at the same commit)

Every route touching a `transactionId`/`refundId` via a global storage
lookup (`storage.getTransaction`, `storage.getRefund`,
`storage.getSplitPaymentById`, `storage.getRefundsByTransaction`,
`storage.createRefund`) splits into four buckets:

**A. Out of scope per the hard rules (Windcave transport/session-binding/
split finalization) — not touched:** `POST /api/transactions/:id/pay`
(routes.ts:2643), `hosted-fields-complete` (2912), `googlepay-complete`
(2950), the Windcave notification handler (~3920–4046),
`GET /api/windcave/callback` (4050+) — all already the subject of R1-T7's
prior fix.

**B. Already correctly tenant-scoped at the query itself (the §8.5 pattern —
nothing to fix):** `GET /api/merchants/:id/active-transaction` (2008, calls
`storage.getActiveTransactionByMerchant(merchantId, scope)`);
`GET /api/merchants/:merchantId/refunds` (5775, calls
`storage.getRefundsByMerchant(merchantId)` directly).

**C. Deliberately public-by-design (no merchant identity in the request to
scope by) — flagged, not proposed for a fix:** `GET /api/transactions/:id`
(3023), `POST /api/transactions/:id/receipt-pdf` (3044),
`GET /api/transactions/:id/receipt-qr` (3105), `GET /api/split-payments/:id`
(2463) — all explicitly commented "public — needed for customer receipt
page." `POST /api/transactions/:id/split` (2370) has **no authentication and
no ownership check of any kind**, by design (it also serves an unauthenticated
customer split-payment page) — this is a genuine product/security-model
question (griefing risk on someone else's counter transaction, not fund
theft), not something this pass will guess at. Flagged for the owner, not
implemented.

**D. The structural anti-pattern named in the task — global fetch by id,
`merchantId` compared afterward in the route handler:**

| # | Route | Fetch (global) | Compare (route-level) |
|---|---|---|---|
| 1 | `PATCH /api/transactions/:id/split-enabled` | `storage.getTransaction(transactionId)` — routes.ts:2428 | `user?.role !== 'admin' && transaction.merchantId !== user?.merchantId` → 403 — routes.ts:2435 |
| 2 | `POST /api/transactions/:id/cancel` | `storage.getTransaction(transactionId)` — routes.ts:2486 | `checkMerchantOwnership(req, transaction.merchantId!)` → 403 — routes.ts:2494 |
| 3 | `POST /api/transactions/:transactionId/refunds` | `storage.getTransaction(transactionId)` — routes.ts:5636 | `transaction.merchantId !== merchantId` → 403 — routes.ts:5642 |
| 4 | `GET /api/transactions/:transactionId/refunds` | `storage.getTransaction(transactionId)` — routes.ts:5756 | `transaction.merchantId !== merchantId` → 403 — routes.ts:5761 |
| 5 | `GET /api/refunds/:refundId` | `storage.getRefund(refundId)` — routes.ts:5806 | `refund.merchantId !== merchantId && req.user?.role !== 'admin'` → 403 — routes.ts:5812 |
| 6 | `GET /api/v1/transactions/:id` (`FEATURE_ECOMMERCE_API`-gated, off by default) | `storage.getTransaction(transactionId)` — routes.ts:6133 | `transaction.merchantId !== req.apiKey.merchantId` → 403 — routes.ts:6148 |
| 7* | `POST /api/transactions/tap-to-pay` (optional body `transactionId` branch, routes.ts:2253) | `storage.getTransaction(parseInt(transactionId))` | `pendingTransaction.merchantId !== mid` → 404 — routes.ts:2254 |

\* Site 7 sits inside the Tap to Pay handler (D13-locked off; inert behind
`config.features.tapToPay`) and the same handler goes on to call Windcave
transport (`createAttendedSession`/`submitTapToPayToken`). Per the hard rule
"no touching Windcave transport... even if you notice something," this is
flagged, not folded into this pass's scope, exactly as the approved plan
said.

`checkMerchantOwnership` (routes.ts:451) and `isAccountOwner` (auth.ts:39)
were read in full and confirmed correctly typed: `req.user.merchantId ===
merchantId` with an `Number.isInteger(merchantId) && merchantId > 0` guard,
admin bypass only for `role === 'admin'`. The admin JWT's `merchantId: 0`
sentinel (auth.ts:327, auth.ts:428) means the `!merchantId` 401 guard at
sites 3–5 fires before an admin could even reach the compare — a separate,
deliberate gap (admin refund override deferred to R4, per the comment at
routes.ts:5619–5621), not a bypass.

## Independent runtime re-verification (this pass, not just re-reading)

The approved plan's central claim — "every compare in bucket D is
unconditional and correct... I could not construct a red test proving a live
cross-tenant bypass at any of the 6 sites" — was based on reading the code
and reading the existing test file's coverage. Rather than accept that
verdict from static reading alone, this pass wrote a throwaway two-merchant
cross-tenant probe (`server/__tests__/r1-t3-tenant-scoping-probe.test.ts`,
never committed, deleted immediately after use) exercising all six bucket-D
sites plus site 1 as a sanity re-check:

```ts
const a = await createOwnerPrincipal();
const b = await createOwnerPrincipal();
const txn = await pendingTransaction(a.merchantId); // or completedTransaction

// e.g. site 2:
const res = await request(app)
  .post(`/api/transactions/${txn.id}/cancel`)
  .set(bearer(b));           // B's token, A's transaction
expect(res.status).toBe(403);
```

First run (before enabling `FEATURE_REFUND_INITIATION`): 5/6 passed at 403;
site 3 (`POST /api/transactions/:transactionId/refunds`) returned **503**
`REFUND_INITIATION_DISABLED`, not 403 — because the capability gate runs
before the tenant compare and the harness defaults that capability off. That
is the documented ordering (`R1-T6-transactions-refunds-batch-2026-09-06.md`,
"capability gate before role gate"), not a bypass: cross-merchant B still
cannot refund A's transaction, the request is just short-circuited one stage
earlier. Re-run with `FEATURE_REFUND_INITIATION=true` (and
`ENV_VALIDATION_MODE=enforce`, required by `config.ts` for any
money-capability flag; `PAYMENT_MODE` stays `disabled` throughout, so no
other capability is touched) to actually reach the ownership compare:

```
PASS server server/__tests__/r1-t3-tenant-scoping-probe.test.ts
  ✓ site 2: POST /api/transactions/:id/cancel — B cannot cancel A's transaction
  ✓ site 3: POST /api/transactions/:transactionId/refunds — B cannot refund A's transaction
  ✓ site 4: GET /api/transactions/:transactionId/refunds — B cannot list A's transaction refunds
  ✓ site 5: GET /api/refunds/:refundId — B cannot fetch A's refund
  ✓ site 6: GET /api/v1/transactions/:id — B's API key cannot fetch A's transaction
  ✓ site 1: PATCH /api/transactions/:id/split-enabled — B cannot toggle A's transaction (sanity re-check)
Tests: 6 passed, 6 total
```

All six sites return 403 (or, for `cancel`, 403 with the transaction
provably still `pending` afterward — confirmed by re-fetching it) when a
second, unrelated merchant attempts the operation. **No red result could be
produced for any bucket-D site**, independently confirming the plan's
verdict rather than just inheriting it. This satisfies the "failing-test-
first" rule's own precondition in the negative: there is no current gap to
prove, so there is nothing to build a fix under.

Existing coverage was also re-confirmed by reading
`server/__tests__/http-params-transactions-refunds-batch.test.ts`: only site
1 (`split-enabled`, line 118) has a committed cross-tenant regression test
today (already passing). Sites 2–6 have zero committed cross-tenant test —
only same-owner-success and malformed-id-400 cases (lines 162–184, 357–463,
465–505). That is a real, citable **test-coverage gap**, distinct from an
**authorization gap** — the runtime probe above shows the underlying
authorization already holds; it is just not asserted in committed tests for
five of the six sites.

## Verdict and what was (and was not) done

Per the task's explicit instruction — "If the plan concluded there was
nothing to fix, just write the evidence file recording that finding (no
code change)" — and independently confirmed above:

- **No `IStorage` method added.** The plan's own draft
  (`getTransactionForMerchant`/`getRefundForMerchant`) was not implemented.
  Adding it now, with no failing test to justify it, would be a structural
  refactor dressed up as a security fix, and two of the six sites (`cancel`,
  `split-enabled`) also allow an admin bypass that a single merchant-scoped
  query can't express without an added role branch — the plan itself flagged
  that as a judgment call needing review, not something to resolve by
  guessing.
- **No route changed.** All bucket-D compares are today unconditional,
  correctly typed, and — per the runtime probe — actually enforce
  cross-tenant denial.
- **No schema migration.** `transactions.merchantId` / `refunds.merchantId`
  (shared/schema.ts:157, 328) already exist, are indexed
  (`transactions_merchant_id_idx` schema.ts:204,
  `refunds_merchant_id_idx` schema.ts:345), and a tenant-scoped method would
  be a pure `WHERE id = ? AND merchant_id = ?` on existing columns — moot
  here since nothing was implemented, but confirmed so no reader has to
  wonder if this pass silently skipped a migration it should have written.
- **The throwaway probe test was deleted, not committed** — it proved a
  negative (no bug), and the task's own instruction is to record the finding
  in this evidence file rather than land a test with nothing red behind it.
- **Two items are flagged for the owner, not decided here:**
  1. `POST /api/transactions/:id/split` (routes.ts:2370) has no
     authentication and no ownership check at all, by design (used by an
     anonymous customer split-payment page). Whether an anonymous holder of
     a transaction ID should be able to force a split on someone else's
     counter transaction is a product/security-model call (griefing risk,
     not fund theft), not something this pass will guess at.
  2. The Tap to Pay `transactionId` branch (routes.ts:2253/2254) has the
     same ownership-check shape as bucket D, but sits inside a Windcave-
     transport handler that is out of this task's boundary (D13-locked off
     regardless). Recommend the owner/plan decide whether it belongs to
     R1-T3/T7's tenant-storage scope or R2's Windcave boundary before anyone
     touches it.
- **The test-coverage gap on sites 2, 3, 4, 5, 6 remains open**, citable at
  `server/__tests__/http-params-transactions-refunds-batch.test.ts` (lines
  162–184, 357–463, 465–505). Adding committed cross-tenant regression tests
  there (the shape used in this pass's deleted probe) is worth doing as a
  follow-up, but is a coverage improvement, not a red-test-driven fix, and
  was not added to that file in this pass since it wasn't part of the
  approved plan's scope (which was scoped to "implement the tenant-scoping
  fix if provable, else record the finding").

## Verification (no functional change, so before == after)

- `npm run check` (tsc): clean, no output.
- `npm run test:server` (`jest --selectProjects server --runInBand`):
  **53 suites / 1020 tests pass**, both before this pass's investigation and
  after (no server code was changed; the throwaway probe file was deleted
  before this final run). `git status` is clean — the only change from this
  pass is this evidence file.

## Remaining risk

- Sites 2–6's authorization is sound today per the runtime probe above, but
  has no committed regression test guarding it — a future edit to any of
  these five handlers could silently reorder or drop the compare with no
  test to catch it. Recommend adding the five missing cross-tenant tests
  (mirroring `split-enabled`'s existing one) as a low-risk, no-schema
  follow-up.
- `POST /api/transactions/:id/split`'s total absence of an ownership check
  (item 1 above) and the Tap to Pay branch's scope boundary (item 2 above)
  are both real, unresolved, owner-visible open questions — not fixed, not
  silently dropped.
- R1-T7's broader §8.5 scope (boards, stock, property clients/invoices,
  trades clients/quotes/invoices, settings, uploads, exports) is untouched
  by this pass; this evidence file covers only the Transactions & Refunds
  domain named in the task.

## What was deliberately not done, and why

No `IStorage` method, no route change, no migration, no committed test
addition. The assigned domain (Transactions & Refunds) has no provable
authorization gap at the six candidate sites — confirmed both by reading
the live code and by an independent two-merchant runtime probe built for
this pass — so there is nothing to implement failing-tests-first under the
plan's own rule. The two flagged items above are genuine product/security-
model decisions for the owner, not coding decisions this pass will guess at.
