# R1-T3 — tenant-scoping gaps in Trades (clientProfiles / quotes / jobInvoices / jobSchedules / jobEvents): investigated, no code change

Date: 2026-09-13. Branch: `remediation/r1-continuation-20260907`. HEAD at start
of this pass: `d8dd8c95`. The working tree's pre-existing unrelated dirty files
— `server/routes.ts`, `shared/schema.ts`, `client/src/pages/trades/trades-terminal.tsx`,
`client/src/__tests__/trades-terminal-view-boundary.test.tsx`, and the untracked
`client/src/__tests__/mobile-quote-flow.test.tsx`,
`client/src/features/terminal/trades/MobileQuoteView.tsx`,
`client/src/features/terminal/trades/mobile-quote-view.css`,
`docs/HANDOFF-2026-09-13-mobile-quote.md`, `scripts/check-mobile-quote.mjs`,
`server/__tests__/mobile-quote-create.test.ts` — belong to a separate,
concurrently-running agent's "mobile quote flow" work. They were read but never
modified, reverted, stashed or staged by this pass. This commit contains this
evidence file only.

This is the fifth and last of the five R1-T3 tenant-scoping domains started on
2026-09-13, and the one the prior multi-agent pass stopped mid-implementation
(see `CONTINUATION-2026-09-07.md`'s top entry: *"Trades — NOT completed… its
scratch probe test was deleted, nothing else from it survives"*). It restarts
from scratch, as that note instructs.

## Docs read first

- `CLAUDE.md`
- `docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md` §1 (purpose/authority/
  reading order/hygiene/“definition of done”), §4 (D1–D13 locked decisions),
  §8.5 (tenant-scoped storage rule: *"Prefer storage methods that require
  tenant scope, such as `getTransactionForMerchant(transactionId, merchantId)`,
  over global reads followed by route-level comparison. Implement them for
  transactions, refunds, boards, stock, property clients/invoices, **trades
  clients/quotes/invoices**, settings, uploads, and exports."*). §8.4 was also
  read, because one adjacent finding below lands there rather than here.
- `docs/evidence/remediation-v2-2/CONTINUATION-2026-09-07.md` — status/gap
  tracker; its top entry describes this exact pass and the four sibling lanes
  already finished today.
- Style/method precedent — the three sibling investigations produced earlier
  today, all read in full:
  `r1/R1-T3-transactions-refunds-tenant-scoping-2026-09-13.md`,
  `r1/R1-T3-boards-stock-tenant-scoping-2026-09-13.md`,
  `r1/R1-T3-property-tenant-scoping-2026-09-13.md`.

This task was assigned as a pre-approved, review-gated plan (produced by a
read-only investigation pass with no Edit/Write access) with the instruction:
carry out exactly that plan; if it concluded there was nothing to fix,
independently verify that conclusion with a real two-merchant runtime probe,
delete the probe, and record the finding with no code change. That is what
happened. Every line number, table and claim below was re-derived from the
live files in this pass, not copied from the plan on trust.

## 0. Table-ownership correction, re-confirmed

The R1-T3 task family's original wording assigned `clientProfiles` to the
**Property** domain. That is wrong, and the Property pass already corrected it;
this pass re-confirmed the correction independently from live `shared/schema.ts`:

- `shared/schema.ts:1215` `/* ═══ TRADES VERTICAL ═══ */` → `clientProfiles:1219`,
  `quotes:1235`, `jobSchedules:1268`, `jobInvoices:1288`, `jobEvents:1336`.
- `shared/schema.ts:1021` `// PROPERTY MANAGEMENT VERTICAL` → `tenantProfiles:1027`.
- `server/storage.ts:788` labels the same block `// ── Trades vertical ──`.

**`clientProfiles` is Trades** (this domain); property's analog is
`tenantProfiles` (covered by the sibling Property file).

## 1. Line-number basis — important, because this file is Codex-dirty

`server/routes.ts` carries another agent's uncommitted edit (+18 net lines
inside `POST /api/trades/quotes`). **Every `server/routes.ts` line number in
this document is from committed `HEAD` (`git show HEAD:server/routes.ts`, 8609
lines)**; working-tree numbers are HEAD+18 for anything at or after HEAD:8069.
`server/storage.ts`, `server/route-policy.ts`, `server/auth.ts` and
`server/http-params.ts` are clean, so their numbers are identical either way.
`shared/schema.ts` is also Codex-dirty, but only below line 1371 (Zod schemas);
the table definitions cited in §0 and §5 are unchanged from HEAD.

## 2. Domain inventory — every global-fetch-then-compare site in scope

All 20 live in `server/routes.ts`. All are `authenticateToken` only — unlike
Property/Boards, this family has **no `checkMerchantOwnership` call at all**; it
compares inline. All 20 share the identical preamble:

```ts
const merchantId = req.user?.merchantId;
if (!merchantId) return res.status(401).json({ message: "Authentication required" });
```

| # | Route | Global fetch (HEAD line) | Compare (HEAD line) | merchantId source |
|---|---|---|---|---|
| 1 | `GET /api/trades/clients/:id` | `getClientProfile(req.params.id)` 7994 | 7995 | JWT → users row |
| 2 | `PUT /api/trades/clients/:id` | 8003 | 8004 | JWT → users row |
| 3 | `POST /api/trades/clients/:id/archive` | 8014 | 8015 | JWT → users row |
| 4 | `POST /api/trades/clients/:id/unarchive` | 8023 | 8024 | JWT → users row |
| 5 | `POST /api/trades/clients/:id/promote` | 8033 | 8034 | JWT → users row |
| 6 | `GET /api/trades/clients/:id/events` | 8043 | 8044 | JWT → users row |
| 7 | `POST /api/trades/quotes` (body `clientProfileId`) | 8067 | 8068 | JWT → users row |
| 8 | `GET /api/trades/quotes/:id` | `getQuote(req.params.id)` 8116 | 8117 | JWT → users row |
| 9 | `GET /api/trades/quotes/:id/pdf` | 8143 | 8144 | JWT → users row |
| 10 | `POST /api/trades/quotes/:id/resend` | 8167 | 8168 | JWT → users row |
| 11 | `POST /api/trades/invoices` (body `clientProfileId`) | 8303 | 8304 | JWT → users row |
| 12 | `POST /api/trades/invoices` (body `quoteId`) | `getQuote` 8307 | 8308 | JWT → users row |
| 13 | `POST /api/trades/invoices/:id/resend` | `getJobInvoice` 8330 | 8331 | JWT → users row |
| 14 | `POST /api/trades/invoices/:id/send-balance` | 8345 | 8346 | JWT → users row |
| 15 | `POST /api/trades/invoices/:id/mark-paid-external` | 8380 | 8381 | JWT → users row |
| 16 | `POST /api/trades/invoices/:id/complete` | 8397 | 8398 | JWT → users row |
| 17 | `POST /api/trades/invoices/:id/void` | 8414 | 8415 | JWT → users row |
| 18 | `POST /api/trades/schedules` (body `clientProfileId`) | 8436 | 8437 | JWT → users row |
| 19 | `PUT /api/trades/schedules/:id` | `getJobSchedule` 8449 | 8450 | JWT → users row |
| 20 | `DELETE /api/trades/schedules/:id` | 8462 | 8463 | JWT → users row |

Every one of those 40 line numbers was re-read in this pass against
`git show HEAD:server/routes.ts` and matched exactly.

Sites **7, 11, 12 and 18** are the attacker-*chosen-id* shapes — the foreign
uuid arrives in the POST body rather than the path, so nothing about the URL
hints that a cross-tenant object is being named. All four still compare against
the caller's own `merchantId`.

**Two derived-id reads that carry no compare of their own**, both safe
transitively — recorded as defence-in-depth notes, not gaps:

- `send-balance` → `storage.getQuote(dep.quoteId)` HEAD:8352, existence-checked
  only. Safe because `dep` already passed site 14's compare, and `dep.quoteId`
  could only ever have been set through site 12's compare.
- `GET /api/trades/clients/:id/events` → `storage.getJobEventsByClient(req.params.id)`
  HEAD:8045. That query (`server/storage.ts:7726`) filters on `clientProfileId`
  alone with **no `merchantId` predicate** — it is safe only because site 6
  gates it one line earlier. The probe below asserts explicitly that this
  function is never reached for a foreign client.

### `req.user.merchantId` is not attacker-controllable

`server/auth.ts:397–478` re-reads the `users` row on **every** request, rejects
unless `userRow.status === 'active'` and `user.merchantId === decoded.merchantId`
(auth.ts:463), re-reads the merchant row and rejects unless it is
verified/active, and then sets `req.user` from the **database** row — "The
database role is authoritative; stale JWT role claims are ignored."

Note also that the admin principal carries `merchantId: 0` (auth.ts:428), which
is falsy, so `if (!merchantId) return 401` fires for admins on **every** trades
route. This family is fail-closed for admins; there is no admin bypass here
(unlike Property/Boards, whose `checkMerchantOwnership` has an explicit
`role === 'admin'` branch). The probe below asserts this.

### Confirmed out of scope, correctly excluded

Public token routes `GET /api/trades/quotes/token/:token` (HEAD:8179),
`GET /api/trades/quotes/token/:token/pdf` (8152),
`POST /api/trades/quotes/token/:token/respond` (8224) — single-resource
capability tokens, §8.5's "public checkout tokens authorize one payment
resource only". Hosted-checkout helpers `getCheckoutInvoiceByToken` /
`getCheckoutParty` / `finalizeTradeInvoice` (7084/7091/7116),
`POST /api/windcave/trades-notification` (7807) and
`POST /api/webhooks/whatsapp` (7827) — provider/session-keyed callback paths
belonging to the R2/R1-T7 workstreams this task's rules forbid touching.
Cron passes in `server/trades-cron.ts` / `server/trades-delivery.ts` — no
merchant JWT involved.

The four list routes already use the §8.5-preferred idiom and were not touched:
`getClientProfilesByMerchant` (storage.ts:7518), `getQuotesByMerchant` (7567),
`getJobInvoicesByMerchant` (7622), `getJobSchedulesByMerchant` (7694) — each a
`where(eq(X.merchantId, merchantId))` at the query itself. Verified
specifically: `GET /api/trades/invoices`'s `?clientProfileId=` filter is applied
**inside** the merchant-scoped query (storage.ts:7626, `conds.push` onto a
`conds` array already seeded with the merchantId equality), so a foreign
`clientProfileId` narrows to the empty set rather than escaping the tenant.

All 31 trades route registrations are classified in
`server/route-policy.ts:258–288` as `merchant-user` or `public` — zero
unclassified, zero `unauthenticated-suspect`.

## 3. Trades is DB-only in `MemStorage` — why the probe is mock-based

`server/storage.ts:2915–2947` stubs the entire trades vertical for `MemStorage`,
which is the only backend the no-live-database harness
(`server/__tests__/support/http-harness.ts`) can use:

```ts
// ── Trades — MemStorage stubs (DB-only feature) ───────────────────────────
async createClientProfile(data: any): Promise<any> { throw new Error("Trades requires database"); }
async getClientProfile(id: string): Promise<any> { return undefined; }
async createQuote(data: any): Promise<any> { throw new Error("Trades requires database"); }
async getQuote(id: string): Promise<any> { return undefined; }
async createJobInvoice(data: any): Promise<any> { throw new Error("Trades requires database"); }
async getJobInvoice(id: string): Promise<any> { return undefined; }
async createJobSchedule(data: any): Promise<any> { throw new Error("Trades requires database"); }
async getJobSchedule(id: string): Promise<any> { return undefined; }
```

So the Boards/Stock and Transactions/Refunds siblings' probe pattern — create
real cross-merchant fixtures through the actual HTTP create routes — is
impossible here, exactly as it was for Property. This pass therefore used the
Property pattern: two real merchants and two real logins built through the real
harness, with only the four global lookups stubbed to hand back a row owned by
merchant A. Everything else in the request path is the real thing —
`authenticateToken` (including its live users/merchant re-reads), the real
ownership compare, the real `requireBillingCard` ordering, the real error
shapes. Starting a server against a real database is forbidden by this task's
rules and was not done.

## 4. Independent runtime re-verification (this pass, not just re-reading)

Wrote a throwaway probe, `server/__tests__/r1-t3-trades-tenant-scoping-probe.test.ts`
(never committed; deleted immediately after the run), covering all 20 sites plus
five controls. Shape:

```ts
a = await createOwnerPrincipal();
b = await createOwnerPrincipal();
// Sites 7, 11, 12, 18 run requireBillingCard BEFORE the ownership lookup
// (HEAD:8060, 8281, 8431) — without this a 402 would mask the compare.
jest.spyOn(billing, "billingCardIsReady").mockReturnValue(true);
// Every trades mutator is spied so a refusal that still wrote would be caught.
for (const m of MUTATORS) jest.spyOn(storage as any, m).mockResolvedValue({ id: "written" });

jest.spyOn(storage, "getClientProfile").mockResolvedValue({ id: CLIENT_ID, merchantId: a.merchantId });
const res = await request(app).get(`/api/trades/clients/${CLIENT_ID}`).set(bearer(b));
expect(res.status).toBe(404);
expectNoWrites();
```

`MUTATORS` = `createClientProfile`, `updateClientProfile`, `archiveClientProfile`,
`unarchiveClientProfile`, `createQuote`, `updateQuote`, `createJobInvoice`,
`updateJobInvoice`, `createJobSchedule`, `updateJobSchedule`,
`terminateJobSchedule`, `createJobEvent` — every cross-tenant case asserts all
twelve are untouched, so "refused" means "refused **and** wrote nothing", not
merely "returned 404".

Site 12 is deliberately mixed: `getClientProfile` returns **B's own** client so
the site-11 gate passes, and only `getQuote` returns A's row — otherwise the
site-12 compare would never be reached and the case would be vacuous.

Result, first and only run — no correction needed, nothing went red:

```
PASS server server/__tests__/r1-t3-trades-tenant-scoping-probe.test.ts (15.389 s)
  R1-T3 probe — trades: merchant B against merchant A's rows
    ✓ site 1: GET /api/trades/clients/:id
    ✓ site 2: PUT /api/trades/clients/:id
    ✓ site 3: POST /api/trades/clients/:id/archive
    ✓ site 4: POST /api/trades/clients/:id/unarchive
    ✓ site 5: POST /api/trades/clients/:id/promote
    ✓ site 6: GET /api/trades/clients/:id/events
    ✓ site 7: POST /api/trades/quotes (attacker-chosen clientProfileId in body)
    ✓ site 8: GET /api/trades/quotes/:id
    ✓ site 9: GET /api/trades/quotes/:id/pdf
    ✓ site 10: POST /api/trades/quotes/:id/resend
    ✓ site 11: POST /api/trades/invoices (attacker-chosen clientProfileId in body)
    ✓ site 12: POST /api/trades/invoices (own client, attacker-chosen foreign quoteId)
    ✓ site 13: POST /api/trades/invoices/:id/resend
    ✓ site 14: POST /api/trades/invoices/:id/send-balance
    ✓ site 15: POST /api/trades/invoices/:id/mark-paid-external
    ✓ site 16: POST /api/trades/invoices/:id/complete
    ✓ site 17: POST /api/trades/invoices/:id/void
    ✓ site 18: POST /api/trades/schedules (attacker-chosen clientProfileId in body)
    ✓ site 19: PUT /api/trades/schedules/:id
    ✓ site 20: DELETE /api/trades/schedules/:id
  R1-T3 probe — controls (the 404s above must not be vacuous)
    ✓ sanity: A CAN fetch her own client
    ✓ sanity: A CAN fetch her own quote
    ✓ sanity: A CAN void her own invoice (the write path really is reachable)
    ✓ control: no Authorization header is 401, not a leak
    ✓ control: the admin principal (merchantId 0) has no bypass in this family
Tests: 25 passed, 25 total
```

What the run establishes:

- **All 20 sites deny a second, unrelated merchant with `404 {"message":"Not
  found"}`** (or the site-specific `"Client not found"` / `"Quote not found"` at
  sites 7/11/12/18) — not 403. Correct for this family: it has no
  `checkMerchantOwnership` 403 branch, and a tenant-safe 404 is what §8.5/§5.4
  want for an id the caller must not learn exists.
- **The refusals are not vacuous.** Against the identical stub, A gets `200` on
  her own client and her own quote, and A's void of her own invoice really does
  reach `updateJobInvoice(INVOICE_ID, { status: "voided", … })` — so the 404s
  are the real compare firing, not a stub that blocks everyone.
- **No write escapes a refusal** at any of the 15 mutating sites.
- **Site 6's unscoped follow-on query never runs** for a foreign client:
  `getJobEventsByClient` was spied and asserted `not.toHaveBeenCalled()`.
- **The admin principal is refused (401), not privileged**, confirming the
  `merchantId: 0` fail-closed reading above at runtime.

**No red result could be produced at any of the 20 sites.** The
failing-test-first rule is satisfied in the negative: there is no gap to prove,
so there is nothing to build a fix under.

## 5. Verdict and what was (and was not) done

**No gap. No code change.** Every authorization compare in the Trades domain
uses the caller's own server-derived `req.user.merchantId`; no site compares
against attacker-controllable input. Same conclusion as the three sibling
domains today, reached from the live code and an independent runtime probe
rather than from their write-ups.

- **No `IStorage` method added.** The plan drafted the §8.5-idiom additions
  (`getClientProfileForMerchant` / `getQuoteForMerchant` /
  `getJobInvoiceForMerchant` / `getJobScheduleForMerchant`, each
  `where(and(eq(X.id, id), eq(X.merchantId, merchantId)))`, touching `IStorage`
  at storage.ts:789–824, `MemStorage` at 2916–2947, `DbStorage` at 7508–7731)
  and then recommended **not** writing them. Agreed and followed: with nothing
  red behind it this is a structural refactor dressed as a security fix — the
  same judgment all three siblings reached.
- **No route changed.** All 20 compares are unconditional, correctly typed
  (`!==` between two integers, never a mixed-type comparison), and precede every
  write and every side effect.
- **No schema migration.** `clientProfiles.merchantId` (schema.ts:1220),
  `quotes.merchantId` (1237), `jobSchedules.merchantId` (1270),
  `jobInvoices.merchantId` (1290) and `jobEvents.merchantId` (1338) already
  exist as non-null `integer(...).references(() => merchants.id)` columns.
  `quotes`, `jobSchedules`, `jobInvoices` and `jobEvents` already carry
  composite `merchantId` indexes (`quotes_merchant_status_idx` 1264,
  `job_schedules_merchant_status_idx` 1286, `job_invoices_merchant_status_idx`
  1328, `job_events_merchant_created_idx` 1347). `clientProfiles` has no index
  block at all, but a scoped lookup would filter on its uuid primary key plus an
  equality on the same row, so even the hypothetical refactor needs no index.
  Nothing to migrate under any variant of this work — recorded explicitly so no
  later reader wonders whether a needed migration was skipped.
- **The throwaway probe was deleted, not committed.** It proves a negative;
  landing it would be new test surface with nothing red behind it, and the
  task's instruction is to record the finding here. §7 below recommends
  committing an equivalent as a separate, deliberate coverage item.

## 6. Codex-file blocking assessment

A separate agent has uncommitted work in `server/routes.ts` and
`shared/schema.ts` in this same tree, and git stages whole files. So:

- **Any route-level change in this domain is BLOCKED** until that work is
  committed — the trades block lives in `server/routes.ts`, and that agent's
  diff sits at HEAD:8067–8068, i.e. *inside site 7 itself*. Editing it would be
  uncommittable without sweeping someone else's in-progress work into this
  commit.
- `shared/schema.ts` is likewise blocked (nothing there needs changing anyway).
- A storage-only addition (`server/storage.ts`, clean) would not be blocked, but
  would be dead code with no caller.

**Because the correct action is "no code change", nothing is actually blocked in
practice.** This section matters only if the owner later decides to land the
§8.5 refactor: at that point the trades routes must wait for the mobile-quote
work to be committed first.

### Awareness of that uncommitted diff (checked `git diff`, not assumed)

`POST /api/trades/quotes` in the *working tree* has an uncommitted change making
`clientProfileId` optional (`recipient` / `skipClient` in `createQuoteSchema`,
working-tree `shared/schema.ts:1374–1392`) and, in the new branch, creating a
merchant-owned hidden `prospect` via `createClientProfile({ merchantId, … })`
with `merchantId` taken from the JWT. **This introduces no new tenant surface**:
the existing-client branch keeps the identical compare, and the new branch never
accepts a caller-supplied id. Its untracked test
`server/__tests__/mobile-quote-create.test.ts` already asserts the cross-tenant
404 for site 7 — but that file is uncommitted and not this remediation's to
claim as coverage. This pass's own probe covers site 7 independently, against
the same working-tree code.

## 7. Adjacent findings — recorded, deliberately not fixed here

1. **Zero committed trades HTTP test.** `git ls-files server/__tests__ | xargs
   grep -ln "api/trades"` returns nothing; the only match in the working tree is
   the other agent's untracked `mobile-quote-create.test.ts`. All 20 sites are
   unguarded by CI today. Same structural hole Property recorded. A future edit
   could reorder or drop a compare with nothing to catch it.
2. **`strictUuidParam` is defined and never used.** `server/http-params.ts:42`
   exists specifically for the uuid-keyed property/trades tables;
   `grep -c strictUuidParam server/routes.ts` = **0** (its only references are
   its own unit test and a comment in the source-guard test). Against a real
   Postgres, a malformed `:id` on any of these routes produces `invalid input
   syntax for type uuid`, which the handler's `catch` turns into a **500**, not
   the **400** §8.4 requires. This is a §8.4 item, not a tenant-scoping gap —
   and it would be BLOCKED anyway, since it edits `server/routes.ts`.
3. **No role gating anywhere in the trades family.** `grep -n "requireOwner|role
   === 'owner'" server/routes.ts` finds nothing in this block. Any *active
   member* of a merchant can void an invoice (site 17), mark one paid externally
   (site 15), terminate a schedule (site 20) or complete a job (site 16). That
   is tenant-safe but not necessarily role-safe. Consistent with Property, and
   an open §8.5 role-matrix item.

**Owner question (not an agent decision):** §8.5's safe defaults name refunds
and payout/configuration as owner-only but say nothing about trades invoice
void / mark-paid-external / schedule termination. Should those be owner-only,
or is member access intended? Finding 3 stays open until that is answered; a
coding agent must not guess a permission boundary that changes who can write off
money.

## 8. Verification (no functional change, so before == after)

- `npm run check` (tsc): clean, exit 0, no output — run with the probe file
  present, so the probe itself also typechecked.
- `npm run test:server` (`jest --selectProjects server --runInBand`):
  - **Before (probe absent): 54 suites / 1024 tests, all passing.**
  - With the probe present: 55 suites / 1049 tests, all passing (the probe
    contributes exactly 1 suite / 25 tests, and disturbs no other suite).
  - **After (probe deleted): 54 suites / 1024 tests, all passing.**
  - **Delta measured in this run: 0 regressions, 0 changes.**
- Those absolute numbers are higher than the committed baseline (53/1020)
  because the other agent's untracked `server/__tests__/mobile-quote-create.test.ts`
  is picked up by the runner. The judgement above is this pass's own
  before-vs-after delta, not a comparison against a historical number.
- `git status` before staging showed only this evidence file as new, alongside
  the other agent's pre-existing dirty files. Only this file was staged, by
  explicit path. No wildcard add; `.claude-home/**` and
  `.claude/settings.local.json` untouched.
- No production build, no `db:push`/`db:migrate`, no server started against any
  real database, no `.replit`/Secrets/config change, no push to any remote.

## 9. Remaining risk

- All 20 sites' authorization is sound today per the probe, but — like all three
  sibling domains — has **zero committed regression test** guarding it, and
  (shared with Property) the `MemStorage`-only harness cannot host one without
  either implementing the trades vertical on `MemStorage` or adopting this
  pass's mock-the-lookup pattern. Recommended low-risk follow-up: commit an
  equivalent of this probe as permanent coverage — deliberately, as a coverage
  item with its own review, not smuggled in under a "no gap found"
  investigation. Note it would live in `server/__tests__/`, which is **not**
  Codex-dirty, so it is not blocked.
- The two transitively-safe unscoped reads in §2 (`getQuote(dep.quoteId)` at
  HEAD:8352 and `getJobEventsByClient` at HEAD:8045) are correct only because of
  a gate elsewhere in the same handler. Neither is a gap today; both are the
  kind of thing that becomes one if a handler is later refactored. If the §8.5
  storage refactor is ever done, `getJobEventsByClient` should gain a
  `merchantId` predicate at the same time.
- Findings 2 (`strictUuidParam` unused → 500 instead of 400 on a malformed uuid)
  and 3 (no role gating) are real, open, and blocked/deferred as described.
- R1-T7's broader §8.5 scope — **settings, uploads and exports** — remains
  entirely unstarted; this file closes only the Trades slice.
- The already-tracked, out-of-scope split-payment session-replay gap
  (`r1/R1-T7-windcave-session-binding-2026-09-11.md`) and the anonymous SSE
  addressing gap (gap 12, mitigated but not closed in `c1e42db1`) are unrelated
  to this domain and not actioned here.

## 10. What was deliberately not done, and why

No `IStorage` method, no route change, no migration, no committed test. The
assigned domain has no provable authorization gap at any of the 20 candidate
route+compare sites — confirmed by reading the live committed code, by checking
the concurrent uncommitted diff rather than assuming it, and by a two-merchant
runtime probe built for this pass and deleted after it. Under the plan's own
failing-test-first rule there is nothing to implement. The adjacent findings in
§7 are named for the owner and the next pass rather than folded into a same-day
fix, and the permission question in §7 is explicitly left for the owner to
answer.
