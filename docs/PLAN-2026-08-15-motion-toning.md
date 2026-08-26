# Motion review & toning plan — start with Property

**Date:** 2026-08-15
**Branch:** `feat/tablet-desktop-app`
**Trigger:** "transitions across the whole app seem violent, the bounce pop-in cascade
is too much; some assets and components don't need it at all, or only a very subtle
transition."

Status: **Step 0 and the tablet/desktop pass are landed and verified** (§8). The
mobile Property screens (Steps 1–4) are still to do.

Decisions taken: tiered with two budgeted accents; keep the hero morph; soften the
trades rail blob; leave `glowDrift` alone.

---

## 1. Verdict

The complaint is correct and it has a single dominant cause, not a diffuse one.

Almost every animation in the app is driven by one easing curve —
`cubic-bezier(0.34, 1.56, 0.64, 1)` — which appears **78 times across 18 files**. It is
a "back-out" curve: it deliberately overshoots its destination and comes back. Used
once, on one accent element, that reads as playful. Used as the app's default timing
function — including on properties that cannot meaningfully overshoot — it reads as
the whole UI twitching.

On top of that, the two entrance keyframe sets (`bouncePopIn` on mobile,
`desktopBounceIn` on desktop) *already* encode a bounce as keyframes. Applying an
overshooting curve to an already-bouncing keyframe set compounds the two. That is the
specific mechanism behind "violent".

---

## 2. What is actually causing it (measured, not estimated)

### A. Compounding overshoot — the main offender

In CSS, the timing function in an `animation` shorthand applies to **every keyframe
interval**, not to the animation as a whole. `cubic-bezier(0.34, 1.56, 0.64, 1)`
overshoots its interval by a measured **9.8%**. So each of `bouncePopIn`'s four
segments overshoots its own waypoint:

| segment | translateY (authored) | translateY (actual) | scale (authored) | scale (actual) |
|---|---|---|---|---|
| 0% → 55% | −7px | **−10.6px** | 1.045 | **1.063** |
| 55% → 74% | +3px | **+4.0px** | 0.983 | 0.977 |
| 74% → 88% | −1.5px | **−1.9px** | 1.007 | 1.009 |
| 88% → 100% | 0px | +0.15px | 1.000 | 0.999 |

Net effect per element: **~41px of travel and 5 direction reversals to move 0px**,
while scaling across a 20% range (0.86 → 1.063). On a list where a dozen rows do this
in sequence, that is the "violent cascade".

`desktopBounceIn` is the same shape (translateY 26px, scale 0.88, three overshoots,
same curve).

### B. Amplitude is set for hero moments, applied to everything

`bouncePopIn` starts at `translateY(30px) scale(0.86)`. A 14% scale-up is a hero
entrance. It is currently applied to section labels, empty-state text, search rows, and
individual timeline events.

### C. The cascade runs far too long

| screen | last element starts | last element ends |
|---|---|---|
| Tenant Directory (mobile) | 775ms | **1295ms** |
| Tenant Profile (mobile) | 620ms | **1140ms** |
| Settings (shared) | 445ms | 965ms |
| Property Home (desktop) | 676ms | **1216ms** |
| Property Analytics (mobile) | 400ms JS delay + stagger | **~2000ms** to fully settle |

The stagger step is 45ms (mobile) / 52ms (desktop) with caps of 12 and 10 steps.
Anything past ~5 steps stops reading as a cascade and starts reading as lag.

### D. The back curve is applied to properties that can't use it

This is where it stops being a taste issue and becomes a defect:

- **`height` / `max-height` / `max-width` / `padding`** — `.tp-feed-hero`,
  `.tp-send-slot`, `.tp-split-slot`, `.stagger`. An overshooting height physically
  clips its content and then gaps it back. Visible as a flicker at the container edge.
- **`background` / `color` via `transition: all`** — the analytics timeframe pills and
  transactions pills. Colour interpolation past the destination gets clamped, so the
  curve just makes the change land unevenly.
