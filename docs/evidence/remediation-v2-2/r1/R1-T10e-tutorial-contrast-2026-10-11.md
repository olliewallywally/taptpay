# R1-T10e — shared tutorial contrast checkpoint, 2026-10-11

Implementation: `f9ccd53c0777ec0b1e3d858ddf446927f20544c5` on
`fix/qwen-aligned-20261010`; base `ea6c55379e36b17a971db3bba72165995f5ef7f7`,
verified published before work. Oliver requested continuing the next task; earlier
commit/push authorization persists. Replit deployment remains with Oliver.
**T10e/T10f/R1/release and final independent implementation review remain open.**

## Correction and failing-first proof

Only three application CSS declarations change: shared small eyebrow text uses
the card's existing navy `#040d6d`, the step counter uses existing paragraph color
`#586079`, and both keyboard focus outlines use the same navy. Fonts, dimensions,
backgrounds, outline width/offset, animations, content, routes, tutorial state and
business/payment handlers are unchanged. No golden images were updated.

Read the [bounded preflight/reread](R1-T10e-tutorial-contrast-preflight-2026-10-11.md),
[retained first failures](R1-T10e-tutorial-contrast-regression-history-2026-10-11.md),
and [complete structural report](R1-T10e-tutorial-contrast-browser-summary-2026-10-11.json).

Reverified all 676 preceding client-source hashes and 421 immutable built files
before work: zero mismatches. Actual stylesheet browser fixtures and real `/trades`
tutorials at all four contexts fail before correction. The application baselines
retain 15 settled step samples / 90 repeated failed checks, with 8/8 keyboard cases
passing. Final-harness baselines reproduce those failures on the same old build.

| Shared check | Before | After | Required |
| --- | ---: | ---: | ---: |
| Small eyebrow text on white card | 2.418:1 | 16.361:1 | 4.5:1 |
| Step counter, including foreground alpha | 3.278:1 | 6.242:1 | 4.5:1 |
| Close/next focus outlines against card | 1.606:1 | 16.361:1 | 3:1 |

The next button's blue shadow cannot invalidate the correction: navy against even
fully opaque `#58abff` is 6.766:1; its actual shadow is only 36% opaque over white.
These are computed-color measurements, not owner visual/pixel or AT acceptance.

## Fresh candidate verification

- Typecheck and isolated production client/server builds pass.
- Focused client tutorial suite: **4 suites / 27 tests**, all pass. The preceding
  **123 suites / 1,447 tests** belong to the previous checkpoint; no fresh full
  client/server/PostgreSQL claim is made for this CSS-only correction.
- Actual CSS fixtures: four contexts pass; four settled-helper clean agreements
  and **13 negative checks** pass (including a permanently translucent timeout).
  All **12 actual-Chromium axe evaluator controls** also pass.
- **204/204 normal cells complete**, with zero route/session/shell/request/error/
  geometry/Transactions faults, zero fallback-only cells, **841 requests / 45
  registered routes**. Full-page accessibility remains **76 pass / 128 fail**.
- Final **88/88 active tutorial cells / all 20 keys / 22 surfaces × four contexts**:
  **176/176 keyboard cases pass**, 174 real connected-control returns and two
  explicit phone NFC document-origin returns. Every completion step is sampled:
  **294 completion steps + 88 Escape samples = 382 settled step samples /
  2,292 repeated contrast measurements**, all pass, with both controls genuinely
  keyboard-focused. No forced refocus or response replacement.
- **30/30 focused-card geometry comparisons** across the four `/trades` contexts
  match exactly before/after (15 steps × two focused controls); fixture geometry
  also matches. This is bounded geometry evidence, not a fresh full T10d resize/
  fallback/route-exit rerun.

The first active candidate completed 88 cells but one short desktop Property
Analytics completion probe sampled changing ancestor rendering after a separate
wait. Retain its 175/176 successful closure cases, source/manifest hashes and failed
output. The final sampler checks readiness and measures within one browser operation
for each control, retaining the 10-second bound and rejecting unsupported rendering.
All 88 active cells were rerun. The completed 204 normal cells use unchanged normal
source/evaluator and the identical client build; they were not silently substituted
or claimed as another rerun after this test-only refinement.

## Remaining scan results and acceptance

