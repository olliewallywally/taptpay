# R1-T10e preflight — accessibility verification

Base: `9e46250bdd62dc62227a4f420862344ce0d47a58` on
`fix/qwen-aligned-20261010`. The owner explicitly requested committing/pushing
the prior continuation and moving to the next task. GitHub's branch head matches
that base. This approves bounded test implementation, not whole-R1 acceptance.

## Verification of Prior Fixes
The prior immutable report identifies 88/88 tutorial cells and 204/204 normal
screen cells, 121 client suites/1,440 tests and the tested source/build hashes.
Publication has been independently rechecked. The existing matrix asserts actual
routes, sessions, screen marks, shells, errors/requests and geometry; it never
runs axe. Installed axe-core is 4.10.3. The historical keyboard gate simulates a
software keyboard and cannot replace keyboard navigation or accessibility scans.

## Blocking Issues
None to adding read-only test coverage. The prior final independent implementation
review remains owed; advancing these explicitly requested checks does not close it.
Do not change production code until its accessibility defect is captured and its
bounded correction reviewed. Do not hide violations or use an allowance list.

## High-Risk Concerns
Scanning the wrong page, signed-out shell, loading state or only a tutorial card
could falsely pass. Keep all existing identity/route/error assertions. axe incomplete
results require human assessment; no violation count is proof of manual acceptance.
Do not publish HTML, text/input values, cookies, tokens or provider/customer payloads.

## Missing Steps
E1: add an explicit accessibility mode to the real-route matrix; run WCAG A/AA,
including WCAG 2.1/2.2 rules, on all 204 cells; record rule IDs, impacts, tags,
structural selectors, pass counts and incomplete checks. Add planted-fault and
clean-control fixtures using the actual evaluator. E2: audit active tutorials and
representative dialogs, keyboard focus/trap/return, visible focus, names/states
and alerts. E3: cover 200% zoom/reflow, reduced motion, contrast and target geometry;
write the owner/manual keyboard and screen-reader checklist. These are distinct
checks; a first-page axe pass cannot mark all E work complete.

## Unsafe Assumptions
Do not equate CSS scale, deviceScaleFactor or a narrow viewport with browser zoom.
Do not click payment/provider/message actions during a keyboard test. Chromium and
synthetic storage do not prove Safari, native behavior or a screen reader.

## Required Ordering Changes
Write the evaluator/negative controls first, then capture the baseline on the
unchanged application build. Diagnose actual failures before proposing corrections.
Keep normal device/tutor modes unchanged; reject contradictory/empty filters.
Rebuild and reverify affected surfaces after any application correction. Retain
earlier failures; do not rebuild an application candidate while browser runs use it.

## Open Product / Provider / Legal Questions
No product decision is needed for the read-only audit or structural accessibility
repairs. Approved layout/golden-image, palette, target dimensions and owner/manual
acceptance remain recorded constraints; any required visual change must be concrete
and reviewed, with golden acceptance still owed. No provider action is authorized.

## Compliance and Data-Handling Notes
Same isolated synthetic records, real application/session/CSRF routes and off-origin
interception as the existing harness. Persist structural reports only. No migration,
live feature flag, provider, message or deployment activity. Exclude runtime/private
files from all commits; stage explicit paths only.

## Test and Rollback Adequacy
Catch unnamed controls, unlabelled fields, unnamed dialogs, invalid ARIA, contrast
and missing engine execution in fixtures; preserve a clean page control. Scan the
full matrix and record incomplete results separately. Add meaningful failing-first
regressions for any production correction. Rollback is a test-only revert on this
base; retain the prior security and tutorial fixes. Manual/independent review gates
remain open even after automated checks pass.

## Final Recommendation (Approve / Do not approve)
Approve E1–E3 test-only implementation on exact base
`9e46250bdd62dc62227a4f420862344ce0d47a58`, using P8.5's separately recorded reread
alternative. No production correction or release approval is implied.

Separate reread: followed `visit` settling, page identity and shell checks, actual
Transactions drag/focus restoration and browser error watchers. The scan must run
before the existing page closes and must add failures to the same cell, while
leaving ordinary runs unchanged. Active tutorial scans and keyboard/dialog states
need distinct evidence because ordinary matrix sign-in disables tutorials. Axe
node HTML and failure text can contain customer data, so only selector/rule metadata
is durable. Approve the same test-only scope. This is an implementer reread, not
the outstanding final independent implementation review.

## Bounded correction reread (before application edits)
Verification: the unchanged published build was scanned in 204/204 cells; all
non-accessibility route, session, shell and error assertions passed. Initial
candidate configuration explicitly enabled experimental rules; retain that run,
report those candidates separately, and use non-experimental WCAG rules plus the
explicit dialog-name requirement for the standard gate. A real evaluator control
fails when experimental `p-as-heading` is selected. The numeric-paragraph control
itself passed and is not evidence of that heuristic firing in isolation.

Tutorial regressions fail for both Escape and multi-step completion returning
focus, with trap and route-departure denial controls passing (2 failures, 2 passes).
Approve capturing the original connected element once before tutorial activation,
retaining it across steps, and restoring only on the same eligible route when
closing. Clear it on route departure/restart; do not restore into another page.
Separately reread provider activation, overlay effect/key changes, persistence
generation handling and responsive registration before this correction.

