# Phase 2 outcome — the four stylesheets are scoped (RC-6 closed)

Date: 2026-08-20 · Branch `feat/tablet-desktop-app`
Plan: `docs/PLAN-2026-08-17-mobile-responsive-ui.md` §5.1, §9 phase 2
Gate: "§7.4 clean; anchors resolve on all three verticals" — **met**

> This is a separate file rather than an edit to the plan because a second
> session was editing §6.1 of the plan, the amendment and the companion at the
> same time. Fold §3 below into the plan when that work settles.

---

## 1. What landed

| Was | Now |
|---|---|
| `RetailTerminalViewCore.jsx:1462` `TP_CSS`, unscoped `<style>` literal, 132 rules | `features/terminal/retail/retail-terminal-view.css`, every rule under `.retail-terminal-view` |
| `PropertyTerminalView.tsx:1351` `TP_TERM_CSS`, unscoped, 99 rules | `features/terminal/property/property-terminal-view.css`, every rule under `.property-terminal-view` (the class is new on the root) |
| `pages/trades/trades-terminal.tsx:520` `TP_TERM_CSS`, unscoped, 95 rules | **deleted**; `/trades/quote` now carries `.trades-terminal-view` and uses the feature sheet |
| `features/terminal/trades/trades-terminal-view.css` | already scoped; gained the one rule it was missing |
| 31 `@keyframes tp-*` definitions across five files, 15 distinct names | `features/terminal/terminal-keyframes.css`, one definition each |

The transform was mechanical and self-checked: each rule's declarations were
compared before and after scoping, and the run asserts the rule count is
unchanged and every selector carries its root. No declaration was edited.

**Verified in Chromium** on `/terminal`, `/property/terminal`,
`/trades/terminal` and `/trades/quote` at 390×844, reading the CSSOM rather than
`<style>` text: **zero unscoped `.tp-` rules and zero duplicated `tp-*`
keyframes on every route.** Each vertical now renders its own authored action
bar — retail 316×56, property and trades 241×48 — regardless of which terminal
was mounted first.

## 2. Three things found while doing it

**2.1 The trades send button could never appear. (live defect, fixed)**
`trades-terminal-view.css` was one rule short of the literal it was copied from
in `d325beb`: it had `.tp-send-slot { max-width: 0; opacity: 0 }` and no
`.tp-send-slot.show`. `TradesTerminalView.tsx:1087` renders
`` `tp-send-slot${sendVisible ? ' show' : ''}` ``, so selecting a client on the
trades terminal home added a class that matched nothing and the send shortcut
stayed collapsed at zero width. Confirmed from the CSSOM before the fix —
property had the rule, trades had no `.tp-send-slot.show` at all — and confirmed
resolving afterwards. It never showed up because the vertical that *did* have
the rule was declaring it globally on some route orders.

**2.2 There were six stylesheets, not four.**
`PropertyTerminalView.tsx:1112` and `TradesTerminalView.tsx:606` each carried a
second inline `<style>` inside the row action sheet, re-injected on every open,
both defining `@keyframes tp-fade` and `@keyframes tp-sheetup`. RC-6's inventory
missed them because they declare no `.tp-` selector — only keyframe names, which
a selector-shaped guard cannot see. Both are now in the shared keyframes file.

**2.3 Deleting the fourth sheet removed the app's only request for Outfit 800/900.**
`TP_TERM_CSS` opened with
`@import url('…Outfit:wght@400;500;600;700;800;900…')`. `index.css:1` and
`index.html:211` both stop at 700. So `/trades/quote` was rendering `.tp-amount`
(`font-weight: 800`) in a real 800 while `/trades/terminal` synthesised it — two
routes, same screen, different type. Removing the import makes them agree. This
is the hard half of **MD6**, and A1 §4.3 already records that `--amount-k` was
calibrated against a weight that is not loaded; **phase 3's goldens still need
MD6 answered first.**

## 3. Corrections the plan needs

