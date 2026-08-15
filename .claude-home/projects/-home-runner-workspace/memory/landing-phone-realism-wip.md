---
name: landing-phone-realism-wip
description: "WIP (uncommitted, 2026-08-08) — landing phone rebuilt to autoplay as a real session with visible taps; 8/8 scenes done, browser re-verify owed"
metadata: 
  node_type: memory
  type: project
  originSessionId: 80ce5a45-c1c9-4c22-9831-56eb6197962c
  modified: 2026-08-08T11:39:56.101Z
---

**Paused at Oliver's request 2026-08-08. All work is UNCOMMITTED in the working
tree on `feat/tablet-desktop-app`.** Nothing is stashed — do not stash it
([[git-stash-hides-untracked]]).

## What Oliver asked for (two rounds)

1. First: the phone demo shouldn't be scrubbed by scroll — "do the action like a
   video… on repeat". Also: no overlapping buttons, good padding. And "the live
   app demo at the button… needs to be the full demo app".
2. Then, after seeing round 1: **"it's not what I want"** — it must "look natural
   and see button presses and animations etc", every scene must "start on the
   main terminal page and or dashboard whatever suits for that section", and it
   must "work exactly like someone is using it in front of me".

Two decisions he made when asked:
- **Autoplay within the beat**: scroll still picks *which* scene, so the cinematic
  caption always matches the screen; the scene then plays itself on a loop. (The
  cinematic act's captions/HUD are scroll-driven and paired 1:1 with the 8 scenes,
  so a fully decoupled phone would contradict the words beside it.)
- **"Try it live" → seeded demo merchant + sandbox token** (not a new-tab link).

## Done and verified

Infrastructure (all in `client/src/pages/landing-phone/`):
- `reducer.ts` — scroll now only picks the scene (`sceneAtProgress`). New pure
  `stepAtElapsed(beats, elapsed)` + `cycleLength(beats)` + `uniformBeats()`.
  Timing vocabulary: `TAP_MS` 300 / `BEAT_MS` 780 / `DWELL_MS` 1150 / `HOLD_MS` 2100.
  Per-step `beats` exist because a uniform beat reads as a robot advancing slides.
- `TAP_MS` is deliberately **equal to the `lpTap` CSS animation duration** — the
  ripple unmounts when the press step ends, so a longer animation is cut off
  mid-expand. Changing one requires changing the other (noted in both files).
- `primitives.tsx` — new `<Press on seq radius>`: sinks the control and ripples
  from its centre. `seq` keys the ripple so a repeated press on the *same* control
  (typing 2, 2) restarts it. Rendered **by** the control, never positioned from a
  coordinate table, so it cannot drift when padding changes.
- `landing-phone.css` — `.lp-press`, `.lp-tap`/`@keyframes lpTap`, `.lp-screen-in`,
  and a reduced-motion block that kills all three.
- `Screen` carries `lp-screen-in`; scenes key frames on a `screen` identity string
  so four keypresses on one keypad do **not** re-animate it but leaving it does.
- `LandingPhoneDemo.tsx` — `useAutoplayStep(scene, beats, playing)` (rAF, clamps
  deltas to 250ms), keyed on **scene not steps** (four scenes share a step count).
  Reduced motion / Save-Data get the finished frame and no clock at all.
- `useStoryProgress.ts` — new `useOnScreen`, parks the clock off screen. Note the
  comment there: progress itself must *not* be observer-gated (a jump past the
  story crosses no threshold and freezes it) — that bug was fixed in `28e8b96`.

All 8 scenes rewritten as `FRAMES` scripts (frames a viewer sees, not milestones),
each opening on its vertical's real home surface:
- `retail-sale` 16, `retail-split` 18 — terminal home, `+`, digits one at a time
- `trades-invoice` 19, `quote-deposit` 13 — `JobsHome` (now exported)
- `rent-weekly` 18, `property-bill` 19 — `HomeScreen` (now exported)
- `overview` 7 — is the dashboard; dock/action presses drive the vertical changes
- `checkout-wallet` 8 — customer-side, so it opens on the payment link (correct)

