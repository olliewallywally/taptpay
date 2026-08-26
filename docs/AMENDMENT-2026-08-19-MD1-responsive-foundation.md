# Amendment A1 — MD1 answered, and the responsive foundation it implies

Date: 2026-08-19
Amends: `docs/PLAN-2026-08-17-mobile-responsive-ui.md` (v2.1) — §6.1 replaced, §6.5 replaced,
§4.3 confirmed unchanged, §7 extended, §9 re-ordered. The companion
`docs/PLAN-2026-08-17-terminal-panels-and-dock.md` (v2) is unaffected except where §5.4 below
names it.
Status: **decision-ready.** No code changed. Every number below was computed from the repo or
measured in it; the derivations are shown so they can be checked rather than trusted.
Revised 2026-08-19 after MD7 was settled from the code — see §7.

---

## 1. The decision

**MD1 = fluid / intrinsic layout — but not in the form §6.1 specifies.**

The plan framed MD1 as a binary. It is really two independent questions, and conflating them
is why the recommended answer looked expensive:

| | Question | Plan's answer | This amendment |
|---|---|---|---|
| **Q1** | Is scaling done by **layout** or by **transform**? | layout | **layout** — agreed, and §1.1 shows transform is disqualified on facts, not taste |
| **Q2** | Do proportions scale **together** or **independently**? | independently (21 clamps) | **together** — one length-valued unit, §3.1 |

The plan took "fluid" to mean "every token gets its own clamp". That is the expensive,
drift-prone form. A single unit gives the *proportional fidelity of a scaled canvas* with the
*layout behaviour of a fluid one*, and §3.1 shows it reproduces the plan's own calibration
table to within 2px on every token — from one number instead of twenty-one.

### 1.1 Why the scaled canvas is disqualified

`client/src/desktop/ScaledCanvas.tsx` works because it simulates **one** logical device
(1180×880) inside a resizable window. Six reasons that does not transfer to a phone. The first
alone is decisive; the rest are independent.

**(a) Two aspect families.** §4.1's matrix spans 16:9 (~0.5625) and 19.5:9 (~0.462). A uniform
scale cannot serve both. Against the design's own 375×812:

| Device | scale | rendered | wasted | 44px target → | 88px amount → |
|---|---|---|---|---|---|
| 320×568 | 0.700 | 262×568 | **58px — 18% of the width** | 30.8px | 61.6px |
| 360×640 | 0.788 | 296×640 | **65px — 18%** | 34.7px | 69.4px |
| 375×667 | 0.821 | 308×667 | **67px — 18%** | 36.1px | 72.3px |
| 390×844 | 1.039 | 390×844 | — | 45.7px | 91.5px |
| 412×915 | 1.099 | 412×892 | 23px vertical | 48.3px | 96.7px |
| 430×932 | 1.147 | 430×931 | 1px | 50.5px | 100.9px |

Every 16:9 phone loses 18% of its width to letterbox bars and lands tap targets at 31–36px,
under both Apple's 44pt and WCAG 2.5.8. You would still need per-device adaptation — the entire
cost the scaled canvas was meant to avoid — *and* you would have paid for the canvas.

**(b) Portals break the illusion.** 76 `fixed` usages across the merchant app, and
`components/ui/dialog.tsx`, `sheet.tsx`, `drawer.tsx`, `alert-dialog.tsx` all render
`fixed inset-0` inside a Radix `Portal` → `document.body`. A portal escapes the transformed
ancestor, so every modal, sheet and drawer would render **unscaled while the app behind it is
scaled** — two coordinate systems on screen at once, on the payment confirmation sheet.

**(c) Non-portaled `fixed` inverts.** `transform` on an ancestor makes `position: fixed`
descendants resolve against the transformed box rather than the viewport. `mobile-header.tsx`,
`page-transition.tsx`, `merchant-terminal*.tsx` and `nfc-payment.tsx` all rely on the current
behaviour.

**(d) Dynamic browser chrome.** Phones hide the URL bar on scroll. A height-driven scale factor
means type physically resizes while the merchant scrolls a list. Desktop windows do not do this.

**(e) Safe areas scale.** `env(safe-area-inset-*)` inside a transform is multiplied by the
scale, so notch and home-indicator clearance is wrong on exactly the devices that have them.

