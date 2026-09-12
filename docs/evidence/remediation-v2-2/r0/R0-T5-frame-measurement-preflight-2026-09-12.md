# R0-T5 bounded review — measure the frame, not the viewport

Base: `ada0d5bd61285b4450cbb7ec35199833a71ac7fa`.
Scope: repair the synthetic device verifier; no application change.

## Verification of Prior Fixes

Fresh production build succeeds. The unmodified device verifier reproduces
10/15 passing, with all five desktop cases failing the inset-frame assertion.
Its own desktop terminal screenshot visibly shows the centered rounded frame.

## Blocking Issues

`DesktopFrame.tsx` puts `data-testid="desktop-frame"` on the full-viewport
backdrop. The actual frame is its direct `.tapt-desktop-frame` child. The
containment verifier measures the former, unlike `verify-desktop-p0.mjs`, which
correctly measures the latter. The September 11 claim that the app is full-bleed
is therefore unsupported by the test and contradicted by the screenshot.

## High-Risk Concerns

Changing assertions to tolerate full-bleed desktop would weaken the contract.
Instead select the correct element and enforce exact dimensions, centering,
radius, clipping, canvas size and device class. Leave all application CSS alone.

## Missing Steps

Run all 15 existing scenarios and add the locked fine-pointer 1440x650 case for
all five routes. Preserve page-error, disabled-control and zero-mutation checks.

## Unsafe Assumptions

A test ID's name need not describe the DOM element it marks. The old failing
assertion did not establish a product decision was required. Owner visual
acceptance of the complete R1-H1 baseline is a separate gate.

## Required Ordering Changes

Original failure reproduced before edits. Inspect component/CSS and captured
screenshot, repair the verifier, rerun against the same unchanged built assets.

## Open Product / Provider / Legal Questions

None for the selector repair. No visual baseline, design deviation, credential
status or overall R0 completion is changed by this test-only correction.

## Compliance and Data-Handling Notes

Built static client on loopback; all API requests fulfilled by synthetic fixtures,
external origins blocked, service workers disabled. Screenshots contain synthetic
empty merchant state. No app server, database, provider or runtime secret used.

## Test and Rollback Adequacy

The original red run and existing P0 geometry precedent establish the defect.
The corrected gate must still reject a full-window or unrounded desktop frame.
Reverting this script correction restores false failures, not product behavior.

## Final Recommendation (Approve / Do not approve)

Approve the bounded verifier repair on the exact base above. Not release approval.

Separate reread before implementation (same agent, not independent personnel):
compared `DesktopFrame.tsx`, desktop CSS lines 166–260, P0 measurement and
assertions, all 15 original results and the desktop screenshot. The expected
1000px-wide, 59:44-ratio frame and 28px radius are already implemented; the
off-white backdrop is preserved. Do not ask the owner to resolve this test bug.
