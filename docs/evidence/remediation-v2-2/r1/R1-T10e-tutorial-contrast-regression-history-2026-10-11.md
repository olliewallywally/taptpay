# Shared tutorial contrast — retained first failures, 2026-10-11

Base `ea6c55379e36b17a971db3bba72165995f5ef7f7`, unchanged published client build
tree `2b104c9be30363b41117514a250040e7fa36f51f72734fcc1e5f00b805d1faa7`.
All 676 recorded client source hashes and 421 built files matched before work.

Read [bounded preflight/reread](R1-T10e-tutorial-contrast-preflight-2026-10-11.md).
Raw original logs/reports are retained outside Git under
`/workspace/reviews/r1-t10-contrast-2026-10-11/`, not overwritten by candidate runs.
Durable evidence contains only structural selectors and computed numeric styles.

## Actual stylesheet, before correction

Command:

```sh
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-tutorial-contrast.mjs /workspace/reviews/r1-t10-contrast-2026-10-11/css-before.json
```

Actual exit **1**. At phone, tablet, desktop and short desktop sizes, all four
distinct shared checks fail (text is repeated under each focused-control sample):

```text
.tutorial-eyebrow text contrast 2.418 < 4.5
.tutorial-footer > span text contrast 3.278 < 4.5
.tutorial-close focus contrast 1.606 < 3
.tutorial-next focus contrast 1.606 < 3
axe color-contrast
```

All 12 probe negative controls passed: four alpha-composited text examples,
four weak focused outlines, four unsupported ancestor-opacity rejections.
The fixture reads the real application CSS, not a copy of its declarations.

## Published application, before correction

Command for each of `phone`, `tablet`, `desktop`, `desktop-short`:

```sh
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node --import tsx scripts/verify-r1-t10-device-matrix.ts /workspace/reviews/r1-t10-contrast-2026-10-11/baseline/phone /workspace/reviews/r1-t10-accessibility-2026-10-11/release-check-build/public --tutorial-accessibility --context phone --surface /trades
```

All four actual processes exit **1**. Sanitized final lines:

```text
FAIL tutorial accessibility phone trades /trades: 0 interaction/runtime faults; 1 accessibility rules; 18 shared contrast faults
FAIL tutorial accessibility tablet trades /trades: 0 interaction/runtime faults; 1 accessibility rules; 24 shared contrast faults
FAIL tutorial accessibility desktop trades /trades: 0 interaction/runtime faults; 1 accessibility rules; 24 shared contrast faults
FAIL tutorial accessibility desktop-short trades /trades: 0 interaction/runtime faults; 1 accessibility rules; 24 shared contrast faults
```

All 8 Escape/completion keyboard cases passed and returned to their real connected
origins. Fifteen settled step samples retain 90 repeated failed measurements;
these represent four shared style defects, not 90 distinct defects. The real
application and isolated stylesheet agree on the computed ratios. Required
thresholds remain **4.5:1 text** and **3:1 focus outlines against the opaque card**.

These first failures establish the defect before the three CSS declarations
change. Subsequent success must come from the recorded candidate build, while
full-page violations, incomplete checks and owner/manual acceptance stay distinct.

## First candidate — sampling failure retained

All 88 candidate cells completed, with 175/176 successful closure/return cases.
The short desktop Property Analytics completion probe failed after the first
step with:

```text
Error: page.evaluate: Error: tutorial contrast: ancestor opacity/filter changes rendered colors
```

The readiness wait and color measurement were separate browser operations, and
close-button measurement had no new readiness check after Tab. Approve the
recorded test-only refinement: check readiness/focus and measure in the same
browser operation for **each** control. No forced refocus, timeout increase,
contrast-threshold change or production change. A permanently translucent card
must still time out/fail within the unchanged 10-second bound.

Retain all first reports in `active-first/{context}`, first baselines in
`baseline-first/{context}`, first statuses/logs and the `.first` source snapshots.
The identical frozen candidate build is reused for the full final active rerun;
the completed 204 normal cells use unchanged normal source/evaluator code. Final
harness hashes distinguish the rerun from this first failed attempt.

## Additional finding checked on both builds

The fresh full normal scan records the small phone Recurring target as well as
the earlier targets. Isolated `/trades/recurring` audits on both old and candidate
immutable builds reproduce identical contrast and target-size violations, with
no non-accessibility faults. Both processes exit **1**. Preserve this existing
issue in the final findings; do not replace the full scan with its older counts.

The fresh phone split-by-number page sent four read requests versus three in
the preceding checkpoint. Both use exactly the same three registered GET routes
(session, merchant events and transaction); no failed/unregistered request or
business action occurred. Final evidence records the observed 841 total requests.