**(f) Accessibility is closed permanently.** Under a transform, OS text scaling and browser
zoom cannot be honoured at any later date without discarding the foundation.

**Where the scaled canvas *is* right:** the landing page's phone demo and the desktop
simulation. Both are pictures of a device, with no keyboard, no portals and no real tap
targets. Keep `ScaledCanvas` for those. It is not a bad component; it is the wrong component
for a product surface.

### 1.2 Why the 21-clamp form is rejected too

Three measured problems with §6.1 as written.

**Twenty-one calibration points, and the plan has already missed several.** v2 shipped twelve
tokens undefined and two miscalibrated (`--bar-h` 37.99 against an authored 39, `--row-h` 64.0
against a measured 69). That was *after* an external review. Nothing structural prevents the
next one.

**Proportions warp between the binding points.** Each clamp binds at a different width. §6.1's
own notes: `--row-h`'s ceiling binds from ~398px, `--sp-1`'s from 427px. Between 398 and 430
the row stops growing while the spacing around it keeps growing — the design's proportions
silently distort, and no geometry gate in §7 is watching for it.

**The token layer covers a minority of the geometry.** The three terminal views carry
**562 px literals across 48 distinct values** (`PropertyTerminalView.tsx` alone: 318;
`TradesTerminalView.tsx` 123; `trades-terminal-view.css` 121). Twenty-one tokens cannot absorb
48 values. Whatever is not tokenised stays fixed and drifts against whatever is — so the
warping above is not an edge case, it is most of the screen.

---

## 2. What "responsive" has to cover

A sizing formula is one axis of about fifteen. This is the full list, with what the plan
currently does about each. Rows marked **new** are defects or gaps this amendment found in the
code, not in the plan's prose.

| # | Axis | Status |
|---|---|---|
| 1 | Width — rhythm, controls, type scale | §6.1, 21 clamps → **replaced**, §3.1 |
| 2 | Height — the vertical budget | §6.4 grid → **kept unchanged**, §3.4 |
| 3 | Aspect-ratio families (16:9 vs 19.5:9) | not addressed; it is what disqualifies MD1's alternative (§1.1a) |
| 4 | Dynamic browser chrome (`svh`/`lvh`/`dvh`) | partly — retail is still on `100vh`, and 16 `100vh` sites remain (§4.8) |
| 5 | **Software keyboard** | **absent, and there is a live severe bug** (§4.1) |
| 6 | Input modality — coarse vs fine pointer, hover | **absent — and it is the correct fix for RC-1** (§4.2) |
| 7 | OS text scaling / Dynamic Type | MD6, deferred — but MD1 decides whether it stays *possible* (§3.2) |
| 8 | Browser zoom / iOS Display Zoom | **absent; actively blocked by `user-scalable=no`** (§4.5) |
| 9 | Safe areas, four-sided | §6.1 D — kept |
| 10 | Orientation | MD5 — unchanged by this amendment |
| 11 | Content extremes | §6.5 covers the amount only; names, addresses and empty states are open (§4.7) |
| 12 | Font loading and metrics | MD6 — **plus a bug that invalidates `--amount-k`** (§4.3) |
| 13 | Reduced motion, contrast, forced colours | two `prefers-reduced-motion` blocks exist; **zero** `prefers-contrast` / `forced-colors` (§4.9) |
| 14 | Container context — the same component in demo, desktop, modal, Playwright | **absent; container queries give it for free** (§3.3) |
| 15 | Foldables, iPad Split View, window segments | **absent; §3.3 handles it without a special case** |

---

## 3. The foundation

### 3.1 One unit

```css
.tp-viewport {
  container-type: inline-size;          /* size off our own 430-capped box, not the window */
  --u: clamp(3.3px, 1.0256cqi, 4px);    /* exactly 4.000px at the 390 reference */
}
```

Every geometry value in the terminal becomes `calc(N * var(--u))`, where **N = authored_px / 4**.
The design is already drawn on a 4px grid, so N is a clean number in almost every case.