Approve bounded semantic repairs demonstrated by the full baseline: associate
existing board-builder and onboarding labels with their selects; name recurring
client/frequency/channel/date fields and unnamed stock, tenant-back and stack-back
icons; make the observed notification, analytics and legacy scroll containers
keyboard-focusable named regions. Preserve visual classes/styles, tutorial anchors,
routes, actions, money calculations and request contracts. Wouter supports a
styled Link directly, so the stack-back control should become one named link.
Shared mobile terminal/admin defects require source diagnosis before inclusion.

Blocking/high-risk concerns: no blanket CSS, role or tabindex rewrite; no changes
to deliberate client-name/description contracts based solely on an experimental
label heuristic. Preserve first failures and all contrast/target-size findings.
Missing steps: focused tests, typecheck/build, fresh actual-route audits and manual
keyboard/focus/AT checks. Unsafe assumptions: JSDOM alone cannot prove visual focus
or real animation timing; a scanner cannot prove screen-reader acceptance.
Ordering: capture these failures, implement this scope, freeze a fresh build, rerun.
Product questions: palette/target geometry and golden acceptance remain open.
Data handling: remove attribute values from persisted axe selectors, retaining
structural location and cell identity; test the sanitizer with planted selector
values. Rollback is an explicit revert of this bounded checkpoint. Final
recommendation: approve these semantic/focus and evaluator corrections; do not
approve whole T10e, R1, deployment or the owed independent implementation review.

Source diagnosis: mobile terminal stack scroll regions are in the retail core,
`PropertyTerminalView.tsx` and `TradesTerminalView.tsx`; the admin findings are in
`pages/admin/MerchantDetail.tsx`, not the obsolete legacy admin page. Approve the
same focusable-region correction there and accurate names on the merchant-ID
edit/save/cancel icons without triggering or changing those actions.

E2 test reread: add a separate tutorial-accessibility matrix mode using the same
isolated server/sign-in/routes. Hold only the real started-progress reply until
an existing page control is focused, then release it and prove actual Chromium
Tab/Shift-Tab confinement, named dialog/visible focus, Escape and multi-step Enter
completion returning to that exact connected control. Audit the full document
with the active tutorial, preserving violations separately from keyboard faults.
Use a fresh synthetic restart for each case; never click underlying business or
provider controls. Run on the published build first to confirm focus failures,
then on the frozen corrected build. This remains automated evidence only; zoom,
other dialogs, screen readers and owner acceptance remain open.

Correction refinement: the property stack uses `AnimatedScrollList`, whose
interface and implementation discard caller accessibility attributes. The
typecheck caught this before publication. Approve explicitly accepting/forwarding
only `tabIndex`, `role` and `aria-label` to the actual scrolling div, preserving
the internal key/scroll handlers and refs. Capture named-region/arrow-navigation
tests failing first, then recheck the client suite and typecheck.

Observed E2 fixture correction: the retained phone NFC notice has no enabled
underlying control. Do not plant a fake trigger or assert return to a nonexistent
element. Only on that explicitly non-interactive surface, record document-origin
focus and assert it returns to the same body. All other cells must still establish
and return to a real connected control. Keep the first failed case, then recheck
that surface with the corrected fixture on the identical immutable build; record
the distinct harness hashes rather than claiming every cell was rerun.

## Final semantic correction review

### Verification of Prior Fixes
The first corrected 204-cell run removed all field-label, link-name and
scroll-region violations. Its remaining unnamed control is the retail expanded
stack's back icon. Source diagnosis shows the closed panel remains translated
offscreen in the DOM and keyboard/accessibility tree. A failing component test
captures the missing closed-panel exclusion before changing it.

### Blocking Issues
No blocker to a semantic closed/open state correction; contrast, target size,
incomplete checks and broader acceptance are still open.

### High-Risk Concerns
Do not hide an open panel or alter stack actions/data. Use its existing
`stackExpanded` state for `aria-hidden` and native `inert`; name the close icon.

### Missing Steps
Verify closed/open/close transitions, existing sale delegation/no-double-submit
tests, full client tests without concurrent browsers, typecheck and a fresh build.
Rerun both full matrices against that immutable final build.

### Unsafe Assumptions
A translated panel is not automatically excluded from keyboard or screen readers.
The first matrix had a tablet landing chunk still pending and a desktop quote
focus probe failed under the combined workload; retain both failures. Wait for
the actual current-step focus condition within the existing bounded timeout,
rather than assuming it is ready after a fixed 250ms delay. No timeout increase.

### Required Ordering Changes
Capture the closed-panel failure, apply the bounded correction, finish the client
suite, freeze the new build, then run browser matrices. Preserve the first build
and reports. Record the NFC document-origin fixture explicitly in the fresh run.

### Open Product / Provider / Legal Questions
No visual or provider decision is introduced by a semantic panel-state fix.
Palette, target geometry, golden acceptance and all manual checks remain pending.

### Compliance and Data-Handling Notes
No new API, request, provider, message, flags, credentials or financial changes.
Durable evidence remains structural and sanitized.

### Test and Rollback Adequacy
The component test must prove both inert closed state and operable named close
action when opened, plus the existing payment boundary tests. Revert this bounded
checkpoint if needed; preserve earlier security/tutorial commits and first failures.

### Final Recommendation (Approve / Do not approve)
Approve this closed-panel/name correction and readiness-based focus probe after a
separate reread of stack rendering/state, event handlers and the actual provider
focus effect. Do not approve deployment, whole T10e/R1 or independent review.
