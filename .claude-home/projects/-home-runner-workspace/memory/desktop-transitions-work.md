---
name: desktop-transitions-work
description: "Desktop/tablet page transitions: committed as 666b898; what's done, what's left, and the two acceptance probes"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1277f62f-974f-465e-81f9-9b0584158a19
  modified: 2026-08-09T04:07:15.999Z
---

Oliver's requirements: **no flash/reloads on any page change**; the **top bar
must never move** except the page-selector bubble; **every component on every
page** gets a **bounce pop-in with a cascading stagger**.

There was never a standalone transitions plan doc — the motion spec is §7
(`:201`) + P6 (`:230`) of `docs/PLAN-2026-07-24-tablet-desktop-app.md`.

## Done — committed 666b898 on `feat/tablet-desktop-app` (2026-08-08, 21 files)

Two root causes, both fixed:
1. Every page rendered its own `DesktopFrame > ScaledCanvas > DesktopShell` via
   `DesktopPageScaffold`, **and** `PageTransition` (`page-transition.tsx:22-24`)
   keys a `motion.div` on the location with `mode="wait"` — so every hop tore the
   chrome down and burned 220ms blank first. `ScaledCanvas` starts at `scale 0` /
   `visibility:hidden` until its layout effect runs, so each remount blanked the
   frame. Fix: `DesktopChrome` mounted once above the router, driven by the pure
   `desktopChromeForLocation()` map in `desktop-theme.ts`. Desktop app routes
   bypass `PageTransition`; mobile + public routes keep it unchanged.
2. Nav items had `padding: 0` and the active one `padding: 8px 22px` plus
   `font-weight: 700` under `justify-content: space-between`, so every label
   shifted on each page change. Fix: items always carry the active padding and
   reserve the bold width via a hidden `::after` sharing the grid cell; a
   separate `.tapt-desktop-nav-bubble` slides to the active item.

Cascade primitives live in `desktop.css`: `@keyframes desktopBounceIn`,
`.dt-rise` (explicit `--dt-i` step / `--dt-d` offset) and `.dt-cascade`
(auto-indexes direct children 0..9). Delay = `--dt-i * 52ms + --dt-d`. A
reduced-motion block disables them and forces `opacity: 1` — required, because
they hide at `opacity: 0` and rely on the animation to reveal.

**Measured**, both 1440×900 and 1194×834: chrome remounts **21/21 → 0/21**,
loader flashes **14/21 → 1/21**; wordmark/nav-label drift **0.00px** over 10 hops.

Two acceptance probes (dev server on :5000, single instance —
[[dev-server-single-instance]], [[playwright-nix-chromium]]):
- `scripts/desktop-shots/probe-transitions.mjs` — chrome survival + loader flash.
- `scripts/desktop-shots/probe-topbar.mjs` — top-bar drift + bubble tracking.

## Round 2 — committed as a7d15a3, fully verified (2026-08-08)

666b898 **broke its own P0 gate**: it static-imported `DesktopChrome` +
`desktopChromeForLocation` into `App.tsx`, so a 390×844 phone downloaded six
desktop modules (`DesktopChrome/DesktopFrame/DesktopShell/ScaledCanvas/
desktop-theme/desktop.css`). Measured by A/B — `verify-desktop-p0.mjs` **fails
with exit 1 at HEAD**. Do not build on 666b898 without these working-tree edits.

Fix (a7d15a3 on `feat/tablet-desktop-app`, 6 files, not pushed):
- Route map moved out to **`client/src/lib/desktop-chrome-route.ts`** so the
  router can match a location without importing desktop UI; `desktop-theme.ts`
  re-exports it so desktop callers are unchanged.
- `DesktopChrome` is now `lazy()`, wrapped in an outer `Suspense` that only ever
  resolves on cold load — once mounted, navigation never suspends there, so the
  frame still cannot blink.
- `DesktopPageFallback` moved **into `App.tsx`** on purpose: importing it from
  `@/desktop/DesktopChrome` would drag the desktop chunk into the entry bundle.