```css
--sp-1:        calc(1     * var(--u));   /*  4px @390 */
--sp-2:        calc(2     * var(--u));   /*  8 */
--sp-3:        calc(3     * var(--u));   /* 12 */
--sp-4:        calc(4     * var(--u));   /* 16 */
--sp-6:        calc(6     * var(--u));   /* 24 */
--sp-7:        calc(7     * var(--u));   /* 28 */
--bar-h:       calc(9.75  * var(--u));   /* 39 — action bar, still the only height source */
--btn-h:       calc(6.75  * var(--u));   /* 27 — .tp-subbar-btn */
--row-h:       calc(17.25 * var(--u));   /* 69 — one active-stack row */
--stack-hdr-h: calc(6     * var(--u));   /* 24 */
--kp-max:      calc(19    * var(--u));   /* 76 — the keypad key's DESIGN size.
                                           Renamed from --kp-size, and --panel-h never existed:
                                           see SPEC-2026-08-20-dock-implementation.md §1.2/§5.
                                           --kp-size is the container-capped value and is
                                           declared on .tp-panel-body, not here. */
--fab-size:    calc(17.5  * var(--u));   /* 70 */
--amount-max:  calc(22    * var(--u));   /* 88 — ceiling only; §3.4 and §4.3 constrain it further */
```

**Validation — the unit reproduces the plan's own §6.1 calibration table.** This is the check
that matters: if one number can regenerate twenty-one hand-calibrated ones, the twenty-one were
never independent.

| Token | §6.1's 320px value | `--u` at 320 (u = 3.3) | Δ | §6.1's 390px value | `--u` at 390 (u = 4) |
|---|---|---|---|---|---|
| `--sp-4` | 13.1 | 13.2 | +0.1 | 16 | **16** |
| `--sp-6` | 20.0 | 19.8 | −0.2 | 24 | **24** |
| `--bar-h` | 32.0 | 32.2 | +0.2 | 39 | **39** |
| `--row-h` | 56.6 | 56.9 | +0.3 | 69 | **69** |
| `--stack-hdr-h` | 20.0 | 19.8 | −0.2 | 24 | **24** |
| `--stack-min` | 201.8 | 202.5 | +0.7 | 245.0 | **245.0** |
| `--kp-size` | 60.7¹ | 62.7¹ | +2.0 | 76 | **76** |
| `--fab-size` | 59² | 57.8 | −1.2 | 70 | **70** |

¹ both are then capped by the panel's realised height, so the pre-cap difference does not reach
the screen. ² §4.3's "FAB 70 → 59" estimate; nothing measured it.

At 390 every value is exact **by construction**, not by calibration — the class of bug that
produced `--bar-h: 37.99` cannot occur. At 320 the largest divergence is 2px on a token that is
capped downstream anyway.

**§4.3's budget is unchanged.** Substituting the unit-driven rows into the 320×568 budget:
hero **191.1** (height-driven, untouched) + gutter 70 (measured, untouched) + stack **202.5**
(was 202) + dock 70 = **533.6 / 568**, against the plan's 533. The budget, its slack and its
justification all survive verbatim. §4.3 needs no rework.

**MD1a — what happens above 390.** The unit's ceiling is set at **4px (i.e. at 390), not 4.4px
(430)**, a deliberate departure from §6.1. Above 390 the container keeps growing but the unit
stops, so extra space becomes more content rather than bigger content. Computed at 430×932,
each option using its own tokens:

| At 430×932 | §6.1's clamps | `--u` ceiling **4.0** *(recommended)* | `--u` ceiling 4.4 |
|---|---|---|---|
| row height | 70.4px | **69px** — identical on every phone | 75.9px |
| chrome gutter | 117px | 110px | 121px |
| visible stack rows | 5.54 | **5.80** | 5.08 |
| `.tp-amount` ceiling | 88px | **88px** — the design's value | 96.8px |
| golden set | a geometry per width | **one geometry from 390 up** | a geometry per width |

**Be honest about the size of this:** the row-count difference is a quarter of a row. This is
not the decision that determines whether the app is responsive — it is a preference about what
a large phone should do with its extra space, and the case for 4.0 rests on the last two rows,
not the third. Consistent physical size across the range gives stable muscle memory and holds
the amount at the size it was drawn; capping also collapses the golden set from a continuum to
a single geometry above 390, which is a real saving in §7.1.

*If Oliver would rather the design grew on large phones, change one number — `4px` → `4.4px` —
and nothing else in this amendment moves.*

### 3.2 Geometry rides `--u`; type rides `rem`

