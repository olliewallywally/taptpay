# Handoff — Tablet/Desktop merchant app (branch `feat/tablet-desktop-app`)

Date: 2026-07-28, updated 2026-08-06
Status: **all 15 screens built** — retail 5/5, property 5/5, trades 5/5. The §6
deviation list has now been **raised with Oliver and ruled on** — see §6 for what
he decided and what shipped. What is left is the accepted-change queue in §9,
then P5 (tutorial adaptation, plan §7a) and P6 (polish).

> **If you are picking this up cold and about to work on the terminal's "no
> payment board" option, read `docs/PLAN-2026-08-06-payment-links-no-board.md`
> first.** The token direction is approved and implementation has not started,
> but the plan was independently reviewed and corrected on 2026-08-06. Its Phase
> 0 is mandatory: production board selection, SSE isolation, response DTOs, and
> storage scoping must be repaired before token work.
Read `docs/PLAN-2026-07-24-tablet-desktop-app.md` first: it is still the authoritative
spec for scope, device gating, routes and per-screen requirements. This file records
what has actually been built, the conventions to follow, the traps that have already
cost time, and what to do next.

---

## 1. Where things stand

| Screen | Route | File | Commit |
|---|---|---|---|
| P0 scaffold | — | `client/src/desktop/{DesktopFrame,ScaledCanvas,DesktopShell,DesktopPageScaffold,desktop-theme,desktop.css}` | `58ba709` |
| 4a retail home | `/dashboard` | `desktop/pages/retail-home.tsx` | `60118b5` |
| 4b retail stock | `/stock` | `desktop/pages/retail-stock.tsx` | `87146de` |
| 4c retail terminal | `/terminal` | `desktop/pages/retail-terminal.tsx` | `525b302` |
| 4d retail analytics | `/transactions` | `desktop/pages/retail-analytics.tsx` + `desktop/data/retail-reports.ts` | `91865d6` |
| 4e settings (all verticals) | `/settings` | `desktop/DesktopSettingsPage.tsx` + `desktop/pages/retail-settings.tsx` | `a81c04a` |
| 2a property home | `/property` | `desktop/pages/property-home.tsx` | `dc8f2b9` |
| 2b property clients | `/property/tenants` | `desktop/pages/property-clients.tsx` | `10405a0` |
| 2c property terminal | `/property/terminal` | `desktop/pages/property-terminal.tsx` | `3e3b6c6` |
| 2d property analytics | `/property/analytics` | `desktop/pages/property-analytics.tsx` + `desktop/data/property-reports.ts` | `912c1e7` |
| 2e property settings | `/settings` | `desktop/pages/property-settings.tsx` (wrapper) | `79b5dcc` |
| 3a trades home | `/trades` | `desktop/pages/trades-home.tsx` + `desktop/data/trades-data.ts` | `934442b` |
| 3b trades clients | `/trades/clients` | `desktop/pages/trades-clients.tsx` | `2f0101a` |
| 3c trades terminal | `/trades/terminal` | `desktop/pages/trades-terminal.tsx` | `ba37025` |
| 3d trades analytics | `/trades/analytics` | `desktop/pages/trades-analytics.tsx` + `desktop/data/trades-reports.ts` | `404fbaa` |
| 3e trades settings | `/settings` | `desktop/pages/trades-settings.tsx` (wrapper) | `812e21d` |

Still to do: **P5** tutorial adaptation (plan §7a) and **P6** polish. No screen is
a stub any more — every `client/src/desktop/pages/*.tsx` renders a real screen.

Deliberately left out of finished screens, each worth its own pass rather than a
cramped port: co-tenants on the add-tenant form (2b), attach-invoice upload plus
the split toggle on a bill (2c), and the split toggle on a job invoice (3c).

---

## 2. How to build a screen (the loop that has worked)

1. **Read the design markup for that screen** in
   `docs/design/desktop-app/Taptpay Desktop.dc.html`. Screen offsets:
   retail 4a–4e at lines 40 / 233 / 302 / 526 / 766; property 2a–2e at
   1710 / 1947 / 2001 / 2217 / 2494; trades 3a–3e at 883 / 1076 / 1130 / 1354 / 1593.
   The rendered targets are `docs/design/desktop-app/screens/dt--*.png`.
