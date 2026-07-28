# Handoff — Tablet/Desktop merchant app (branch `feat/tablet-desktop-app`)

Date: 2026-07-28
Status: **in progress** — retail complete (5/5), property 4/5 (only 2d analytics left).
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
| 2e property settings | `/settings` | `desktop/pages/property-settings.tsx` (wrapper) | `79b5dcc` |

Still to build: **2d** property analytics, then all of P3 trades, P5 tutorial
adaptation, P6 polish.

Deliberately left out of finished screens, each worth its own pass rather than a
cramped port: co-tenants on the add-tenant form (2b), and attach-invoice upload
plus the split toggle on a bill (2c).

`client/src/desktop/pages/*.tsx` not listed above are still P0 stubs that render an
empty `DesktopPageScaffold` — that is what an unbuilt screen looks like.

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
```

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
- Assert `no page errors` — the scripts fail loudly on `pageerror`/console errors.

The dev server must already be running on **:5000, single instance only** (memory
`dev-server-single-instance`); the workflow does not auto-restart.

---

## 4. Traps that have already cost time

**Verify field names in `shared/schema.ts` before writing any aggregation.**

- Retail transactions: `price` (decimal string), `taptStoneId`, `splitEnabled`,
  `totalRefunded`, `refundableAmount`, `paymentMethod`. The insert schema also
  accepts `selectedStoneId`, which `storage.createTransaction` maps to `taptStoneId`.
- **There is no merchant-level split flag.** `splitEnabled` is a column on
  *transactions*. Gating split UI on `merchant.splitEnabled` hides it forever.
- Rent invoices (`invoices_rent_requests`): **`amountCents` (integer cents)** and
  **`dueAt`** — not `amount`/`dueDate`. Voided status is **`"voided"`**.
- Tenants (`tenant_profiles`): **`firstName` + `lastName`**, no `name` field.
- Schedules (`active_schedules`): `amountCents`, `frequency`, `nextRunDate`.
- Payment links come from the server: `merchant.paymentUrl`, `merchant.qrCodeUrl`,
  and per-board `stone.paymentUrl`. Do not hand-build `${origin}/pay/:id` (that is
  only payment-stack's fallback).

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
- `desktop/data/retail-reports.ts` — pure report engine (10 retail reports). The
  trades/property equivalents should follow the same shape: a metadata array + one
  `build*Report(id, ctx)` switch returning `{heroV, h2V, chart, segs|bars, rows}`.
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

## 6. Open deviations — DO NOT silently resolve these

Oliver's instruction: these are collected and raised **as one list when the whole
integration is finished**, so he can accept or overrule each. Keep adding to it; do
not re-litigate them screen by screen. The living copy is in the assistant memory
file `tablet-desktop-open-deviations.md`; the current contents:

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
- Home-screen components not extracted (above).

---

## 7. Next actions, in order

1. **2d property analytics** — design lines 2217–2493, ref
   `pages/property/property-analytics.tsx` + `components/reports/PropertyReportsButton.tsx`.
   Mirror 4d's structure exactly: `retail-analytics.tsx` is the reference for the
   curve, the draggable sheet (including the scale divisor) and the tiles→filters→
   report flow, and `desktop/data/retail-reports.ts` is the shape a
   `property-reports.ts` should copy. Property reports must map onto reports that
   actually exist; omit any design tile with no backing rather than mocking it, and
   list the omissions in the commit.
2. Then P3 trades (3a–3e, same pattern — trades state atoms are `tr*`; the trades
   data layer mirrors property's), P5 tutorial adaptation (plan §7a), P6 polish.

When trades home (3a) lands, decide the shared-home-components extraction: it will
be the third copy of the chart/health-strip/list/actions furniture.

## 8. Repo hygiene

Per `CLAUDE.md`: never `git add -A`. Exclude `.claude-home/**` and
`.claude/settings.local.json`. Commit one screen at a time with the verification
results stated in the message.