This is the split that keeps axis 7 (OS text scaling) open, and it is the reason to decide it
now rather than at MD6. If type is a px-derived length, Dynamic Type and Android font scale are
dead permanently — a WCAG 1.4.4 failure baked into the foundation.

- **Prose, labels, fields, list content → `rem`.** They honour the user's setting. Fields keep
  a `≥1rem` floor (§4.5 explains why that floor is load-bearing on iOS).
- **Display numerals → `--u` and container units.** `.tp-amount` and the split count are
  graphics whose job is to fill a box, not text someone reads at length. §4.3 rebuilds the
  fitter.
- **Chrome geometry → `--u`.** Bar heights, gutters, radii, the dock. A payment terminal's
  chrome should not reflow because someone bumped their text size; the text inside it should.

**The rule that makes this safe, and it is not optional:**

> **No element containing user-scalable text may have a fixed `height`. It gets `min-height`
> and grows.**

Without it, a merchant at 130% text size gets clipped labels everywhere, and the failure is
invisible to every gate that runs at the default text size. This rule applies to roughly 40 of
the 562 px literals; the rest are true geometry and convert mechanically.

### 3.3 Container queries, not media queries

All component-level responsiveness keys off `cqi` of `.tp-viewport` — never the window. The
codebase currently contains **zero** container queries and seven `@media` blocks in
`index.css` alone. The payoff is not stylistic:

- the same terminal component renders correctly in the landing page's phone demo, in the
  desktop app, inside a modal, and in Playwright at any size, with no media query and no props;
- **iPad Split View and foldables work with no special case** — at 320pt wide and 1024pt tall
  `use-device-class.ts:12` classes the window as mobile, and a width-driven unit is correct
  there while any height-driven or window-driven scale is wrong;
- the golden set can be captured by resizing one element rather than one browser.

**One consequence to check, stated plainly because it is the same failure mode used to
disqualify the transform in §1.1c:** `container-type` implies `contain: layout`, which makes
`.tp-viewport` a containing block for `position: fixed` descendants. Verified: there are no
`position: fixed` rules anywhere under `client/src/features/terminal/**`, and portalled
overlays escape to `document.body` and are unaffected. This must be re-checked in the §7.4
static pass, not assumed to stay true.

`container-type: size` on `.tp-hero` and `.tp-panel` additionally implies `contain: size`,
meaning those elements' heights must come from the grid and never from their content. Under
§6.4's `minmax(<length>, <length>)` rows that holds — but content that outgrows the box will
overflow silently rather than push. §6 adds a gate clause for it.

### 3.4 The vertical stays a grid

§6.4 is **unchanged and correct**. Heights come from `minmax()` and `1fr`, never from a scalar —
a hero sized off width is wrong on every short screen, and §6.1's A/B split identified this
properly. The only edit: `--stack-min` is now expressed in the unit,

```css
--stack-min: calc(60.75 * var(--u) + 2px);   /* 3 rows + header + gap + border */
```

which yields 245.0 at 390 and 202.5 at 320 — reproducing §4.3's budget row to the pixel, which
is the check that the row and header factors are right.

### 3.5 The exemption list — what must never scale

Proportional scaling is only safe because of this list. Anything here is authored as an
absolute value and is exempt from `--u`:

| Exempt | Value | Why |
|---|---|---|
| **Hit areas** | ≥44px via `.tap-target`'s `::after`, independent of the visual box | this is what buys the right to draw a 27px button — §4.2 |
| **Minimum readable type** | 11px floor on any text, 1rem on fields | below it, small phones become unusable rather than compact |
| **Hairline borders** | 1px, never `0.825px` | subpixel borders render as inconsistent grey |
| **Safe-area insets** | `env()` raw | they are physical device measurements, already in real pixels |
| **Focus ring** | 2px + 2px offset | an accessibility affordance, not decoration |
| **Icon stroke width** | authored | strokes scaled below 1px disappear |
| **Motion durations and easings** | `--m-dur-*`, `--m-ease-*` from `index.css:72-75` | time is not a length; §6.1 was already right to reuse these rather than invent |

### 3.6 Support and fallback

Container query units are Chrome 105+, Safari 16+, Firefox 110+. For a 2026 payments app that
is the whole field, but the fallback is one block and it is worth having:

