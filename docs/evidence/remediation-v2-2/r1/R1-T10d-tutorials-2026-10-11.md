# R1-T10d — tutorial continuation

Base: `27158eeb54a77898f67066f3876630089ee1b2f7` on
`fix/qwen-aligned-20261010`. Authority: the owner-revised
[full integration plan](../../../../attached_assets/full_intergration_plan_-_taptpay_1787816180424.txt),
R1-T10/P8.5 and the [October 10 handover](../../../HANDOFF-2026-10-10-r1-t10-commit-and-push.md).
Bounded approval and correction rereads:
[preflight](R1-T10d-preflight-2026-10-10.md).
Implementation commit: `07ccd385a9bf72241a9835e8016d738a1c889df0`.

## What changed

The real-route device harness now has an explicit `--tutorials` mode. It uses its
existing real cookie sign-in, CSRF-protected routes, isolated in-memory records,
off-origin interception and strict page/console/request observers. It covers all
20 registered tutorials on 22 surfaces, including Settings in all three verticals,
at phone, tablet, desktop and short desktop: 88 cells.

Every cell completes its walkthrough, confirms the server's completed status and
last step, reloads without replay, restarts through the real Settings button and
confirmation, verifies the generation increment/reset, completes again and checks
persistence again. Settings' own restarted overlay is completed in place, rather
than replacing its UI restart with a third API restart. API restarts are used only
for isolated first visits and the separate route-departure scenario.

Each step checks a visible primary target or fallback, its aligned spotlight,
card bounds/text and button centre hits. Where an alternate fallback is rendered,
a CSS-only probe hides the primary, verifies fallback selection, restores it and
verifies recovery. No underlying business action is clicked. The first step also
resizes across the phone/desktop boundary and back. A fresh run leaves through
actual SPA history navigation, confirms persisted dismissal, and uses browser
Back to confirm the original screen returns without tutorial replay. Required
requests and finite animations must settle; card absence is sampled over a stable
period rather than assuming a fixed delay is sufficient.

The retained NFC route must explicitly say contactless is unavailable and offer
the QR alternative. The gate rejects affirmative disabled-payment instructions;
it does not remove truthful explanatory copy just because it mentions NFC.

Production corrections are limited to existing tutorial behavior:

- phone Trades overview/action groups now carry their existing registry anchors;
- same-route responsive registration gaps retain active tutorials;
- cancelled unsent startup attempts retry, and pending startup saves activate
  only on the still-mounted, eligible original route;
- shown/saved step indices stay valid when a desktop-only step disappears on phone;
- hidden/inert/clipped targets are rejected, lazy/changed targets are rebound,
  and responsive/ancestor animation geometry is measured without negative boxes;
- tutorial focus does not scroll the page unexpectedly;
- the conditional phone quote-create step uses its existing quote surface fallback;
- successful phone Settings restart returns to the grouped controls its walkthrough
  describes; cancellation and failure preserve the current section;
- merchant streams abort on document departure and reconnect on persisted page
  restoration; explicit disconnect removes lifecycle listeners, and genuine
  connection failures remain reported.

No business layout, colors, dimensions, feature enablement, route contract,
migration, provider action or golden baseline was changed.

## Failing-first and retained findings

Durable sanitized original outputs and candidate history:
[regression history](R1-T10d-regression-history-2026-10-11.md).

The original real phone Trades resize failed; three component/view regressions
failed before its correction. The first full tutorial run passed 55/88 and failed
33: preserve `tutorial-matrix-first/tutorial-results.json`. Follow-up diagnostics
identified both application faults and two verifier faults: root body overflow
was treated as a zero-height clip in standards mode, and fixed-delay assertions
sampled exiting Settings/Back overlays under concurrent load. A standards-mode
negative/positive fixture reproduced the root checker error before correction.
Hidden-target recovery, two interrupted-startup cases, and pagehide stream
cancellation also have explicit red-then-green regressions.

The two interrupted candidate browser runs were stopped for corrections and a
fresh build; their partial results remain as `tutorial-matrix-second` and
`tutorial-matrix-candidate-1`. Neither is promoted to a full pass.