2. **Read the prototype's logic** for that screen — the `<script type="text/x-dc">`
   block (~line 2621+). Property state atoms are unprefixed, trades are `tr*`,
   retail are `rt*`. That map is the interaction spec: what toggles, what animates,
   what a button does.
3. **Find the mobile page that owns the same logic** and reuse its endpoints,
   mutations and validation. Never invent an endpoint; never re-derive a fee or a
   GST rate that already exists in `lib/report-utils.ts`.
4. **Verify against the schema, not against the mobile page's variable names.**
   See §4 — three field-name assumptions have already been wrong.
5. Write the page as a single file with a page-scoped CSS template literal (class
   prefix per page: `rh-`, `rs-`, `rt-`, `ra-`, `ds-`, `ph-`). This matches the
   codebase's per-vertical-page convention.
6. **Verify** (§5), then commit that one screen with a message that states what was
   wired and what deviates from the design.

### Layout conventions

- The canvas is exactly **1180×880**. `DesktopShell` renders a 66px header + 1px
  divider, then `.tapt-desktop-main` (1180×813, `position: relative`) holding your
  page. So a design coordinate `y` inside a screen maps to `y - 66` in your page.
- The design's own absolute offsets can be ported verbatim once you subtract that
  66 (and the body padding, if your container has any). 4c's rail and 4d's report
  blocks do exactly this and match the PNGs.
- Pass `showScope={false}` to `DesktopPageScaffold` when the screen draws its own
  scope control inside a column (every content page does).

---

## 3. Verification (do all of it before committing)

```bash
npx tsc --noEmit                    # must be silent
npx vite build                      # each desktop page must land in its own chunk
node scripts/verify-desktop-p0.mjs  # device gating, frame geometry, chunk isolation, tutorial spotlight
npx jest client/src/pages/__tests__/smoke-tests.test.tsx client/src/__tests__/tutorial-registry.test.ts
```

Then **screenshot the screen you built at both device classes** and compare with the
design PNG. Working examples live in `scripts/desktop-shots/` — copy the closest one,
swap the route and fixtures:

```bash
node scripts/desktop-shots/shot-property-home.mjs   # → /tmp/taptpay-desktop-2a/*.png
node scripts/desktop-shots/shot-trades-terminal.mjs # → /tmp/taptpay-desktop-3c/*.png
```

The five trades scripts share `scripts/desktop-shots/trades-fixtures.mjs` — clients,
quotes, invoices, the API mocks, a frozen clock, and `newTradesPage`/`runTradesShots`.
Use it for further trades work rather than re-inventing fixtures; a screen needing an
extra row registers its own `page.route` afterwards, because Playwright matches the
most recently registered route first.

Those scripts encode the things that are easy to get wrong:

- Chromium must be the nix one:
  `/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium`
  (the bundled Playwright browser is broken — see memory `playwright-nix-chromium`).
- Auth is a **dummy JWT written to `localStorage` in an init script** plus
  `page.route` mocks; no server data is needed.
- **Desktop** = `{ viewport: { width: 1440, height: 900 } }` → centred 13″ frame.
  **Tablet** = `{ viewport: { width: 1194, height: 834 }, hasTouch: true }` → full
  bleed. Without `hasTouch` the pointer is fine and you get the desktop path, so you
  are not actually testing the tablet.
- Assert `no page errors`. Several scripts currently collect/print errors but still
  exit zero; the corrected payment plan Phase 1/6 requires hard failure before those
  scripts count as a gate.

The dev server must already be running on **:5000, single instance only** (memory
`dev-server-single-instance`); the workflow does not auto-restart.

---

## 4. Traps that have already cost time

**Verify field names in `shared/schema.ts` before writing any aggregation.**

- Retail transactions: `price` (decimal string), `taptStoneId`, `splitEnabled`,
  `totalRefunded`, `refundableAmount`, `paymentMethod`. Clients currently send the
  request-only `selectedStoneId`; MemStorage maps it, but production DatabaseStorage
  does not until the corrected plan's Phase 0 canonical input is implemented.
- **There is no merchant-level split flag.** `splitEnabled` is a column on
  *transactions*. Gating split UI on `merchant.splitEnabled` hides it forever.
