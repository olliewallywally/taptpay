# Plan — Tablet/Desktop merchant app (3 verticals × 5 pages)

Date: 2026-07-24
Status: **IMPLEMENTED; headless/browser acceptance complete on
`feat/tablet-desktop-app`**. This remains the authoritative product spec. For the
built state and rollout next steps, read
`docs/HANDOFF-2026-07-28-tablet-desktop-app.md` and
`docs/VERIFY-2026-08-07-tablet-desktop-final-qa.md` first.
Audience: any AI/dev picking this up cold. Read this whole file before writing code.
Also read first: `CLAUDE.md`, `docs/HANDOFF-2026-07-20-onboarding-billing-tutorial.md`, `replit.md`.

---

## 1. What this is

The current app in `client/src` is a **phone-only UI** (fixed ~430px columns, bottom dock nav). Oliver has designed a completely separate **tablet/desktop UI** and it must be implemented pixel-faithfully with **all real logic wired in** — every button does exactly what its mobile equivalent does, against the same APIs. It is not a responsive restyle of the mobile pages; it is a second presentation layer over the same data.

**One design serves both tablet and desktop.** They are not two designs:

- **Tablet**: the app fills the screen edge-to-edge.
- **Desktop**: the app must NOT fill the browser window. It renders as a centered, rounded-corner "13-inch tablet" (13″ diagonal) floating on a deep-navy page background — like a tablet lying on the desk. Rounded corners (design canvas uses 20px radius; use ~24–28px for the outer frame), soft shadow, empty margin around it.
- **Mobile (phones)**: keeps the existing mobile app, untouched. The mobile UI must only ever appear on phones; the tablet/desktop UI must only ever appear on tablets/desktops.

## 2. Design source of truth (in this repo)

Everything is in `docs/design/desktop-app/`:

- `Taptpay Desktop.dc.html` — THE design. A self-contained interactive prototype: 15 screens (3 verticals × 5 pages) with working nav, charts, keypads, sheets, and animations, driven by a `<script type="text/x-dc">` component (~line 2621 to EOF, ~1,380 lines of logic). **This file is the spec for markup, exact colors, spacing, copy, and interaction behavior. Port from it directly; do not redesign anything.**
- `support.js` + `_ds/` — the design-system runtime + fonts it needs.
- `screens/dt--*.png` — rendered screenshots of all 15 screens (what "done" looks like).

To view it live: it does **not** hydrate over `file://` (its runtime fetches the document itself). Serve it:

```bash
cd docs/design/desktop-app && python3 -m http.server 8199
# open http://localhost:8199/Taptpay%20Desktop.dc.html
```

Each screen is a 1180×880 frame tagged `data-screen-label`. IDs in the file: property = `2a…2e`, trades = `3a…3e`, retail = `4a…4e`.

### The 15 screens

| Vertical | Home | Directory | Terminal | Analytics | Settings |
|---|---|---|---|---|---|
| Property (`2a–2e`) | home | clients (tenants) | terminal | analytics | settings |
| Trades (`3a–3e`) | trades home | trades clients | trades terminal | trades analytics | trades settings |
| Retail (`4a–4e`) | retail home | retail **stock** | retail terminal | retail analytics | retail settings |

All 15 share: `taptpay` wordmark top-left, centered top pill-nav (Home · Clients/Stock · Terminal · Analytics · Settings — active item is a filled pill), and a scope dropdown top-left of content (`all properties` / `all sites` / `my store` — see §7 "Scope dropdown").

### Prototype logic = interaction spec

The `text/x-dc` script holds a single state object + per-vertical render maps (property = unprefixed, trades = `tr*`, retail = `rt*`). Reading it tells you *exactly* how each interaction behaves (what toggles, what expands, what flashes, timings, easing, colors). Key state atoms and what they drive:

