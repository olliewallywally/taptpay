# Implementation spec — terminal feature panels + the nav dock (phases B–F)

Date: 2026-08-20 · Status: **written to be executed without further design decisions.**
Implements `docs/PLAN-2026-08-17-terminal-panels-and-dock.md` (v2, DK1–DK4 settled).

## 0. How to use this document

The plan is the **why**: the measurements, the evidence, the four settled decisions, the list
of what may not change. It stays authoritative for all of that and you should read §1, §2 and
§7 of it before starting.

This is the **what to type**. It exists because the plan was written against a mental model of
the code rather than the code, and eight of its instructions cannot be followed literally. §1
lists every disagreement. **Where the two documents conflict, this one wins**, and §1 says why
in each case.

Three rules for the implementer:

1. **Nothing here is a suggestion.** If a value in this document does not produce the stated
   result, stop and report it. Do not substitute a value that "looks right" — every number
   here was measured in the repo's own Chromium 125, and a number that disagrees means an
   assumption broke, which is information.
2. **One phase per commit**, in the order given. Each phase names the gate that must pass
   before the next begins.
3. **Never widen a selector.** `.tp-screen.tp-feature`, never `.tp-screen`. The plan's §3.1
   explains what happens otherwise; the companion's §6.6.1 ownership rule makes it binding.

---

## 1. Corrections to the plan — read this before anything else

Eight statements in the plan (and two in the companion) are wrong against the tree as of
2026-08-20. Each was checked, not assumed.

### 1.1 `.tp-panel`, `.tp-panel-body` and `.tp-hero` do not exist

The plan's §3.1 publishes a CSS block styling `.tp-panel` and `.tp-panel-body` as though they
were existing classes. They are not in the codebase:

```
$ grep -rn "tp-panel\|tp-hero" client/src
client/src/pages/landing-page.tsx:114:  <section id="tp-hero" …      ← unrelated: the landing page's hero
```

Nor is `.tp-feature`, `.tp-home` or `.tp-plain` — the companion's Phase 2b, which the plan's §8
names as a hard dependency, has not landed. Every hero and panel in all 27 screens is an inline
style object on a `<div className="stagger">`. **Phase B therefore begins with §2 of this
document (Phase B0), which creates those classes.** There is no shortcut: applying §3.1's CSS
today styles nothing at all, silently.

*Name collision to be aware of, not to fix:* `landing-page.tsx:114` uses `id="tp-hero"`. It is
an id, not a class, so there is no CSS collision — but a `grep tp-hero` will always return it.

### 1.2 `--kp-size` has three separate defects, and this is the important correction

**Defect 1 — two definitions.** Companion §6.1 half C defines it as a `100cqh` expression;
amendment A1 §3.1 redefines it as `calc(19 * var(--u))` and A1 §5.1 declares §6.1 "replaced".
Followed literally the key is a flat 76px at every size and the keypad overflows at 320 and 360.
**Both are needed** — the unit sets the design size, the container expression caps it to what
the panel can actually show. The single reconciled definition is in §5 of this document.

**Defect 2 — `--panel-h` does not exist.** A1 §3.1's comment says `--kp-size` is "still
min()-capped by `--panel-h`". No such token is defined in the plan, the companion, the amendment
or the code. Ignore the comment; §5 carries the real cap.

**Defect 3 — the declaring element is wrong, and the padding is subtracted twice.** Both plans
write the formula *on `.tp-panel`*, the element that also carries `container-type: size`. Two
things follow, and they were measured rather than reasoned about:

- **An element is never its own size-query container.** `100cqh` written on `.tp-panel` resolves
  against the nearest *ancestor* container. `.tp-viewport` is `container-type: inline-size`, so
  it supplies no block axis, and the value falls all the way back to the small viewport.
  Measured: `100cqh` on the container itself = **568px**; on a descendant = **277px**, the
  container's *content box*.
- Because `100cqh` is the content box, the panel's own padding is **already excluded**.
  Subtracting `2 * var(--sp-6)` again, as both plans do, double-counts it.

The practical damage, measured across the six portrait viewports with the rest of §4's grid in
place (`--dock-h: 64px`, safe area 0):

| viewport | key, formula as published | key, corrected (§5) | design size |
|---|---|---|---|
| 320×568 | 53.5 | **63.4** | 76 |
| 360×640 | 64.5 | **74.4** | 76 |
| 375×667 | 68.7 | **76.0** | 76 |
| 390×844 | 76.0 | 76.0 | 76 |
| 412×915 | 76.0 | 76.0 | 76 |
| 430×932 | 76.0 | 76.0 | 76 |

So the published form is not merely inelegant: it draws a key **16% smaller than the panel can
afford** on the smallest phone, and never reaches the design size on a 375×667 iPhone SE 2/3 —
one of the most common devices in the matrix.

**And it is one keystroke away from restoring the original bug.** Custom properties are
substituted lazily, so today the wrong placement still resolves at the *use* site (`.tp-kp`),
which is why it under-sizes rather than explodes. Register the property — exactly what A1 §3.1
recommends elsewhere for `--r`, and the obvious "make it type-safe" move —

```css
@property --kp-size { syntax: "<length>"; inherits: true; initial-value: 76px; }
```

— and the value computes eagerly at the declaring element, becomes a flat **76px everywhere**,
and the keypad shows **three rows and overflows at 320×568 and 360×640**. Measured, both
branches. This is the same silent-failure class as the companion's v1 `0px` token defect, in
the same token. §5 puts the declaration on `.tp-panel-body` and §9 gates the numbers, not the
presence of the token.

### 1.3 "The 50/50 split" is 28 inline literals, not one rule

The plan speaks of the split as a thing to replace. It is `height: '50%'` written 28 times in
three files:

| file | `height: '50%'` sites | of which `.tp-home` |
|---|---|---|
| `RetailTerminalViewCore.jsx` | 9 — :334 :358 :398 :435 :483 :537 :578 :622 :670 | :334, :358 |
| `PropertyTerminalView.tsx` | 11 — :369 :430 :464 :485 :573 :604 :763 :837 :862 :966 :1073 | none |
| `TradesTerminalView.tsx` | 8 — :174 :243 :314 :347 :371 :468 :491 :558 | :174 |

25 of the 28 belong to feature screens. **The 26th feature screen has no 50% hero**: trades'
quote screen (`TradesTerminalView.tsx:729`) uses `height: '20%'`. A blanket `--hero-min: 184px`
would grow that hero from 114px to 184px — a redesign nobody asked for. §4.4 gives it a
compact-hero variant.

