R1-T10d preflight on 27158eeb54a77898f67066f3876630089ee1b2f7

## Verification of Prior Fixes
Source review confirms real cookie sign-in, merchant-scoped tutorial state/restart/progress routes, the 22 merchant surfaces and four device contexts already used by the device matrix. The missing tutorial matrix is confirmed by the script: it disables tutorials during every visit. Existing registry tests assert source anchors but never drive progress or geometry.
## Blocking Issues
None to writing the test-only tutorial matrix. Known missing phone Trades anchors must be measured before any production correction. Final T10c review and dock verification remain separate evidence.
## High-Risk Concerns
Do not silently accept an absent target, a redirected page, failed persistence, stale overlay or stale geometry after changing device class. Use real routes, cookies and CSRF; retain synthetic isolated data and no off-origin traffic.
## Missing Steps
Extend the existing in-process matrix with an explicit tutorial mode. Exercise completion, persistence after reload, restart through Settings, dismissal/route transitions, resize, targets/fallbacks and disabled-feature absence. Keep standard matrix behavior unchanged. Add negative fixtures for the new measurements.
## Unsafe Assumptions
A visible tutorial card alone proves no target, progress or persistence. In-memory storage and Chromium cannot prove PostgreSQL/native/manual accessibility.
## Required Ordering Changes
Write the gate and capture current failures first. Give any necessary application fixes their own narrowly scoped evidence/review; then rebuild and rerun affected cells and the full tutorial matrix.
## Open Product / Provider / Legal Questions
No new product decision is needed for existing tutorial correctness. Golden images, accepted layout, feature enablement and real-device acceptance remain unchanged.
## Compliance and Data-Handling Notes
Synthetic local session and records only. No provider, external message, deployment or database changes. Persist counts and structural geometry, not cookies or customer payloads.
## Test and Rollback Adequacy
Use all four plan contexts and all 20 registered tutorials (22 surfaces including Settings per vertical). Check actual state from the server after completion/restart. Fail on page/console/request errors. Prove geometry rejects absent/offscreen/stale highlights. Re-run the normal device matrix after any application fix.
## Final Recommendation (Approve / Do not approve)
Approve this test-only T10d scope on 27158eeb, using the established separate-reread alternative in P8.5.

Separate reread: followed TutorialProvider saveProgress/restart generation handling and the current overlay's lookup, scroll and resize logic; read Settings confirmation/restart buttons and matrix storage/session setup. Reusing the existing process avoids fake HTTP authentication and duplicated fixtures. Tests may use a real API restart to isolate cells, but each tutorial must also survive a restart triggered by the actual Settings button. Preserve the ordinary device-matrix path and verify unknown/empty filters fail. Approve the same test-only scope. This is a separately recorded reread, not a second human/agent reviewer.

## Separate correction review — responsive tutorial lifecycle and phone Trades anchors

The first real-browser phone Trades cell failed on resize with no tutorial card,
spotlight or target, followed by a missing-dialog timeout. Source tracing shows
`currentPage = null` while `Router` replaces the phone subtree with lazy desktop
chrome; `TutorialProvider` interprets that layout gap as leaving the page. A new
component regression reproduces it. A second regression shows desktop step 3 of
3 disappearing on mobile (which has only 2 steps). A rendered-view regression
finds neither phone Trades primary anchor. All three fail before production edits;
actual route dismissal still passes. Logs: `tutorial-red-trades.log` and
`tutorial-unit-red.log` in the continuation review directory.

Approve only: bind the active tutorial to the actual route; retain it through a
same-route layout gap, dismiss it on actual navigation/auth loss; clamp the shown
and saved step to the current device's available steps; re-resolve the target as
lazy layout nodes arrive; add the existing Trades overview/shortcut anchor names
to their corresponding phone groups. No layout, colors, dimensions, data/API,
feature flags or golden baseline changes. Rebuild and verify the affected browser
cell and full tutorial matrix before claiming T10d complete.

Separate reread: followed App Router's distinct phone and desktop trees and its
lazy chunk boundaries. URL identity survives that swap, while page registration
does not. A target element can also be replaced during the gap, so keeping the
old element reference alone would leave a stale spotlight. The phone view already
has dedicated stat-card and shortcut group containers, so stable attributes are
sufficient; no restructuring is needed. Approve the same correction scope. Any
new application finding returns to an explicit correction review.

## Separate correction review — hidden targets and responsive measurements (2026-10-11)

The first 88-cell run passed 55 and failed 33; retain that report. The phone
Trades send step highlights an inert, translated send slot instead of the
visible terminal fallback. Several responsive returns retain an offscreen
spotlight; phone quote creation has no `main` fallback because its new wizard
does not render a main element. These are existing tutorial correctness defects,
not authority to change the accepted application layout or drive the wizard.

The browser checker also clipped fixed/absolute content to the zero-height body
of a standards-mode page. A standards-mode fixture reproduces that false failure;
correct the checker to use the viewport for root overflow, preserving all planted
hidden/clipped/offscreen faults. Await actual responsive shell and finite
animations/target boxes, and wait for Settings' first-visit tutorial before trying
to click its restart UI. Do not waive console or request failures.

