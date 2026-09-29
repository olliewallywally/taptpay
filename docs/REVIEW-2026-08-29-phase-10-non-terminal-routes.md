# Review — phase 10 diagnosis: non-terminal merchant routes

Date: 2026-08-29 · Branch `feat/tablet-desktop-app`
Plan: `docs/PLAN-2026-08-17-mobile-responsive-ui.md` §9 phase 10 ("Extend to
non-terminal merchant routes")
Status: diagnosis only — no fix code in this pass, matching how RC-1..RC-7
preceded phases 1-9 rather than being discovered mid-implementation.

Phases 1-9 and RC-1 through RC-7 (§3) were scoped entirely to the three
`.tp-*` terminal verticals. Nothing outside that shell — the dashboard, stock
management, transactions, settings, onboarding, auth, and the public landing
page — was ever measured. Six independent, evidence-based audits covered
exactly those remaining routes, each using the same measure-don't-eyeball
method the terminal work established (Playwright/Chromium, real
`getBoundingClientRect`/`scrollWidth`/computed-style reads, simulated
safe-area and keyboard insets). RC numbering continues from RC-7.

---

## RC-8 — Bare `100vh` / `min-h-screen` / `max-h-[90vh]` with no svh/dvh fallback chain *(RC-5 recurrence)*

Same mechanism RC-5 already fixed on the terminal (`height: 100vh; height:
100svh; height: 100dvh;`): Tailwind's `min-h-screen` and any bare `vh`
arbitrary value compile to the *large*-viewport `100vh`, which on iOS Safari
with the URL bar showing is 60-100px taller than what's actually visible. It
recurs, unguarded, on four route groups:

- **`/stock`** — `client/src/pages/stock-management.tsx:518` carries
  Tailwind's `min-h-screen` **nested one level inside** its own parent at
  `:517`, which already correctly sets `minHeight: '100svh'` inline. Confirmed
  against Tailwind's own default theme (`node_modules/tailwindcss/stubs/config.full.js:538,645,677`
  → `screen: '100vh'`; `tailwind.config.ts` never overrides `minHeight`).
  Runtime: computed min-height tracked `window.innerHeight` exactly (568px
  @320×568, 844px @390×844).
- **`/transactions`** — `client/src/pages/transactions.tsx:593`,
  `DialogContent className="... max-h-[90vh] ..."`, is the *one* height in
  this file that never migrated (lines 435, 436, 501 already use `100svh`).
  Computed `maxHeight` resolves to **511.2px @320×568** and **759.6px
  @390×844** — purely off the raw viewport, with nothing capping it to the
  true visible area.
- **`/login`** and **`/signup`** — `client/src/pages/login.tsx:145`
  (`min-h-screen`) and `client/src/pages/merchant-signup.css:2`
  (`.signup-page { min-height: 100vh; ... }`) both have zero svh/dvh companion
  rule (CSSOM match confirms no fallback in either matched rule; computed
  min-height tracks 844px/568px on login). Both are pre-auth flows reachable
  directly in mobile Safari.
- **`/` (landing)** — `client/src/pages/landing-page.tsx:194` (`#tp-story`)
  and `:316` (`#tp-words`) are `height: '100vh'` **combined with
  `overflow: 'hidden'`** while `position: sticky`-pinned for a scroll-linked
  3D animation — the riskier direction RC-5 was written to close, because
  bottom-anchored HUD/dot elements (`#tp-cine-dots`, `bottom: 5vh`, line 304;
  `#tp-cine-hud`, `bottom: 8vh`, line 300) would render below the real fold on
  real iOS Safari mid-scroll with no internal scroll available to reach them.
  (Headless Chromium can't reproduce the dynamic toolbar to show the delta
  directly — the finding is the unguarded pattern itself, verified absent of
  any fallback in source.)

**Checked and explicitly ruled out, not a recurrence:** `/onboarding`'s
`min-h-screen` (`merchant-onboarding.tsx`) also compiles to bare `100vh`, but
that audit deliberately tested it against RC-5's actual failure mode and
confirmed it does *not* reproduce — it's a `min-height` floor on a freely
scrolling document with no fixed shell, so the oversized value can only pad,
never clip.