- `homeRange/homeSel` (+`tr`/`rt` variants) — home bar chart range chips (Day/Week/Month/Year) and "tap a bar" → WEEK BREAKDOWN panel showing that bar's value, best day, average, % of week.
- `homeBox` — home health strip: tapping one of the 3 numbers expands an inline detail list (`HDET`) with the underlying rows; back arrow collapses.
- `homeNotifOpen` — notifications box: collapsed 104–108px "mail slot" (a letter peeking out of a slot + "3 notifications"); tap → grows to ~194px and cross-fades to the notification list (height + opacity + pointer-events transitions).
- `termMode/termFilter/termSearch`, `kpVal/kpCtx`, `reqFlash/billFlash` etc. — terminal: left = totals + filterable/searchable request/job/stack list; center = vertical icon rail (mode switch); right = compose panel; keypad edits amount; "send" buttons flash confirmation.
- `sheetOpen/dragY/dragStartY/dragStartT/dragMoved` — analytics Payment History bottom sheet: draggable with real physics — track pointer, on release use distance + velocity (`dragStartT`) to decide snap open/closed. Peek vs expanded start is a preference (`historyStart`).
- `sheetMode: 'history' | 'filters' | report` + `report/pendReport` — Reports flow inside that sheet: **Reports** button → grid of report tiles → tapping a tile opens a filter step (period / property-or-client / status chips) → **generate** renders the report (donut or bars + hero stats + row list) with `reportIn` animation. Design defines ~9 property reports (rent, arrears, expenses, cashflow, methods, ontime, occupancy, gst, latefees) and equivalent retail/trades sets.
- `openSec` — settings accordion: Business Details / Dashboard Preferences / Subscription & Billing / Account / Transaction Notifications; open section turns sky-blue with glow.
- `modeSel` — settings vertical switcher tiles (Retail / Property / Trades).
- Design props (bottom of `data-props`): `homeBigBox` (health strip | analytics snapshot | upcoming timeline), `chartStyle` (smooth curve | bars), `historyStart` (peek | expanded) — these are **merchant-facing Dashboard Preferences**, see §6 Settings.
- Keyframes in the doc head: `tileIn`, `reportIn`, `popIn`, `glowDrift` — reuse them verbatim.

## 3. Device gating (hard requirement)

Create `client/src/hooks/use-device-class.ts`:

```ts
export type DeviceClass = 'mobile' | 'tablet' | 'desktop';
// mobile:  smallest viewport side < 700 OR (coarse pointer AND width < 768)
// tablet:  coarse-pointer/touch device AND width >= 768
// desktop: fine pointer AND width >= 1024  (fine pointer + 768–1023 → tablet treatment)
// Listen to resize + matchMedia('(pointer: coarse)'); re-evaluate on change.
```

Rules:

