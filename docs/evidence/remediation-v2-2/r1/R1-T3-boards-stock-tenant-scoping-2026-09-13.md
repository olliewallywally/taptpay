# R1-T3 — tenant-scoping gaps in Boards (Tapt Stone) & Stock/Inventory: investigated, no code change

Date: 2026-09-13. Branch: `remediation/r1-continuation-20260907`. HEAD at start
and end: `1269e644` (working tree clean before and after — no commit needed
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
  as explicitly open (row R1-T7, and gap-list item 7); this domain (boards/
  stock) is one slice of that still-open item.
- Style/precedent: `r1/R1-T3-transactions-refunds-tenant-scoping-2026-09-13.md`
  (the immediately preceding sibling task — same task family, same "no gap
  found" conclusion, same independent-runtime-reverification method followed
  here) and `r1/R1-T6-nfc-tapt-stone-and-days-clamp-2026-09-06.md` (prior
  batch that touched this exact route family and recorded the public
  `GET /api/tapt-stones/:id` design decision this pass re-confirms rather
  than re-litigates).

This task was assigned as a pre-approved plan (the investigation summary
below, produced by a prior read-only pass against live `shared/schema.ts`,
`server/storage.ts`, `server/routes.ts` at commit `9a51bd8`/this branch's
lineage) with the explicit instruction: implement exactly that plan,
failing-test-first; if the plan concluded there was nothing to fix, record
that finding here with no code change. This pass first independently
re-verified the plan's central claim by reading the live files at the
current HEAD and by writing a throwaway two-merchant runtime probe (below),
then followed its own conclusion.

## Domain inventory (from the approved plan, independently re-confirmed by
reading the live files at `1269e644`)

**Board (`taptStones`) routes:** `GET/POST /api/merchants/:id/tapt-stones`
(routes.ts:3763, 3779), `PUT/DELETE /api/merchants/:merchantId/tapt-stones/:stoneId`
(routes.ts:3830, 3865), `GET /api/tapt-stones/:id` (routes.ts:3899). Confirmed
by reading each handler directly — line numbers, `checkMerchantOwnership`
gating, and the inline comments ("cross-tenant guard") all matched the plan
verbatim. Non-CRUD `getTaptStone` reads inside payment/QR/SSE flows
(routes.ts:1107, 2043, 2110, 2698, 5331) are payment/checkout-adjacent, not
board CRUD, and are excluded per the task's own scope line (Windcave
transport/session-binding no-touch zone).

**Stock (`stockItems`) routes:** `GET/POST /api/merchants/:merchantId/stock-items`
(routes.ts:5857, 5876), `PUT/DELETE /api/merchants/:merchantId/stock-items/:itemId`
(routes.ts:5904, 5941). Confirmed by reading each handler directly.

`IStorage.getTaptStone(id)` / `getStockItem(id)` (storage.ts:592, 601) take
no `merchantId` parameter, matching the plan's claim that the discouraged
"global fetch + route-level compare" shape from §8.5 is present at
routes.ts:3846/3876 (`existingStone.merchantId !== merchantId`) and
routes.ts:5917/5954 (`existingItem.merchantId !== merchantId`). `taptStones`
and `stockItems` (shared/schema.ts:579–607) both carry a plain
`merchantId: integer(...).references(() => merchants.id)` column with no
unique/foreign-key trickery that would make a scoped query impossible —
confirming no schema migration would be needed even if a fix were written.

## Independent runtime re-verification (this pass, not just re-reading)

The approved plan's central claim — "the `merchantId` being compared is not
attacker-controlled... no route in this domain where a request-body or
query-supplied `merchantId` ... is what gets compared... a crafted request
with someone else's `stoneId`/`itemId` correctly 404s" — was based on static
reading. Rather than accept that verdict from reading alone, this pass wrote
a throwaway four-case two-merchant probe
(`server/__tests__/r1-t3-boards-stock-probe.test.ts`, never committed,
deleted immediately after use) exercising all four write routes:

```ts
const a = await createOwnerPrincipal();
const b = await createOwnerPrincipal();
const create = await request(app)
  .post(`/api/merchants/${a.merchantId}/tapt-stones`)
  .set(bearer(a))
  .send({});
const stoneId = create.body.id;

// B, authorized on B's own path, targets A's stoneId:
const res = await request(app)
  .put(`/api/merchants/${b.merchantId}/tapt-stones/${stoneId}`)
  .set(bearer(b))
  .send({ name: "hijacked" });
```

