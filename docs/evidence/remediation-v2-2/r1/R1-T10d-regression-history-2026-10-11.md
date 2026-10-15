# R1-T10d — retained failing-first output

Base: `27158eeb54a77898f67066f3876630089ee1b2f7`, branch
`fix/qwen-aligned-20261010`. These are sanitized excerpts of observed failing
checks, preserved for review across workspace resets. Detailed local originals
remain under `/workspace/reviews/r1-t10-continuation-2026-10-10/`.
See the [preflight/correction rereads](R1-T10d-preflight-2026-10-10.md) and
[implementation/verification evidence](R1-T10d-tutorials-2026-10-11.md).

## Application regressions, before their respective corrections

`tutorial-unit-red.log`:

```text
● a responsive layout unmount does not dismiss the active tutorial on the same route
● moving from a desktop-only last step to mobile keeps a finishable tutorial
● TradesDashboardView extraction boundary › phone tutorial anchors identify the overview and the quote/invoice shortcuts
Received: null
Test Suites: 2 failed, 2 total
Tests:       3 failed, 4 passed, 7 total
```

`tutorial-hidden-unit-red.log`:

```text
● an inert primary target uses the visible fallback and rebinds when the primary opens
Expected: "191px"
Received: "11px"
Tests:       1 failed, 3 skipped, 4 total
```

`tutorial-startup-red.log`:

```text
● a same-route layout gap before the startup delay does not strand the tutorial
● a same-route layout gap while the first progress write is pending still shows the saved tutorial
Tests:       2 failed, 3 skipped, 1 passed, 6 total
```

The final pending-write regression additionally denies activation after an actual
route change. The existing active-layout and route-dismissal controls remain.

`sse-page-lifecycle-red.log`:

```text
● merchant stream closes on page departure and reconnects after a persisted page restoration
Expected: true
Received: false
Tests:       1 failed, 1 passed, 2 total
```

`settings-restart-red.log`:

```text
● successful phone restart returns to the grouped Settings controls the tutorial describes
Tests:       1 failed, 2 passed, 3 total
```

Cancellation and refused restart already passed on the original Settings handler;
the correction retains those controls rather than resetting on failure.

## Verifier regressions, before their respective corrections

The standards-mode absolute application/root-overflow fixture in
`tutorial-geometry-root-red.log` falsely reported all three painted elements absent:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
+ actual - expected
+ ['no visible target or fallback', 'no visible tutorial card', 'no visible spotlight']
- []
```

The alias fixture in `tutorial-alias-red.log` required an explicit false for an
independent fallback but initially received `undefined`. The nested-fallback
fixture in `tutorial-nested-fallback-red.log` and collapsing-wrapper fixture in
`tutorial-wrapper-fallback-red.log` both failed with:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
true !== false
```

These corrections concern root clipping and independent-probe eligibility.
Ordinary target presence, alignment, clipping and button-hit checks still fail
on genuinely missing/hidden/stale/obstructed fixtures. Independent alternatives
remain tested; aliases and ancestor/descendant candidates are not independent.

## Complete browser candidates and full-suite history

| Retained tutorial artifact | Completed cells | Pass | Fail | Outcome |
|---|---:|---:|---:|---|
| `tutorial-matrix-first` | 88 | 55 | 33 | Responsive lifecycle, targets/geometry and verifier findings; retained |
| `tutorial-matrix-candidate-2` | 88 | 73 | 15 | Three phone Settings restart defects and twelve forced-probe findings; retained |
| `tutorial-matrix-candidate-3` | 88 | 86 | 2 | Phone property/trades terminal wrapper probes; retained |

The two interrupted candidates are retained separately and never count as a
complete pass. The final browser summary records the accepted candidate; this
history does not erase earlier failures.

The first full client run under concurrent browser load reported 1,432/1,434
passing tests, with a quick-invoice timeout and cash-receipt render assertion.
Those untouched suites passed in isolation (15 tests). A quiet full run then
passed 120 suites / 1,437 tests; after the Settings correction the final quiet
run passed 121 suites / 1,440 tests. No assertion or timeout was weakened.
Focused corrected application regressions pass 29 tests across five suites;
the final tutorial evaluator passes 18 positive/negative fixtures.

No production data, cookie/token, provider payload, browser trace or real customer
record is included. These checks do not replace final independent review or
accessibility, golden-image, native and real-device acceptance.
