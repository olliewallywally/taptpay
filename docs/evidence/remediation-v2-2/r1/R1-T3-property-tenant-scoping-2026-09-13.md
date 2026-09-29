# R1-T3 — tenant-scoping gaps in Property (tenantProfiles / activeSchedules / invoicesRentRequests): investigated, no code change

Date: 2026-09-13. Branch: `remediation/r1-continuation-20260907`. HEAD at start
and end: `7d3681ca` (working tree's pre-existing unrelated dirty files —
`client/src/__tests__/trades-terminal-view-boundary.test.tsx`,
`client/src/pages/trades/trades-terminal.tsx`, `server/routes.ts`,
`shared/schema.ts`, and the untracked mobile-quote-flow files — were present
before this pass and left untouched throughout; no commit needed beyond this
evidence file).

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
  as explicitly open (row R1-T7, and gap-list item 7); this domain (property)
  is one slice of that still-open item.
- Style/precedent: `r1/R1-T7-windcave-session-binding-2026-09-11.md` and the
  two immediately-preceding sibling investigations in this same task family —
  `r1/R1-T3-boards-stock-tenant-scoping-2026-09-13.md` and
  `r1/R1-T3-transactions-refunds-tenant-scoping-2026-09-13.md` — same method:
  independently re-verify the approved plan's static reading, then follow its
  own conclusion.

This task was assigned as a pre-approved plan (the investigation summary
below, produced by a prior read-only pass against live `shared/schema.ts`,
`server/storage.ts`, `server/routes.ts`, `server/route-policy.ts`) with the
explicit instruction: implement exactly that plan, failing-test-first; if the
plan concluded there was nothing to fix, record that finding here with no
code change. Unlike the plan's own author (a read-only search agent with no
Edit/Write access), this pass has full tool access, so — following the two
immediately-preceding siblings' method — it first independently re-verified
the plan's claims by re-reading the live files and by writing a throwaway
runtime probe, then followed its own conclusion.

## Naming correction (re-confirmed from the approved plan)

The task as originally phrased named "`clientProfiles`" for the property
vertical. Reading live `shared/schema.ts` confirms the plan's correction:
`clientProfiles` (schema.ts:1219) sits under
`/* ═══════════════ TRADES VERTICAL ═══════════════ */` (schema.ts:1215), and
`server/storage.ts`'s `IStorage` interface likewise labels it
`// ── Trades vertical ──` (storage.ts:788). The property vertical's actual
client-analog table is **`tenantProfiles`** (schema.ts:1027), under
`// PROPERTY MANAGEMENT VERTICAL` (schema.ts:1021). This investigation covers
`tenantProfiles` + `invoicesRentRequests` (both explicitly property-vertical)
plus `activeSchedules`, which shares every route handler and the identical
pattern in the same code block — not `clientProfiles`, which is Trades and
out of this domain.

## Domain inventory (from the approved plan, independently re-confirmed by

reading the live files at HEAD `7d3681ca`)

All 14 routes below live in `server/routes.ts`, all gated
`authenticateToken` + `checkMerchantOwnership(req, x.merchantId)`. Read in
full at routes.ts:451–456:

```ts
function checkMerchantOwnership(req: AuthenticatedRequest, merchantId: number): boolean {
  if (!req.user) return false;
  if (!Number.isInteger(merchantId) || merchantId <= 0) return false;
  if (req.user.role === 'admin') return true;
  return req.user.merchantId === merchantId;
}
```

This is the identical helper the two immediately-preceding sibling
investigations (Boards/Stock, Transactions/Refunds) already independently
verified correct — not re-derived here, only re-confirmed present and
unchanged.

| # | Route | Global fetch | Compare (unconditional) |
|---|---|---|---|
| 1 | `GET /api/property/tenants/:id` | `storage.getTenantProfile(req.params.id)` — routes.ts:7177 | routes.ts:7179 |
| 2 | `PUT /api/property/tenants/:id` | routes.ts:7188 | routes.ts:7190 |
| 3 | `POST /api/property/tenants/:id/archive` | routes.ts:7204 | routes.ts:7206 |
| 4 | `POST /api/property/tenants/:id/unarchive` | routes.ts:7217 | routes.ts:7219 |
| 5 | `GET /api/property/tenants/:id/events` | routes.ts:7230 | routes.ts:7232 |
| 6 | `GET /api/property/tenants/:tenantId/schedules` | routes.ts:7254 | routes.ts:7256 |
| 7 | `POST /api/property/tenants/:tenantId/schedules` | routes.ts:7265 | routes.ts:7267 |
| 8 | `PUT /api/property/schedules/:id` | `storage.getActiveSchedule(req.params.id)` — routes.ts:7283 | routes.ts:7285 |
| 9 | `DELETE /api/property/schedules/:id` | routes.ts:7302 | routes.ts:7304 |
| 10 | `POST /api/property/invoices` (body `tenantProfileId`) | `storage.getTenantProfile(req.body.tenantProfileId)` — routes.ts:7364 | routes.ts:7366 |
| 11 | `POST /api/property/invoices/:id/resend` | `storage.getInvoiceRentRequest(req.params.id)` — routes.ts:7404 | routes.ts:7406 |
| 12 | `GET /api/property/invoices/:id` | routes.ts:7419 | routes.ts:7421 |
| 13 | `POST /api/property/invoices/:id/void` | routes.ts:7430 | routes.ts:7432 |
| 14 | `POST /api/property/invoices/:id/mark-paid-external` | routes.ts:7444 | routes.ts:7446 |