```css
@supports not (container-type: inline-size) {
  .tp-viewport { --u: 4px; }    /* design size, fixed layout — degrades to today's behaviour */
}
```

Because every value is `calc(N * var(--u))`, a single fallback declaration restores the entire
design at its authored size. That is not achievable with 21 independent clamps.

---

## 4. Axes the plan does not cover

Found by auditing the code against the fifteen axes in §2. The first is a live bug of the same
severity as RC-1; the third invalidates a constant the plan derives.

### 4.1 The software keyboard can hide fields with no way to reach them — **severe, live**

Every screen shell is `overflow: hidden` inside a fixed-height viewport that is also
`overflow: hidden`:

```
.tp-viewport { height: 100svh; overflow: hidden; }          /* ×4 stylesheets */
.tp-screen   { position: absolute; inset: 0; overflow: hidden; }
```

There are **25 text inputs** across the terminal views. `svh` is the *small* viewport — it is
static and never shrinks when the keyboard opens. The visual viewport shrinks; the layout
viewport does not. So on a 390×844 phone with a ~336px keyboard, anything in the bottom 40% of
the screen is covered, and because both ancestors are `overflow: hidden` there is **nothing to
scroll** — the browser's `scrollIntoView` has no scrollport to work with.

**There is no `visualViewport` handling anywhere in `client/src`** — zero matches.

The fix has three parts, and none of them is `--u`:

1. `interactive-widget=resizes-content` in the viewport meta (Chromium honours it; WebKit
   ignores it, hence 2);
2. a `visualViewport` `resize`/`scroll` listener writing `--kb-h` to `document.documentElement`,
   with `--kb-h: 0px` as the initial value;
3. screens that contain fields become `overflow-y: auto; overscroll-behavior: contain;` with
   `padding-bottom: calc(var(--kb-h) + var(--safe-bottom))`. Screens with no fields keep
   `overflow: hidden`.

This interacts with the companion's DK1 (*the panel may scroll*, settled 2026-08-19) — the same
scrollport serves both, so they should land together.

**New decision — MD8.** Does the keyboard fix land inside this plan (it is a responsiveness
defect, and phase 6 owns the viewport-unit work) or as its own commit ahead of it (it is a live
bug on a shipping app, unrelated to the redesign)? *Recommended: its own commit, ahead of
phase 6, gated by a Playwright test that focuses the last field on each vertical and asserts it
is inside the visual viewport.*

### 4.2 Tap targets key off the wrong axis

RC-1's defect is not only the *value* (44px beating an authored 27px). It is the **axis**:

```css
@media (max-width: 640px) { button { min-height: 44px; min-width: 44px } }
```

Width does not tell you whether a finger is involved. This rule gives 44px targets to a 500px
desktop browser window that will never be touched, and none to a 900px-wide tablet that only
ever is. The correct axis is `pointer: coarse` — which the codebase already knows about, in
`use-device-class.ts:5`, and has never applied to CSS.

The replacement, landing in phase 5 alongside the removal:

```css
@media (pointer: coarse) {
  .tap-target { position: relative; }
  .tap-target::after {
    content: ""; position: absolute; inset: 50% auto auto 50%;
    width: max(100%, 44px); height: max(100%, 44px);
    transform: translate(-50%, -50%);
  }
}
```

The hit area meets the minimum; the visual box stays whatever the design drew. This is what
makes a 27px button legitimate rather than a violation, and it is a precondition for §3.1 —
without it, proportional scaling at 320 would take real targets below the floor.

### 4.3 `--amount-k` is calibrated against a font weight that is not loaded

§6.1 derives `--amount-k = 1.50` from "Outfit 900's digit advance ≈ 0.543em". Two problems.

**Weight 900 is not loaded.** Both font requests stop at 700:

```
client/src/index.css:1   …family=Inter:wght@100;200;300;400;500;600;700&family=Outfit:wght@100…700
client/index.html:211    …family=Outfit:wght@300;400;500;600;700
```

`.tp-amount` is authored `font-weight: 900` in retail (`RetailTerminalViewCore.jsx:1498`) and
`font-weight: 800` in property, trades and the legacy trades terminal. So every measurement
behind `k` was taken from a **browser-synthesised** face. Faux-bold widens glyphs by an amount
that differs per engine — so `k` is calibrated to headless Chromium and will be wrong on the
iPhone the merchant is holding, and will change again the moment anyone adds `800;900` to the
request.