## RC-9 — Hardcoded top-of-screen pixel clearance instead of `env(safe-area-inset-top)` *(RC-5 recurrence)*

The app sets `viewport-fit=cover` and `apple-mobile-web-app-status-bar-style:
black-translucent` site-wide (`client/index.html`), and already has a
correct, working precedent for reading the real inset
(`client/src/components/notification-system.tsx`, and
`TerminalDockView.tsx:466`'s `max(20px, env(safe-area-inset-bottom, 20px))` on
the *bottom* edge of these very routes' shared dock). The top edge is
unaddressed on **every one of the six audited route groups**:

- **`/dashboard`** — `RetailDashboardView.tsx:500`, `padding: '54px 22px 30px'`.
- **`/stock`** — `stock-management.tsx:519-520`, an explicit
  `{/* Safe-area spacer */}` `<div style={{ height: 54 }} />`.
  *(Grep across both files plus `retail-dashboard-view.css` for
  `env(safe-area-inset` → no matches; `grep -rln safe-area-inset-top
  client/src` → only `notification-system.tsx`.)*
- **`/transactions`** — `transactions.tsx:439`, `padding: '52px 24px 0'`; the
  'analytics' label's own `getBoundingClientRect().top` measured **57px**,
  i.e. 2px inside a 59px Dynamic-Island-class inset once one was simulated.
- **`/settings`** — `settings.tsx:719`, hero `padding: '64px 22px 28px'` at
  document y=0; behaviorally confirmed inert — computed `padding-top` was
  **64px with no simulated inset and unchanged 64px with a 59px-top
  simulation applied** (`mobile-fixtures.mjs`'s `--sa-test-top`).
- **`/onboarding`** — `merchant-onboarding.tsx:101`, `py-10` → fixed 40px;
  icon circle top measured at **y=40**. Compared against known device values
  (iPhone 14: 47px; Dynamic-Island class: 59px) rather than a live
  simulation, since `env()` is unconditionally 0 outside real WebKit and this
  page has no `--sa-test-*` fallback wiring — both device values exceed the
  page's 40px.
- **`/login`** — `login.tsx:154`, back button measured **top: 24px**.
- **`/signup`** — back button (`.signup-page-back`) at **top: 19.2px**, logo
  row (`.signup-brand-row img`) at **top: 66.3px**.
- **`/` (landing)** — `landing-page.tsx:55` (`#tp-nav`, `top: '2px'`) and
  `:92` (`#tp-menu-close`, `top: '20px'`); computed `padding-top` on the nav
  stayed at the authored **18px** across all three tested viewports
  regardless of simulated inset. Grep for `safe-area|env(safe` across
  `landing-page.tsx`, `landingRuntime.ts`, `landing.css` → zero matches.

This is the broadest single pattern found in phase 10 — present on all six
route groups.

## RC-10 — Modals and sheets never wire into the app's own `--kb-h` / `window.visualViewport` keyboard contract

`useKeyboardInset()` is mounted app-wide (`App.tsx:1011`/`:1013`,
`client/src/hooks/use-keyboard-inset.ts`) and correctly publishes `--kb-h` /
`[data-kb-open]` on `<html>` specifically so a focused field's commit button
can't end up underneath the software keyboard — but the only consumer of
either token is `client/src/features/terminal/terminal-tokens.css:149-172`,
scoped to `.tp-viewport .tp-screen.tp-feature`. Two shared, non-terminal
overlay components have zero rules keyed on either, and
`scripts/verify-mobile-keyboard.mjs`'s §K3 keyboard-occlusion check only ever
drives the three terminal verticals, so neither gap has ever been caught:

- **`/stock`** — the Add/Edit-product `SheetContent` (`side="bottom"`,
  fixed, static `h-[92dvh]`, `stock-management.tsx:667`) puts its
  Save/Cancel/Delete footer (`:293-345`) as a `shrink-0` **sibling** of the
  scrollable body, not inside it, so it has no scroll path even in
  principle. Simulating the keyboard the same way `verify-mobile-keyboard.mjs`
  does (shrinking `window.visualViewport`): Save button hidden by **248.0px
  @320×568** (kb=260px) and **320.0px @390×844** (kb=336px); the sheet's own
  rect is pixel-identical before/after.
- **`/transactions`** — the Transaction Receipt / Issue Refund
  `DialogContent` (`client/src/components/ui/dialog.tsx:41`, `fixed
  left-[50%] top-[50%] translate-x/y-[-50%]`) is positioned against the
  static layout viewport, not `visualViewport`. Grep for `--kb-h`,
  `[data-kb-open]`, `window.visualViewport` across `transactions.tsx` and
  `dialog.tsx` → zero hits. Simulated keyboard: Confirm Refund button hidden
  by **193.7px @320×568** / **252.5px @390×844**; the Refund Amount input
  itself hidden by **28.9px / 87.7px**. Dialog rect measured pixel-identical
  before and after raising the keyboard in both cases.

**Checked and explicitly ruled out, not a recurrence:** `/onboarding` and
`/login`/`/signup` were both checked against this exact risk and confirmed
not applicable — neither has a `position: fixed` / non-reflowing ancestor, so
the browser's native focus-scroll-into-view already handles the keyboard
correctly.

## RC-11 — Fixed-width siblings / no `min-width:0` safety net starve text columns *(RC-4 recurrence)*

RC-4 named "no fluid type, no intrinsic sizing, anywhere" on the terminal; the
same absence of a fluid/intrinsic-sizing safety net recurs on three
normal-flow, non-terminal routes, via three different concrete mechanisms
(fixed-width flex siblings, an unconstrained grid item, a JS-injected
`nowrap` row) that all produce the same class of failure — text either
clips/widens the page, or is squeezed unreadably next to a full-size,
non-shrinking control:

- **`/settings`** — billing card-on-file row (`settings.tsx:1184`,
  `<p className="truncate">{brand} ending in {last4}</p>` at `:1193-1195`)
  sits in a `flex ... gap-3` row against two fixed-width `shrink-0` outline
  buttons (~68px each, `:1201-1215`). Measured text-column `clientWidth` vs
  the string's own `scrollWidth` (118px): **9.55px @320×568** (screenshot
  shows a single 'V'), **56.5px @375×667**, **71.5px @390×844** (screenshot:
  "Visa endi…" — the last-4 digits are never visible), **111.5px @430×932**
  (still 6.5px short on the largest supported phone). Team-member rows
  (`:1073`, name/email column at `:1075-1080` against Resend/Revoke or
  Disable/Remove buttons at `:1082-1102`/`:1104-1127`) show the same shape: an
  invited member's 33-char email measured **71px / 223px scrollWidth
  @320×568** (141/223 @390×844); an active member's meta line measured
  **67px / 214px @320×568** (137/214 @390×844) next to a destructive
  Disable/Remove pair.
- **`/onboarding`** — `merchant-onboarding.tsx:142`, the "Registered Business
  Details" summary's `grid grid-cols-2` value `<span>`s have no `min-w-0`,
  `break-words`, `overflow-wrap`, or `truncate` at all, so an unbroken string
  (an email has no wrap point) doesn't clip — it pushes
  `documentElement.scrollWidth` past `clientWidth` and widens the whole
  layout viewport: **334 vs 320 (+14px) @320×568** for a 41-char email, span
  rect `right: 333.6` (13.6px past the true edge); binary-searched trigger at
  **38 chars (+1px) → 40 chars (+14px)**; reproduced at **393 vs 390 (+3px)
  @390×844** with a 48-char email. `window.innerWidth` itself moved to 334 —
  the forced-pinch-zoom/horizontal-scroll failure mode.
- **`/` (landing)** — `landingRuntime.ts:1008-1009`'s mobile-layout rewrite
  injects a `white-space: nowrap` payment-methods row into
  `#tp-hero-content` (`landing-page.tsx:122`), a flex item of `#tp-hero` with
  no `min-width:0`/`width`/`flex` set (`:114`). Per the flexbox
  automatic-minimum-size rule this pins the whole hero column to the nowrap
  row's own content width — measured `#tp-hero-content` computed width
  **398.812px identically at 320 and 390** (independent of viewport). At the
  plan's own 320×568 floor this produces real glyph clipping:
  `Range.getClientRects()` on the hero paragraph shows live body copy running
  to `x=343.5`, **23.5px past the 320px edge**, invisible to a `scrollWidth`
  check because `#tp-root` sets `overflowX: 'clip'` (`:41`). Fits with
  11-31px of slack at 390/430 today — "one growth of copy... away from
  re-breaking there too."

A related, cosmetic-only truncation was also found on `/settings` (see
one-offs below) but is kept separate since it's ellipsis working as intended,
not an overflow/squeeze defect, and doesn't recur elsewhere.

---

## Route-specific, one-off findings

These don't recur elsewhere and don't fit a merged RC above.

**`/transactions`**
- **Dock paints over and intercepts clicks on the refund modal.**
  `TerminalDockView` is a fixed sibling of the router at `zIndex: 60`
  (`TerminalDockView.tsx:466`); the shared Dialog overlay/content both use
  Tailwind's `z-50` (`dialog.tsx:24,41`). Nothing in `transactions.tsx`
  reserves the dock's footprint. Measured @390×844 with the refund form
  open: dialog `bottom=801.8`, dock `top=766` → **35.8px of overlap**;
  `document.elementFromPoint()` in that band returns the dock's
  `data-demo-id="dock-terminal"` button, not the dialog.
- **Bottom list padding is a guessed dock clearance, not read from the live
  `--dock-h` token.** `transactions.tsx:522` hardcodes `130px`; the dock
  already publishes its real measured height as `--dock-h` on
  `document.documentElement` (`TerminalDockView.tsx:205`) for exactly this
  purpose, but the file never reads it (grep: zero hits). Measured
  `--dock-h = 78px` today, leaving 52px of untested margin that nothing
  would catch drifting.

**`/settings`**
- **Mode-switcher subtitles lose their second word at the 320px floor only**
  (cosmetic — the ellipsis mechanism itself is not broken).
  `settings.tsx:1494/1506/1518`: `scrollWidth`/`clientWidth` measured
  **63/43, 56/43, 53/43 @320×568** ("termin…" / "tenants…" / "quotes…"),
  fully fits (63/63, 56/56, 53/53) at 390×844 and above. A related suspected
  'Property' title overflow was checked and ruled out — `titleOverflowsButtonBy: 0`,
  no visible clipping in the screenshot.

---

## Tap-target regressions — regressions on already-shipped work, not new scope

One genuine tap-target regression was found, and it is the reason
`dashboard-stock`'s audit reports `noRegressionConfirmed: false` (every other
route group reports `true`):