Approve only: reject targets hidden by ancestors/inert/ARIA hiding or entirely
clipped by a non-root ancestor; prefer visible candidates, scroll eligible
offscreen candidates, and never construct a negative spotlight rectangle;
remeasure/rebind when responsive targets/ancestor styles change; focus the
tutorial button without scrolling the page; use the existing phone quote surface
as the creation step's fallback. Stable step objects and cleanup of observers
must prevent feedback loops. Add regressions before applying these corrections.

Separate reread: traced Retail's inert send slot, Trades' offscreen send slot,
Settings' mobile section selector and lazy desktop replacement, and the quote
wizard's conditional final create button. A fallback must explain the current
surface without clicking or creating any business record. Root body overflow is
propagated to the viewport, while ordinary clipped ancestors still constrain
descendants. Approve this bounded correction scope; no second reviewer claimed.

## Separate correction review — merchant stream page lifecycle (2026-10-11)

The phone retail tutorial run records stream network errors when leaving/reloading
the document. `SSEClient` disconnects on React cleanup but has no page lifecycle
cleanup. A new regression confirms the pending fetch remains active on `pagehide`;
a separate control proves genuine connection errors remain reported. Do not
filter these errors out of the gate.

Approve a merchant-stream-only pagehide abort and persisted-pageshow reconnect.
Remove both listeners on explicit disconnect/reconnect so a disconnected page
cannot revive its stream. Preserve cookie authentication, stream URL, retry
behavior, customer streams and real error reporting. Verify the lifecycle tests
and the phone retail tutorial run before accepting this correction.

Separate reread: an unload does not guarantee React unmount; an abort signal
already suppresses expected cancellation in `consumeMerchantStream`. Back/forward
cache restoration requires a fresh connection with the current cookie. Explicit
disconnect must remove restoration listeners. Approve the same bounded scope;
this is an implementer reread, not final independent review.

## Separate correction review — interrupted first-visit startup (2026-10-11)

Two new regressions fail on the corrected candidate: a same-route layout swap
before the 420ms startup timer leaves a sticky attempt key and never starts;
a swap during its first progress write saves `started` but cancels activation.
The existing active-tour retention test passes and does not cover either case.
Approve clearing an attempt only when its timer was cancelled before sending,
and activating a saved first visit only while the provider remains mounted,
eligible and on the captured route. A pending save must not revive a tutorial
after actual navigation or eligibility loss. Add that denial control.

Separately reread the timer, registration cleanup, saveProgress cache update and
actual URL dismissal. Resetting an unsent attempt permits one retry; an in-flight
attempt remains unique. A current mounted/eligible/route reference distinguishes
responsive remount from leaving without changing persistence or API behavior.
Approve the same bounded startup correction.

The expanded Back test also sampled an exiting dialog with a fixed 700ms delay
under concurrent browser load; its failure screenshot already shows no overlay.
Replace fixed-delay absence assertions with a bounded wait for the actual screen,
no finite animation, no outstanding required request, and a stable period without
any tutorial card. A tutorial that reappears or never exits still fails. Retain
the observed failure and do not count it as an application pass.

## Separate correction review — phone Settings restart surface (2026-10-11)

Completing Settings' actual UI-restarted walkthrough in place exposes all five
phone steps without targets: the handler explicitly leaves `activeSection` set
to `tutorial`, which replaces the grouped Settings controls with a detail page.
The existing confirmation says Settings will begin now. The browser red evidence
and successful/cancelled/refused component checks isolate this behavior.

Approve only returning `activeSection` to the grouped Settings list after a
successful restart. Cancellation and failure must keep the current section and
unchanged progress, with the existing failure toast. No URL, API, business setting,
layout dimension or desktop change. Independently reread the registry's five
phone anchors and the handler: they belong to the grouped list, not its tutorial
detail view. The reset belongs only after `await restartTutorials()` succeeds.

The forced-fallback probe separately hid controls whose primary/fallback selectors
are aliases for the exact same DOM node (property add/edit/request buttons).
That is a verifier defect, not a missing independent fallback. Record DOM identity
and probe only a separately rendered alternate; still require a real visible
target/fallback on every ordinary step. Add alias and independent-alternate
fixtures, preserve genuine missing-target failures and wait for pending requests
before recording early-exit diagnostics. Approve this checker-only correction.

## Separate correction review — fallback wrapper independence (2026-10-11)

The next frozen run still fails the forced fallback probe on phone property and
trades terminals: `.tp-pfab` is a wrapper whose dimensions come from the same
button selected as the primary. The ordinary step has an aligned target, but
CSS-hiding its button collapses the wrapper too. The existing independence check
rejects descendants of the primary, but misses this inverse containment case.

Approve only a checker correction: neither selected candidate may contain the
other for a forced independent-fallback probe. Add a collapsing-wrapper fixture
and capture its failure before the correction. Ordinary steps must continue to
require a visible primary/fallback and aligned spotlight; missing independent
fallbacks must still fail. Preserve this complete run, rerun the full tutorial
matrix with the corrected checker, and retain the unchanged application build.

Separately reread the terminal's button/wrapper selectors and both containment
directions. A wrapper that depends on the primary's rendered size is not a
separately rendered alternate. This change affects probe eligibility only, not
application target selection or ordinary geometry fault detection. Approve the
same checker-only scope; final independent implementation review remains owed.