**3.1 §6.6.1 trap 4 and §1 MD7 — do not move `QuoteScreen`.**
Both say `QuoteScreen` (`pages/trades/trades-terminal.tsx:34`) should move into
`features/terminal/trades/`. It must not. `QuoteScreen` is a *controller*: it
uses `useQuery`/`useMutation`, `queryClient`, `fetch(`, `navigator.clipboard`,
`document.createElement` and `window.location`.
`__tests__/trades-terminal-view-boundary.test.tsx:16-28` forbids every one of
those inside `features/terminal/trades/**`, so the move fails the boundary test
on five rules and inverts the controller/view split the test exists to enforce.
The screen it renders — `QuoteView`, the part with the `.tp-screen` markup — is
already in the feature module. **The extraction is finished; nothing is left to
move.** This is the same shape of error as MD7 itself: the plan read a
controller as a stray screen.

**3.2 §7.2's RC-6 counter measured the wrong thing.**
Phase 1 counted `<style>` tags whose text matched `/\.tp-subbar\s*\{/`. That
proxy fails twice: `.retail-terminal-view .tp-subbar {` *contains*
`.tp-subbar {`, so scoping — the fix — pushed the number **up** (1 → 3), and
reading `<style>` text cannot see an imported sheet or a keyframe collision at
all, which is how 2.2 survived the inventory. Replaced with two CSSOM counters,
`tpUnscopedRules` and `tpDuplicateKeyframes`, both baselined at **0** — a hard
ratchet: no unscoped `.tp-` rule can ever come back unnoticed.

**3.3 §5.1's shared-primitives extraction is deferred to phase 6.** *(deviation)*
§5.1 asks for a `terminal-primitives.css` after scoping. A three-way diff of the
three sheets says 67 rules are identical in all three, 8 in two, **24 diverge**
and 59 belong to one vertical. Every divergence is either palette
(`#58ABFF`/`#040D6D` vs `#F4F4F4`) or a number phase 6 is about to tokenise:
`.tp-subbar` `scale(0.85)`, `.tp-subbar-btn` padding 25 vs 22, `.tp-subbar-ind`
z-index 0 vs 2, `.tp-viewport` `100vh` vs `100svh`, `.tp-amount` weight 900 vs
800, `.tp-toast` bottom 28 vs 110. Extracting now means inventing an ad-hoc
variable layer that phase 6 immediately rewrites, and touching all three sheets
twice. What *was* extracted is the part phase 6 cannot express and scoping
cannot fix: the keyframes, which are global by definition.

## 4. Guards added

- `client/src/__tests__/terminal-css-scoping.test.ts` — no `.tp-` rule outside
  its vertical root in any vertical sheet; no `<style>` template literal
  declaring a bare `.tp-` selector anywhere under `client/src`; each `tp-*`
  keyframe defined exactly once. All three were mutation-checked: each fails on
  a deliberate break and passes when it is undone. The keyframe clause was
  matching against the file *path* rather than its contents on the first pass —
  the mutation check is what caught it, and fixing it is what surfaced 2.2.
- `client/src/__tests__/tutorial-registry.test.ts` — every phone-terminal
  spotlight anchor (`.tp-amount`, `.tp-subbar`, `.tp-pfab`, `.tp-viewport`,
  `[aria-label="send"]`, `[aria-label="new rent request"]`,
  `[aria-label="new invoice"]`) is still rendered by its view, and still has a
  rule inside its own vertical's scope. Both mutation-checked. This is RC-6's
  quiet failure: an anchor that stops matching falls back to `.tp-viewport` and
  spotlights the whole screen, which reads as a design choice rather than a bug.

## 5. State

`tsc` silent · `jest` 69 suites green · `vite build` 19.06s ·
`verify:mobile` no regressions, unscoped `.tp-*` 0 max, duplicate keyframes
0 max · `verify:terminal-dock` unchanged at 18 findings — confirmed identical
before and after this work by re-running it against reverted sources, so phase 2
neither fixed nor broke anything the dock gate sees.

The other counters are untouched and still record the unfixed defects: 210
controls pinned at 44px, `visibleStackRows` floor 0 against a contract of 3, 10
clipped text nodes, 9 tap-centre misses.

**Next:** 2b (the screen-class contract), then 3 — which is blocked on MD6 (§2.3).