- **`opacity`** — `::view-transition-new(property-hero)`. Clamped at 1, so the
  overshoot portion is dead time: the fade stalls.
- **`top` / `left`** — `.tp-pfab`, `.tp-psubbar`, `.pd-notch`. These are layout
  positions; overshooting them makes fixed chrome appear to slip.
- **`transform: rotate(180deg)`** on the feed chevron — overshoots past 180° and
  returns. This is the single most noticeable micro-tic in the terminal.

### E. Motion systems stacked on the same pixels

Navigating to a Property screen can run four systems at once:
1. `PageTransition` (Framer) — opacity + y14 + scale .982, or
2. the View Transition root fade + hero morph (`property-transition.ts`), plus
3. `.pt-slide-top` on the header, plus
4. the `.pt-bounce` cascade on every block underneath.

On Tenant Directory the hero count and label bounce *inside* a card that is
simultaneously being morphed by the View Transitions API — two independent motions on
the same pixels.

---

## 3. The replacement: four tiers and a token set

The fix is not "make everything faster". It is **deciding, per element, whether it
should move at all** — which is what was asked for.

### Tokens (new, in `client/src/index.css` `:root`)

```css
--m-ease-out:  cubic-bezier(0.22, 1, 0.36, 1);    /* expo-out, 0% overshoot — default */
--m-ease-soft: cubic-bezier(0.4, 0, 0.2, 1);      /* state changes: colour, background */
--m-ease-pop:  cubic-bezier(0.34, 1.30, 0.64, 1); /* ~2.5% overshoot — accents only */
--m-dur-micro:  120ms;   /* press, hover, toggle */
--m-dur-ui:     200ms;   /* tab switch, indicator slide */
--m-dur-enter:  280ms;   /* block entrance */
--m-stagger:     28ms;   /* cascade step */
```

`--m-ease-pop` at 1.30 measures ~2.5% overshoot versus the current 9.8% — enough to
feel intentional, not enough to read as a wobble.

### Tiers

| tier | motion | duration | applies to |
|---|---|---|---|
| **0 — none** | nothing | — | section labels, icons, dividers, timeline rails, nav/tab bars, page headers, anything already inside a morphing container |
| **1 — fade** | opacity only | 180ms | list rows, feed rows, empty states, secondary text, loading states |
| **2 — rise** | opacity + `translateY(8px)`, **no scale** | 280ms | primary content blocks: hero, chart, search row, panel |
| **3 — pop** | opacity + `translateY(10px) scale(0.96)`, `--m-ease-pop` | 300ms | **budgeted**: at most two per vertical |

Every tier is **two keyframes**. The overshoot, where it exists at all, comes only from
the easing curve — so there is exactly one reversal instead of five. This is the core
structural fix.

```css
@keyframes m-fade { from { opacity: 0; }                                  to { opacity: 1; } }
@keyframes m-rise { from { opacity: 0; transform: translateY(8px); }      to { opacity: 1; transform: none; } }
@keyframes m-pop  { from { opacity: 0; transform: translateY(10px) scale(0.96); } to { opacity: 1; transform: none; } }
```

### Cascade budget

Step **28ms**, capped at **6 steps** (168ms) — versus today's 45–52ms × 10–12.
Tail becomes **168 + 280 = ~450ms**, down from 1295ms. Rows past step 6 all land
together, which reads as "the list arrived", not "the list is still arriving".

### Keeping the class names

`.pt-bounce` has ~25 call sites and `.dt-cascade`/`.dt-rise` cover all 15 desktop pages.
**Redefine what those classes do rather than renaming them.** Adding `.pt-fade` and
`.pt-pop` alongside lets each call site be re-tiered individually, and makes the later
trades/retail rollout nearly free.

---

## 4. Property vertical — screen by screen

### P0 · Shared foundation — `client/src/index.css`, `client/src/desktop/desktop.css`