### 1.4 There are 26 feature screens, not 27

The plan says 27 in §1.0, §4.2, §4.3 and §8. Its own inventory table sums to 7 + 11 + 8 = **26**,
and the tree agrees: 31 `.tp-screen` elements = 4 `.tp-home` + 26 `.tp-feature` + 1 `.tp-plain`.
The companion's §6.6.1 table is internally consistent at 26; only the sum was never taken. A
count assertion written to 27 can never pass. Use 26, and gate the count per file (§9).

The four `.tp-home` screens are `RetailTerminalViewCore.jsx:333` and `:357`,
`PropertyTerminalView.tsx:219`, `TradesTerminalView.tsx:172`. The one `.tp-plain` is
`RetailTerminalViewCore.jsx:898`.

### 1.5 The stylesheets moved on 2026-08-20 — check before you start

The plan and the companion both describe "four unscoped copies of the same `.tp-*` stylesheet"
(companion RC-6). **That is no longer true.** The companion's Phase 2 landed in the working tree
during this document's writing, uncommitted:

| host element | stylesheet, now |
|---|---|
| `RetailTerminalViewCore.jsx:1193` | `retail/retail-terminal-view.css`, scoped `.retail-terminal-view` |
| `PropertyTerminalView.tsx:1310` | `property/property-terminal-view.css`, scoped `.property-terminal-view` |
| `TradesTerminalView.tsx:1058` | `trades/trades-terminal-view.css`, scoped `.trades-terminal-view` |
| `pages/trades/quote-builder.tsx` | imports the trades sheet directly |
| all four | `features/terminal/terminal-keyframes.css` — shared, unscoped, by design |

`TP_CSS` and both `TP_TERM_CSS` constants are gone, and
`client/src/__tests__/terminal-css-scoping.test.ts` is the static guard that stops them coming
back. **Two consequences you must not miss:**

- **`terminal-keyframes.css` is the precedent for a shared unscoped file**, and the guard's
  `VERTICAL_SHEETS` list deliberately excludes it. §3.1's `terminal-tokens.css` follows exactly
  that pattern. Do not add either file to `VERTICAL_SHEETS`.
- **`.tp-screen` is now `.retail-terminal-view .tp-screen`** and its twins — specificity (0,2,0).
  A shared rule written as `.tp-screen.tp-feature` is *also* (0,2,0), so which one wins depends on
  CSS import order. §4.1 uses `.tp-viewport .tp-screen.tp-feature` (0,3,0) for that reason. This
  is the single easiest way to make Phase B look like it did nothing.

Retail's viewport still says `height: 100vh` (`retail-terminal-view.css:20`) where property and
trades say `100svh`. That is the companion's RC-5 and it is **in scope for Phase B1**, because
`--hero-pref` is `svh`-derived and a `100vh` viewport makes the hero taller than the box it is
measured against.

**Every line number in this document was taken on 2026-08-20 against a tree with uncommitted
work in it.** The JSX line numbers in §1.3, §1.4 and §2.1 were re-checked after the stylesheet
move and only one had shifted. Re-run the greps in §9.B0 before you start; if a count disagrees,
the count is right and the line number is stale.

### 1.6 `dockVisible` is dead code — it is not the Phase D hook

`RetailTerminalViewCore.jsx:1188` computes `const dockVisible = !showBoards && (onHome ||
!onTerminal)` and **never uses it**. It is residue from a local dock that the view/controller
extraction removed. It looks exactly like the switch Phase D wants. It is not connected to
anything. Delete it in Phase D or leave it; do not wire to it.

### 1.7 Phase D has no channel, and cannot have the obvious one

The plan says "`TerminalDockView` gains a `collapsed` control prop … so the terminal can request
the collapsed state". The terminal cannot reach it. `App.tsx` renders `<Router />` and
`<BottomNavigation />` as siblings; `BottomNavigation` (`components/bottom-navigation.tsx`)
derives everything from `useLocation()`, and **which feature screen is showing is component
state inside the view, not a route** — retail's keypad, split, stock and share are all at
`/terminal`. There is no prop path and no URL to read.

§6 specifies the channel: a 30-line module store, written by the three route controllers, read
by `BottomNavigation` with `useSyncExternalStore`. `TerminalDockView` gains only the prop, so
`__tests__/terminal-dock-view-boundary.test.tsx` stays green by construction.

### 1.8 `--panel-top` measures a bar that is not there

The plan's §3.1 rule 2 has `--panel-top` measured from the floating action bar. On a feature
screen that bar is translated to sit *above* the hero/panel boundary, inside the hero — it never
overlaps the panel. The measured mechanism belongs to the home screen's `--chrome-gutter`
(companion Phase 8). §4.3 makes `--panel-top` a token and says what to keep.

### 1.9 Two things the plan gets right that are easy to undo

- **`--dock-h` on `document.documentElement`.** Phase A shipped this correctly
  (`TerminalDockView.tsx:105-131`), including clearing it on unmount and publishing only for
  `placement === "fixed"`. Do not "tidy" it onto a terminal-scoped node.
- **The repo's motion rule** (`index.css:60-71`): overshoot comes from `--m-ease-pop` and
  nothing else, and *never* on height, width, padding, colour or opacity. The current dock
  violates it three times (`height 0.5s cubic-bezier(0.34,1.56,0.64,1)` and two more at
  `TerminalDockView.tsx:170-174`). Phase F replaces those; do not carry the curve across.

---

## 2. Phase B0 — the class contract

**Depends on:** nothing. **Gate:** §9.B0. **Commit:** `refactor(terminal): classify all 31 tp-screen elements`.

This is the companion's Phase 2b. It is listed there but has not landed, and every later phase
in this document needs it. Doing it here does not steal work from the companion — it is additive
and the companion's own §6.6.1 says so ("Adding a class is additive — no rename").

### 2.1 The classification

Add exactly one class to each of the 31 `.tp-screen` elements. The `className` line numbers:

```
.tp-home    (4)  retail :333 :357   property :219   trades :172
.tp-plain   (1)  retail :898
.tp-feature (26) retail   :397 :434 :482 :536 :577 :621 :669
                 property :367 :429 :463 :484 :572 :602 :762 :836 :861 :965 :1072
                 trades   :241 :313 :346 :370 :467 :490 :557 :729
```

`className="tp-screen"` becomes `className="tp-screen tp-feature"`, and so on. Nothing else
changes in this commit — no styles, no structure.