Verified: `npx tsc` clean · `npx jest landing-phone-scenes` **27/27** ·
`npm run build` green (which also proves the property↔rent import cycle below is
safe) · `scripts/verify-landing-phone-autoplay.mjs` **9/9** (that run predates the
scene rewrites — rerun it).

New scripts, all working:
- `scripts/verify-landing-phone-autoplay.mjs` — the autoplay acceptance gate.
- `scripts/filmstrip-landing-phone.mjs` — shoots one full cycle of a scene.
  Must use a **clipped page screenshot**, not `element.screenshot()`: the
  cinematic rig animates forever so Playwright's stability wait never settles.
- `scripts/audit-landing-overlaps.mjs` — overlap/padding audit. Only judges
  controls **inside the viewport band**; measuring the whole document lies,
  because the mobile Industries phone is `display:none` until its reveal tab is
  tapped and the cinematic phone is inside a `position:sticky` viewport.

## Bug found and fixed on the way

`manifest.ts`'s docblock has always claimed `landing-phone-scenes.test.ts`
asserts its `SCENE_STEPS` matches the registry. **It never did**, and they had
silently drifted. That is not cosmetic: the Industries phone rests on
`SCENE_STEPS - 1`, so a stale count leaves a tab on a half-finished workflow. The
assertion now exists ("keeps the landing page manifest in step with the registry").

## Still owed

1. **Rerun the browser gates** — the autoplay 9/9 predates the 8-scene rewrite.
   Also rerun `scripts/verify-landing-phone-browser.mjs` (was 67/74 at `28e8b96`).
   Dev server must be a single instance on :5000 ([[dev-server-single-instance]]),
   chromium via nix-store ([[playwright-nix-chromium]]).
2. **Eyeball each scene's filmstrip.** Only `retail-sale` has been looked at
   frame by frame (terminal home → FAB ripple → lit keypad digit all confirmed
   good). The other seven are typechecked and built but not visually reviewed.
3. **Task 2 — overlaps/padding: not started.** The audit script runs and currently
   reports only two 5px gaps between the Industries tabs; the earlier run was
   invalid (measured elements thousands of px off screen). Re-run it now that it
   only judges on-screen controls, and check the magic-numbered
   `.tp-phone-live` at `landing-page.tsx:472` (`position:absolute; top:472px;
   left:80px` inside `.tp-tilt-inner`, whose `.tp-phone` is `top:-114px;
   height:545px`).
4. **Task 3 — the demo app: not started.** `client/src/pages/demo-terminal.tsx` is
   a 1440-line **orphan** — lazy-imported at `App.tsx:27`, routed nowhere. It is
   fully authenticated (`/api/auth/me`, `authToken` from localStorage, merchant
   SSE, real `POST /api/transactions`) and there is **no** demo/mock mode server
   side (that was removed when the app went production-only, see
   [[checkout-redesign-handoff]]). Oliver chose seeded demo merchant + scoped
   anonymous sandbox token; public write surface must be sandboxed + rate-limited.
   Beware: `scripts/verify-landing-phone-browser.mjs` has a FORBIDDEN rule that
   fails the build on **any** `/api/` request from the landing page — it will need
   scoping to the story phone once the demo app can call an API.

## Traps

- **Import cycle**: `property-bill.tsx` ⇄ `rent-weekly.tsx` (property-bill imports
  the shared property chrome from rent-weekly; rent-weekly now imports
  `HomeScreen` back). It works because both are hoisted `export function`
  declarations only called inside render closures, and the build is green — but
  the clean fix is to move the property chrome into its own module, the way
  retail-sale → retail-split is one-directional.
- The working tree **also holds another session's desktop work** (`App.tsx`,
  `client/src/desktop/**`, `client/src/features/tutorial/tutorial.tsx`,
  `scripts/verify-desktop-p0.mjs`, `client/src/lib/desktop-chrome-route.ts`).
  Do not stage those with the landing work. Per CLAUDE.md, never `git add -A`;
  exclude `.claude-home/**` and `.claude/settings.local.json`.

Related: [[landing-phone-demo-status]], [[taptpay-design-language]],
[[desktop-transitions-work]].
