---
name: mobile-44px-rule
description: Mobile UI breakage root cause — a blanket min-height/min-width 44px on all buttons under 640px; plan at docs/PLAN-2026-08-17-mobile-responsive-ui.md
metadata: 
  node_type: memory
  type: project
  originSessionId: 77407836-b974-40ea-96f0-bff2e237e95e
  modified: 2026-08-20T08:52:21.057Z
---

Investigated 2026-08-17 on `feat/tablet-desktop-app`. Oliver reported five mobile UI
bugs; four share one cause: `client/src/index.css:360-368` applies
`min-height: 44px; min-width: 44px` to every `button`/`[role=button]` inside
`@media (max-width: 640px)`. `min-height` beats `height`, so every component that sets
its own height is inflated **on phones only** — `.tp-subbar-btn` 27→44, `.tp-send` 37→44,
`.tp-pill` 30→44, `.tp-stack-hdr` 24→44. The action-bar highlight (`.tp-subbar-ind`) is a
`<div>`, stays 27px, so the label's bottom sits 4.6px below the bubble.

**Why no test caught it:** the query is `max-width: 640px`, and every probe in
`scripts/desktop-shots/` runs at ≥1194px. `scripts/verify-mobile-retail-regression.mjs`
is the only mobile gate — one viewport (390×844), outer-box assertions only, and it
passes against the broken UI.