- Add the token block and the three keyframe sets.
- Redefine `.pt-bounce` → tier 2 (`m-rise`, 280ms, `--m-ease-out`); add `.pt-fade`,
  `.pt-pop`.
- Replace `desktopBounceIn` with `m-rise` semantics: `translateY(10px)`, no scale,
  280ms, `--m-ease-out`. Step 52ms → 30ms, cap 10 → 6.
- `--dt-d` on `.ph-right` / `.th-right`: 208ms → 90ms.
- Extend both `prefers-reduced-motion` blocks to the new classes.

> **This step alone removes most of the violence across all three verticals, from three
> files.** The 15 desktop pages only set `--dt-i` / `--dt-d`; they need no edits.

### P1 · Tenant Directory — `client/src/pages/property/tenant-directory.tsx`

| element | today | change |
|---|---|---|
| hero count, hero label | `pt-bounce` @0/60ms | **Tier 0** — remove. They sit inside the View-Transition hero; it already morphs them. |
| search row | `pt-bounce` @140ms | Tier 2, 0ms |
| tenant rows | `pt-bounce` @190 + i×45, cap 12 | **Tier 1** fade, 120 + i×28, cap 6 |
| archived disclosure | `pt-bounce` @775ms | Tier 1, fixed 260ms |
| add-tenant FAB (`tdirAddPop`) | 4-keyframe bounce, 520ms | **Tier 3 (budgeted)** — rewrite as 2 keyframes with `--m-ease-pop`, keeping `translateX(-50%)` in both |

Tail: 1295ms → **~440ms**.

### P2 · Tenant Profile — `client/src/pages/property/tenant-profile.tsx`

| element | today | change |
|---|---|---|
| header | `pt-slide-top` @0ms | **Tier 0** — it arrives with the page transition; it does not need its own slide |
| "activity timeline" label | `pt-bounce` @170ms | **Tier 0** — it is a section label |
| timeline events (max 10) | `pt-bounce` @215 + i×45 | **Tier 1** fade, 120 + i×28, cap 6 |
| empty state | `pt-bounce` @215ms | Tier 1, 160ms |

Tail: 1140ms → **~470ms**.

### P3 · Property Terminal — `client/src/features/terminal/property/PropertyTerminalView.tsx`

Fourteen sites — the densest file, and where category **D** defects live.

| element | today | change |
|---|---|---|
| `.tp-feed-hero`, `.tp-feed-body` (height/padding) | 550ms back curve | 320ms `--m-ease-out` — **height must not overshoot** |
| `.tp-send-slot`, `.tp-split-slot` (max-width) | 420ms back curve | 300ms `--m-ease-out` |
| `.stagger` (height) | 550ms back curve | 320ms `--m-ease-out` |
| `.stagger > *` | `tp-popIn` 400ms back, 60ms steps | Tier 2, 280ms, 28ms steps |
| `.tp-stack-row` | `tp-stackIn` 380ms back | **Tier 1** fade 160ms, no transform — this is a live feed; rows must not pop |
| `.tp-top-banner` | `translateY(-100%)` 600ms back | 380ms `--m-ease-out` (9.8% of a full-height translate is a large excursion) |
| `.tp-pfab` transform | 360ms back | Tier 3 candidate — keep pop, 280ms |
| `.tp-pfab` / `.tp-psubbar` `top` | 450ms back | `--m-ease-out` — layout position, no overshoot |
| `.tp-subbar-ind` (left/width) | 450ms back | `--m-ease-pop`, 200ms — sliding indicators may keep a hint |
| feed chevron rotate | 300ms back | 200ms `--m-ease-soft` |
| `.tp-send` transform | 300ms back | 140ms `--m-ease-soft` (press feedback) |

### P4 · Property Analytics — `client/src/pages/property/property-analytics.tsx`

The slowest screen in the app — ~2s to settle.