**The four traps from companion §6.6.1 apply and are the reason the list is by line, not by
component:** five components return `.tp-screen` from two branches (property `SendRentLink`,
`ChargeBill`, `MarkExternal`; trades `QuickInvoice`, `MarkExternal`) — both branches are in the
list above, class both. `CashSuccess` (:669) is palette-inverted but is `.tp-feature`.
`PendingTerminal` (:357) is a second home screen. `pages/trades/trades-terminal.tsx` holds no
`.tp-screen` at all — it is the controller.

### 2.2 The hero and panel

In the same commit, on the **26 feature screens only**, add the two structural classes to the
existing children. Every feature screen has exactly this shape today:

```jsx
<div className="tp-screen tp-feature" style={{ background: NAVY }}>
  <div className="stagger" style={{ background: OFFW, height: '50%', … }}>  ← hero
  <div className="stagger" style={{ flex: 1, background: NAVY, padding: `38px 28px ${dockPad('28px')}`, … }}>  ← panel
</div>
```

becomes

```jsx
<div className="tp-screen tp-feature" style={{ background: NAVY }}>
  <div className="stagger tp-hero" style={{ background: OFFW, … }}>
  <div className="stagger tp-panel" style={{ background: NAVY }}>
    <div className="tp-panel-body">   ← new wrapper around the panel's existing children
      …
    </div>
  </div>
</div>
```

Three rules for this edit:

1. **Keep `stagger`.** It drives the entrance animation and
   `RetailTerminalViewCore.jsx:1170` finds the hero with `entering.querySelector('.stagger')`
   to position the floating subbar. Removing it breaks the action bar's placement silently.
2. **Delete from the hero's inline style only `height: '50%'`.** Leave `display`,
   `flexDirection`, `background`, `color`. The grid row replaces the height.
3. **Delete from the panel's inline style `flex: 1`, `padding` and `minHeight`.** Those are the
   six hand-tuned literals in the plan's §1.2 plus the `dockPad()` calls Phase A added, and
   §4.2's rules replace all of them. Leave `background`.

`dockPad()` and its three definitions (`RetailTerminalViewCore.jsx:91`,
`PropertyTerminalView.tsx:349`, `TradesTerminalView.tsx:225`) become unused at the end of Phase
B and are deleted there, not here.

**`.tp-plain` gets no wrapper and no hero** — one region, and §4.2 gives it the dock reservation
only.

---

## 3. Phase B1 — the token block

**Depends on:** B0. **Gate:** §9.B1. **Commit:** `feat(mobile): the terminal token layer`.

This is the companion's Phase 6 reduced to exactly what phases B–F consume. It is written so it
can land from this document without waiting on the rest of the companion, and so that when the
companion lands its full §6.1 the two are the same text.

### 3.1 Where it goes

One new file, `client/src/features/terminal/terminal-tokens.css`, sitting beside
`terminal-keyframes.css` and imported the same way it is — from all four hosts:

```
RetailTerminalView.tsx:4      import "../terminal-keyframes.css";   ← add the tokens import here
PropertyTerminalView.tsx:4    import "../terminal-keyframes.css";
TradesTerminalView.tsx:4      import "../terminal-keyframes.css";
pages/trades/quote-builder.tsx:11
```

It is shared and unscoped **deliberately** — the tokens must resolve identically on all three
verticals, and `terminal-keyframes.css` already establishes that a shared terminal sheet is
legitimate (§1.5). Do not add it to `terminal-css-scoping.test.ts`'s `VERTICAL_SHEETS`, and do not
copy it into the three vertical sheets: three copies of a token layer is RC-6 wearing a different
hat, and this is the layer everything else derives from.

```css
/* client/src/features/terminal/terminal-tokens.css
   The single source for terminal geometry. Amendment A1 §3.1 (MD1 answered):
   one clamped unit, every other length derived as calc(N * var(--u)) where
   N = authored_px / 4. Do not add a second clamped token here. */

.tp-viewport {
  container-type: inline-size;          /* size off our own 430-capped box, not the window */
  --u: clamp(3.3px, 1.0256cqi, 4px);    /* exactly 4.000px at the 390 reference */

  --sp-1: calc(1 * var(--u));
  --sp-2: calc(2 * var(--u));
  --sp-3: calc(3 * var(--u));
  --sp-4: calc(4 * var(--u));
  --sp-6: calc(6 * var(--u));
  --sp-7: calc(7 * var(--u));

  --kp-max:  calc(19 * var(--u));       /* 76 @390 — the keypad key's DESIGN size (§5) */
  --fab-size: calc(17.5 * var(--u));

  /* Height-driven. A hero sized off width is 233px on a 320x568 phone. */
  --hero-min:  184px;
  --hero-pref: clamp(184px, 33.65svh, 316px);
  --panel-min: calc(4 * 44px + 3 * var(--sp-3) + 2 * var(--sp-6));

  --safe-bottom: env(safe-area-inset-bottom, 0px);

  --panel-top: calc(9.5 * var(--u));    /* 38 @390 — see §4.3: nothing measures this */

  /* JS-written. The only one, and every read needs the fallback shown here:
     --dock-h  documentElement, published by TerminalDockView (Phase A, shipped). init 0px */

  height: 100vh;    /* fallback order matters — retail still says only 100vh (§1.5) */
  height: 100svh;
  height: 100dvh;
}

@supports not (container-type: inline-size) {
  .tp-viewport { --u: 4px; }            /* design size, fixed layout — today's behaviour */
}
```

### 3.2 What must not be done to this block

- **Do not register any of these with `@property`.** §1.2 measured what that does to `--kp-size`;
  the same eager-computation trap applies to anything reading `cqi`/`cqh`.
- **Do not add a second clamp.** A1 §3.1's whole argument is that one clamped unit reproduces
  the twenty-one hand-calibrated values. If a value needs a different curve, it is either
  height-driven (goes in the second group) or on A1 §3.5's exemption list.
- **The exemption list is binding** (A1 §3.5): hit areas ≥44px, an 11px type floor, 1px
  hairlines, `env()` safe areas raw, 2px focus rings, icon stroke widths, and the `--m-dur-*` /
  `--m-ease-*` motion tokens from `index.css:72-75`. None of these become `--u` multiples.

### 3.3 Validation, and this is the gate