The next completed expanded run passed 73/88. Three phone Settings cells exposed
the real restart-section defect; twelve cells failed a forced-fallback probe
because both selectors referred to one control or the fallback was inside the
hidden primary. The successful/cancelled/failed restart regressions and
alias/nested/independent-fallback fixtures preceded their respective corrections.
All 88 results remain in `tutorial-matrix-candidate-2`. Only a separately rendered
fallback that shares neither an ancestor nor a descendant relationship with the
primary is an independent hide/recovery probe;
every ordinary step still requires a visible anchor and aligned spotlight.
The same candidate's normal screen matrix passed 204/204; the final source is
rebuilt and rerun rather than promoting that older candidate to final acceptance.

The next full frozen run passed 86/88. Its two failures were the phone property
and trades terminal wrapper probe: hiding the primary button collapsed its
`.tp-pfab` wrapper fallback. The normal steps passed. A collapsing-wrapper fixture
failed before correcting the inverse containment check. All 88 results remain in
`tutorial-matrix-candidate-3`; that run is not promoted to a pass. Only the tutorial
checker and its fixture changed after it. Application sources, tests and the
production build remain byte-identical to the completed 204-cell screen run.

The first full client run under concurrent browser load failed a five-second
quick-invoice test and a cash-receipt render assertion: 1,432/1,434 passed.
Both untouched suites then passed in isolation (15 tests). A fresh quiet full
run on that candidate passed all 120 suites / 1,437 tests. After the Settings
correction, a further quiet full run passed 121 suites / 1,440 tests; no test
assertion or timeout was weakened. All prior failure logs are retained.

## Verification

Typecheck, fresh production client/server build, 29 focused regressions across five suites,
full client 121 suites / 1,440 tests, 18 tutorial geometry fixtures and four
invalid-selection/option checks pass. Tutorial geometry evaluator SHA-256:
`2b6202edcb416adfec917d4ef78b27fb35ab0aa7c1e2c9ba20417d8021907b68`.
The positive standards-mode body fixture does not waive ordinary hidden,
inert, clipped, offscreen, stale or obstructed-target failures.

The final browser runs all exited 0: **88/88 tutorial cells** (22 per context,
20 unique page keys on 22 surfaces), with zero recorded faults. The validated
[durable per-cell summary](R1-T10d-browser-summary-2026-10-11.json) records
**176 completion/reload-persistence rounds**, **588 ordinary step measurements**,
**55 independent fallback hide/recovery pairs**, **176 responsive measurements**,
and **88 successful SPA route-departure/browser-Back checks**. Every cell has both
rounds completed/persisted and both navigation checks true; the executed surfaces
match the original full matrix, without omissions or duplicates.

Each tutorial context has its own HTTPS app/storage process so concurrent
generation resets cannot affect another context. All four use the same frozen
source/build manifest. The final normal device matrix separately passed
**204/204 cells**, **840 API requests to 45 registered routes**, with no
fallback-only cell and zero recorded faults, preserving its scoring and actual
Transactions drag/focus-restoration checks. Only the tutorial probe checker and
fixture changed after that normal run; application sources/tests, normal checker
and built application are identical. The summary records those two file-hash
differences explicitly.

The summary identifies implementation `07ccd385a9bf72241a9835e8016d738a1c889df0`
and the exact source/test hashes. All committed blobs were compared with the
tested manifest. The isolated final client build contains **421 files**; its
complete sorted path/file-hash tree checksum is
`74d86115d426df39598cc6ac23f15f9a8699b660f6dc5c5da81575bd584416f4`.
The built index checksum is
`747f9f6d93df46d7ceab4b850cf998d392c56004f63ca02ce02fbf3826d18c9a`.

Detailed local logs, screenshots of failures and the final source/build manifest:
`/workspace/reviews/r1-t10-continuation-2026-10-10/`. Evidence commits contain
structural/count-only summaries, not cookies, browser traces or real customer data.

## Limits and next work

This is Chromium with synthetic data and real application routes, not production
PostgreSQL, provider, native, Safari or real-device evidence. It exercises rendered
fallbacks and seeded states, not every possible data/error/wizard state. It does
not prove every rapid-click or server-response ordering scenario. Those broader
state-machine and accessibility gates remain part of the program.

T10e remains next: automated scans on every matrix surface, keyboard/focus order
and visible focus, dialog trapping/return, names/states/alerts, 200% zoom/reflow,
reduced motion, contrast and target size, plus the manual evidence checklist.
T10f remains owner/manual golden-image, device and screen-reader acceptance.
The final independent implementation review requested by the handover remains
owed; the preflight's separately recorded implementer rereads do not claim it.
R1-T10 and R1 remain open; these results do not authorize R2 or deployment.