| element | today | change |
|---|---|---|
| chart wipe | `width 1.6s` | **700ms** `--m-ease-out` |
| chart tooltip | `opacity 0.5s ease **1.2s**` | 250ms delay 400ms |
| chart dot | delay 1s | delay 300ms |
| `StatRow` | JS `setTimeout(400 + delay)` then `transition: all 0.5s` back | **Delete the JS reveal.** Use the CSS Tier-1 cascade (28ms step, cap 6). Removes 400ms of dead time before anything moves. |
| timeframe pills | `all 0.3s` back | `background 160ms, color 160ms` `--m-ease-soft` |
| total figure | `all 0.45s` back | Tier 2, 240ms |
| drag sheet | `transform 0.38s` back | 380ms `--m-ease-out` — a sheet must not spring past where the finger left it |

### P5 · Property Dashboard — `client/src/features/dashboard/PropertyDashboardView.tsx`

Already the calm baseline: no entry cascade. Minimal work.

- `.pd-tf-ind`, `.pd-notch` → `--m-ease-pop`, 200ms.
- `.pd-bar-pill` (`pdPillIn`) → `--m-ease-pop`.
- Leave `.pd-bar` (already expo-out) and `.pd-tap` ring alone.

### P6 · Desktop directory profile — `client/src/desktop/DesktopDirectoryProfile.tsx`

`ddpPop .5s cubic-bezier(.34,1.42,.5,1)` (5.8% overshoot), events at
`min(160 + i×42, 300)ms` → `m-rise` 280ms `--m-ease-out`, `min(90 + i×28, 230)ms`.

### P7 · Property desktop pages

`property-home`, `property-clients`, `property-analytics`, `property-terminal`,
`property-settings` — **no per-file edits.** They only set `--dt-i`/`--dt-d`; P0 fixes
them. Verify visually rather than editing.

---

## 5. Order of work

| step | scope | files |
|---|---|---|
| 0 | Tokens, keyframes, `.pt-*` / `.dt-*` redefinition, reduced-motion | 2 |
| 1 | Tenant Directory + Tenant Profile re-tiering | 2 |
| 2 | Property Terminal (14 sites) | 1 |
| 3 | Property Analytics (incl. deleting the JS reveal timers) | 1 |
| 4 | Property Dashboard + desktop directory profile | 2 |
| 5 | Verify at 3 viewports, then **stop for sign-off** | — |
| 6 | *(after sign-off)* roll to Trades, Retail, Settings | ~8 |

Commit per step, per the branch's existing convention.

## 6. Verification

- Screenshot/filmstrip each of the 5 Property screens on entry, before and after, at
  mobile / tablet / desktop.
- Use the nix-store chromium + minted JWT for merchant 22 (per the Playwright note in
  memory) — the bundled chromium is broken.
- Confirm `prefers-reduced-motion: reduce` still fully suppresses entrances on both
  mobile and desktop after the class redefinitions.
- Known limitation to accept: the ~78 inline-style transitions cannot be caught by a
  CSS reduced-motion block. Migrating them to tokens is what makes that possible; that
  is a side benefit of this work, not a separate task.

## 7. What landed (2026-08-15)

### Step 0 — shared foundation ✅

- `client/src/index.css` — motion token block on `:root`; `.pt-fade` / `.pt-bounce` /
  `.pt-pop` / `.pt-slide-top` rewritten as two-keyframe tiers; reduced-motion block
  extended to all four; the hero cross-fade dropped from 340/500ms to 250ms so the
  card's contents no longer lag the browser's geometry morph.
- `client/src/desktop/desktop.css` — `desktopBounceIn` → `desktopRiseIn` (two
  keyframes, `translateY(10px)`, no scale, expo-out); stagger 52ms → `--m-stagger`
  (28ms); nth-child cap 10 → 6.
- `--dt-d` rescaled from the old 52ms step to the new 28ms one so authored sequencing
  is preserved, not just shortened: 208ms → 112ms (`property-home`, `trades-home`,
  `retail-home` — all encode "start at step 4"), 104ms → 56ms (`property-analytics`),
  80ms → 44ms (`DesktopSettingsPage`).