- Rent invoices (`invoices_rent_requests`): **`amountCents` (integer cents)** and
  **`dueAt`** — not `amount`/`dueDate`. Voided status is **`"voided"`**.
- Tenants (`tenant_profiles`): **`firstName` + `lastName`**, no `name` field.
- Schedules (`active_schedules`): `amountCents`, `frequency`, `nextRunDate`.
- Payment links come from the server: `merchant.paymentUrl`, `merchant.qrCodeUrl`,
  and per-board `stone.paymentUrl`. Do not hand-build `${origin}/pay/:id` (that is
  only payment-stack's fallback).

**Trades invoices are not free-form.** `createJobInvoiceSchema` refuses a `deposit`
that is not linked to a quote, and a `balance` is issued by the server from an
already-paid deposit (`POST /api/trades/invoices/:id/send-balance`, amount computed
from the quote total) rather than composed on the client. 3c's three type chips are
therefore three different operations, two of them conditionally disabled. Quote GST
comes from `@shared/trades-gst`'s `computeQuoteTotals` with the merchant's
`gstRegistered`/`tradeGstMode`; the fee is `tradesFeeCents` in `lib/trades-money.ts`.

**Property data must go through `client/src/lib/property-data.ts`** hooks
(`usePropertyTenants` / `usePropertyInvoices` / `usePropertySchedules`). That file
says MUST, and it is how mutations invalidate every consumer at once.

**Pointer drags must be divided by the canvas scale.** The canvas is
`transform: scale(...)`; pointer deltas arrive in viewport pixels. Read the scale off
the nearest `[data-desktop-scale]` ancestor and divide, or the element lags the
cursor on desktop. 4d's sheet is the reference implementation.

**Billing gate is free if you use `apiRequest`** — a 402 `BILLING_CARD_REQUIRED`
dispatches a global event that `NotificationProvider` already renders.

**Don't trust the prototype's numbers.** Every hard-coded row in the design file is a
placeholder. If a figure has no data behind it, leave it out and say so — see §6.

---

## 5. Reusable pieces already built

- `desktop/DesktopSettingsPage.tsx` — the **shared** settings screen. 2e and 3e are
  two-line wrappers: `<DesktopSettingsPage {...props} vertical="property" />`.
- `desktop/data/retail-reports.ts` — pure report engine (10 retail reports).
  `property-reports.ts` (4) and `trades-reports.ts` (4) follow the same shape: a
  metadata array + one `build*Report(id, ctx)` switch returning
  `{heroV, h2V, chart, segs|bars, rows}`. Property and trades expose only the
  reports that have a real PDF implementation — design tiles with no backing data
  were dropped, not mocked.
- `desktop/data/trades-data.ts` — the trades cache and domain layer (query hooks on
  the mobile keys, `scopeTradesData`, `buildTradesClientRows`, `buildTradesHealth`,
  period/bucket helpers). Every trades screen reads through it, which is why a
  client's status is identical on home, directory and terminal.
- `desktop/data/desktop-prefs.ts` — per-merchant localStorage preferences.
- `hooks/use-push-notifications.ts` — web + native-iOS push subscribe/unsubscribe.
- `lib/report-utils.ts` — money, NZ GST, timeframe windows. Use these, don't re-derive.
- `lib/property-dashboard-data.ts` — `periodWindow`, `buildBuckets`, `collectedCents`,
  `growthPct`, `filterByProperty`. Retail adapts transactions into the invoice shape
  these expect (see the top of `retail-home.tsx`'s model) so both verticals bucket
  identically.

Not yet extracted: the home-screen furniture (bar chart, health strip, entity list,
quick actions) is duplicated between `retail-home.tsx` (`rh-`) and `property-home.tsx`
(`ph-`). The plan wants it extracted; trades home is the third call site and the
sensible moment. Treat it as a decision, not an oversight.

---

## 6. Deviations — RAISED AND RULED ON (2026-08-06)

The full list was put to Oliver on 2026-08-06 and he ruled on every item. **Do not
re-raise these.** Rulings below; the accepted-change queue is §9.

**Shipped as fixes** (committed 2026-08-06):

| Item | Ruling | Commit |
|---|---|---|
| 4d/3d peak dot floating in the fill | fix it | `4ade651` |
| 2b vs 3b hero count contradiction | make 2b match 3b | `5cadc4d` |
| 4c keypad `.`/`<` keys | centre both as glyphs, not characters | `6067bd4` |
| 3d "outstanding invoices" | keep live, but label it all-time | `cfe5fe5` |
| 4e payout account | **remove entirely** — bank details are Windcave's | `6ec20f7` |
| 3b name/site ellipsising | split onto separate lines, keep the 400px column | `e3a6daa` |

**Post-fix review (2026-08-06):** all six UI commits implement their ruled normal
case, but boundary/data/accessibility follow-ups remain: endpoint chart peaks clip,
archived-only properties remain selectable, property/trades keypads are inconsistent,
part-paid split invoices overstate outstanding totals, Business Details saves leak a
raw merchant row, and long trades client text is still inaccessible. Commit
`2f8a7bd` fixes the normal REST query but not SSE isolation or Postgres board
persistence. The authoritative findings and implementation gates are now §2–§5 of
`docs/PLAN-2026-08-06-payment-links-no-board.md`.

**Kept as shipped** (Oliver accepted the deviation): 4c boards picker, 4c split
chips (same function as mobile), 4d report tiles white, 3c compose block at
`top:476`, 3c deposit/balance chips disabled with a reason, 3c jobs list one row
per client, 3b status dots coloured by state, 3d/2d shipping 4 reports not 10,
home-screen components **not** extracted (accepted duplication), Dashboard
Preferences `homeBigBox`/`chartStyle` stay out.

**Changed scope — became real work:**

- **4d Fees report: remove it**, replace with a report we can guarantee is
  correct. Oliver approved *Revenue by Board* (backed by `transactions.taptStoneId`
  + the stones table; nothing invented). The prototype's "vs eftpos" comparison
  stays dropped.
- **4c "no payment board"** — approved as a **per-payment token link**, not the
  shared merchant URL. This is its own plan:
  `docs/PLAN-2026-08-06-payment-links-no-board.md`. Read it before starting.
- **4e notification toggles: build the missing two.** Oliver was shown the cost
  (preferences column + migration, filtering across all 13 `sendPushToMerchant`
  call sites, a new daily-payout job, a new failed-payment send site) and asked
  for them anyway. Keep it in its own commits at the end of the queue so the
  desktop UI work can merge independently if needed.
- **4d second filter row** (product not category) stays as-is for now — a
  `category` column on stock items is a genuine feature, explicitly deferred.

The historical list, for context on *why* each deviation existed:

- 4c keypad `.` key shows its character (prototype renders it blank).
- 4c "boards" reveals a board picker the design doesn't have (API needs a stone id).
- 4c split-way chips are a local preview; only `splitEnabled` is sent.
- 4d Fees report drops the prototype's invented "vs eftpos" comparison.
- 4d second filter row filters by product — stock items have no category column.
- 4d report tiles are white; the prototype paints them the same colour as the sheet.
- 4d peak dot floats in the fill rather than sitting on the curve (faithful to the
  design's own geometry, but it reads like a bug).
- 4e ships one real push toggle, not the design's three (backend has one).
- 4e payout account is dimmed to signal read-only.
- Dashboard Preferences `homeBigBox`/`chartStyle` deliberately absent until 4a/4d can
  render the alternatives.
- Push logic is duplicated: mobile `settings.tsx` still has its own inline copy.
- `ReportModal` portals to `document.body`, so Export covers the browser window
  rather than rendering inside the 13″ frame.
- Home-screen components not extracted (above) — trades home (3a) made it the third
  copy, so this is now accepted duplication unless Oliver wants the refactor.
- 3b status dots are coloured by state; the prototype paints every dot the same
  accent blue, which carries no information on real rows. 2b already did this.
- 3b hero count follows the site scope; 2b's equivalent count does not follow its
  property scope. One of the two should change.
- 3b rows keep the design's 400px column and its combined "name | site" label, so a
  long client-plus-address string ellipsises (full text on hover).
- 3c deposit/balance chips are disabled with a reason when the selected client has
  no quote / no paid deposit, because the server cannot accept them (see §4).
- 3c compose block raised from the design's `top:512` to `476`: at 512 its send
  button falls 30px past the 813px canvas. The design PNG shows the same clipped
  button, so this is a fix to the design, not a port error.
- 3c "jobs" list shows one row per client (worst-case live invoice), which is what
  the prototype's own list does, rather than one row per invoice.
- 3d exposes 4 reports, not the design blurb's 10 — those are the four that have a
  real trades PDF. Same call as 2d.
- 3d "outstanding invoices" is a live figure (every open invoice), not a
  period-windowed one; the period segments only reframe revenue and the chart.
- 3d peak dot inherits 4d's floating-dot geometry (above).

---

## 7. Next actions, in order

§6 has been raised and ruled on. The remaining queue is §9. After it: **P5
tutorial adaptation** (plan §7a) — the registry already carries desktop entries
for the trades pages (`ta-*` on analytics, `trades-home-*` on home), so the work
is auditing each of the fifteen screens for anchors, adding
`desktopTarget`/`desktopBody` overrides where the desktop layout needs different
wording, and confirming the mobile tutorial is byte-identical afterwards. Then
**P6 polish**.

---

## 9. Accepted-change queue (reviewed 2026-08-06)

Six normal-case fixes are committed (§6). The review found safety/correctness work
that must precede the feature queue:

1. **Payment/addressing safety gate.** Complete Phase 0 of
   `docs/PLAN-2026-08-06-payment-links-no-board.md`: allowlisted merchant and
   transaction responses, canonical Postgres board persistence + ownership checks,
   transactionally serialized first-free board allocation, explicit active scopes,
   header-authenticated SSE audiences, redacted logging, and removal of the stale
   MemStorage cache. Run the read-only historical board/null audit; never guess a
   backfill.
2. **Post-fix boundary pass.** Complete Phase 1 of that plan: endpoint chart peaks,
   active property choices/live count, consistent desktop keypad glyphs,
   split-aware trades outstanding totals, readable/accessibly named client rows,
   and settings response-contract coverage.
3. **b4 — Revenue by Board report.** Only start after board persistence is fixed.
   Remove the Fees report from
   `desktop/data/retail-reports.ts` (leaving 9) and add *Revenue by Board*:
   revenue / count / average per board off `transactions.taptStoneId` joined to
   the stones table, with an explicit "Unassigned" bucket. Historical null-board
   data is known to include rows whose board intent was lost; do not present that
   bucket as proven no-board revenue.
4. **b2 — no-board payment links + board creation.** Complete Phases 2–6 of the
   corrected plan. The token must remain the credential through checkout and
   receipt; tokenized rows must be unreachable through numeric public routes.
   Durable payment-attempt/idempotency rows and transactional split setup are
   required before any per-payment link is enabled.
5. **D2 — `ReportModal` into the desktop frame.** It portals to `document.body`
   (`components/reports/ReportModal.tsx:98,259`), so Export covers the browser
   window instead of the simulated 13″ frame. Portal to `.tapt-desktop-frame`
   when present. **Trap:** the frame is inside a `transform: scale(...)` canvas,
   so the modal's `position:fixed; inset:0` must become absolute or it will be
   scale-relative.
6. **D1 — mobile push onto the shared hook.** `hooks/use-push-notifications.ts` is
   used only by `desktop/DesktopSettingsPage.tsx`; `pages/settings.tsx:144-350`
   still carries its own inline copy including the native-iOS branch. Own commit,
   needs real-device testing.
7. **b7 — the two missing notification toggles.** The big one, deliberately last.
   `push_subscriptions` (`shared/schema.ts:573`) has no preference column, and
   `sendPushToMerchant` is called from 13 sites with the type passed at the call
   site, never compared against anything stored. Of the design's three toggles
   only "payment received" maps to something real: there is **no daily-payout job
   at all**, and `sendPushToMerchant` is never called with a `failed` status.
   Needs: preferences column + migration `0012`, filtering inside
   `sendPushToMerchant`, a daily-payout job, and a failed-payment send site.

Then P5, then P6.

## 8. Repo hygiene

Per `CLAUDE.md`: never `git add -A`. Exclude `.claude-home/**` and
`.claude/settings.local.json`. Commit one screen at a time with the verification
results stated in the message.
