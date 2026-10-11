# Handoff — R1-T10 accessibility continuation, 2026-10-11

Read the owner-revised full integration plan, the newest continuation ledger
entry and this handover. This continues the published tutorial/security branch;
it does not close R1, T10e, T10f or the outstanding independent review.

Repository: `olliewallywally/taptpay`; branch `fix/qwen-aligned-20261010`.
Prior published checkpoint: `9e46250bdd62dc62227a4f420862344ce0d47a58`;
prior tutorial implementation: `07ccd385a9bf72241a9835e8016d738a1c889df0`.
GitHub's branch head was rechecked against that checkpoint before this work.
Oliver explicitly requested commit/push and the next task. He deploys on Replit.

Implementation/evidence commits and final results are recorded in
`docs/evidence/remediation-v2-2/r1/R1-T10e-accessibility-2026-10-11.md`.
Derive the evidence checkpoint from the commit containing this handover and verify
publication with `git ls-remote origin refs/heads/fix/qwen-aligned-20261010`.

## Work completed in this continuation

- Added actual axe scans to the real-route 204-cell matrix, preserving page,
  session, shell, route-policy, request, error and geometry assertions. WCAG A/AA
  2.0/2.1/2.2 uses non-experimental rules plus explicit dialog naming. No allowances.
- Added a separate full active-tutorial matrix: real Tab/Shift-Tab, visible focus,
  named dialog, Escape and multi-step Enter completion returning focus. Phone NFC
  has no underlying enabled control and records a document-origin case explicitly.
- Corrected provider focus return without restoring into a departed route; named
  controls/fields, associated existing select labels, and made the observed scroll
  containers named keyboard targets. Forward only the required accessibility props
  through the shared scroll shell, preserving its refs and arrow/scroll handlers.
- Corrected retail's closed stack panel remaining in keyboard/AT navigation, using
  its existing state for native inert/aria-hidden and naming the opened close action.
- Persist only structural axe metadata with attribute values removed from selectors.
  Planted evaluator faults, clean controls, missing-engine and selector-value checks
  use actual Chromium. Invalid modes/empty selections are rejected.

See the exact bounded preflight/correction rereads, retained regression history,
full structural JSON and manual acceptance checklist in the linked evidence.
Prior failed runs and builds remain under
`/workspace/reviews/r1-t10-accessibility-2026-10-11/`; do not overwrite them.

## Next work and limits

T10e remains open: remediate recorded contrast/target-size findings with concrete,
reviewed palette/geometry changes; assess every incomplete scan and experimental
manual candidate. Shared tutorial eyebrow/count contrast is a useful first bounded
slice: inspect the actual computed foreground/background, then propose an existing
approved dark text color and verify the real affected contexts. Never silently
reclassify these failures as passes or update golden images to hide them.

Complete other-dialog/alert and whole-surface keyboard flows, actual 200% browser
zoom/reflow, reduced-motion checks, real devices/screen readers and owner visual
acceptance. The supplied manual checklist is pending, not a signoff. Final
independent implementation review of prior c2/c3/Transactions/tutorial work and
this continuation remains owed; implementer rereads do not close that gate.

The prior tutorial geometry/resize/fallback/Settings-restart evidence is linked
from the earlier tutorial handover. Do not describe it as a fresh final-build
rerun: this continuation's fresh active matrix covers keyboard/name/focus/axe.
Normal screens still exercise the existing geometry and Transactions checks.

No deployment, R2 work, live provider, message, payment, feature-flag, database,
migration or approved golden-baseline activity occurred. Preserve user runtime
`logs/`, `.claude-home/**`, local settings and browser/session artifacts. Stage
explicit paths only; never `git add -A` or `git add .`.

Use existing `/workspace/taptpay`, installed dependencies and
`PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium`. Freeze builds outside the checkout.
Run the full client suite without concurrent browser jobs, then at most four
browser processes at once; preserve real exit statuses and incomplete/failed work.
