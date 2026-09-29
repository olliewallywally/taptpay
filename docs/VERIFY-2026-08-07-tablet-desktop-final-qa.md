# Final QA — Tablet/Desktop merchant app

Date: 2026-08-07
Branch: `feat/tablet-desktop-app`
Status: **headless, browser, mobile-regression, and isolated-Postgres acceptance complete**

## Outcome

The 15-screen tablet/desktop merchant UI, accepted-change queue, P5 tutorial
adaptation, payment-link safety work, notification preferences, and Trades UI
refinements are complete in the branch state covered by this report.

No product mock data was added. Browser fixtures remain confined to test scripts.
The existing phone UI, request contract, board-link behaviour, onboarding, auth, and
public routes remain regression boundaries.

## Automated verification

Passed on 2026-08-07:

- `npm run check` — TypeScript passed.
- `npm run build` — Vite client and esbuild server passed; desktop pages remain
  separately code-split.
- `node scripts/verify-desktop-p0.mjs` — passed device gating, frame geometry,
  chunk isolation, and tutorial spotlight checks.
- `npx jest --runInBand` — 35 suites, 356 tests passed across client and server.
- `git diff --check` — passed.

P0 browser geometry:

- desktop 1440×900: centered 1000×745.75 frame, scale 0.847457;
- touch-tablet 1194×834: full bleed;
- touch-tablet 1366×1024: full bleed;
- phone 390×844: mobile UI and zero desktop source modules.

Non-blocking existing warnings remain: stale browser-data packages, large PDF/admin/
landing chunks, the ts-jest isolated-modules deprecation, and React `act()` warnings
in broad smoke tests.

## Isolated real-Postgres verification

`npm run test:server:postgres` ran with `TAPTPAY_TEST_DATABASE=1` against a distinct
temporary PostgreSQL 16 cluster under `/tmp`. It was never pointed at the configured
`DATABASE_URL`.

Results:

- safety guard: 8/8 passed;
- migrations 0000 through 0010a passed;
- pre-index board persistence/scoping and eight-way first-free allocation passed;
- duplicate/split-parent preflights passed;
- migration 0011, token constraints, and token lookup passed;
- final active scopes and payment-attempt reuse/conflict/CAS passed;
- split CAS/isolation passed;
- eight-way finalization produced one fee counter and stable replay;
- no verifier schemas remained;
- the temporary server, database, and files were removed.

Focused server payment coverage also passed: 6 suites, 53 tests.

## Read-only historical board/null audit

The configured database was queried inside a read-only transaction with PostgreSQL
read-only enforcement. No credentials, merchant IDs, or PII were recorded here.

Aggregate findings:

- the target has not yet applied migration 0011 (`payment_token_hash` is absent);
- 2 merchants have active boards;
- 7 historical transactions have `tapt_stone_id IS NULL` for one of those merchants;
- statuses: 3 pending, 2 cancelled, 1 completed, 1 refunded;
- all 3 pending rows are older than 7 days and have no Windcave session, transaction,
  or external-ID evidence;
- duplicate active-board number groups: 0;
- board-linked transaction/merchant ownership mismatches: 0.

Rollout decision: **LEAVE the three stale pending rows unchanged.** Do not infer or
backfill a board and do not cancel/recreate automatically. They remain legacy/
unassigned until merchant or processor evidence supports a deliberate operation.
Completed, cancelled, and refunded historical null rows remain `Unassigned` in the
Revenue by Board report.

## Browser and visual acceptance

All 15 dedicated screen suites passed at desktop 1440×900 and touch-tablet
1194×834 with no page or console errors:

- Property: Home, Clients, Terminal, Analytics, Settings;
- Trades: Home, Clients, Terminal, Analytics, Settings;
- Retail: Home, Stock, Terminal, Analytics, Settings.

The suites generated 238 screen/state PNGs: 62 Property, 100 Trades, and 76 Retail.
Including P0 and mobile regression outputs, the QA run produced 246 PNGs under
`/tmp/taptpay-*`.

Covered interactions include search, range/status/sort chips, scope filters, health
drilldowns, notifications, forms and validation, scaled-canvas sheet dragging,
reports and frame-contained exports, terminal sends, board creation, stock selection,
split mode, sharing, stack details, Trades invoice/quote/balance/external-paid flows,
Property invoice plus recurring schedule writes, and Settings saves with exact body
assertions.

Side-by-side review against all 15 design PNGs found no blocking layout regression.
Fixture-driven amounts, row counts, and valid empty/default states intentionally differ
from the prototype's mock data.

## Phone regression

`node scripts/verify-mobile-retail-regression.mjs` passes at 390×844 and records
screenshots in `/tmp/taptpay-mobile-retail-regression`.

It asserts the existing mobile terminal component and BottomNavigation, exact viewport
fit with no horizontal overflow, zero desktop frame/canvas/modules, the exact legacy
board-sale request body, no `linkMode` or internal `taptStoneId`, the selected board's
shared payment URL, and zero page/console errors.

## QA harness corrections

- Added the missing `/api/trades/schedules` empty fixture so Trades terminal shots do
  not fall through to an authenticated real endpoint.
- Added the dedicated 390px mobile retail regression verifier.
- Added a transition-settle wait so its QR screenshot is deterministic.

## External manual gates before production enablement

These require external hardware/provider state and were intentionally not faked:

1. On a real iOS/Web Push device, verify permission, subscription, preference
   filtering, failed-payment delivery, and the daily-payout summary.
2. In staging with controlled test merchants, apply the approved migrations and run
   live Windcave token A/token B/board/split/cancel/receipt flows in separate browsers.
3. Confirm token-path redaction in application and infrastructure logs, then monitor
   token 404/410/429 rates, finalization errors, SSE audiences, and board conflicts.

No external charge, SMS, production mutation, migration, or push delivery was triggered
by this QA run.
