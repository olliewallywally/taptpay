# R8 first repository slice — in flight

October16,2026. Branch remediation/r8-ci-20261016, based on pushed R7
c9f513c583573285bcc6c1aa7ddb480d2f1b8458. This R8 work is not committed/pushed
yet; this record is being included in the first reviewable checkpoint. Re-derive
status from Git/files; background session IDs are not durable.
Do not claim phase exit or deployment. Claude retains R4.

## Preserve

- Owner app PID4196 and its root node_modules. All dependency installs/tests with
  updated packages use /tmp/taptpay-r8/frozen-install, an archived source copy,
  not a Git checkout/worktree. Its one Git-metadata test reads the real repository
  with explicit GIT_DIR/GIT_WORK_TREE; no source/metadata is changed by that read.
- No production/provider credentials, live/shared database mutation or external
  message delivery. All new initiation defaults, D13, frozen SQL and R5/R6 release
  gates remain. Property feed-under-dock and D10 remain unchanged.
- Never git add -A. Exclude local Claude state, logs, raw evidence, env and dumps.
  /logs/ is newly ignored; pre-existing files remain intact.

## Implemented scope

Node22.23.3/npm10.9.9 are pinned. Safe CI replaces secret-backed DB migration,
skipped browser jobs, development-server readiness and raw uploads with disposable
PostgreSQL17 and owned HTTPS production-output browser verification. The typed
R8 scripts have their own check:r8 gate. Process groups have bounded teardown and
an actual completion acknowledgement, not just a signal. Port0/omitted password
targets are rejected before connection. Sanitized reports are stage/status/counts/
advisory IDs only; raw child output remains private.

Critical patches: matched @capacitor/core/cli/ios8.4.3 and Swift exact8.4.3,
express4.22.3, ts-jest29.4.15, handlebars override4.7.10, proxy-addr2.0.8.
Seven unused auth/session packages and matching types removed after call-site
and dependency-graph review;32 installed packages removed. Both motion packages
and React/react-dom remain. Fresh npm ci preserved lock bytes for each group;
typecheck/build checks passed. Root dependencies were never replaced.

Desktop Send now has a synchronous pending latch, released on settlement.
Real-browser failure and a failing unit regression preceded the repair. It avoids
two immediate HTTP submissions while preserving the durable creation key and
retry after failure. Client full regression on the patched install:134 suites,
1507 tests, zero failures/open handles.

ESLint now scopes source files, handles TS/Jest globals correctly, retains hook
errors and enforces zero new errors. Initial17731 errors reduced to a reviewed
698-error existing baseline before later removals; final lint result is recorded below.
No full clean-lint certification. Existing fake React-hook naming in a server
clock helper is now an import alias; no hook rule was disabled.

Technical docs, both design briefs and the legacy deploy helper no longer certify
unsupported readiness/compliance. Legal wording is inventoried unchanged pending
professional/product approval. Fake key creation/revocation now refuse in both
storage implementations; the unused old admin screen forwards to the unavailable
surface. WooCommerce retains its gateway identity/history/settings, always
reports unavailable, refuses payment/refunds and webhook order updates, and has
no network/order/cart/stock/settings side effects. PHP8.4 syntax/runtime checks
with controlled WordPress/WooCommerce hosts pass; this is not shop UAT.

## Frozen build

Patched isolated install built twice with network/DB denial active. A complete
snapshot rollover and Capacitor sync were copied back after strict parity:
198 source web files; native full copy plus two empty Cordova files. Index SHA256
752b816726ceed8973211e93f1d755e6e07a884f45093a4b032949c064412e8d.
Only native tracked change from sync is CapApp-SPM/Package.swift. Preserve the
whole generated snapshot. Root artifact/native guard passes. A signed new native
build is still required to update an installed SDK; Replit web deployment alone
does not replace that binary.

Lock SHA256: e9886957ba7e697192731a20ff478c4745739e4934391f70dda3d244cb8dec36.

## Validation results and next commands

Node22 binary: /workspace/.onboarding/r8-node22/bin/node. Export that bin directory
first in PATH. PHP_BIN=/workspace/.onboarding/r8-php/bin/php;
GITLEAKS_BIN=/workspace/.onboarding/r8-gitleaks/gitleaks;
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium. Do not print private test-env files.

- Fresh PG replay:54 migrations, repeat0 pending, canonical0049b digest matched;
  four existing full-chain actual storage verifiers passed again on the final
  candidate. Start only the owned R8 cluster
  with /workspace/.onboarding/taptpay-r8-start-postgres.sh, then source its private
  r8-postgres/test-env.sh. Never retarget strict R3/R5/R6 operator tools.
- Full final client passed, /tmp/taptpay-r8/frozen-client-final.json.
- Final clean full server passed:238 suites,5249 tests, zero failures/open
  handles, /tmp/taptpay-r8/server-clean-final.json. Earlier failures are retained
  privately; they are not substituted for this complete successful run.
