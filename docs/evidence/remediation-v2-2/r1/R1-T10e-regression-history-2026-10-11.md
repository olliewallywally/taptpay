# R1-T10e retained failures and corrections

Artifact root: `/workspace/reviews/r1-t10-accessibility-2026-10-11/`.
These are development evidence, not a release or whole-phase acceptance.

- Original published-build audit: all 204 cells completed; 42 passed and 162
  failed. Explicit rule-ID selection unintentionally enabled experimental rules
  (`p-as-heading`, `td-has-header`, `label-content-name-mismatch`, plus experimental
  incomplete checks). Preserve the run. Its standard-rule projection is a
  classification of those results, not a rerun or retroactive passing exit.
- Evaluator's initial unnamed-dialog fixture failed: WCAG tags alone omit the
  best-practice dialog-name rule. Add that exact mandated rule explicitly.
  The selection-control fixture then caught experimental heuristics being enabled;
  use axe's non-experimental WCAG preset and retain experimental manual candidates.
  The numeric-paragraph control passed; it was not a standalone heuristic failure.
- Tutorial focus regression: Escape and multi-step completion failed; Tab wrapping
  and route-departure denial passed (2 failures / 2 passes). Provider origin capture
  and same-route restoration corrected both. Chromium on the published build also
  failed both return checks, and the first corrected build passed both.
- First route-departure test assumed destination autofocus in its synthetic tree.
  Refine to the actual contract: do not restore into the previous route, even if
  its old control remains connected. Keep the initial failed logs; do not claim
  they proved destination autofocus behavior.
- Property stack semantic change initially failed typechecking because the shared
  scroll component discarded accessibility props. Both new named-region tests
  failed before forwarding those props. A subsequent arrow test exposed JSDOM's
  missing `scrollIntoView`; mock only that unsupported browser method per control,
  preserve focus assertions and verify the existing scroll calls. Do not change
  production scroll behavior to accommodate JSDOM.
- First browser focus harness used `route.fetch`, whose separate request context
  rejected the synthetic loopback certificate. Replace that unnecessary proxy
  with focusing the existing control before `route.continue`: original browser
  session/TLS/server response remain intact. No TLS-verification disablement.
- The first multi-step browser probe used a strict single-card hidden locator
  while Framer retained an exiting card. Wait for absence of all tutorial cards.
  The published-build return checks then both failed as expected.
- First full corrected-build run: tablet landing had an unsettled lazy chunk;
  desktop quote's fixed-delay focus probe failed; client tests timed out under the
  combined browser workload and reported follow-on act warnings. Keep these logs,
  reduce browser concurrency and rerun the client suite without concurrent browser
  jobs. Replace the fixed-delay focus assumption with an actual current-card focus
  condition within the existing 10-second bound, without increasing timeouts.
- Phone NFC's retained informational page has no underlying enabled control.
  The first full tutorial test rejected that fixture; record document origin only
  for this specific surface and assert return to the same document body. Other
  surfaces must still establish a real control. Keep the failed first case and
  separate NFC recheck; the final full matrix uses the refined fixture explicitly.
- First complete corrected page audit retained one unnamed retail stack-back icon.
  Its closed panel was translated offscreen but remained in keyboard/AT navigation.
  A failing closed/open/close regression preceded `aria-hidden`/native `inert`
  derived from existing stack state and the named close action. Preserve that first
  build and all reports, then freeze the final build and repeat both full matrices.
- The first option checks lacked the existing Chromium-path override for options
  evaluated after browser startup. Five early rejections passed; two did not reach
  the intended diagnostic. With the established browser path, all seven invalid
  combinations/empty selections were rejected for their intended reason.

Local logs, screenshots and synthetic session data remain outside Git. Durable
structural evidence retains first-candidate failure counts, selectors with
attribute values removed, rule IDs/impacts/tags and exact source/build hashes.
Contrast, target-size, incomplete checks and manual/independent review stay open.