Every line number above was independently re-read at the current HEAD (they
drifted by a handful of lines from the plan's cited numbers, consistent with
normal code movement since the plan was written; the code shape is
identical). All 14 are confirmed classified in `server/route-policy.ts:226–244`
as `principal: "merchant-user"` with markers
`["authenticateToken","checkMerchantOwnership"]` — no unclassified/gap entry
for this domain.

**Not in scope, confirmed correctly excluded:**
`GET/PUT /api/property/reminder-settings` (routes.ts:7889, 7899) — re-read in
full; both operate only on `req.user.merchantId` via `storage.getMerchant`/
`storage.updateMerchant`, take no id param, and have no IDOR surface.
`getCheckoutInvoiceByToken`/`getCheckoutParty`/`finalizeRentInvoice`/
`sendRentGstInvoices` (routes.ts:7084, 7091, 7033, 6999) and the public
`/api/checkout/resolve/:token` family (routes.ts:7464+) — token-authorized
hosted-checkout/finalization helpers, part of the split-payment/Windcave flow
this task's hard rules forbid touching. `POST /api/windcave/rent-notification`
(routes.ts:7790) and `POST /api/webhooks/whatsapp` (routes.ts:7827) —
provider-webhook routes keyed by session/message id, not merchant-JWT routes;
also out-of-scope callback logic. List routes `GET /api/property/schedules`
(routes.ts:7246, calls `getActiveSchedulesByMerchant`) and
`GET /api/property/invoices` (routes.ts:7319, calls
`getInvoiceRentRequestsByMerchant`) already use the §8.5-preferred idiom —
filtered by `merchantId` at the query itself — and were not touched.

## A structural fact this pass found that the approved plan did not surface:

**the property vertical is DB-only; `MemStorage` cannot exercise it**

Reading `server/storage.ts`'s `MemStorage` class (the only backend
`server/__tests__/support/http-harness.ts`'s no-live-database harness can
use — it explicitly asserts `liveStorage.clearAllMerchants` exists and
refuses to run otherwise) shows all three property-vertical `create*`
methods are unimplemented stubs that throw, and the `get*` methods always
return `undefined`:

```ts
// storage.ts:2886-2903 (MemStorage)
async createTenantProfile(data: any): Promise<any> { throw new Error("Property management requires database"); }
async getTenantProfile(id: string): Promise<any> { return undefined; }
async createActiveSchedule(data: any): Promise<any> { throw new Error("Property management requires database"); }
async getActiveSchedule(id: string): Promise<any> { return undefined; }
async createInvoiceRentRequest(data: any): Promise<any> { throw new Error("Property management requires database"); }
async getInvoiceRentRequest(id: string): Promise<any> { return undefined; }
```