At a 390px-wide container `--u` must compute to **exactly `4px`**, and every derived token to its
authored value. One assertion covers all of them. Then the proportion lock: at 320, 360, 375,
390, 412 and 430, `--sp-6 / --sp-3` is constant to three decimals. Twenty-one independent clamps
could not pass that assertion; this block passes it by construction, which is the point.

---

## 4. Phase B2 — the grid

**Depends on:** B1. **Gate:** §9.B2. **Commit:** `feat(mobile): the feature-screen grid`.

### 4.1 The CSS

Into `terminal-tokens.css`, below the token block:

```css
/* Two regions: the hero yields, the panel takes the rest and never goes under
   the dock.

   Two things about this selector, both load-bearing:

   NEVER bare .tp-screen — that is all 31 screens, including the four homes the
   companion grids differently and DockPlaceholder, which has one region and no
   hero at all. The companion's §6.6.1 ownership rule makes this binding.

   And it is prefixed with .tp-viewport for specificity, not for scoping. Since
   the companion's phase 2, each vertical declares `.retail-terminal-view
   .tp-screen { display: flex }` and its twins — (0,2,0), the same specificity as
   a bare `.tp-screen.tp-feature`, so a tie would be broken by import order and
   this rule would silently lose. (0,3,0) wins outright. */
.tp-viewport .tp-screen.tp-feature {
  display: grid;
  grid-template-rows:
    minmax(var(--hero-min), var(--hero-pref))     /* off-white: yields first */
    minmax(var(--panel-min), 1fr);                /* navy: takes the rest */
  overflow: hidden;
}

.tp-hero {
  min-height: 0;                  /* without this the row minimum is content, not --hero-min */
  container-type: size;
}

.tp-panel {
  min-height: 0;                  /* THE missing declaration — flex/grid items refuse to
                                     shrink below min-content until this is set. It is the
                                     whole of the plan's §1.1 in one line. */
  container-type: size;           /* so §5's --kp-size can read the panel's realised height */
  display: flex;
  flex-direction: column;
  padding-top: var(--panel-top);
  padding-left: var(--sp-7);
  padding-right: var(--sp-7);
  padding-bottom: calc(var(--dock-h, 0px) + var(--safe-bottom) + var(--sp-3));
}

.tp-panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;               /* DK1: scrolling is a first-class outcome */
  overscroll-behavior: contain;   /* a flick must not chain to the page */
}

/* One region, no hero. Takes the dock reservation and nothing else. */
.tp-viewport .tp-screen.tp-plain {
  padding-bottom: calc(var(--dock-h, 0px) + var(--safe-bottom) + var(--sp-3));
}

/* Trades' quote screen (TradesTerminalView.tsx:729) is authored with a 20% hero,
   not 50%. Without this it would grow from 114px to 184px on a 568px phone —
   a redesign, and §4.6 of the plan forbids one. */
.tp-viewport .tp-screen.tp-feature[data-hero="compact"] {
  --hero-min:  96px;
  --hero-pref: clamp(96px, 17svh, 160px);
}
```

Add `data-hero="compact"` to `TradesTerminalView.tsx:729` and delete its `height: '20%'`.

### 4.2 Why each declaration is there

Keep these four sentences with the code; they are what stops the next person deleting a line
that looks redundant.

1. **`min-height: 0` on `.tp-panel`** is the fix for the plan's §1.1. `flex: 1` is `flex: 1 1 0%`,
   but the default `min-height: auto` refuses to shrink below min-content, so the keypad's 412px
   min-content height renders inside a 284px slot and `overflow: hidden` amputates the rest.
2. **`container-type: size` on `.tp-panel`** is legal only because the grid row above gives the
   panel a definite height. It also makes the panel a containing block for `position: fixed`
   descendants — there are none under `features/terminal/**` today and §9 asserts that stays true.
3. **The bottom padding reads `--dock-h`, never a literal.** Six different hand-tuned bottom
   paddings are what produced 50–78px of permanently-hidden content on every device. One
   measured value, published on `document.documentElement` by the dock itself.
4. **`.tp-panel-body` owns the overflow, not `.tp-screen`.** Today `.tp-screen`'s
   `overflow: hidden` amputates. DK1 says a feature screen may scroll; what it may never do is
   spill past the viewport or hide content under the dock.

### 4.3 `--panel-top` is a token, not a measurement

The plan's §3.1 rule 2 says `--panel-top` "is measured from the floating action bar, the same
mechanism the companion plan's **Phase 8** uses for the home screen's `--chrome-gutter`". That
conflates two different situations, and on a feature screen it would measure a bar that is not
over the panel at all.

`.tp-psubbar` is `position: absolute; top: 50%; height: 37px`, and its **feature-screen** modifier
is `transform: translateY(calc(-100% - 20px))` — `retail-terminal-view.css:322`,
`property-terminal-view.css:121`, `trades-terminal-view.css:95`. Retail and property additionally
carry an inline `translateY(calc(${boundaryDelta}px - 100% - 20px))` that pins it to the *real*
hero bottom. Either way the bar's bottom edge lands **20px above the hero/panel boundary — inside
the hero.** It never overlaps the panel on a feature screen.

The bar sits inside the panel only on the **home** screen (`translateY(67px)`), and that is where
a measured `--chrome-gutter` belongs. It is the companion's Phase 8, not this one.

So `--panel-top` is just the panel's top breathing room, and it becomes one token replacing the
six hand-tuned literals (38 / 40 / 52 / 56 / 52 …) in the plan's §1.2 table:

```css
--panel-top: calc(9.5 * var(--u));    /* 38 @390 — the keypad's authored value */
```

Replace the `--panel-top: var(--sp-6)` seed in §3.1's block with this and delete the "JS-written"
comment line for it; nothing writes it.

**Keep the `boundaryDelta` effect exactly as it is** (`RetailTerminalViewCore.jsx:1163-1184`,
`PropertyTerminalView.tsx:1219-1237`). It positions the floating bar against the hero's real
bottom edge, and after Phase B the hero is no longer a flat 50% — so that effect is precisely
what keeps the bar attached to the moving boundary. It is also the second reason `.stagger` must
survive §2.2: line 1170 finds the hero with `entering.querySelector('.stagger')`.

### 4.4 What Phase B deletes

- All 25 feature `height: '50%'` literals and trades :729's `height: '20%'`.
- Every feature panel's inline `flex: 1`, `padding` and `minHeight`.
- All three `dockPad()` helpers (`RetailTerminalViewCore.jsx:91`, `PropertyTerminalView.tsx:349`,
  `TradesTerminalView.tsx:225`) once their last call site is gone.