- Tutorial spotlight froze around a mid-bounce rect (a transform on an ancestor
  is invisible to `ResizeObserver` and outlives the 360ms settle timer) — fixed
  with capture-phase `animationend`/`transitionend` re-measure in `tutorial.tsx`.
- `verify-desktop-p0.mjs` gained `waitForAnimationsToSettle()` (skips infinite
  spinner animations, 4s bound) so geometry is asserted on settled layout.

All green: `tsc --noEmit` silent · `npx jest` **49/49 suites, 504/504 tests** ·
`npm run build` clean · `verify-desktop-p0.mjs` exit 0 with
**`phoneDesktopSourceModuleCount: 0`**. Production bundle splits
`DesktopChrome-*.js` (5 kB) + `DesktopChrome-*.css` (8 kB); the entry chunk has
zero hits for `tapt-desktop-frame`/`ScaledCanvas`/`desktopBounceIn`.

## Still owed

- **Visual side-by-side pass vs `docs/design/desktop-app/Taptpay Desktop.dc.html`
  — the only thing left open on the transitions work.**
- §6 is fully closed: the original list was ruled 2026-08-06, the four cascade
  omissions ruled 2026-08-08, everything else closed 2026-08-09 (below).

## FINISHED 2026-08-09 — all four open items closed, UNCOMMITTED

Six files modified/added, verified, **not committed and not pushed** (Oliver has
not been asked yet). They are cleanly separable from the landing-phone work in
the same tree:
`client/src/App.tsx` · `client/src/desktop/pages/trades-terminal.tsx` ·
`scripts/desktop-shots/{probe-transitions,retail-fixtures}.mjs` ·
`scripts/desktop-shots/probe-cascade.mjs` (new) ·
`docs/HANDOFF-2026-07-28-tablet-desktop-app.md`.

1. **`probe-transitions.mjs` is a usable gate, exit 0 on a healthy tree.** Three
   signals; only `chrome REMOUNTED` and `route-loader`
   (`[data-testid='page-loader']`) gate. Page-slot suspensions (timed via
   `data-testid='desktop-page-fallback'`) and content spinners are reported only.
   Selectors must stay **inline literals** — `INSTRUMENT` is serialised by
   `page.evaluate` and loses its closure.
2. **Cascade coverage audited** by new `scripts/desktop-shots/probe-cascade.mjs`:
   samples `document.getAnimations()` inside the ~1s cascade window
   (9×52ms + 540ms), then checks for elements left at opacity 0. That second
   check is the valuable one — `.dt-rise`/`.dt-cascade > *` ship `opacity: 0`
   under an `animation: … both` fill, so a block whose animation never runs is
   **permanently invisible**, and nothing else in the suite catches it.
   Result **13/13 screens, both device classes**, 4–12 real stagger steps, none
   stuck.