- **`/stock` — `ProductSheet`'s controls were never covered by the phase-5
  44px-removal ruling and are now smaller-and-uncompensated.** Before phase 5
  (commit `1030d37`, "replace the blanket 44px control rule"), *every*
  `<button>` in this sheet was accidentally inflated to a 44×44 hit box by
  the old `index.css:362-368` rule. Removing that rule app-wide was correct —
  but `docs/REVIEW-2026-08-24-mobile-44px-control-inventory.md`'s source
  crawl (`scripts/inventory-44px.json`, captured 2026-08-23) only visited the
  *closed* `/stock` route (Radix mounts `SheetContent` conditionally on
  `open`), capturing 17 controls, none from inside the sheet. Measured live
  (390×844, sheet + EmojiPicker + a variation group open,
  `stock-management.tsx:59-67,115-121,139-146,171-177,180-186,226-228`): 40
  emoji buttons at **29.6×36px**, per-group remove `<X>` at **15×15px**,
  per-option remove `<X>` at **13×13px**, 'Add group'/'Add option' links at
  **~75×17px**, sheet close at **28×28px** — none carry `.tap-target`. The
  per-option/-group removes fire directly on click with no confirmation
  step, so a mis-tap on a 13-15px target silently discards a variation
  entry.

**Checked and confirmed NOT regressed:** `/login` and `/signup`'s
`.tap-target` treatment was added in the same 2026-08-24 commit (`1030d37`)
that the control inventory explicitly reviewed for these two routes — no
regression there. `/onboarding`'s text/select/textarea fields were never in
RC-1's selector list (`button, [role="button"], input[type="submit"],
input[type="button"]`) to begin with, so there was nothing to regress. `/`
(landing)'s one 44px-affected control (`.tp-tab` industry switcher, ruled
NATIVE in the same review) has had no new interactive control added since.

---

## Zero-finding route groups

**None.** All six audited route groups came back with at least one finding:
`dashboard-stock` (4: RC-8, RC-10, RC-9, plus the tap-target regression
above), `transactions` (5: RC-10, RC-8, RC-9, plus the 2 one-offs above),
`settings` (4: RC-11 ×2, RC-9, plus the 1 one-off above), `onboarding` (2:
RC-9, RC-11), `auth-login-signup` (3: RC-8 ×2, RC-9), `landing` (3: RC-11,
RC-8, RC-9).

---

## Punch list

**Blocking**
1. `/transactions` refund modal — wire the Confirm Refund button and Refund
   Amount input into `--kb-h`/`visualViewport` (RC-10). Confirm button is
   193.7-252.5px behind the keyboard today, with no scroll path.
2. `/stock` `ProductSheet` — wire the Save/footer row into `--kb-h` (RC-10).
   Save button is 248-320px behind the keyboard, unreachable.
3. `/settings` billing card-on-file row — text column collapses to
   9.55-111.5px vs the 118px needed, at *every* supported width including the
   390 reference; last-4 digits are never visible at 390×844 (RC-11).
4. `/settings` team member rows — identifying name/email squeezed to
   67-141px vs 214-223px needed, next to destructive
   Resend/Revoke/Disable/Remove buttons, at every width including 390 (RC-11).
5. `/` landing hero — the JS mobile-layout rewrite silently clips 23.5px of
   live hero copy at the 320×568 floor with no scrollbar to reveal it
   (RC-11).
6. `/onboarding` business-details summary — long emails/business names
   overflow the grid column and widen the entire layout viewport (+14px
   @320, +3px @390) (RC-11).
7. `/stock` `ProductSheet` — 13-15px destructive remove controls with no
   confirmation step and no `.tap-target` compensation (regression callout
   above).

**Moderate**
8. RC-8 viewport-unit cleanup: `/stock:518`, `/transactions:593`
   (`max-h-[90vh]`), `/login:145`, `/signup`'s `.signup-page`, `/` landing
   `#tp-story`/`#tp-words`.