- Retail's `height: 100vh` at `TP_CSS:1464`, replaced by the token block's three-line fallback.

The 3 `.tp-home` `height: '50%'` literals (retail :334, :358, trades :174) stay — they are the
companion's Phase 8.

---

## 5. Phase C — the keypad, and the reconciled `--kp-size`

**Depends on:** B2. **Gate:** §9.C. **Commit:** `feat(mobile): fluid keypad sizing`.

### 5.1 The single definition

This replaces companion §6.1 half C, amendment A1 §3.1's `--kp-size` row and its `--panel-h`
comment, and the plan's §1.3 block. There is one definition and it lives on `.tp-panel-body`:

```css
/* IN terminal-tokens.css, with .tp-panel-body.

   Declared HERE and not on .tp-panel, deliberately: an element is never its own
   size-query container, so 100cqh written on .tp-panel resolves against the next
   container up — .tp-viewport is inline-size only, so it falls back to the small
   viewport. Measured in Chromium 125: 568px there, 277px here.

   No padding term: 100cqh is the container's CONTENT box, so .tp-panel's padding
   is already excluded. Both plans subtract it a second time and draw a key 16%
   smaller than the panel can afford.

   --kp-max is the design size from the unit; the min() caps it to what four rows
   plus three gaps can actually occupy. Do NOT @property-register this token —
   registration makes it compute eagerly at the declaring element, pinning it to
   76px and putting the keypad back over the edge at 320 and 360. */
.tp-panel-body {
  --kp-size: min(var(--kp-max), calc((100cqh - 3 * var(--sp-3)) / 4));
}
```

and the key itself, in each vertical's stylesheet, replacing `width: 76px; height: 76px`:

```css
.tp-kp { width: var(--kp-size, 76px); height: var(--kp-size, 76px); }
```

The keypad grid's `gap: 14` becomes `gap: var(--sp-3)`, and its `align-content` becomes `center`.

### 5.2 The numbers this produces

Measured with the §4 grid, `--dock-h: 64px` (collapsed, Phase D) and no safe-area inset:

| viewport | hero | panel | panel content box | `--kp-size` | 4 rows fit |
|---|---|---|---|---|---|
| 320×568 | 191.1 | 376.9 | 283.3 | **63.4** | ✓ |
| 360×640 | 215.4 | 424.6 | 327.8 | **74.4** | ✓ |
| 375×667 | 224.4 | 442.6 | 344.4 | **76.0** | ✓ |
| 390×844 | 284.0 | 560.0 | 460.0 | **76.0** | ✓ |
| 412×915 | 307.9 | 607.1 | 507.0 | **76.0** | ✓ |
| 430×932 | 313.6 | 618.4 | 518.0 | **76.0** | ✓ |

Four rows at every viewport with no per-device value, and the key never grows past its design
size. The plan's §1.3 quotes 60.7px at 320×568; that derivation subtracted the dock twice (once
from the panel's height, once as padding). 63.4 is the measured figure and it is the one to gate
against.

The smallest key, 63.4px, is comfortably above the 44px hit-area floor, so A1 §3.5's exemption
does not bind here and no `::after` inflation is needed on the keypad.

### 5.3 What DK1 means for this phase

Oliver answered that the panel may scroll. So §9.C's four-rows assertion is **reported, not
blocking**: if some screen cannot reach four rows, it scrolls and Phase C still lands. Four rows
remains the target — a keypad you scroll is a bad keypad even when it is a legal one — but it
does not gate the commit. What stays blocking is that nothing spills past the viewport and
nothing sits under the dock.

---

## 6. Phase D — the collapse channel

**Depends on:** nothing (may land any time after A). **Must not reach users before E — see
DK2.** **Gate:** §9.D. **Commit:** `feat(mobile): collapse the dock on feature screens`.

### 6.1 The store

`BottomNavigation` cannot see which feature screen is showing (§1.7). New file,
`client/src/features/navigation/dock-collapse-store.ts`:

```ts
/* The dock and the terminal are siblings under App.tsx's <Router />, and which
   feature screen is showing is view state, not a route — retail's keypad, split,
   stock and share are all at /terminal. This module is the channel between them.

   It stays a plain module on purpose: no wouter, no storage, no fetch, so the
   terminal-dock-view-boundary test is unaffected whichever side imports it. */
export type DockCollapse = "auto" | "collapsed" | "expanded";

let current: DockCollapse = "auto";
const listeners = new Set<() => void>();

export function setDockCollapse(next: DockCollapse) {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}
export function subscribeDockCollapse(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const getDockCollapse = () => current;
export const getDockCollapseServer = (): DockCollapse => "auto";
```

### 6.2 The three writers

The effect goes in the **route controllers**, not in the views, and is gated on a new prop so
that the landing demo and the desktop app — which mount the same views — never drive the real
dock. This mirrors how Phase A gated `--dock-h` on `placement === "fixed"`.

Each view gains `publishDockState?: boolean` (default `false`) and:

```ts
useEffect(() => {
  if (!publishDockState) return;
  setDockCollapse(isFeatureScreen ? "collapsed" : "auto");
  return () => setDockCollapse("auto");
}, [publishDockState, isFeatureScreen]);
```

`isFeatureScreen` already exists in two of the three: `RetailTerminalViewCore.jsx:1159` and
`PropertyTerminalView.tsx:1217`. Trades needs the same one-liner off `props.screen`.

The three controllers pass `publishDockState`:
`pages/merchant-terminal-mobile-v2.tsx:459`, `pages/property/property-terminal.tsx:495`,
`pages/trades/trades-terminal.tsx:459`.

**Do not wire to `dockVisible`** (`RetailTerminalViewCore.jsx:1188`) — §1.6, it is dead.

### 6.3 The reader and the prop

`bottom-navigation.tsx`:

```tsx
const collapse = useSyncExternalStore(subscribeDockCollapse, getDockCollapse, getDockCollapseServer);
return <TerminalDockView mode={mode} activeId={…} onPick={…} collapse={collapse} />;
```

`TerminalDockView` gains `collapse?: DockCollapse` defaulting to `"auto"`, and its existing idle
logic becomes:

- `"auto"` — today's behaviour exactly, the `collapseAfterMs` idle timer.
- `"collapsed"` — collapse immediately, idle timer cleared and not restarted.
- `"expanded"` — expand and hold.