- The601 bogus-document requests and valid invoice check still use real HTTP
  and the original five-second test budget. Only its load-generating client is
  in a bounded Node child, scripts/verify-document-flood.mjs; the real Express app
  stays in the test. Credentials go through stdin, not argv. All assertions stay.
  This passed in2605ms and the full document suite passed on recheck. Temporary
  timing probes are removed; do not restore the failed earlier helper drafts.
- Final check:r8 passes. JSDoc fixes its inferred nullable selector type; the
  serialized geometry browser-code hash is unchanged. Two Playwright callbacks
  now await/discard Disposable and return void. Final harness self-test is pending.
- Final static stage passed all10 checks, including all38 tooling tests.
  Review reproduced a lifecycle bug in the command runner: the execution timer
  remained armed after parent exit during the separate descendant-kill grace.
  A tighter1-second regression captured PARENT_COMPLETED but incorrectly returned
  timedOut=true. The timer is now canceled immediately on exit; the same test
  passes and still waits for owned descendants to stop. Test deadlines were not
  increased. Tooling files run serially so unrelated heavy fixture bootstraps do
  not consume subprocess-safety budgets. A saturated local parallel run also
  exceeded the preview's15-second boot budget; final isolated-stage proof remains
  now passed with unchanged boot/test budgets; no prior failure is counted as a pass.
- Full zero-new lint passed:680 existing errors,0 new. A final rerun after the
  browser-request/scheduling review also passed. The removed import was verified
  by all68 upload-inventory tests passing; no timeout/baseline relaxation.
- All204 page cells passed on the final built snapshot. The unfiltered tutorial
  process was deliberately stopped through its own orchestrator after its slow
  per-cell duration showed the CI scheduling problem. It was not counted as a
  pass. Four separate device batches now cover every tutorial/public-state/chunk/
  terminal cell with the same assertions/deadlines. CI also schedules the four
  contexts separately and keeps all failures visible. Results pending.
- Harness self-test passed:23 planted faults all caught,5 clean controls passed.
  The first local invocation mistakenly supplied a relative client directory;
  the corrected invocation uses the documented absolute directory.
- New chunk/terminal request-cleanliness guard has3 fail-first regressions for
  hung requests, late errors and waiting for successful completion; all pass.
  R8 typecheck and37-test tool run passed before adding the scheduling contract.

- Prior R8 browser checks passed all8 chunk and4 terminal cells, but precede the
  final Capacitor dependency build. Run final pages/tutorial/chunks/terminal on
  index752b8167; final helper source matches the isolated candidate. Keep
  strict browser errors and all owner visual/device gates; no golden refresh.

## Security reports

Current tree secret scan passes.16 scanner/config safety tests pass. Exactly57
public checksum rows, two occurrences of one synthetic verifier password and two
literal loopback URI port templates were narrowly classified. No evidence file,
all-hash, commit-wide or real credential waiver. Same-file planted credentials
and remote URI templates still fail. See R8-SCANNER-REVIEW-2026-10-16.md.

History:2351 findings,2227 dispositioned,124 unresolved (108 generic-api-key,
10 JWT,6 connection-URI findings). These are candidates requiring review, not124
confirmed live credentials. History remains red; no rotation is asserted. Private
metadata is in /tmp/taptpay-r8-ci-fceiM8/secret-history.log.

Lock-only dependency audit:80 affected packages,0 critical,61 high,17 moderate,
2 low;139 advisory IDs. High/critical gate correctly fails. Targeted compatible
follow-up and reviewed major migrations remain; no blanket waiver/audit fix.

## Finish this slice

Full server/static/PG/lint results are verified. Complete final browser validation,
review every source/lock/snapshot change, create sanitized evidence/source hashes
and final independent reread, rewrite this handoff with actual results, then
record the completed browser evidence after this reviewable checkpoint. Push only
explicit reviewed paths; the checkpoint is not phase exit. No deploy/merge or phase-exit claim.

Next R8 work starts with a reproduced production-only install failure: fresh
npm ci --omit=dev succeeds, but the actual built server exits with
ERR_MODULE_NOT_FOUND for vite before any network connection. server/vite.ts
statically imports Vite and vite.config.ts, even on the production static path.
The private failing proof is /tmp/taptpay-r8/production-start-negative.log;
/tmp/taptpay-r8/production-install-path names its disposable install. Separate
that development-only dependency path, add actual built-server production-install
proof and verify the development middleware before tooling relocation. No repair
or production readiness is claimed yet. Remaining high findings/history triage,
production-only dependency/tooling placement, portable script/package-name and email-provider
decisions with required evidence, artifact/license/PII dispositions, remaining
storage-verifier adapters and actual target/restore/provider/native/legal release
closeout. Read plan15 and normative22.5/22.13; do not claim all of R8 complete.

Cloud setup draft was saved with verified Node/PG/PHP/scanner setup and startup
instructions. It requires user review/save and Publish to activate; it has not
been published and new-task restoration is unverified. No new network/secret
bindings or application restart were made.