First run exposed an error in this pass's own *assumption*, not in the
product code: the first draft asserted `403` for "B's own path, A's
`stoneId`"; the real (and correct) behavior is `404`, because
`checkMerchantOwnership`/the inline role check pass first (B is legitimately
authorized on B's own merchantId path), and only then does
`existingStone.merchantId !== merchantId` fail — which the route reports as
`404 "Tapt stone not found"`, not `403`. That is exactly the plan's own
described behavior ("a crafted request... correctly 404s") — the test's
expected status was wrong, not the route. Corrected the assertions to `404`
for that shape and re-ran. A second case (B supplying A's own merchantId in
the path, so the ownership pre-check itself fires) does correctly return
`403`, confirming that path is also closed. Final run:

```
PASS server server/__tests__/r1-t3-boards-stock-probe.test.ts
  ✓ B cannot rename A's tapt stone (404, own path/foreign stone)
  ✓ B cannot delete A's tapt stone even by guessing A's own merchantId in the path (403, foreign path)
  ✓ B cannot update A's stock item (404, own path/foreign item)
  ✓ B cannot delete A's stock item (404, own path/foreign item)
Tests: 4 passed, 4 total
```

Each case also asserted no side effect: after B's blocked delete attempts,
A's `GET /api/merchants/:id/tapt-stones` and `GET /api/merchants/:id/stock-items`
still list the untouched stone/item. **No red result could be produced for
any of the four write routes** — independently confirming the plan's verdict
rather than just inheriting it. This satisfies the "failing-test-first"
rule's own precondition in the negative: there is no current gap to prove,
so there is nothing to build a fix under.

The one route with genuinely no ownership check at all —
`GET /api/tapt-stones/:id` (routes.ts:3899) — was re-checked against its
existing accepted disposition rather than treated as a fresh finding:
`server/route-policy.ts:147` records `principal: "public"`; `server/route-inventory.ts:283-284`
gives the rationale ("raw row has no sensitive fields...
paymentUrl/qrCodeUrl are already the public payment link"); and
`r1/R1-T6-nfc-tapt-stone-and-days-clamp-2026-09-06.md` independently recorded
the same "no auth or ownership check (by design)" conclusion in an earlier
batch. This pass additionally confirmed no client in `client/src` calls this
bare route — `grep -rn "/api/tapt-stones/" client/src` returns only the
merchant-scoped `PUT`/`DELETE` call sites in `demo-terminal.tsx`,
`merchant-terminal-mobile-v2.tsx`, and `retail-terminal.tsx` — consistent
with legacy-but-deliberately-public rather than an oversight. Not re-flagged.

List routes (`getTaptStonesByMerchant`, `getStockItemsByMerchant`) were
confirmed already filtered by `merchantId` at the query level in both
`MemStorage` and `DbStorage` — the §8.5-preferred idiom — and were not
touched.

## Verdict and what was (and was not) done

Per the task's explicit instruction — "If the plan concluded there was
nothing to fix, just write the evidence file recording that finding (no
code change)" — and independently confirmed above:

- **No `IStorage` method added.** A `getTaptStoneForMerchant(id, merchantId)`
  / `getStockItemForMerchant(id, merchantId)` pair would be a reasonable
  hygiene alignment with §8.5's stated preference (defense against a future
  route that forgets the pre-check), but there is no failing test to justify
  it today — writing one now would be inventing a failure that doesn't
  exist, which the task explicitly says not to do.
- **No route changed.** All four write-route compares (routes.ts:3846, 3876,
  5917, 5954) are unconditional, use only the caller's own JWT-derived
  `merchantId`/`role` (never attacker-supplied), and — per the runtime probe
  — actually deny cross-tenant access (403 when the path merchantId itself is
  foreign, tenant-safe 404 when the id inside an authorized path belongs to
  another tenant).
- **No schema migration.** `taptStones.merchantId` / `stockItems.merchantId`
  (shared/schema.ts:581, 598) already exist and are plain integer FK columns;
  a tenant-scoped method would be a pure `WHERE id = ? AND merchant_id = ?`
  on existing columns — moot here since nothing was implemented, but
  confirmed so no reader has to wonder if this pass silently skipped a
  migration it should have written.
- **The throwaway probe test was deleted, not committed** — it proved a
  negative (no bug, after correcting its own wrong initial status-code
  assumption), and the task's own instruction is to record the finding in
  this evidence file rather than land a test with nothing red behind it.
- **`GET /api/tapt-stones/:id`'s public-by-design status is re-confirmed,
  not re-flagged** — already reviewed twice before this pass
  (`route-policy.ts`, `route-inventory.ts`, and the 2026-09-06 batch
  evidence); independently re-verified here (schema fields, client callers).

## Verification (no functional change, so before == after)

- `npm run check` (tsc): clean, no output.
- `npm run test:server` (`jest --selectProjects server --runInBand`):
  **53 suites / 1020 tests pass**, both before this pass's investigation and
  after (no server code was changed; the throwaway probe file was deleted
  before this final run). `git status` is clean — the only change from this
  pass is this evidence file.

## Remaining risk

- The four write-route compares are sound today per the runtime probe above,
  but (like the sibling transactions/refunds domain) have no committed
  cross-tenant regression test guarding them — a future edit to any of these
  four handlers could silently reorder or drop the compare with no test to
  catch it. Recommend adding committed cross-tenant tests for
  tapt-stones/stock-items PUT/DELETE (mirroring the pattern in
  `http-params-nfc-tapt-stone-batch.test.ts`) as a low-risk, no-schema
  follow-up — not done here since it is a coverage improvement, not a
  red-test-driven fix, and was outside the approved plan's scope.
- R1-T7's broader §8.5 scope (property clients/invoices, trades
  clients/quotes/invoices, settings, uploads, exports) is untouched by this
  pass; this evidence file covers only the Boards & Stock domain named in
  the task.
- The already-tracked, unfixed, out-of-scope split-payment session-replay
  gap in `finaliseHostedPayment` (`r1/R1-T7-windcave-session-binding-2026-09-11.md`)
  and the unauthenticated legacy-no-board SSE gap (gap 12,
  `r1/R1-T2-classifier-extension-2026-09-12.md`) are unrelated to this
  domain and not actioned here.

## What was deliberately not done, and why

No `IStorage` method, no route change, no migration, no committed test
addition. The assigned domain (Boards & Stock) has no provable authorization
gap at the four candidate write-route sites — confirmed both by reading the
live code and by an independent two-merchant runtime probe built for this
pass — so there is nothing to implement failing-tests-first under the plan's
own rule. `GET /api/tapt-stones/:id`'s deliberate public design was
re-verified, not overridden — changing it would be a product/security-model
decision (and would touch a route two independent prior reviews already
accepted), not something this pass will guess at.