**The three verticals are not even the same weight** — 900 in retail, 800 elsewhere — so no
single constant can serve all three.

The fix is two parts:

1. Request the variable range (`wght@100..900`, one file, covers every weight in use) or
   self-host per MD6. Either way, do it **before** anything is calibrated.
2. **Replace the constant with a measurement.** The formula stays as the first-paint estimate,
   so there is no layout thrash; a correction pass then measures the truth:
   - set from CSS: `font-size: min(var(--amount-max), calc(100cqi / var(--amount-chars) * 1.5))`
   - after `document.fonts.ready`, and on every `ResizeObserver` tick, compare `scrollWidth` to
     `clientWidth` and apply a single multiplicative correction.

   `document.fonts.ready` is the part that is easy to miss: without it the fitter measures the
   fallback face's metrics during FOUT and settles on the wrong size. That is a real bug on
   every cold load today, independent of everything else here.

This makes the fitter independent of typeface, weight, synthesis, grouping (MD4) and currency
symbol — which is what "robust" has to mean for the one element on screen that carries the
money.

### 4.4 The global `!important` mobile overrides fight the design system

Two rules in `index.css` do the same thing RC-1 does — override component intent globally —
and both are load-bearing, so neither can simply be deleted:

**`index.css:733` — `input, select, textarea { font-size: 16px !important }`** under 768px.
`.tp-field` is authored at **17px** in all four stylesheets, so fields render 17px on
tablet/desktop and 16px on phones, and no component can opt out. The rule exists because iOS
Safari zooms the page when a focused input is under 16px — a real problem with a real fix. It
must move *into* the system as a `≥1rem` floor on the field token (§3.2), not stay as a blanket
`!important`.

**`index.css:710` — `@media (max-width: 768px) { * { max-width: 100vw } }`.** A universal
selector constraining every element on phones *and* tablets. `100vw` includes the scrollbar
width, so on a desktop browser narrowed below 768px it *causes* the horizontal overflow it was
added to prevent. Replace with `overflow-x: clip` on `body` — one rule, no universal selector,
correct on every platform. This is also a precondition for §3.3, since a universal `max-width`
interacts badly with elements that are meant to scroll their own overflow.

The wider point for phase 5: the §5.3 audit of "all seven media blocks" should be scoped as
*find every global rule that overrides a component*, not just the 44px one. These two are the
proof that RC-1 was a pattern, not an incident.

### 4.5 Zoom is disabled

```html
client/index.html:5
<meta name="viewport" content="width=device-width, initial-scale=1.0,
      maximum-scale=1, user-scalable=no, viewport-fit=cover" />
```

`maximum-scale=1` and `user-scalable=no` are a WCAG 1.4.4 failure. They were near-certainly
added to stop iOS focus-zoom — but §4.4's 16px field rule already prevents that, reliably and
without disabling pinch. So the meta tag is buying nothing and costing accessibility.

Recommended: drop `maximum-scale` and `user-scalable`, keep `width=device-width`,
`initial-scale=1`, `viewport-fit=cover`, and add `interactive-widget=resizes-content` from
§4.1. Then verify the terminal at 200% zoom — which under §3.3's container queries behaves like
a narrow container, i.e. it degrades the way a small phone does rather than breaking.

### 4.6 Input modality gaps

`PropertyTerminalView.tsx` has **zero** `inputMode` attributes across 1460 lines, and retail has
two. Amount fields therefore open an alphabetic keyboard, on a payments app. `enterKeyHint` and
`autocomplete` are effectively absent (2 uses across all three views).

Small, but it is the same category as everything else here — the UI does not adapt to how it is
being operated. Fold into phase 4's control inventory, which is already walking every control.

### 4.7 Content extremes beyond the amount

§6.5 and §7.2 handle `$99999.99`. Nothing handles a 40-character tenant name, a long property
address, a zero-row stack, or a 60-row one. The three views already carry 20 `textOverflow` and
21 `whiteSpace: nowrap` declarations, so the intent exists but is unverified — and truncation
behaviour changes with the unit at every width.

The §7.2 fixture set should carry a **content-extreme variant per screen**: longest realistic
string, empty state, and overflow state. This is cheap once the goldens exist and it is the
axis most likely to break in production, because real merchant data is not the seed data.

