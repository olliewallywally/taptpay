# R1-T10e accessibility checkpoint — 2026-10-11

This is a bounded semantic/focus correction and verification checkpoint.
**T10e, T10f, R1 and release acceptance remain open.** The prior final independent
implementation review remains owed; separately recorded implementer rereads do
not close it. Oliver requested commit/push and moving to this next task, and will
deploy through Replit himself.

Base: `9e46250bdd62dc62227a4f420862344ce0d47a58`, verified published on
`fix/qwen-aligned-20261010`. Implementation commit:
`0f123cc1d4e93482bdd91d7e09133e73233af0a0`. The evidence checkpoint is the commit
containing this document and the immediate handover; verify GitHub publication
against that commit rather than assuming a document proves a push.

## Scope and first failures

Read [bounded preflight and correction rereads](R1-T10e-preflight-2026-10-11.md),
[retained regression history](R1-T10e-regression-history-2026-10-11.md),
[manual acceptance checklist](R1-T10e-manual-acceptance-2026-10-11.md), and the
[full structural browser JSON](R1-T10e-browser-summary-2026-10-11.json).

The published application build was unchanged for the first 204-cell scan.
It completed with 42 passing / 162 failing cells and no non-accessibility faults.
That initial candidate selected experimental WCAG-tagged heuristics inadvertently;
the retained standard-rule projection is 55 passing / 149 failing cells, a
classification of the same results rather than a rerun or retroactive passing exit.
Preserve the original experimental paragraph/table/name candidates for human review.

axe 4.10.3 uses non-experimental WCAG A/AA 2.0, 2.1 and 2.2 rules, including
target-size; explicit `aria-dialog-name` supplies the mandated dialog-name check
that axe tags as best practice. No violation or incomplete result is allowlisted.
Twelve actual-Chromium evaluator controls cover clean pages, numerical paragraphs,
missing engine execution, button/field/dialog names, ARIA state, contrast, crowded
targets, inaccessible/accessible scroll regions and nested selector-value removal.
All seven contradictory/unknown/empty mode selections are rejected for the intended
reason. Earlier setup/configuration/fixture failures remain in history.

Tutorial Escape and multi-step completion both failed to return focus in JSDOM
and actual Chromium on the published build. Trap and route-departure denial controls
passed. The provider now captures one connected origin before activation, retains
it across steps, and restores only on the same eligible route. A route departure
or restart clears the reference rather than focusing the previous page.

Control/field repairs cover stock, tenant back, payment-stack back, merchant-ID
edit/save/cancel, recurring fields, board-builder and onboarding select labels.
Observed notifications/analytics/legacy/terminal/admin scroll areas become named
keyboard targets. The shared scroll shell forwards only the required accessibility
props to its actual scrolling div while preserving refs and arrow/scroll handlers.

The retail stack's translated closed panel remained in keyboard/AT navigation.
A failing closed/open/close test preceded state-derived native `inert`/`aria-hidden`
and the named opened close action. Existing sale delegation/no-double-submit tests
remain green. No payment calculations, API controllers, provider or request contracts
were changed. Existing visual classes/styles, tutorial anchors and baselines remain.

## Final normal-page results

The fresh final application build completed **204/204 normal cells**: 51 surfaces
at phone, tablet, desktop and short-desktop contexts. All existing page/route/session,
shell, request/error, geometry and Transactions assertions pass. No control-name,
field-label, select-name, link-name or scroll-access violation remains in this run.
The cells made 840 application API requests across 45 registered routes, with no
fallback-only screen identities or unknown API addresses.

The accessibility gate itself still exits **1**: **76 cells pass / 128 fail**.
Contrast affects 124 cells (841 repeated node findings); target-size affects 18
cells (20 node findings). These counts overlap and are not unique source defects.
They remain failures, with no allowances or claim that target geometry was repaired.
All incomplete results remain available for manual assessment.

Final client suite: **123 suites / 1,447 tests**, all passing without concurrent
browser jobs. Typecheck and isolated Vite/esbuild client/server builds pass.
The earlier overloaded full-suite timeout/act-warning run was retained and stopped;
it is not described as passing. Browser runs were then bounded to four concurrent
processes, each completing normal checks before active-tutorial checks.

## Final active-tutorial results

The fresh final run completed all **88/88 cells**, covering all 20 page keys /
22 merchant contexts at the same four sizes. **176/176 keyboard cases pass**:
174 return to a real connected control, and the two explicitly recorded phone
NFC cases return to their document origin. Both Escape and multi-step Enter
completion persist the expected state; Tab/Shift-Tab confinement, named dialogs
and visible outline checks pass with no page/console/request or interaction faults.
No earlier candidate is substituted into this final full run.

Full-document active-tutorial axe scans still exit **1**: 1 cell passes / 87 fail.
Contrast affects 87 cells (387 repeated node findings); target-size affects two
cells (four node findings). Incomplete checks remain pending. Focus outline presence
does not prove all focus-indicator contrast or manual screen-reader acceptance.

## Build, evidence and remaining acceptance

Final immutable client build:
`/workspace/reviews/r1-t10-accessibility-2026-10-11/release-check-build/public`.
All 421 built files and client source hashes were checked after freezing.

- Build-tree SHA-256:
  `2b104c9be30363b41117514a250040e7fa36f51f72734fcc1e5f00b805d1faa7`.
- Index SHA-256:
  `dbd425c17e2feadb57b12fe55f782d849372dcff4b487a5a34889bc788b94176`.
- axe engine SHA-256:
  `880970c081707360e64f34cea25ff91892f5bc95675bd584416f4c9bc0682424`.
- Structural browser report SHA-256:
  `69564411bb04eebc04cf233ceebb4441de14ec4b5009bc5563ce9114e90961e1`.

Reproduce using installed dependencies and the existing checkout:

```sh
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-accessibility-audit.mjs
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node --import tsx scripts/verify-r1-t10-device-matrix.ts <normal-output> <frozen-client-dir> --accessibility --context phone
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node --import tsx scripts/verify-r1-t10-device-matrix.ts <tutorial-output> <frozen-client-dir> --tutorial-accessibility --context phone
node scripts/summarize-r1-t10-accessibility.mjs <retained-artifact-root> <structural-report.json>
```

Repeat the context argument for tablet, desktop and desktop-short, retaining
original exit statuses. The summarizer requires complete original/final matrices
and rejects missing or duplicate cells/engine execution; it never promotes a
partial scan.

The structural report records the actual engine/evaluator/harness hashes,
per-cell rule IDs/impacts/tags, structural selectors, passed rule IDs and incomplete
checks. Attribute values are removed; no HTML, input values, accessible customer
text, cookies, tokens, screenshots or request bodies are committed. Earlier builds,
first-run results and private/runtime artifacts remain outside Git.

Next bounded work is the concrete contrast/target-size worklist and other-dialog/
alert/whole-page keyboard flows, actual 200% browser zoom/reflow, reduced motion,
real device/screen-reader checks and owner golden acceptance. Shared tutorial
eyebrow and progress-count contrast are candidates for a first palette correction.
Do not equate viewport/CSS/device-scale changes with actual browser zoom, and do not
update golden images without the plan's owner approval.

No deployment, R2 work, migration, live database/provider/payment/message/flag or
approved golden-baseline change occurred. Rollback is an explicit revert of this
checkpoint while preserving the earlier security/tutorial commits and evidence.
