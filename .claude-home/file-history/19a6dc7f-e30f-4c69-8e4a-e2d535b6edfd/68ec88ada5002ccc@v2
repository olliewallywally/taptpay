# Property Dashboard Redesign — Design Spec

**Date:** 2026-07-02
**Reference:** user-supplied mockup `attached_assets/image_1783029267424.png`
**Scope:** Full rewrite of `client/src/pages/property/property-dashboard.tsx` to the new design, plus deep-link wiring into `client/src/pages/property/property-terminal.tsx` (query-param entry + status filter and inline reminder buttons on the active rent-requests stack). All figures computed from live data.

## Design source

The mockup is the user's own design and is authoritative for layout, palette, and typography. Numbers in the mockup ($15,500, +25%, 85%, 250, 12) are examples only — every figure is computed from live invoice/tenant data. The mockup's flat-low-bars look is the empty state.

Palette follows the existing property tokens: navy `#040D6D`, sky `#58ABFF`, bright bar-highlight blue (the lighter `#3F9BFF`-family blue used for the selected bar), off-white sheet `#F4F4F4`, white cards. Font: Outfit.

## Page layout (top → bottom)

1. **Navy hero card** (rounded, full-width, containing items 2–5)
2. **`all properties ⌄` dropdown** — wireframe pill (transparent, 1.5px sky stroke), top-right inside the hero.
3. **Hero figure block** — huge sky-blue `$X,XXX` = rent **collected** in the selected timeframe (and selected property), with:
   - a small wireframe pill beside it, e.g. `+25%` — change vs. the previous equivalent period (previous day/week/month/year, matching the selector). Negative periods show `-X%`; if the previous period had zero collected, the pill hides.
   - `rent collected` label under the figure.
   - `XX% collection rate` line — paid ÷ (all non-voided invoices sent) within the selected timeframe & property, as a percentage.
4. **Bar chart** — clickable vertical bars with rounded tops, axis labels beneath (M T W T F S S etc.). One bar is "selected": rendered in the brighter blue with a pill bubble floating above it showing that bucket's collected total (e.g. `2.5k`). Tapping any bar moves the selection + pill. Default selection = the current (most recent) bucket.
5. **Notch** — the hero card bottom has a small downward triangle notch pointing at the timeframe selector below it (as in the mockup).
6. **Timeframe selector** — `Day / Week / Month / Year` pill bar on the sheet below the hero. Navy track, cyan/sky sliding indicator behind the active label. Slide effect mirrors the terminal's `SubBar`/`.tp-subbar-ind` pattern: refs on each button, measure `offsetLeft`/`offsetWidth`, animate the indicator's `left` + `width` with the same spring curve (`cubic-bezier(0.34,1.56,0.64,1)`, ~450ms).
7. **Stat cards row**:
   - `TENANTS` — white card, tenants icon, big navy count of active (non-archived) tenants. Tap → `/property/tenants`.
   - `OUTSTANDING` — navy card, `(!)` icon, big sky count of overdue invoices. Tap → `/property/terminal?stack=overdue`.