### 4.8 `100vh` is still live in retail and 15 other places

`RetailTerminalViewCore.jsx:1453` is `height: 100vh` while property and trades are `100svh` —
matching the memory note, now confirmed. Repo-wide: **34 `100svh`, 16 `100vh`, 4 `100dvh`**.
Phase 6 owns the fallback chain (`100vh` → `100svh` → `100dvh`); it should sweep all 16, not
just the terminal's one, or the same bug returns through a neighbouring page.

### 4.9 No contrast or forced-colours handling

Two `prefers-reduced-motion` blocks exist (`index.css:986`, `:1099`) — good. There are **zero**
`prefers-contrast` and **zero** `forced-colors` rules anywhere in `client/src`. Windows High
Contrast Mode will flatten the terminal's colour-coded status system, which is load-bearing
information.

Lowest priority item in this document, and out of scope for MD1 — recorded so it is a decision
rather than an oversight.

---

## 5. Changes to the plan

### 5.1 §6.1 — replaced

The A/B/C/D structure is kept. Half A (width-driven) collapses from thirteen clamped tokens to
one clamped unit plus twelve `calc()` derivations (§3.1). Half B (height-driven) is unchanged.
Half C gains the `contain: size` warning from §3.3. Half D is unchanged, plus `--kb-h` from
§4.1. The calibration table is replaced by §3.1's validation table, which now has one row to
verify rather than nine.

### 5.2 §6.5 — replaced

`--amount-k` as a constant is withdrawn (§4.3). The formula survives as the first-paint
estimate; a `document.fonts.ready` + `ResizeObserver` correction pass becomes the guarantee.
§6.5's conclusion that **MD4 cannot cause an overflow** still holds and is now stronger — a
measured fitter is grouping-invariant by construction rather than by algebra.

### 5.3 §4.3, §6.4 — unchanged

Confirmed by substitution (§3.1, §3.4). The budget lands at 533.6/568 against the plan's 533.

### 5.4 The companion plan

Unaffected. DK1 (*the panel may scroll*) and §4.1's scrollport are the same mechanism and
should land in one commit; the companion's A (`--dock-h`) is orthogonal and can still land at
any time.

### 5.5 §9 — revised execution order

```
0 → 1 → 2 → 2b → 3 → 4 → 5 → [K] → 6 → [7 ‖ A] → [8 ‖ B] → [9 ‖ C] → [D → E → F] → 10
```

with one new phase and two adjustments:

| Phase | Change |
|---|---|
| **K** *(new)* | The keyboard fix (§4.1) + the viewport-meta change (§4.5) + the two `!important` overrides (§4.4). Independent of the token layer; fixes a live bug. Gate: focus the last field on each vertical, assert it is inside `visualViewport`. |
| 3 | Now depends on the font-weight fix (§4.3) — goldens captured against a synthesised face are not a baseline |
| 5 | Adds the `pointer: coarse` re-axis (§4.2) alongside the removal, not after it |
| 6 | Sweeps all 16 `100vh` sites (§4.8), not only the terminal's |

MD1 still blocks nothing before phase 6, so phases 1–5 and K can begin immediately.

---

## 6. Gates

§7's existing clauses stand. These are added, one per axis that this amendment opened. Each is
falsifiable and runs headless.

| Axis | Gate |
|---|---|
| The unit | at 390, `getComputedStyle(el).getPropertyValue('--u')` is exactly `4px`; every token in §3.1 equals its authored value. One assertion catches all thirteen. |
| Proportion lock | at 320, 360, 375, 390, 412, 430: `--row-h / --bar-h` is constant to 3 decimal places. This is the assertion that 21 independent clamps could not pass. |
| MD1a | at 430, `--u` computes to `4px` and `visibleStackRows >= 5` |
| Type scaling | with root font-size at 20px (125%), no text is clipped and no element's `scrollHeight > clientHeight` on any screen. This is the gate for §3.2's no-fixed-height rule. |
| Keyboard | focus each of the 25 fields; assert the field's rect is inside `window.visualViewport` |
| Tap targets | every interactive element's `::after` hit box is ≥44×44 under emulated coarse pointer; **and** no element is force-inflated under a fine pointer at 500px wide |
| `contain` | no `position: fixed` rule exists under `features/terminal/**` (static); no element inside `.tp-hero`/`.tp-panel` overflows its container (runtime) |
| Amount fitter | after `document.fonts.ready`, `scrollWidth <= clientWidth` for `$0.01`, `$99999.99`, `$99,999.99`, and a 3-char currency prefix, at all six widths |
| Font weights | every `font-weight` used in the terminal is present in the loaded face list (`document.fonts` check) — this is the gate that would have caught §4.3 |
| Zoom | at 200% browser zoom, no horizontal scroll on `body` and the action bar's six invariants still hold |
| Content extremes | the longest-string / empty / overflow fixture per screen, at 320 and 430 |
| Container independence | render `RetailTerminalView` into a 320px box **and** a 430px box on the same 1440px page; both satisfy their invariants. Proves §3.3 without a browser resize. |