In all three, an explicit swipe (Phase E) still wins over the requested state until the next
change of `collapse`. Import the *type* only into `TerminalDockView`; the store is imported by
`BottomNavigation` and the controllers.

### 6.4 The constraint that is not optional

DK2's answer makes the upward swipe *the* way back from a collapsed dock. D alone collapses the
dock on all 26 feature screens while the only restore path is the any-touch handler E exists to
delete — that ships a dock that pops open when you brush it, on every feature screen. **Land D
behind E, or land them in the same PR.** Building D first is fine; releasing it first is not.

---

## 7. Phase E — the swipe

**Depends on:** nothing. **Gate:** §9.E. **Commit:** `feat(mobile): swipe up to expand the dock`.

### 7.1 What is deleted

`TerminalDockView.tsx:131`, all three of:

```jsx
onTouchStart={resetIdle}  onMouseMove={resetIdle}  onClick={collapsed ? resetIdle : undefined}
```

Keep `resetIdle()` on route change (the `[activeId, mode, collapseAfterMs]` effect) — that is
intent, not a stray touch.

### 7.2 The handle

The collapsed wrapper is `navWidth × 44` = 14,080px² against a 224px² visible affordance, and 30
of 30 probed points expand it. Replace the decorative pill with a real button:

```tsx
<button
  ref={handleRef}
  type="button"
  aria-expanded={!collapsed}
  aria-label="show navigation"
  aria-controls={dockId}          /* dockId = useId(), also on the dock body */
  onPointerDown={onDragStart}
  onPointerMove={onDragMove}
  onPointerUp={onDragEnd}
  onPointerCancel={onDragEnd}
  onClick={onHandleClick}
  style={{
    position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
    width: 120, height: 36,              /* the pointer surface, ~1.2% of the old area */
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 10,
    background: 'none', border: 'none', padding: 0,
    touchAction: 'none',                 /* ON THE HANDLE ONLY — see 7.5 */
    pointerEvents: collapsed ? 'auto' : 'none',
    cursor: 'grab',
  }}
>
  <span aria-hidden="true" style={{ width: 56, height: 4, borderRadius: 999, background: palette.dock }} />
</button>
```

The visible pill stays 56×4. Only the pointer surface changes, from 320×44 to 120×36.

### 7.3 The gesture

Track the finger; do not detect a swipe. The repo already has this idiom three times —
`pages/transactions.tsx:512-518`, `pages/property-analytics.tsx:309-313`,
`pages/trades-analytics.tsx:317-321` — pointer events, `touch-action: none`, and
`transition: dragging ? 'none' : '…'`. Copy its shape.

```
pointerdown   setPointerCapture, y0 = e.clientY, x0 = e.clientX, t0 = e.timeStamp
              dragging = true, transition off
pointermove   dy = y0 - e.clientY
              if (Math.abs(e.clientX - x0) > Math.abs(dy)) → abort, release, settle closed
              progress = rubber(dy / 56)
pointerup     expand if progress > 0.45 OR velocity > 0.4 px/ms; else settle closed
              velocity = dy / (e.timeStamp - t0)
pointercancel settle closed
```

**The rubber-band function** (the plan says "rubber-band past 1.0" without giving one):

```ts
const rubber = (p: number) => (p <= 1 ? Math.max(0, p) : 1 + (1 - Math.exp(-(p - 1) * 0.55)) * 0.32);
```

Linear up to full travel, then asymptotic to 1.32 — so 56px of overshoot yields ~12px of extra
movement and the dock never detaches from the finger. Same shape as the sheet drag in
`transactions.tsx`, expressed as a formula because the sheet's is a clamp.

`progress` drives the same 0→1 value Phase F animates against (§8.2), so the two phases share
one number rather than each keeping their own.

### 7.4 Keyboard and assistive tech — a hard requirement, not a nice-to-have

A gesture-only affordance is unreachable by keyboard and by switch control. The handle is a real
`<button aria-expanded>` with an accessible name, and `Enter`/`Space` expand it.

The trap: a keyboard activation of a `<button>` fires `click`, and so does a tap. Discriminate
on `event.detail === 0`, which is what keyboard-synthesised clicks report:

```ts
const onHandleClick = (e: React.MouseEvent) => {
  if (e.detail !== 0) return;      // a real pointer tap — the gesture owns this
  setCollapsed(false);
};
```

Do not rely on a "gesture in progress" ref alone; a tap with no movement never sets it. §9.E
asserts **both halves** — keyboard expands, tap does not — because the discrimination is exactly
what a later refactor deletes as redundant.

### 7.5 Three details that decide whether it feels right

- **`touch-action: none` on the handle only.** On the full-width strip it eats any page scroll
  that starts near the bottom edge. §9.E gates a scroll flick starting in the bottom 80px of
  every mobile route.
- **Downward swipe collapses**, symmetrically, when expanded. The expanded dock's own buttons
  keep their click handlers; put the downward gesture on the dock body's `onPointerDown` and
  abort it the moment `Math.abs(dy) < 6` at pointerup, so a tap on an icon is never swallowed.
  This is the one place where shrinking the hit area could regress the *expanded* dock, and it
  is why the abort threshold exists.