Normal contrast still affects **124 cells / 841 repeated nodes**. Target-size now
affects **19 cells / 21 nodes**: 17 phone merchant cells and short desktop retail
Terminal/Stack (two nodes each). The additional phone Recurring target is reproduced
with identical violations on both old and candidate builds; it predates this fix.
Retain the fresh finding, rather than reducing its count to the prior 18/20.
One additional split-by-number GET read explains the 841 versus prior 840 requests;
its registered-route set is unchanged and it has no failed request or business action.

Active full-page accessibility improves from **1 pass / 87 fail** to **48 pass /
40 fail**. Remaining contrast affects **40 cells / 226 repeated nodes**; target-size
affects short desktop retail Terminal/Stack, **2 cells / 4 nodes**. The corrected
shared selectors pass; underlying full-page findings remain. Every normal and
active shard keeps its actual **exit 1** for those remaining violations.

Normal incomplete checks still affect: contrast 101 cells, aria-prohibited-attr 94,
aria-valid-attr-value 4, bypass 4, frame-title-unique 3. Active incomplete checks:
contrast 84 cells, aria-prohibited-attr 66. Keep the earlier experimental/manual
candidates too; no incomplete or violation result is an allowance or signoff.

Other dialogs/alerts, whole-surface keyboard flows, actual 200% browser/text zoom,
reduced motion, screen readers, real/native devices and owner visual/golden acceptance
remain pending in the [manual checklist](R1-T10e-manual-acceptance-2026-10-11.md).
The prior c2/c3/Transactions/tutorial and this continuation's final independent
implementation review remain owed. Implementer rereads approve bounded work only.

## Build, provenance and reproduction

Frozen client: `/workspace/reviews/r1-t10-contrast-2026-10-11/build/public`;
421 files; only tutorial CSS differs among the recorded client sources.
Tree SHA256 `f9d5ae7a7a2e5f9fd781ca2eaccd30e8cd4983234c624e36159f40056c3d6d5c`;
index SHA256 `f607b655d8f830c47ff4766a74c2781b8be221e062b9e22903d318f64cf8e0a9`.
Structural report SHA256
`2bc2d924bea317d472ad9a2c43570b1f1259e1141d24f39496fc2f364c26e7cb`.
The report revalidates actual source/build bytes, distinct cells, current registry
step counts, unchanged thresholds, origins, geometry and process statuses. It
retains raw-report hashes, first candidate history, baselines and both-build rechecks.

Node 24.19.0; Chromium 151.0.7922.173; axe-core 4.10.3. Use
`PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium`. Existing stale browser-data/chunk-size
build warnings remain visible; no warning threshold was changed.

```sh
npm run check
npm run test:client -- --runInBand --testPathPatterns=tutorial
NODE_ENV=production npx vite build --outDir /workspace/reviews/r1-t10-contrast-2026-10-11/build/public
npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=/workspace/reviews/r1-t10-contrast-2026-10-11/build
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-tutorial-contrast.mjs /workspace/reviews/r1-t10-contrast-2026-10-11/css-after-settled.json
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-accessibility-audit.mjs
```

For each context, normal uses `--accessibility`; active uses
`--tutorial-accessibility`, with the two output directories kept separate:

```sh
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node --import tsx scripts/verify-r1-t10-device-matrix.ts /workspace/reviews/r1-t10-contrast-2026-10-11/active/phone /workspace/reviews/r1-t10-contrast-2026-10-11/build/public --tutorial-accessibility --context phone
node --import tsx scripts/summarize-tutorial-contrast.mjs /workspace/reviews/r1-t10-contrast-2026-10-11 docs/evidence/remediation-v2-2/r1/R1-T10e-browser-summary-2026-10-11.json docs/evidence/remediation-v2-2/r1/R1-T10e-tutorial-contrast-browser-summary-2026-10-11.json
```

These are reproduction commands, not instructions to overwrite retained artifacts.
Use a new root/build for future work; freeze builds before browser runs, at most
four processes. Full client suites run without concurrent browsers.

No live database/migration, provider, payment, message, flag, deployment or golden
activity. Only isolated synthetic tutorial state is mutated. No HTML, node text,
input values, credentials, cookies or request headers enter durable evidence.
Rollback: revert the bounded implementation commit, preserving prior security and
semantic fixes; no data rollback is required. Publication must be checked against
the evidence checkpoint containing this document, rather than assumed from it.