3. **The six empty CSS declarations are filled** (see the former "Pre-existing
   bug" section below). The file's own inline styles at lines 698/801/968 settle
   the intended values: pressed = `ACTIVE` bg + `NAVY` text, unpressed =
   `ACCENT_SOFT` on transparent.
4. **The 403s were a fixture gap, not an app bug.** `installRetailMocks` was
   retail-only while the probes walk property/trades/settings. Now mocked there
   for every consumer, so `probe-transitions` dropped its own side-patches.
   **Match by prefix**: a Playwright glob matches the full URL *including the
   query string*, so exact patterns miss `/tenants/1`, `/tenants/1/events` and
   `/invoices?tenantId=1`. Both runs now have zero console errors, and
   `/property/tenants/1` renders in ~21ms vs ~292ms on the old 403 error path.

All green after the work: `tsc --noEmit` exit 0 · `npx jest client/src/desktop`
**93/93** · `npm run build` exit 0 · `probe-transitions` exit 0 (0/21 remounts,
0 route loaders) · `probe-cascade` exit 0 · `probe-topbar` exit 0 (0.00px drift)
· `verify-desktop-p0.mjs` exit 0 (`phoneDesktopSourceModuleCount: 0`).

### New finding the fixed probe exposed — needs Oliver's call

Page-slot blank durations were previously invisible. Most hops are 4–30ms
(imperceptible), but the two **legacy** routes are outliers:

| Route | tablet | desktop |
|---|---|---|
| `/board-builder` | **297.8ms** | 237.7ms |
| `/property/tenants/1` | 48.9ms | — |

~300ms of empty page area is a real visible flash, exactly what the no-flash
requirement targets. Cause: legacy routes render `DesktopLegacyPage`, which
lazily loads the *mobile* page inside itself — a second lazy layer whose chunk is
**not** in `DESKTOP_PRELOAD_ROUTES` (only `DesktopLegacyPage` itself is), and
`board-builder`'s chunk is 435.88 kB / 139.44 kB gzip.

The tradeoff to put to Oliver: preloading it removes the flash but makes every
signed-in merchant background-download 435 kB they may never open.

The 14 suspensions themselves are inherent to `React.lazy` — it suspends on first
render of each wrapper even when the module is already cached, so the preload
cannot remove them, only shorten them. 4 lap-1 navs + 10 first-visit push routes
= 14; lap 2 is 0.

- ~~**`probe-transitions.mjs` exits 1 on a healthy tree**~~ — FIXED above. Kept
  for context: its old detector logged a "loader flash" for any
  detector (`:49`) logs `suspense-loader` for *any* added node matching
  `.animate-spin`, never checking full-screen-ness or chrome presence, then
  prints the misleading label "full-screen flash"; `bad = remounts + loaders`, so
  the one hit forces exit 1. It catches `/board-builder`'s own content spinners
  (`board-builder.tsx:601,629,661`). It provably cannot be the route loader:
  `PageLoader` (`App.tsx:172`) is the only full-screen spinner and is wired to
  the **mobile/public** `Suspense` (`:407`), while desktop routes use the empty
  `DesktopPageFallback` (`:378,380`). Same hop reports `chrome: kept` / `blank
  0.0ms`. Narrowing the matcher would make this usable as a gate.
- 4 console `403 (Forbidden)` page errors on both desktop and tablet runs — not
  transitions-related, not examined, do not affect exit code.
- Mobile at 390×844 verified by the P0 phone leg (bottom nav renders, no frame,
  no desktop modules, no page errors) — not a pixel diff, but not regressed.

## Cascade omissions — RAISED AND RULED 2026-08-08: keep all four as shipped

Oliver ruled "ship 1–4" on the list below. **Do not re-raise and do not fix
them** — each is load-bearing for the reason given. Recorded in handoff §6 under
"Transitions/cascade deviations — RULED 2026-08-08".

- Drag sheets (`.ra-sheet`, `.pa-sheet`, `.ta-sheet`) are **excluded** from the
  cascade: they carry a live inline `transform: translateY(...)`, and a
  `both`-filled keyframe would pin them at `translateY(0)` and break the drag.
  Their contents cascade instead, so the sheet shell itself does not pop in.
- `.pa-dot` (chart peak marker) excluded — centred by `transform: translate(-50%,-50%)`.
- Rails are animated on `.rt-rail`/`.pt-rail`/`.tt-rail` themselves, never their
  slots: a transform on the slot makes it the containing block for the
  `position:absolute` rail and moves it.
- Property/trades analytics overviews sit inside `{!report && …}`, so returning
  from a generated report now replays the cascade. Accepted, easily gated.

## Pre-existing bug found — FIXED 2026-08-09

`trades-terminal.tsx:1224,1226,1227,1228,1229` — **six** empty CSS declarations
(`color:;` ×5, `background:;` ×1) across five rules: `.tt-quick-recipient > input`,
`.tt-quick-channel button` (+ `[aria-pressed="true"]`, which has both), and
`.tt-quick-success` (+ its button). Dropped template interpolations; browsers
discard them, so those quick-invoice controls fell back to inherited colours.
Filled from the file's own convention — `TEXT_SOFT` for the inputs, `ACCENT_SOFT`
for unpressed pills, `ACTIVE` bg + `NAVY` text for pressed, `GREEN` for the
success row.