- **`collapseAfterMs === null`** (the landing demo's `placement="absolute"` mount) means the dock
  never collapses, so the gesture is inert there. That falls out for free; §9.E asserts it
  anyway.

---

## 8. Phase F — the oozing morph

**Depends on:** D and E. **Gate:** §9.F. **Commit:** `feat(mobile): the dock's gooey collapse`.

The plan's §3.4 gives the filter, the mandatory two-layer split and a choreography table. This
section gives the DOM, the keyframes and the flag. Everything below was chosen to satisfy §3.4's
four rules; where a choice was open, it went to the option that keeps `filter: none` at rest.

### 8.1 Structure

```
<nav>                                       fixed, pointer-events: none
  <div class="tp-dock-wrap">                width navWidth, height 78 | 64
    <svg class="tp-dock-defs">              width/height 0, aria-hidden — holds <filter>
    <div class="tp-dock-blobs">             LAYER A — filtered, solid shapes, no text
      <span class="tp-dock-blob" ×5>        one per slot, --slot-x set inline
      <span class="tp-dock-blob is-ind">    the active indicator droplet
    <div class="tp-dock-rest">              the crisp resting shape (see 8.3)
    <div class="tp-dock-icons">             LAYER B — unfiltered, above, the 5 buttons
```

**Layer B is mandatory, not stylistic.** The prototype applied the filter to the real dock with
its icons inside and blurred every icon into an unreadable smudge (plan §6.3). Icons cross-fade
on their own timeline and never enter the filtered subtree.

### 8.2 The filter

```html
<svg class="tp-dock-defs" aria-hidden="true" width="0" height="0">
  <filter id="tp-dock-goo" x="-60%" y="-60%" width="220%" height="220%"
          color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="b"/>
    <feColorMatrix in="b" type="matrix"
      values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"/>
  </filter>
</svg>
```

The explicit region is required: the default −10%/+10% clips a `stdDeviation: 8` blur and the
blobs get square edges at the boundary.

### 8.3 Rest versus transition — how "filter: none at rest" is actually achieved

Five 56px-wide blobs at a 56px pitch merge into a 280px bar under the filter, but with the filter
off they show visible scalloping at every join — the prototype found exactly this. So the blob
layer is a **transition-only** object:

| state | visible | `filter` |
|---|---|---|
| at rest, expanded | `.tp-dock-rest` as one crisp 280×48 r24 pill + icons | `none` |
| at rest, collapsed | `.tp-dock-rest` as the crisp 56×4 handle | `none` |
| mid-transition | `.tp-dock-blobs`, `.tp-dock-rest` hidden | `url(#tp-dock-goo)` |

Toggle on `transitionstart`/`transitionend` (or `animationstart`/`animationend`), **never on a
timer** — a timer can leave the filter on if a transition is interrupted, and a permanently
filtered dock is a permanent GPU cost on every screen.

### 8.4 The choreography

Blobs are a fixed 56×48 box with `border-radius: 24px` and `transform-origin: 50% 100%`, animated
by transform only, so the whole morph is composited. `--slot-x` is set inline per blob from the
slot centres the component already measures (`calcLeft`, `TerminalDockView.tsx:133-140`).

```css
/* Collapse — 420ms. --m-ease-out, NOT a back-out curve: index.css:60-71 forbids
   overshoot on anything that clips or clamps, and this squashes to 4px. */
@keyframes tp-dock-collapse {
  0%   { transform: translateX(var(--slot-x)) scaleY(1); }
  35%  { transform: translateX(calc(var(--slot-x) * 0.80)) scaleY(0.92); }
  70%  { transform: translateX(0) scaleY(0.50); }
  100% { transform: translateX(0) scaleY(0.0833); }   /* 48 × 0.0833 = 4px */
}
@keyframes tp-dock-expand {
  0%   { transform: translateX(0) scaleY(0.0833); }
  30%  { transform: translateX(0) scaleY(0.42); }
  70%  { transform: translateX(calc(var(--slot-x) * 0.88)) scaleY(0.94); }
  100% { transform: translateX(var(--slot-x)) scaleY(1); }
}
/* Icons — layer B, their own timeline, always outside the filter. */
@keyframes tp-dock-icons-out { 0% { opacity: 1; transform: scale(1); }   35%,100% { opacity: 0; transform: scale(0.7); } }
@keyframes tp-dock-icons-in  { 0%,65% { opacity: 0; transform: scale(0.7); } 100% { opacity: 1; transform: scale(1); } }

.tp-dock-blobs.collapsing .tp-dock-blob { animation: tp-dock-collapse 420ms var(--m-ease-out) both; }
.tp-dock-blobs.expanding  .tp-dock-blob { animation: tp-dock-expand   480ms var(--m-ease-out) both; }
.tp-dock-icons.collapsing { animation: tp-dock-icons-out 420ms var(--m-ease-soft) both; }
.tp-dock-icons.expanding  { animation: tp-dock-icons-in  480ms var(--m-ease-soft) both; }
```

Read against the plan's §3.4 table: 0–35% the icons leave and the blobs barely move; 35–70% they
converge and the goo merges them into one lozenge with no discrete parts; 70–100% the lozenge
thins to the handle. Expand is the reverse, icons last.

The wrapper's own `height` transition keeps its 0.5s but changes curve to `var(--m-ease-out)` —
the current `cubic-bezier(0.34,1.56,0.64,1)` on `height` is one of the three violations in §1.8.

### 8.5 DK3 — the flag

Oliver accepted the recommendation: the goo is an enhancement behind one flag, with a
geometry-only fallback, and **the timing must not depend on the filter**.

```ts
/* features/navigation/dock-morph.ts */
export const DOCK_GOO_DEFAULT = true;
export const gooEnabled = () =>
  (typeof window !== "undefined" && (window as any).__TAPT_DOCK_GOO__ === false)
    ? false
    : DOCK_GOO_DEFAULT;
```

The flag controls **only** whether `filter` is applied to `.tp-dock-blobs`. The same keyframes,
the same durations, the same easings run either way — with the filter off the five blobs read as
five shapes squashing and sliding together rather than one mass oozing. That is the "melting"
fallback DK3 describes, and because nothing about the timing is conditional, turning the flag off
on iOS cannot produce motion that is merely *present* rather than *correct*.

`window.__TAPT_DOCK_GOO__` is also how §9.F drives the fallback branch without a rebuild.

### 8.6 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .tp-dock-blobs { display: none; }
  .tp-dock-rest, .tp-dock-icons { animation: none !important; transition: opacity 150ms linear; }
}
```

Skip the goo entirely, cross-fade in ~150ms. The precedent block is `index.css:1098-1115`; the
JS-side precedent for reading the query is `desktop/bucket-morph.ts:213-219`. Under reduced
motion `filter` must never be set at any sample — §9.F asserts it.

---

## 9. Gates

All of these go in `scripts/verify-terminal-dock.mjs`, which exists (484 lines) and already
gates Phase A's clauses across six portrait phones. Two standing rules:

- **Exit non-zero on failure.** Several older scripts in this repo collect errors and still exit
  0. The file's own header forbids that; keep it true.
- **Assert numbers, not presence.** The companion's v1 defect was a token that computed to `0px`
  with no error, and §1.2's is a token that computes to its cap. A gate that checks
  "is it set" passes both. Every clause below names a value.

### §9.B0 — the class contract
Per file, the count of each class: retail 2/7/1 home/feature/plain, property 1/11/0, trades
1/8/0. **Assert per file, not in total** — five components return `.tp-screen` from two branches
and a total would hide a missed branch. Total feature = **26**, not 27 (§1.4).

### §9.B1 — the token layer
At a 390px container, `--u` is exactly `4px` and every derived token equals its authored value
(one assertion covers all thirteen). At 320/360/375/390/412/430, `--sp-6 / --sp-3` is constant to
three decimals. `--hero-pref` is 191.1 at 568 and 284.0 at 844. No token computes to `0px`.

Extend `__tests__/terminal-css-scoping.test.ts` with one static clause: `terminal-tokens.css` is
imported by all four hosts (§3.1). A token layer that one vertical does not import fails silently
into `var()` fallbacks, which is the same failure shape as RC-6 and the reason that guard exists.

### §9.B2 — the grid  *(plan §4.2 clauses 1, 3, 5, 6, 7)*
1. Nothing past the viewport: `screen.getBoundingClientRect().bottom <= innerHeight + 1`.
2. Overflow is contained, not clipped: where `.tp-panel-body.scrollHeight > clientHeight`, its
   computed `overflowY` is `auto` **and** `scrollTop` can reach `scrollHeight - clientHeight`.
3. `getComputedStyle(panel).containerType === 'size'`. Without it §5's `100cqh` resolves against
   the viewport and the keys come out wrong, silently.
4. Sweeping height 932 → 568, `panel.height` never falls below `--panel-min`, and the hero
   reaches `--hero-min` before the panel reaches its own minimum.
5. `.tp-plain` takes no grid: `getComputedStyle(dockPlaceholder).display !== 'grid'`, and its
   bottom padding still clears the dock.
6. No element under `features/terminal/**` has computed `position: fixed` (the `contain`
   consequence — static grep plus a runtime sample).
7. Plan §4.2 clause 2 — nothing interactive inside the dock band — already gated by Phase A;
   it must stay green, and it is the single most important assertion in this plan.

### §9.C — the keypad  *(reported, not blocking, under DK1)*
`--kp-size` equals §5.2's table ±0.5px at each of the six viewports — **the table, not
"non-zero"**. All four key rows have `rect.bottom <= panelBody.bottom`. Print the per-viewport
result; a miss is a tuning signal, not a failure (DK1).

Add one **blocking** clause, because it is the trap in §1.2: assert `--kp-size` resolves to
different values at 320 and 390. A single value at both means the container query is not
resolving and the token has silently pinned to its cap.

### §9.D — the collapse
`--dock-h` reports **64** on a feature screen and **78** on home, within one frame of the screen
change. With `publishDockState` unset (the landing demo, the desktop app) the store stays
`"auto"` and `--dock-h` never changes.

### §9.E — the gesture  *(plan §4.3, all nine)*
1. **The 30-point probe becomes the regression test**: 0 of 30 points across the collapsed
   wrapper expand it, except points inside the ~120×36 handle, which all do.
2. A 56px upward drag expands; a 20px drag settles closed.
3. A flick faster than 0.4px/ms expands regardless of distance.
4. A downward drag when expanded collapses it; a tap on a dock icon still calls `onPick` and
   does **not** collapse (the `< 6px` abort).
5. `Enter` and `Space` on the handle expand it and flip `aria-expanded`; the handle has an
   accessible name. **A pointer tap does neither.** Assert both halves.
6. A scroll flick starting in the bottom 80px of every mobile route still scrolls the page.
7. `touch-action: none` is present on the handle and absent on the wrapper.
8. `--dock-h` on `document.documentElement` reports 78 / 64 / 0-or-unset, tracking the transition
   rather than jumping at the end. *(Shipped in Phase A; keep it green.)*
9. With `placement="absolute" collapseAfterMs={null}` the dock never collapses and the gesture
   does nothing.

### §9.F — the morph  *(plan §4.4, all seven)*
1. `filter` computes to `none` at rest in **both** states — sampled after `animationend` and
   again after 2s idle.
2. The filter is live mid-transition, sampled at ~50%, so clause 1 cannot be satisfied by never
   turning it on.
3. No icon node is a descendant of the element carrying `filter`, and each icon's own computed
   `filter` is `none`.
4. Under `prefers-reduced-motion: reduce`, `filter` is never set at any sample and the transition
   completes within ~150ms.
5. The `<filter>` element carries explicit `x`/`y`/`width`/`height`.
6. The `<nav>` stays `position: fixed` with an unchanged rect while the filter is applied.
7. Frame budget recorded as a baseline: no frame over 32ms across the animation on CI Chromium.
8. **With `window.__TAPT_DOCK_GOO__ = false`**, `filter` is never set, and the animation's
   duration and end geometry are **identical** to the goo path. This is DK3's binding
   constraint, and it is the clause that catches a fallback that merely moves.

### Regression boundaries — green throughout, no exceptions
`__tests__/terminal-dock-view-boundary.test.tsx` (the purity boundary),
`__tests__/tutorial-registry.test.ts` (spotlight anchors on all three verticals), the landing
demo's `placement="absolute" collapseAfterMs={null}` mount, and the tablet/desktop app
(`verify-desktop-p0.mjs`, `probe-cascade.mjs`, `probe-transitions.mjs` — and note
`probe-transitions` cannot exit 0 for unrelated reasons; read its summary line).

---

## 10. Order, and what is safe to land alone

```
B0 → B1 → B2 → C          the panel; B0/B1 are the companion's 2b and 6, landed from here
        E → D             build D first if you like, but E ships first or with it (DK2)
              F           only after D and E
```

- **B0, B1, B2 and C are one dependency chain** and each needs the previous one's gate green.
- **E is independent of the whole panel chain** and can land at any time. It removes the
  "expands if you brush it" defect on its own.
- **D must not reach users ahead of E** (§6.4). This is the one hard release constraint.
- **F depends on D and E.** The morph is only worth building once the collapsed state is one you
  enter deliberately.
- **The real-device pass** for the goo and for `touch-action` is still owed and cannot be done
  headlessly — fold it into the iOS gate pending in `HANDOFF-2026-07-28` §7.2. Headless Chromium
  showed no measurable frame cost, which proves the budget is not blown, not that it is free.

### What may not change, in any phase
From the plan's §4.6, because a geometry gate will happily pass a redesign: the dock's slot
order, its icon set, the identity and colour of the active indicator, which region of each screen
is navy and which is off-white (including `CashSuccess`'s inversion), and every label.
Adaptable: key size within its 76px cap, padding and gaps within their token ranges, whether the
panel body scrolls, and the hero's proportion of the screen.

**And note what none of this depends on:** if DK2 were ever revisited to "hide", `--dock-h`
resolves to `0px` and every rule in §4 and every assertion in §9 holds unchanged. Nothing here
depends on the dock existing — only on its height being measured rather than guessed.