### Tablet/desktop pass ✅

The desktop app turned out to be in far better shape than mobile: no `transition: all`,
no stacking of `tileIn` on top of the entry cascade, and Step 0 removed the last
overshoot curve from the cascade itself. Six findings, not thirty.

| id | finding | change |
|---|---|---|
| T1 | trades rail blob: `scaleY(1.48)` squash-stretch over 460ms on a hard ease-in-out, through a bespoke SVG goo filter | `scaleY(1.15)` over `320ms var(--m-ease-out)`; goo filter and slide kept |
| T2 | `tileIn`/`reportIn` ran at **nine** different per-page durations (.22–.55s), two on plain `ease` | all 27 sites → `var(--m-dur-ui) var(--m-ease-out)` |
| T3 | `tileIn` carried `scale(0.98)` on tap-opened surfaces | scale dropped; `translateY(16px)` → `8px` |
| T4 | `reportIn` at 550ms, `translateY(-14px)` | 200ms, `translateY(-8px)` |
| T5 | `.ddp-pop` — the last bounce left in desktop (5.8% overshoot, 500ms, `scale(.97)`, stagger to 300ms) | tier-2 rise, `--m-dur-enter`, stagger `min(90 + i·28, 230)ms` |
| T6 | `glowDrift` 9–11s infinite ambient | **left as-is by decision** |

**Found during verification, not in the audit:** `.tapt-desktop-nav-bubble`
(`desktop.css:353`) transitioned **`width`** on a 5.8%-overshoot curve over 420ms.
This is the most-seen motion in the tablet app — every nav hop moves it — and an
overshooting width made the pill stretch past its label and snap back. Now
`transform 260ms var(--m-ease-pop), width 260ms var(--m-ease-out)`: the travel keeps
a hint of spring, the width cannot.

A broad sweep (`y1 > 1` or `y2 > 1` on any `cubic-bezier` under `client/src/desktop/`)
now returns nothing but a comment. The tablet app has no unintended overshoot left.

### Verification ✅

- `npx tsc --noEmit` clean.
- `scripts/desktop-shots/probe-cascade.mjs` — 13/13 screens cascade at both 1440×900
  and 1194×834, **0 stuck-invisible, 0 wrong surfaces**, identical before and after the
  tablet edits. (Its 28 reported "errors" per device are all one blocked
  `replit.com/…/replit-dev-banner.js` request — environmental, present in both runs.)
- The probe hardcoded the old keyframe name and a 1100ms sampling window, so it was
  updated too — otherwise it would have reported "NO CASCADE" on every screen. Its
  keyframe name now lives in one constant.
- Token resolution checked in-browser: `tileIn` consumers compute to `0.2s`, not `0s`.
  This mattered — the rule ships `opacity: 0` with `both` fill, so an unresolved token
  would have made every modal permanently invisible rather than merely un-animated.

Measured outcome: longest desktop tail **1216ms → 504ms**; stagger 52ms×10 → 28ms×6.

### Still to do

Steps 1–4 (mobile Property: directory, profile, terminal, analytics, dashboard), then
Step 6 (Trades, Retail, Settings on mobile).

---

## 8. Decisions — taken

1. **Tier 3 budget: two accents.** Exactly two deliberate pops in Property — the
   directory add-FAB and the terminal payment-success. Everything else Tier 0/1/2.
   `--m-ease-pop` set at `cubic-bezier(0.34, 1.3, 0.64, 1)` — a measured ~2.5%
   overshoot, against the old curve's 9.8%.
2. **Hero morph stays.** It is the signature and was never the violent part. Its
   content cross-fade was realigned from 340/500ms to 250ms to match the browser's
   default geometry morph, which it had been lagging.
3. **Trades rail blob: softened, not removed** (T1).
4. **`glowDrift`: left alone** (T6).
5. **Shared-file spillover accepted.** Step 0 and the tablet pass are shared CSS, so
   Trades and Retail changed alongside Property. Flagged and accepted rather than
   worked around.
