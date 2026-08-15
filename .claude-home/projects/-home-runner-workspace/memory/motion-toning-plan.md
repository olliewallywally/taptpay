---
name: motion-toning-plan
description: "App-wide transitions feel \"violent\" — root cause is one over-used back-out curve compounding with bounce keyframes; plan at docs/PLAN-2026-08-15-motion-toning.md"
metadata: 
  node_type: memory
  type: project
  originSessionId: 61223ce1-29f2-4efb-8cbd-1eb56aea8097
  modified: 2026-08-15T09:18:26.039Z
---

Oliver flagged (2026-08-15) that transitions across the whole app are too violent and
the bounce/pop cascade is too much. Plan lives at
`docs/PLAN-2026-08-15-motion-toning.md`; its §7 records exactly what landed.

**Done, uncommitted:** Step 0 (motion tokens on `:root`, two-keyframe
`.pt-fade`/`.pt-bounce`/`.pt-pop` tiers, `desktopBounceIn`→`desktopRiseIn`) plus the
whole tablet/desktop pass — 17 files, tsc clean, cascade probe 13/13.
**Still owed:** the 5 mobile Property screens, then Trades/Retail/Settings on mobile.

The non-obvious mechanism: `cubic-bezier(0.34, 1.56, 0.64, 1)` is used 78× across 18
files as the app's de-facto default. It overshoots **9.8%**, and in CSS that curve
applies to *every keyframe interval* — so it compounds with the already-bouncing
`bouncePopIn` / `desktopBounceIn` keyframe sets. Measured result: an element travels
~41px through 5 direction reversals to move 0px. Fix is 2-keyframe entrances where any
overshoot comes only from the easing curve.

**Why:** it reads as a diffuse taste problem but is one shared curve plus two shared
keyframe sets. Step 0 of the plan (3 files: `client/src/index.css`,
`client/src/desktop/desktop.css`, plus token block) removes most of it across all three
verticals, because the 15 desktop pages only set `--dt-i`/`--dt-d` and need no edits.

**How to apply:** don't chase individual components first — land Step 0, re-verify, then
re-tier call sites. Keep the `.pt-bounce` / `.dt-cascade` class names and redefine them;
renaming would churn ~25 call sites for nothing.

Two traps this pass hit, both of which fail *silently*:
- `scripts/desktop-shots/probe-cascade.mjs` hardcodes the cascade keyframe name and a
  sampling window. Rename the keyframe without updating it and it reports "NO CASCADE"
  on every screen. Its name now lives in one `CASCADE_KEYFRAME` constant.
- `.dt-rise` / `.pt-*` / `tileIn` all ship `opacity: 0` with an `animation: … both`
  fill. Any change that makes the duration resolve to `0s` — an unresolved
  `var(--m-dur-*)` token, say — leaves the element *permanently invisible*, not merely
  un-animated. Verify tokens resolve in-browser after touching them.

`--dt-d` values encode step counts, not arbitrary delays ("start at step 4" = 4 ×
step), so rescale them whenever the stagger step changes rather than leaving them.

Related: [[desktop-transitions-work]], [[review-2026-08-15-full-app]],
[[taptpay-design-language]], [[playwright-nix-chromium]]
