# R1-T10e accessibility implementation — 2026-10-11

Bounded engineering checkpoint on `fix/qwen-aligned-20261010`, exact base
`10f12c8d9e6a6317b1416fd1a71f4c769e03aa0d`. The implementation is the commit containing this record;
publication verification is recorded by the subsequent handover checkpoint.
**T10e/T10f/R1/release and final independent acceptance remain open.**

The batch repairs captured contrast and target findings, closed-region keyboard
exposure, modal naming/confinement/Escape/return, input names and local alerts,
report/timeframe/channel states, analytics tab keys, focused animated rows and
keyboard rent/job actions. Native zoom preserves device classification and text
enlargement, with named scrolling and narrow phone reflow. Reduced-motion handling
covers CSS, the existing Framer provider, animated rows and landing runtime paths.
No business API, provider, payment calculation, database/schema or golden change.

## Fresh checks

- Typecheck and isolated production client/server builds: exit 0.
- Full client suite: **124 suites / 1,458 tests**, exit 0, default assertions and
  bounds, without browser/build concurrency. Earlier adverse runs remain recorded.
- Axe diagnostics/privacy, real keyboard, dialogs, motion and native scrolling
  controls pass. Geometry has **36 fixtures**, including covered and null-hit
  negatives. New motion controls retain both long and permanent-animation faults.

| Final browser variant | Phone | Tablet | Desktop | Short desktop | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal surfaces | 51 | 51 | 51 | 51 | 204 |
| Native 200% zoom surfaces | 51 | 51 | 51 | 51 | 204 |
| Reduced-motion surfaces | 51 | 51 | 51 | 51 | 204 |
| Normal active tutorials | 22 | 22 | 22 | 22 | 88 |
| Native 200% zoom active tutorials | 22 | 22 | 22 | 22 | 88 |
| Reduced-motion active tutorials | 22 | 22 | 22 | 22 | 88 |

**876/876 selected cells pass, zero missing runs, zero recorded violations/faults.**
All 24 selected runs have actual exit 0 and unchanged within-run checkers. Active
coverage includes **528 keyboard cases / 1,146 settled contrast samples**. The
summary validates 36 seeded terminal observations, requiring mounted rows and
recorded native reachability when zoom initially places every row offscreen.
These are bounded checks of the documented surfaces and interactions.

## Reproducible provenance

Frozen client `candidate-14/public`, 422 files, under private artifact root
`/workspace/reviews/r1-t10e-completion-2026-10-11/`. Build tree SHA256:
`1dddc402e3b0d31baf4d32b7eb09710da4756fd0eb97abc9f21c3988e8a63f90`.
Client source: 680 file hashes, unchanged since freeze. Full raw-report, checker,
build/source and log hashes are in the
[structural summary](R1-T10e-completion-browser-summary-2026-10-11.json), SHA256
`402deece1269a44e00f223e46c8c1dea75410ff23701fbc299ba0976c9545bb3`. Keep raw artifacts private; no screenshot or build asset is committed.

Normal/zoom checks finished before the atomic reduced-motion sampler correction.
They retain their own frozen checker manifest. Byte reconstruction proves that
replacing the single reduced-only driver line and removing the new helper restores
both original hashes; all normal/zoom paths and existing motion capture/audit are
unchanged. Fresh reduced surfaces and all tutorial variants use the corrected
manifest. Each selected run's provenance is explicit; the four reduced development
runs spanning that edit are retained with wrapper exit 2 and are excluded.

Commands: `npm run check`; `npm run test:client -- --runInBand`; isolated
`npx vite build --outDir <private-build>/public` and server esbuild; each committed
`verify-*-audit.mjs` control script and `verify-device-geometry.mjs`. Run
`node --import tsx scripts/verify-r1-t10-device-matrix.ts <private-output>
<private-build>/public --context <context> --accessibility --diagnostics --keyboard
--dialogs`, adding `--zoom` or `--reduced-motion`. Tutorial variants instead use
`--tutorial-accessibility` and the same context/variant flags.
Set `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium`; keep browser concurrency at four
or fewer and run the full client suite without browsers. No live DB/provider used.

## Incomplete/experimental assessment and remaining acceptance

Incomplete results remain **review candidates**, not passes: color-contrast
538 audit findings / 6521 nodes;
aria-hidden-focus 9 / 27;
aria-prohibited-attr 12 / 12.
Counts include repeated scans/states and are not independent defects.

The hidden-focus candidates occur in the open phone stock sheet: the Radix-hidden
`#root` and Radix focus guards. Actual dialog Tab/Shift-Tab confinement, visible
focus, Escape and return all pass, but AT behavior still needs acceptance.
The prohibited-attribute candidates identify a named generic span on
`/pay/return/:state`; inspect its intended semantics before closing T10e.
Computed diagnostics do not establish every image/gradient/overlap contrast case.
Retain those and experimental label/heading/table candidates for manual review.

Native zoom is the actual Chromium 200% setting, with halved layout viewport,
DPR 2 and visual scale 1 recorded. Chromium mobile emulation ignores that setting;
zoom runs therefore use desktop rendering at the original physical size/pointer.
Actual mobile Safari enlargement, browser chrome, keyboards, orientation, screen
readers, JS/Canvas motion and owner visual/golden acceptance remain pending.
Follow the [manual checklist](R1-T10e-manual-acceptance-2026-10-11.md).

Review: [preflight and separate rereads](R1-T10e-completion-preflight-2026-10-11.md),
[publication review](R1-T10e-completion-review-2026-10-11.md),
[retained history](R1-T10e-completion-regression-history-2026-10-11.md).
Rollback: revert the implementation commit; no data rollback/migration required.
Deployment remains with Oliver on Replit.