Other causes found: the highlight measures x/width only with no ResizeObserver (14.5px
drift after resize); `height: '50%'` + hardcoded `padding: '154px 22px 90px'` caps the
active stack at 0–2 rows on every phone; zero `clamp()` in 4,500 lines of terminal UI so
`$99999.99` (430px at the hardcoded 88px) clips on every device; retail uses `100vh`
while the rest of the app uses `100svh`; retail and property both inject **unscoped**
`.tp-*` global stylesheets with different values (property adds `scale(0.85)` and puts
the bubble's `z-index` above the label) — that's the intermittency.

Full plan, phases and gates: `docs/PLAN-2026-08-17-mobile-responsive-ui.md` (v2.1) and its
companion `docs/PLAN-2026-08-17-terminal-panels-and-dock.md` (v2). Both finished
2026-08-18 and **execution-ready**; both still untracked in git.
Artifacts: https://claude.ai/code/artifact/081ea87a-1585-48fc-8746-fedd260e1875 ·
https://claude.ai/code/artifact/79e36b4a-29f0-46a7-84b4-98081b68a947

**DK1-DK4 settled 2026-08-19** (recorded in the dock plan's §7): DK1 *the panel may
scroll* — so clause 3 stops being fits-or-fails and clause 4 (4 keypad rows) drops to
reported-not-blocking, while clauses 1 and 2 (nothing past the viewport, nothing under the
dock) stay hard; DK2 *collapse, restored by an upward touch-grab* — which means **D must not
reach users ahead of E**, or every feature screen ships a dock that pops open when brushed;
DK3 and DK4 accepted as recommended.

**MD1 amended 2026-08-19** — `docs/AMENDMENT-2026-08-19-MD1-responsive-foundation.md`
(artifact https://claude.ai/code/artifact/d14e4a8a-4da8-44b6-aad7-519f27639325). Answer:
**fluid, but one length-valued unit** `--u: clamp(3.3px, 1.0256cqi, 4px)` with every value
`calc(N * var(--u))`, N = px/4 — it regenerates §6.1's whole 21-token calibration table to
within 2px from one number, and reproduces §4.3's budget (533.6/568). Scaled canvas
disqualified on measured grounds: 18% letterbox on every 16:9 phone, tap targets 31-36px, and
Radix portals escape a transform so modals would render unscaled over a scaled app.
Nine gaps the plan missed, found in the code — the two that matter: **the keyboard can hide
fields with no way to reach them** (25 inputs, `.tp-viewport`+`.tp-screen` both `overflow:hidden`
on a static `100svh`, zero `visualViewport` handling anywhere) and **`--amount-k` is calibrated
against Outfit 800/900, neither of which is loaded** (both font requests stop at 700, so it was
measured on a synthesised face). New decisions MD1a/MD8/MD9; new phase K.

**Phase A of the dock plan is DONE** (2026-08-19, `12414f2` + `2d3b24c`).
`TerminalDockView` publishes `--dock-h` on `document.documentElement` via ResizeObserver
(fixed placement only, cleared on unmount); feature panels whose bottom padding was under
78px now add it. New gate `scripts/verify-terminal-dock.mjs` — six portrait phones, 11 of
27 screens, exits non-zero. **390/412/430 are clean; 320/360/375 still fail (17 findings),
all `min-height: auto` refusals that Phase B unlocks.** Panels already at 100–110px were
left alone. Next: Phase B needs the companion's Phase 2b + Phase 6; D and E do not.

**MD7 settled from the code 2026-08-19 — the plan's premise was wrong.**
`pages/trades/trades-terminal.tsx` is not a second implementation and is not on `/trades/quote`.
It is the trades *controller*, mounted at `/trades/terminal` (`App.tsx:932-935`), rendering the
shared `<TradesTerminalView>` at `:459`, with `__tests__/trades-terminal-view-boundary.test.tsx:149-150`
enforcing that. `/trades/quote` is `quote-builder.tsx`, an 11-line fallback — and it is the ONLY
injector of `TP_TERM_CSS`, so RC-6's fourth unscoped stylesheet is live on one route, not the
vertical. That stylesheet is a duplicate of the scoped `trades-terminal-view.css` (no unique
classes; 39/66 selectors byte-identical), so it deletes — but 27 selectors split on `${VAR}`
interpolations and need a read by eye first. Retiring was never available. Real work = finish the
extraction (move `QuoteScreen`, delete `TP_TERM_CSS`, repoint quote-builder) inside phase 2.
Corrected in the plan's §1/§3 RC-6/§5.1/§7.1/§9 and in the amendment's §7.

**MD1 SIGNED OFF 2026-08-19 (fluid, single-unit).** Phase 1 committed as `88a56fa`:
`scripts/verify-mobile-responsive.mjs` + `scripts/mobile-fixtures.mjs` + a recorded
`verify-mobile-responsive.baseline.json`, wired as `npm run verify:mobile`. Gate scores
3 verticals x 6 viewports + safe-area runs against the baseline: counters must not rise,
visibleStackRows must not fall, a token computing to 0px always fails. It does NOT gate on
console errors (ORB-blocked dev banner — the bug that makes probe-transitions unable to exit 0).
Baseline of the broken UI: bar 56 (authored 39), btn 44 (27), ind 27, send 44 vs a 47.6 bar,
210 controls pinned at 44px, 2 colliding .tp-* stylesheets, visibleStackRows floor 0 (contract 3).
Property/trades needed new fixtures — retail-fixtures.mjs returns [] for both, so their stacks
were empty and the row contract was silently untestable.

**PHASE 2 DONE 2026-08-20 but DELIBERATELY UNCOMMITTED** — Oliver's call, because a second
session was landing phase 6 into the same eight files while it finished (it broke the build
with a bad `../terminal-keyframes.css` import from `features/navigation/`, fixed; its
`terminal-tokens.css` ships 8 deliberately-unscoped `.tp-` rules and regresses trades
tapInflated 5→6 / tapCentreMiss 0→1). Full record, and the three plan corrections it needs
folded in, are in `docs/NOTE-2026-08-20-phase-2-scoping-outcome.md`. In brief: all three
literals are now real scoped `.css` files (`.retail-` / `.property-` / `.trades-terminal-view`),
the fourth is deleted, 31 keyframe definitions became 15 in `terminal-keyframes.css`, and two
guards (`__tests__/terminal-css-scoping.test.ts`, tutorial-anchor assertions) are
mutation-checked. Three finds: the **trades send button could never appear** (the scoped sheet
was one rule short — no `.tp-send-slot.show`); there were **six** stylesheets not four (both
row action sheets inline two keyframes, invisible to a selector-shaped guard); and deleting the
fourth removed the app's **only** Outfit 800/900 request, so MD6 now hard-blocks phase 3.
**Do not move `QuoteScreen`** as §6.6.1 trap 4 says — it is a controller and the move fails
`trades-terminal-view-boundary.test.tsx` on five rules.

**NEXT:** 2b (screen-class contract), 3 (goldens — MD6 first), 4 (app-wide control inventory),
5 (remove RC-1 + re-axis to `pointer: coarse`), K (keyboard). MD2/MD5 still have only assumed
answers; §2.1 design references still need Oliver's confirmation as authoritative. Decisions are
namespaced MD1–MD7 / DK1–DK4 because both plans originally numbered theirs `D1…`.

**Why:** the fix order matters — the action-bar invariants cannot hold while the 44px
rule is live, so Phase 1 precedes everything, and the gate goes in first (failing).

**How to apply:** before touching mobile CSS, check whether a global rule in that
`@media (max-width: 640px)` block (lines 360–473, also `label`/`input`/`table`
`!important` overrides) is already fighting the component. Related: [[ui-consistency-plan-2026-07-12]],
[[motion-toning-plan]].