8. **Action buttons row** (three white rounded cards, small label + icon):
   - `set up rent payment` (+ icon) → `/property/terminal?screen=tenants` (the same destination as the terminal FAB's plus button — first step of creating a rent payment).
   - `send reminder` (alarm icon) → `/property/terminal?stack=overdue&remind=1`.
   - `send expense` (bill icon) → `/property/terminal?screen=bill` (the bills/charge feature screen).

Bottom nav and page chrome stay as-is (existing property bottom nav).

## Chart: buckets & animation

**Calendar buckets** per timeframe (bars = rent collected, i.e. paid/paid_external invoices bucketed by `paidAt`):

| Timeframe | Buckets | Labels |
|---|---|---|
| Day | 8 × 3-hour blocks over the last 24h | 3-hourly times (e.g. 12a 3a 6a … 9p) |
| Week | 7 days, Monday-start current week | M T W T F S S |
| Month | Weeks of the current month (4–5) | W1 W2 W3 W4 (W5) |
| Year | 12 months, Jan–Dec current year | J F M A M J J A S O N D |

- Bars are inline SVG (no chart library) rendered in a fixed viewBox; bar width/x positions derive from bucket count so 7 → 12 bars re-space smoothly.
- **Timeframe-change animation:** existing bars animate to their new x/width (slide over); entering bars grow from the baseline up; exiting bars shrink to the baseline then unmount. Implementation: keep bars keyed by index against the max bucket count, animate `height`/`y`/`x`/`width` via CSS transitions on SVG attributes (or animated `<rect>` style transforms); ~450–600ms spring-ish curve consistent with the selector slide.
- **Bar tap:** sets the selected bucket; the value pill (rounded rect, bright blue, compact `$` formatting: `2.5k`, `$980`, `12k`) animates (fade/scale) to sit above the selected bar. Selected bar uses the brighter blue; others sky-at-rest.
- Value normalisation: bar heights scale to the max bucket value in the current view; all-zero view renders uniform minimal stubs (the empty state).

## Data & filtering

- Data sources: existing queries `/api/property/invoices` and `/api/property/tenants` via `propFetch` (same query keys as today; no new endpoints).
- **Property filter:** options = `all properties` + distinct `propertyAddress` values from tenants. Selecting one filters invoices (by invoice `propertyAddress`, falling back to the tenant's address via `tenantProfileId` when the invoice lacks one) and tenants client-side. Every figure on the page (hero $, % pill, collection rate, bars, both stat-card counts) respects the filter.
- Voided invoices are excluded everywhere (existing convention).
- Timeframe windows for hero/collection-rate/growth: Day = last 24h, Week = current Mon-start week, Month = current calendar month, Year = current calendar year; "previous period" = the equivalent immediately-preceding window.
- Error state: keep the existing retry banner pattern if invoices fail to load.

## Terminal deep-linking (property-terminal.tsx)

The terminal navigates by internal `screen` state (`go()`), so it will read query params on mount (wouter `useSearch` or `window.location.search`):

- `?screen=tenants` → after mount, `go('tenants')` (skips straight to the rent-payment flow's first screen, same as tapping the FAB).
- `?screen=bill` → `go('bill')`.
- `?stack=overdue` → stay on home; pre-set the new stack status filter to `overdue`.
- `?remind=1` (with `stack=overdue`) → additionally show inline **remind** buttons on the filtered rows.
- Params are consumed once on mount (then cleared via `history.replaceState` so refresh/back doesn't re-trigger).

### New: status filter on the active stack (RequestsHome)

- A compact chip row above the rent-requests list: `all · overdue · sent · paid · failed` (statuses per the existing `invoiceStatusFor` mapping). Default `all`. Chips styled consistently with existing terminal pills.
- Filter applies to the list; `all` preserves today's behaviour (12 most recent).

### New: inline reminder button

- When reminder mode is active (via `?remind=1`, or a row is overdue while the overdue filter is on), each overdue row shows a small `remind` pill button on the right; tapping it fires the existing per-invoice resend mutation (`POST /api/property/invoices/:id/resend` via `resendOneMutation`) and shows the existing toast. Button shows a brief busy state and doesn't open the row action sheet (stopPropagation).

## Micro-interactions (all tappable elements)

Applies to: action buttons, stat cards, dropdown pill, timeframe buttons, bars.

- **Rest:** subtle drop shadow (`0 4px 14px rgba(4,13,109,0.08)`-ish on white cards).
- **Hover:** slight lift (`translateY(-1px)`) + shadow deepen.
- **Press:** a stroke-glow ring animates around the element — implemented as a keyframed `box-shadow` ring (`0 0 0 0 rgba(88,171,255,0.55)` → `0 0 0 8px rgba(88,171,255,0)`, ~450ms) triggered per press. Delivered as a small shared CSS class + press handler within the dashboard file.
- `-webkit-tap-highlight-color: transparent` throughout (mobile webview).

## What is removed

The current dashboard's sections (active-transactions hero, revenue+gauge row, 4-stat strip, recent rent transactions list) are replaced wholesale by the new layout. The `Ring` gauge, `StatusBox`, glass card styles, and stat icons that no longer appear are deleted from the file.

## Components (all within property-dashboard.tsx, matching codebase style)

- `PropertyDropdown` — wireframe pill + simple absolute-positioned menu.
- `RentBarChart` — SVG bars + labels + selected-bar pill; props: `buckets: {label, valueCents}[]`, `selectedIdx`, `onSelectBar`, `animKey` (timeframe).
- `TimeframeBar` — Day/Week/Month/Year with sliding indicator (SubBar-style measurement).
- `StatCard`, `ActionButton` — the tappable cards with the press-glow treatment.
- `buildBuckets(invoices, tf)` — pure bucketing helper (unit-testable).

Terminal changes stay minimal and local: query-param mount effect, filter chip row + filter state in `RequestsHome`, inline remind button wired to the existing mutation.

## Testing

- Unit: `buildBuckets` bucketing per timeframe (paid-only, voided excluded, correct bucket counts/labels); growth-% helper (previous-period comparison, zero-previous hides pill).
- Existing jest setup (`jest.config.cjs`) — colocate under `client/src/pages/__tests__/`.
- Manual webview pass: timeframe animation, bar taps, property filter, all five navigation targets, terminal filter chips + remind button.

## Non-goals

- No new API endpoints or schema changes.
- No changes to the trades vertical (a later parity pass can port this).
- No server-side reminder logic changes (reuses existing resend endpoint).