- Gate **only merchant app routes** (the 15 pages + their sub-flows). Do NOT gate: landing page `/`, signup/login/onboarding, legal/info, admin (`/admin` is already desktop-oriented), and all public customer pages (`/pay/*`, `/checkout/*`, `/r/:token`, `/split/*`, `/payment/result/*`, `/receipt/*`, `/trades/quote/:token`, `/smart-terminal`). Those keep current behavior on every device.
- Same URLs for both UIs. `/property/analytics` renders the mobile page on a phone and desktop screen 2d on tablet/desktop. No `/desktop/*` routes.
- `BottomNavigation` renders **only** when device class is `mobile` (wrap its render in App.tsx, don't rewrite the component).
- **Onboarding & auth flows are NOT gated**: signup (`/signup`), login, check/confirm email, `/onboarding` were built responsive and already work at tablet/desktop sizes. They render exactly as today on every device — no desktop variants, no frame. (The 13″ frame applies only to the signed-in app pages; a signed-out user on desktop sees the normal full-window landing/login/signup/onboarding.)
- **Tutorial runs on all device classes** — keep `TutorialProvider` enabled exactly as today and pass the same `tutorialPage` props on the desktop route variants. It needs adaptation to work on the desktop pages — see §7a.
- Mobile pages and their code MUST NOT change. The whole diff should be additive (new files) plus small App.tsx wiring.

## 4. Architecture

New directory `client/src/desktop/`:

```
client/src/desktop/
  DesktopFrame.tsx        // desktop-only 13" rounded shell (see §5)
  ScaledCanvas.tsx        // 1180×880 logical canvas, transform:scale to fit (see §5)
  DesktopShell.tsx        // wordmark + top pill nav + scope dropdown + page slot
  desktop-theme.ts        // palette + keyframes + shared style constants from the design
  components/
    HomeBarChart.tsx      // bars + range chips + tap-a-bar breakdown
    AnalyticsAreaChart.tsx// smooth-curve area chart (+ bars variant per chartStyle pref)
    HealthStrip.tsx       // 3-number health box with tap-to-expand detail
    NotificationsBox.tsx  // mail-slot collapsed → expandable list
    EntityList.tsx        // avatar-initials row list w/ search, status dot, amount column
    StatusChips.tsx       // all/overdue/sent/paid/failed filter chips
    Keypad.tsx            // 1-9,C,0,⌫ pad from terminal screens
    TerminalRail.tsx      // vertical icon rail between list and compose panel
    HistorySheet.tsx      // draggable payment-history sheet + Reports/Export header
    ReportsFlow.tsx       // tiles → filters → rendered report (donut/bars)
    SettingsAccordion.tsx // settings sections incl. vertical-switcher tiles
    QuickActions.tsx      // 3 action cards on home
  pages/
    property-home.tsx     property-clients.tsx   property-terminal.tsx
    property-analytics.tsx property-settings.tsx
    trades-home.tsx       trades-clients.tsx     trades-terminal.tsx
    trades-analytics.tsx  trades-settings.tsx
    retail-home.tsx       retail-stock.tsx       retail-terminal.tsx
    retail-analytics.tsx  retail-settings.tsx
```

Wiring in `client/src/App.tsx`:

- Add lazy imports for desktop pages (own chunks — phones must never download desktop code; see `useRoutePreload` at App.tsx:90, extend it to warm the right set per device class).
- In each gated `<Route>`, pick component by device class, e.g. `/dashboard` → `Dashboard` (mobile) or `DesktopRetailHome`; `/stock` → `StockManagement` or `DesktopRetailStock`; `/property/*`, `/trades/*` likewise. Keep `ProtectedRoute` wrappers exactly as they are (auth + onboarding gate still apply), including the same `tutorialPage` props for the desktop variants — the tutorial runs on every device class (§7a).
- Beware `PageTransition` (see memory `quickinv-pagetransition-fix`): it pins `<Switch>` location — desktop pages go through the same single Switch; do not add a second Switch.
- Vertical/mode state: reuse the existing convention — mode is derived from route prefix and persisted to `localStorage.taptMode` (see `bottom-navigation.tsx:63`). The desktop shell derives vertical from `useLocation()` the same way: `/trades*` → trades, `/property*` → property, else retail. The settings vertical-switcher tiles just navigate to `/`, `/property`, `/trades` respectively (which updates taptMode via the same rule — implement the small saveMode call in the shell since BottomNavigation won't be mounted).

Route → page map (top pill nav uses these):

| Nav item | Retail | Property | Trades |
|---|---|---|---|
| Home | `/dashboard` | `/property` | `/trades` |
| Clients/Stock | `/stock` | `/property/tenants` | `/trades/clients` |
| Terminal | `/terminal` | `/property/terminal` | `/trades/terminal` |
| Analytics | `/transactions`* | `/property/analytics` | `/trades/analytics` |
| Settings | `/settings` | `/settings` | `/settings` |

\* Retail has no `/analytics` route today; mobile splits it across `/transactions` + reports. Use `/transactions` as the retail Analytics URL so the mobile fallback is sensible. Settings is one shared route — the desktop settings page shows the vertical-aware accordion (design 2e/3e/4e differ only in branding/copy of the left column).

## 5. The 13-inch desktop frame + scaling strategy

The design is a **fixed 1180×880 canvas** (ratio 1.34; diagonal 1472 CSS px ≈ 15.3″ at 96dpi). Do NOT try to make the 15 screens fluid-responsive — port them at fixed logical 1180×880 and scale the whole canvas. This keeps every screen pixel-faithful and makes tablet and desktop trivially consistent.

`ScaledCanvas.tsx`: renders children in a 1180×880 box, measures its container, applies `transform: scale(s); transform-origin: top left` with `s = min(availW/1180, availH/880)`. Interactive elements all keep working under transform scale; text stays crisp.

- **Desktop** (`DesktopFrame`): full-viewport deep-navy backdrop (`#000926`, optionally the design's `glowDrift` radial glow, very subtle). Centered frame: target size = **13″ diagonal at CSS 96dpi ≈ 1000×746 px** (scale ≈ 0.847). Cap at `min(target, 94vw/94vh-fit)` so small laptops scale down proportionally; never scale above 1. Frame styling: `border-radius: 28px; overflow: hidden;` plus a soft ambient shadow (`0 40px 120px rgba(0,0,0,0.55)`) and a hairline border (`1px solid rgba(94,158,255,0.18)`). No fake hardware bezel/camera — just the rounded slate. Frame is fixed; **inner page content scrolls within it** (design screens are built to fit 880 height; lists scroll internally, e.g. clients list, terminal lists).
- **Tablet**: no frame, no rounding — `ScaledCanvas` fills the viewport (scale to fit, letterbox with the same navy if the aspect ratio differs). On a typical 1180-to-1366-wide tablet in landscape it lands at scale ≈ 1. Portrait tablets letterbox vertically — acceptable v1; the design is landscape-first.

## 6. Screen-by-screen logic wiring

General: all data via the existing react-query patterns (`@/lib/queryClient`, `apiRequest`). **Reuse the exact fetching/mutation code from the referenced mobile page** — same endpoints, same optimistic updates, same invalidations. No new server endpoints are required except where marked NEW (all optional/deferrable). Amount/date formatting: reuse mobile helpers. All lists that render 5 mock rows in the prototype render real data with the same row anatomy (initials avatar, name | address, status dot, right-aligned amount).

**Billing gate (all three terminals):** payment-send endpoints return HTTP 402 `BILLING_CARD_REQUIRED` when no valid billing card (handoff §2). Mobile shows a persistent top warning with "Open Settings". Desktop must do the same inside the frame — reuse the same handling.

### Property (reference mobile files: `pages/property/*.tsx`)

- **2a Home** (`/property`) — ref `property-dashboard.tsx` (this branch's redesign is the logic source):
  - Header: `all properties` scope (see §7), big rent-collected figure + % pill + bar chart with Day/Week/Month/Year chips, tap-a-bar breakdown card — data derived from `/api/property/invoices` (+ merchant transactions), same aggregation the mobile dashboard uses.
  - **Portfolio Health strip** (desktop-only): 3 tappable numbers — failed $/count, overdue $/count, due-this-week $/count — computed client-side from `/api/property/invoices` statuses + `/api/property/schedules` upcoming. Tap → expands the design's `HDET` detail rows (the actual invoices/tenants behind that number).
  - **Notifications box** (desktop-only): backed by the existing `NotificationProvider` + `sseClient` (`components/notification-system.tsx`). Collapsed slot shows unread count; expanded lists latest notifications. Persisted read state can be local (v1).
  - Tenant search + 3 recent tenants w/ next payment date: `/api/property/tenants` + `/api/property/schedules`.
  - Quick actions: "set up rent payment" → `/property/terminal` (request mode), "send reminder" → the reminder/resend action from mobile (`/api/property/invoices/:id/resend` flow — open a tenant picker first, same as mobile behavior), "send expense" → `/property/terminal` expense mode.
- **2b Clients** (`/property/tenants`) — ref `tenant-directory.tsx`: active-tenant count hero, search, full list from `/api/property/tenants`, `+` opens the existing create-tenant flow (port the mobile form into a desktop modal, same schema `createTenantProfileSchema`, same POST). Row click → tenant profile: **no desktop design exists for the profile.** V1: navigate to `/property/tenants/:id` rendering the existing mobile `tenant-profile.tsx` centered in a ~430px column inside the desktop shell (explicitly styled as an interim). Note this in the PR description.
- **2c Terminal** (`/property/terminal`) — ref `property-terminal.tsx` (1,833 lines — the request/expense compose, frequency, SMS sending, list management all live here):
  - Left: outstanding rent + outstanding expenses totals; collapsible `rent request` list with status chips (all/overdue/sent/paid/failed) + search — `/api/property/invoices`.
  - Center rail icons switch compose context (tenant picker / send / new / expense / confirm — match rail order in the design markup).
  - Right: selected tenant, amount (`$650.00 | per week`, `edit>` opens keypad), delivery `sending via sms <phone>`, frequency chips once/weekly/fortnight/monthly, **send rent request** → same create-invoice/schedule mutations as mobile (`/api/property/invoices`, `/api/property/schedules` for recurring). Expense mode (`billAmt/billFor`) → the mobile expense/ad-hoc invoice flow (`createAdHocInvoiceSchema`).
  - Send button flash states (`reqFlash/billFlash`) on success; errors surface exactly like mobile (toasts).
- **2d Analytics** (`/property/analytics`) — ref `property-analytics.tsx` + `components/reports/PropertyReportsButton.tsx`/`ReportModal.tsx`:
  - Hero total revenue + outstanding, range chips, area chart (respect `chartStyle` pref).
  - Payment History draggable sheet: real transaction/invoice history grouped by day (same query as mobile analytics/transactions).
  - **Reports** → tiles→filters→report flow. Wire to the existing report-generation system (11 real reports shipped — see memory `report-gen-integration`; PDF engine is lazy-chunked). V1 rule: expose exactly the reports that exist today, rendered in the sheet with the design's donut/bars layout; **Export** uses the existing export endpoints (`/api/merchants/:id/export/pdf`, CSV where available). Design report tiles with no real backing yet (e.g. occupancy, late fees if absent) are omitted, not mocked. List any omissions in the PR.
- **2e Settings** (`/settings`) — ref `settings.tsx` (+ handoff §2):
  - Left column: avatar initials, ACTIVE badge (subscription status from `/api/subscription`), business name, **Customer Payment Page** button → opens `/pay/:merchantId`, vertical-switcher tiles, Log Out (existing auth logout).
  - Payment Board Builder card → `/board-builder` (mobile page renders there; interim column treatment like tenant profile if it looks wrong in-frame).
  - Business Details: trading name, GST number, receipt email → existing merchant-details endpoints (`updateMerchantDetailsSchema`). **Payout account is read-only** (bank update endpoint returns 410 — never build an editor for it).
  - Dashboard Preferences (NEW, small): `homeBigBox`, `chartStyle`, `historyStart` — v1 persist in `localStorage` per merchant id; (optional later: merchant settings columns).
  - Subscription & Billing: reuse `/api/subscription` + `/api/billing/card` UI logic from mobile settings (add/remove card, Luhn/expiry/brand validation already exists — port the form, not new validation).
  - Account: change password (existing `changePasswordSchema` flow).
  - Transaction Notifications: the toggles map to existing notification prefs in settings; if a toggle has no backend today, persist locally and note it.

### Trades (reference: `pages/trades/*.tsx`; same anatomy as property, so only deltas)

- **3a Home** (`/trades`) — ref `trades-dashboard.tsx`. Health strip: overdue invoices / awaiting deposit / quotes-awaiting-reply ($ + counts) from `/api/trades/invoices` + `/api/trades/quotes`. Client list w/ invoice status + due date. Quick actions: **new quote** → `/trades/quote` (quote-builder), **quick invoice** → terminal invoice mode (quick-invoice flow exists per memory `quickinv-pagetransition-fix`), **recurring jobs** → `/trades/recurring`.
- **3b Clients** (`/trades/clients`) — ref `client-directory.tsx`: `/api/trades/clients` (+ latest invoice status per row via `/api/trades/invoices`). `+` → create client (existing schema/flow). Row → `/trades/clients/:id` interim column treatment (same as tenant profile).
- **3c Terminal** (`/trades/terminal`) — ref `trades-terminal.tsx`: left totals (revenue this week, outstanding invoices) + jobs list with chips (all/overdue/sent/awaiting deposit/paid); right compose: amount, client, JOB NOTE field, sms line, **full / deposit / balance** chips (deposit % logic from quotes flow), fee line "TaptPay fee (0.3%): $x" — reuse the mobile fee calc, don't re-derive the rate; **send invoice** → `/api/trades/invoices` mutations. Rail pen icon → quote builder (`/trades/quote`).
- **3d Analytics** (`/trades/analytics`) — ref `trades-analytics.tsx` + `TradesReportsButton`: same sheet/reports/export pattern; GST summary report ties to `/api/trades/gst-settings` + existing GST report.
- **3e Settings** — same shared settings page; trades-specific extras that exist on mobile (GST mode via `updateTradeGstSettingsSchema`, reminder settings `/api/trades/reminder-settings`) appear when active vertical is trades.

### Retail (reference: `dashboard.tsx`, `stock-management.tsx`, `merchant-terminal-mobile-v2.tsx`, `payment-stack.tsx`, `transactions.tsx`)

- **4a Home** (`/dashboard`) — ref `dashboard.tsx`: sales revenue + chart (merchant transactions via `/api/merchants/:id/transactions`). Health strip: awaiting-payment $/count, avg sale + txn count, failed $/count — client-side aggregates of today's transactions. Recent sales list w/ method + relative time (`apple pay · 2m ago`) — fields exist on transactions. Quick actions: **new sale** → `/terminal`, **manage stock** → `/stock`, **view sales** → `/transactions`.
- **4b Stock** (`/stock`) — ref `stock-management.tsx`: product count hero; search; sort chips (a–z / price ↑ / price ↓); card grid from `/api/merchants/:id/stock-items` (icon, price, name, sold-this-week count — sold counts aggregated from transactions if that's what mobile does; else omit the subtitle); dashed **add product** card + card click → existing create/edit stock flows (desktop modal, same schemas); BEST SELLER footer computed from the same data.
- **4c Terminal** (`/terminal`) — ref `merchant-terminal-mobile-v2.tsx` (create/tap-to-pay) + `payment-stack.tsx` (active stack):
  - Left: sales revenue today + transactions today; **active stack** list with chips (all/awaiting payment/paid/failed) + search — the live payment stack (same queries/SSE updates as `payment-stack.tsx`, unlimited concurrent payments, tap row → mark paid / open detail exactly as mobile).
  - Right compose: amount (`edit>` → keypad), **paywave / boards** delivery chips, item name field (stock-item quick picks come from stock list — see tablet prototype's `custom | latte | big brunch` chips), **split bill** toggle (merchant `splitEnabled` gating — split is merchant-gated, check flag) with "customer chooses how many ways", fee line "10¢ per transaction", **send payment** → same transaction-creation mutation as mobile (`/api/transactions`), share icon → share/copy payment link (existing link from created transaction).
- **4d Analytics** (`/transactions`) — ref `transactions.tsx` + `RetailReportsButton`: totals + txn count, chart, Payment History sheet = transaction list w/ refund/receipt actions on row detail (`/api/transactions/:id/refunds`, `/receipt-pdf`), Reports/Export as per property.
- **4e Settings** — shared settings page, retail flavor (daily goal / theme if present on mobile settings stays).

## 7. Cross-cutting decisions

- **Scope dropdown** (`all properties` / `all sites` / `my store`): there is **no multi-property/site model in the schema** (single merchant scope). V1: render the dropdown as the design does with the single scope; property vertical may list distinct tenant `propertyAddress` values as filter options if trivially derivable — otherwise static single option. Do not invent a properties table.
- **Numbers animate** (count-up on hero figures), bars grow on mount (`tileIn`), report renders use `reportIn`, buttons use `popIn` where the design does. Keep all animation CSS-first (the prototype is plain CSS + tiny JS state — no animation library needed; do NOT add framer-motion etc.).
- **Fonts**: app already ships Outfit. The design also uses Plus Jakarta Sans in places — check computed styles in the design; if Jakarta appears in final screens, add the `.otf`s from `_ds/fonts` to `client/src/assets` and `@font-face` them (subset if easy); otherwise stay Outfit-only.
- **SSE**: reuse `sseClient` singleton; desktop terminal + notifications subscribe exactly like mobile pages do (beware the dual-payload/tenant-scoping fix from the 2026-07-12 audit — do not add a second parallel EventSource).
- **No mock data anywhere.** The prototype's hardcoded rows (josh smith etc.) are placeholders; every list/number must come from the APIs above. Empty states: design implies simple ones — keep them minimal (dimmed message in the list area), consistent with mobile copy.
- **Auth/session**: unchanged — `ProtectedRoute` already handles it. Login/onboarding remain mobile-styled on all devices (out of scope).

## 7a. Tutorial on tablet/desktop

How it works today: `ProtectedRoute` passes `tutorialPage` → `client/src/features/tutorial/tutorial-registry.ts` holds per-page step lists (~61 steps), each step a CSS selector `target` (+ `fallbackTarget`) like `[aria-label="new sale"]`, `[data-tutorial-id="tx-export"]`. The overlay (`tutorial.tsx`) portals to `document.body`, `position: fixed`, and measures targets with `getBoundingClientRect`.

Good news: **the overlay mechanics need no changes for the scaled canvas** — `getBoundingClientRect` returns post-transform viewport coordinates, and the overlay is viewport-fixed, so the spotlight lands correctly inside the scaled/framed app. Verify this early in P0 with one dummy step.

What does need doing:

1. **Anchors**: every desktop component that is the equivalent of a tutorial-targeted mobile control must carry the **same anchor attribute** (`data-tutorial-id="…"` / `aria-label="…"`) as its mobile counterpart. Build this into the desktop components from the start (it's also good a11y). Where the registry targets a mobile-only class (e.g. `.tp-amount`, `.rd-card`), prefer adding a `data-tutorial-id` to BOTH the mobile element (non-breaking, additive attribute only) and the desktop element, then add it as `fallbackTarget`-compatible selector — or give the desktop element the same class only if it doesn't drag mobile CSS with it (it usually will; prefer the data attribute).
2. **Registry per-device overrides**: extend the step type with optional `desktopTarget?: string` and `desktopBody?: string`. Resolution order on non-mobile: `desktopTarget ?? target` (then fallbacks). Copy that references phone-only gestures/layout ("bottom dock", "swipe up", "tap") gets a `desktopBody` rewrite ("top navigation", "drag", "click"). Audit all ~61 steps; most reuse the same copy.
3. **Steps for pages whose desktop layout merges/differs**: e.g. retail terminal + payment stack are two mobile pages (`retail-terminal`, `retail-payment-stack`) but one desktop screen — on desktop, the `/terminal` route's step list should cover both the compose panel and the active-stack list (compose steps + stack steps merged under the terminal page key via a desktop-specific step list where needed).
4. **Desktop-only widgets** (health strip, notifications box): add 1 short step each to the relevant home-page tutorials, marked desktop-only (`deviceClass !== 'mobile'` filter when building the step list) so mobile flows are byte-identical to today.
5. **Progress/completion**: reuse the existing per-page progress storage (`merchant_tutorial_progress`) unchanged — same page keys, so a merchant who did the tour on mobile isn't re-prompted on desktop and vice versa.
6. **Regression rule**: mobile tutorial behavior must not change — additive attributes and optional fields only; run the existing tutorial tests plus a mobile-viewport smoke of one full page tour.

## 8. Build order (phases — commit + typecheck + build after each)

1. **P0 Scaffolding**: `use-device-class`, `DesktopFrame`, `ScaledCanvas`, `DesktopShell` (nav + mode derivation + saveMode), `desktop-theme.ts`, App.tsx route switching + BottomNavigation gating + lazy chunks. Verify the tutorial overlay spotlights correctly inside the scaled frame (one dummy step, §7a). Acceptance: on desktop viewport every gated route shows an empty framed shell w/ working pill nav; phone (390px) is pixel-identical to before; tablet fills screen.
2. **P1 Retail** (default vertical): 4a → 4b → 4c → 4d. Terminal last-but-one since it's the riskiest (live payments — test with the seeded merchant, see memory `playwright-nix-chromium` for auth'd Playwright).
3. **P2 Property**: 2a → 2b → 2c → 2d.
4. **P3 Trades**: 3a → 3b → 3c → 3d.
5. **P4 Settings** (2e/3e/4e as one page) + Dashboard Preferences wiring back into Home/Analytics (`homeBigBox`, `chartStyle`, `historyStart`).
6. **P5 Tutorial adaptation** (§7a): anchors audit across all 15 screens, registry `desktopTarget/desktopBody` overrides, merged step lists where mobile pages combined into one screen, desktop-only-widget steps, mobile tutorial regression.
7. **P6 Polish + QA**: animations pass against the prototype side-by-side; health-strip drilldowns; notifications box; empty states; 402 billing-gate banner on all three terminals.

Per-phase verification (all headless-able):

- `npm run check` (typecheck), `npx jest`, `npm run build` all green.
- Playwright screenshot matrix vs `docs/design/desktop-app/screens/`: 1440×900 (desktop, frame centered ~1000px wide, rounded, navy letterbox), 1194×834 & 1366×1024 (tablet full-bleed), 390×844 (mobile — must be unchanged; diff against pre-change screenshots).
- Functional smoke per screen with the seeded merchant (merchant 22 + minted JWT, dev server on :5000 — **single instance only**, see memory `dev-server-single-instance`): send a payment/request end-to-end, filter chips, search, sheet drag, a report generation, a settings save.

## 9. Repo rules (do not skip)

- Follow `CLAUDE.md`: never `git add -A`; exclude `.claude-home/**` and `.claude/settings.local.json`; read the 2026-07-20 handoff before touching staging.
- Current branch `feat/property-dashboard-redesign` — create a new branch off it (e.g. `feat/tablet-desktop-app`) rather than mixing with the pending property-dashboard work.
- Never `db:push` from a main-based branch (memory `db-schema-drift-fk-sequences`). This project should need **no schema changes** in v1.
- Keep desktop code out of the mobile bundle (verify chunk split in `npm run build` output — eager vendor-chunk regression was a real past incident, memory `app-perf-loading`).

## 10. Known gaps / decisions already made (don't re-ask)

- Tenant/client **profile pages** and **quote builder / board builder / recurring** have no desktop designs → render existing mobile pages in a centered column inside the shell as interim (§6). Flag them in the PR for future design.
- Reports without real backends are omitted, not mocked (§6, 2d).
- Scope dropdown is cosmetic-single-scope in v1 (§7).
- Onboarding/signup/login stay exactly as built (already responsive) on every device — no desktop variants (§3).
- Tutorial DOES run on tablet/desktop, adapted per §7a; mobile tutorial must remain byte-identical.
- Retail Analytics lives at `/transactions` (§4).