9. RC-9 `env(safe-area-inset-top)`: all six route groups' top chrome — worst
   measured cases are `/transactions` (2px into a 59px inset) and
   `/settings` (hero inert to a simulated 59px inset).
10. `/transactions` dock (`z-index:60`) painting over and intercepting
    clicks on the lower ~36px of a tall refund modal (`z-50`).
11. `/transactions` list's hardcoded 130px dock clearance vs. the live
    `--dock-h` token (currently 78px; 52px of untested, driftable margin).

**Cosmetic**
12. `/settings` mode-switcher subtitles lose their second word
    ("sales"/"rent"/"jobs") at the 320px floor only; ellipsis mechanism
    itself works correctly.

---

## Method

Six parallel audits (dashboard+stock, transactions, settings, onboarding,
login+signup, landing), each against the live dev server on :5000 via
Playwright/Chromium (the nix-store fallback pattern from
`scripts/desktop-shots/retail-fixtures.mjs`), reusing the existing
auth/API-mock fixtures rather than inventing new ones. Every finding is
backed by a runtime measurement (`getBoundingClientRect`, `scrollWidth`/
`clientWidth`, `getComputedStyle`, or a CSSOM rule match) — no visual-only
claims. The already-shipped phase-5 44px/`.tap-target` work was explicitly
not re-litigated; it was checked for regressions only, and one was found
(`/stock`'s `ProductSheet`, above).

**Files referenced:** `client/src/pages/stock-management.tsx`,
`client/src/features/dashboard/RetailDashboardView.tsx`,
`client/src/pages/transactions.tsx`, `client/src/components/ui/dialog.tsx`,
`client/src/features/navigation/TerminalDockView.tsx`,
`client/src/pages/settings.tsx`, `client/src/pages/merchant-onboarding.tsx`,
`client/src/pages/login.tsx`, `client/src/pages/merchant-signup.css`,
`client/src/pages/landing-page.tsx`, `client/src/pages/landingRuntime.ts`,
`client/src/hooks/use-keyboard-inset.ts`,
`client/src/features/terminal/terminal-tokens.css`,
`scripts/verify-mobile-keyboard.mjs`, `scripts/inventory-44px.json`,
`docs/REVIEW-2026-08-24-mobile-44px-control-inventory.md`.