---

## 7. Decisions

| # | Decision | Recommended | Blocks |
|---|---|---|---|
| **MD1** | Fluid or scaled canvas | **Fluid, single-unit form (§3.1)** | everything from phase 6 |
| **MD1a** | Above 390: bigger content or more content | **More content — cap `--u` at 4px** | phase 8, the golden set's size |
| **MD8** | Keyboard fix: inside phase 6, or its own commit ahead of it | **Its own commit (phase K)** | nothing — it is additive either way |
| **MD9** | Honour OS text scaling now, or keep the door open and do it later | **Keep it open now (§3.2's rem split costs nothing), decide later** | nothing; §3.2 is the same work either way |
| MD6 | Fonts | now has a **hard** component: the 800/900 weights must be loaded before phase 3 | phase 3 |

MD2, MD3, MD4 and MD5 are unchanged by this amendment.

**MD7 is settled and no longer open** *(established from the code after this amendment's first
draft, which closed by calling MD7 "the only open decision that changes the size of the job" —
that statement was wrong)*. The plan's premise was mistaken on both counts:
`client/src/pages/trades/trades-terminal.tsx` is the trades **controller**, mounted at
**`/trades/terminal`** (`App.tsx:932-935`) and rendering the shared `<TradesTerminalView>` at
`:459`, with `__tests__/trades-terminal-view-boundary.test.tsx:149-150` enforcing that
relationship. It is not a second implementation, and it is not the `/trades/quote` route —
that is `quote-builder.tsx`, an 11-line direct-link fallback. Retiring it was never available;
what remains is an unfinished extraction (move `QuoteScreen`, delete `TP_TERM_CSS`, repoint
`quote-builder.tsx`), which is a scoped refactor inside phase 2. The plan's §1 MD7, §3 RC-6 and
§5.1 are corrected accordingly.

**With MD7 closed, MD1 is the only decision still blocking the plan** — and §1 of this document
answers it.

---

## 8. Risks and honest unknowns

**The 562 literals are a codemod, but not a blind one.** N = px/4 is mechanical; deciding which
of the 48 distinct values are geometry (→ `--u`), which are type (→ `rem`), and which are exempt
(§3.5) is a judgment call per declaration. Estimate: ~470 mechanical, ~50 type, ~40 exempt. The
proportion-lock gate catches a value converted in the wrong category only if it changes a ratio
that the gate samples — so the conversion should be reviewed by eye against the goldens, not
just by test.

**`--u` at its 3.3px floor makes 320px phones 17.5% smaller, uniformly.** That is bounded and
much better than the scaled canvas's 30%, but it is still a visible departure from the design at
that size, and §2.3 requires it to be checked against the reference rather than the arithmetic.
The exemptions (§3.5) mean it is never an *accessibility* departure.

**Container-query support is assumed, not measured.** No analytics on the merchant base's
browser mix was consulted. §3.6's fallback makes the assumption cheap to be wrong about.

**`prefers-reduced-motion` is handled; `prefers-reduced-transparency` is not,** and the terminal
leans on translucent overlays. Not investigated. Recorded, not planned.

**Two things in this document are inferences, not measurements:** that §4.3's `k` was measured
against a synthesised face (the weights are provably absent and the constant provably assumes
900, but nobody watched the measurement happen), and §4.3's estimate that the FAB renders at
59px at 320. Both should be confirmed in the browser during phase 1, when the baseline JSON is
recorded anyway.