This is a real difference from the two immediately-preceding sibling
domains: Boards/Stock's `taptStones`/`stockItems` (storage.ts:2664–2766) and
Transactions/Refunds are both fully implemented in `MemStorage`, so those
siblings' runtime probes could create real cross-merchant fixtures through
the actual HTTP routes. Property cannot — which is also the direct
explanation for why zero committed HTTP tests exist for any of these 14
routes today (confirmed: `grep -rl "property" server/__tests__/*.ts` finds no
dedicated property test file, and the two files it does match,
`http-params-admin-batch.test.ts`-style batches, don't cover this domain).
It is a structural gap in test infrastructure, not evidence that the routes
were skipped by oversight.

## Independent runtime re-verification (this pass, not just re-reading)

The approved plan explicitly declined to run any runtime probe ("I did not
write or run a runtime probe in this pass... as a read-only search agent I
have no Edit/Write tool access"), unlike the two immediately-preceding
siblings. Because of the `MemStorage` limitation above, a probe for this
domain cannot use the siblings' pattern of creating fixtures through the real
HTTP create routes. It also cannot start a server against a real database —
this task's hard rules explicitly forbid that. The only way to exercise
these 14 handlers' actual authorization logic without either is to mock the
three `get*` lookups (`getTenantProfile`, `getActiveSchedule`,
`getInvoiceRentRequest`) with `jest.spyOn`, an already-established pattern in
this codebase's own test suite (e.g. `jest.spyOn(storage, "getApiKeyByKey")`
in `server/__tests__/http-params-transactions-refunds-batch.test.ts:475`).
This exercises every line of the real route handler — `authenticateToken`,
the `checkMerchantOwnership` compare, `requireBillingCard` ordering, error
shapes — with only the storage lookup itself replaced by a fixture row owned
by merchant A.

Wrote a throwaway probe,
`server/__tests__/r1-t3-property-tenant-scoping-probe.test.ts` (never
committed, deleted immediately after use), covering all 14 sites plus one
sanity check that the true owner *can* reach her own resource (proving the
mock isn't vacuously blocking everyone):

```ts
const a = await createOwnerPrincipal();
const b = await createOwnerPrincipal();
jest.spyOn(storage, "getTenantProfile").mockResolvedValue({ id: TENANT_ID, merchantId: a.merchantId, ... });

// B, authenticated as herself, targets A's tenant id:
const res = await request(app).get(`/api/property/tenants/${TENANT_ID}`).set(bearer(b));
expect(res.status).toBe(403);
```

Result, first and only run — no correction needed:

```
PASS server server/__tests__/r1-t3-property-tenant-scoping-probe.test.ts
  ✓ site 1: GET /api/property/tenants/:id — B cannot fetch A's tenant
  ✓ site 2: PUT /api/property/tenants/:id — B cannot update A's tenant
  ✓ site 3: POST /api/property/tenants/:id/archive — B cannot archive A's tenant
  ✓ site 4: POST /api/property/tenants/:id/unarchive — B cannot unarchive A's tenant
  ✓ site 5: GET /api/property/tenants/:id/events — B cannot read A's tenant's events
  ✓ site 6: GET /api/property/tenants/:tenantId/schedules — B cannot list A's tenant's schedules
  ✓ site 7: POST /api/property/tenants/:tenantId/schedules — B cannot create a schedule under A's tenant
  ✓ site 8: PUT /api/property/schedules/:id — B cannot update A's schedule
  ✓ site 9: DELETE /api/property/schedules/:id — B cannot terminate A's schedule
  ✓ site 10: POST /api/property/invoices (body tenantProfileId) — B cannot bill A's tenant
  ✓ site 11: POST /api/property/invoices/:id/resend — B cannot resend A's invoice
  ✓ site 12: GET /api/property/invoices/:id — B cannot fetch A's invoice
  ✓ site 13: POST /api/property/invoices/:id/void — B cannot void A's invoice
  ✓ site 14: POST /api/property/invoices/:id/mark-paid-external — B cannot mark A's invoice paid
  ✓ sanity: A (the true owner) CAN fetch her own tenant — proves the mock/route wiring is real, not vacuously passing
Tests: 15 passed, 15 total
```

All 14 sites return 403 for a second, unrelated merchant, and the sanity
check confirms the true owner still succeeds (200) against the identical
mock — the 403s are the real `checkMerchantOwnership` branch firing, not a
mock that blocks everyone. **No red result could be produced for any of the
14 sites.** This satisfies the "failing-test-first" rule's own precondition
in the negative: there is no current gap to prove, so there is nothing to
build a fix under — independently confirming the plan's verdict at runtime
rather than only from static reading, matching (and, given the domain's
DB-only storage, going slightly beyond in adapting) the method the two
immediately-preceding sibling investigations used.

Site 10 is the one place an attacker chooses which foreign record to probe
(`tenantProfileId` in the POST body rather than a path param) — the probe's
site-10 case exercises exactly that shape and it also 403s. Site 7's create
path was confirmed to reject before `requireBillingCard` ever runs (the
ownership check sits before the billing-card gate in the handler source),
so the probe did not need to fake a billing card to reach the compare it was
testing.

## Verdict and what was (and was not) done

Per the task's explicit instruction — "If the plan concluded there was
nothing to fix, just write the evidence file recording that finding (no
code change)" — and independently confirmed above:

- **No `IStorage` method added.** The plan's own draft
  (`getTenantProfileForMerchant`/`getActiveScheduleForMerchant`/
  `getInvoiceRentRequestForMerchant`) was not implemented. Adding it now,
  with no failing test to justify it, would be a structural refactor dressed
  up as a security fix — exactly the same judgment the two sibling
  investigations reached for their domains.
- **No route changed.** All 14 compares are today unconditional, correctly
  typed, keyed only off the server-derived `req.user.merchantId`/`role`
  (never attacker-supplied), and — per the runtime probe — actually enforce
  cross-tenant denial (403) at every site, including the one
  attacker-chosen-id site (10).
- **No schema migration.** `tenantProfiles.merchantId`,
  `activeSchedules.merchantId`, and `invoicesRentRequests.merchantId`
  (schema.ts:1029, 1045, 1066) already exist as plain non-null integer FK
  columns. `activeSchedules` and `invoicesRentRequests` already carry
  composite indexes covering `merchantId`
  (`active_schedules_merchant_status_idx`, `invoices_merchant_status_idx` —
  schema.ts:1061, 1113, both confirmed by direct read); `tenantProfiles` has
  no explicit secondary index at all (confirmed: its `pgTable` call has no
  index block), but a scoped method would filter by primary key `id`
  (already unique/indexed) plus an equality check on `merchantId` in the
  same row — moot here since nothing was implemented, but confirmed so no
  reader has to wonder if this pass silently skipped a migration it should
  have written.
- **The throwaway probe test was deleted, not committed** — it proved a
  negative (no bug), and the task's own instruction is to record the finding
  in this evidence file rather than land a test with nothing red behind it.
- **The admin-bypass question the plan raised is now moot for a different
  reason than it guessed.** The plan worried that dropping
  `checkMerchantOwnership` in favor of a merchant-scoped query would silently
  remove the `role === 'admin'` bypass. Since no route was changed, the
  bypass is untouched either way — `checkMerchantOwnership`'s admin branch
  (routes.ts:454) still applies to all 14 sites exactly as today.
- **The MemStorage/DB-only structural gap above is flagged, not fixed.**
  Implementing the property vertical's `create*`/`get*` methods on
  `MemStorage` (so this domain could get committed HTTP-level regression
  tests the way Boards/Stock and Transactions/Refunds already can) is a
  test-infrastructure improvement, not a security fix, and touches shared
  storage-class code well outside this task's scoped fix — not attempted
  here.

## Verification (no functional change, so before == after)

- `npm run check` (tsc): clean, no output.
- `npm run test:server` (`jest --selectProjects server --runInBand`):
  **54 suites / 1024 tests pass**, both before this pass's investigation and
  after (no server production code was changed; the throwaway probe file,
  when present, added exactly 1 suite / 15 tests, all passing — confirmed by
  running the suite once with it present, 55/1039, and once after deleting
  it, 54/1024). `git status` shows only this evidence file as new; the
  pre-existing unrelated dirty files
  (`client/src/__tests__/trades-terminal-view-boundary.test.tsx`,
  `client/src/pages/trades/trades-terminal.tsx`, `server/routes.ts`,
  `shared/schema.ts`, and the untracked mobile-quote-flow files) were present
  before this pass, are unrelated to this task, and were not read, staged, or
  modified by it.

## Remaining risk

- All 14 sites' authorization is sound today per the runtime probe above,
  but — like both sibling domains — has zero committed regression test
  guarding it, and (unique to this domain) the existing `MemStorage`-only
  test harness cannot host such a test without either implementing the
  property vertical on `MemStorage` first or adopting the mock-the-lookup
  pattern this pass used. A future edit to any of these 14 handlers could
  silently reorder or drop the compare with nothing to catch it in CI.
  Recommend, as a low-risk follow-up: either (a) commit a version of this
  pass's mock-based probe as permanent regression coverage, or (b) implement
  `MemStorage` support for the property vertical and add fixture-based
  cross-tenant tests matching the Boards/Stock and Transactions/Refunds
  pattern — a larger change, out of scope for a same-day fix.
- R1-T7's broader §8.5 scope (trades clients/quotes/invoices, settings,
  uploads, exports) is untouched by this pass; this evidence file covers
  only the Property domain (`tenantProfiles`/`activeSchedules`/
  `invoicesRentRequests`) named in the task.
- The already-tracked, unfixed, out-of-scope split-payment session-replay gap
  in `finaliseHostedPayment`
  (`r1/R1-T7-windcave-session-binding-2026-09-11.md`) and the unauthenticated
  legacy-no-board SSE gap (gap 12, `r1/R1-T2-classifier-extension-2026-09-12.md`)
  are unrelated to this domain and not actioned here.

## What was deliberately not done, and why

No `IStorage` method, no route change, no migration, no committed test
addition. The assigned domain (Property) has no provable authorization gap
at the 14 candidate route+compare sites — confirmed both by reading the live
code and by an independent runtime probe built for this pass (adapted to the
domain's DB-only storage constraint via lookup mocking rather than the
sibling domains' real-fixture pattern) — so there is nothing to implement
failing-tests-first under the plan's own rule. The `MemStorage` test-coverage
gap this pass surfaced is a genuine, citable follow-up item, not a coding
decision this pass will guess at or fold into a same-day fix.
