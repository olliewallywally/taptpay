# R8 first repository slice — verified and pushed

Implementation:340e284b0f8ee1bd91337ca2a97bf09614e70eeb on
remediation/r8-ci-20261016; remote SHA was verified after push. Based on R7
c9f513c583573285bcc6c1aa7ddb480d2f1b8458. This completes the first repository
slice and its available regression, not R8 phase exit, merge or deployment.
Claude retains R4. Re-derive current Git/files rather than trusting background IDs.

Read R8-FIRST-SLICE-VERIFICATION-2026-10-16.json under
docs/evidence/remediation-v2-2/r8 for exact results. The checkpoint review is
historical: its pending browser checks subsequently passed. Final review and
subsequent production-import work are recorded separately.

## Completed scope

- Node22.23.3/npm10.9.9 pin; least-privilege CI with no production secrets,
  disposable PostgreSQL17 and actual owned HTTPS readiness/browser checks.
- Real command deadlines, owned-group cleanup and acknowledgement. The execution
  timer is canceled on parent exit before descendant cleanup. A tighter1-second
  fail-first regression proves successful exit cannot become a teardown timeout.
  Tooling files run serially; no test/request timeout was increased.
- Matched Capacitor/core/cli/ios/Swift8.4.3, express4.22.3, ts-jest29.4.15,
  handlebars4.7.10 and proxy-addr2.0.8. Seven proven-dead auth packages and matching
  types removed;32 installed packages removed. Both motion packages and runtime
  React/react-dom retained. Fresh installs preserved lock bytes.
- Correct lint parser/globals/source scope with hooks still errors, plus zero new
  findings against a reviewed existing baseline. No clean full-lint claim.
- Synchronous desktop Send latch prevents immediate repeated POSTs, releases on
  settlement and preserves durable identity/retry. Document-flood test retains601
  real HTTP refusals plus a valid invoice within the original five-second budget.
- Fake API-key success is refused. Unsupported WooCommerce entry points have no
  network/order/cart/stock/settings writes; real PHP syntax/stub-host checks pass.
- Technical docs/briefs/deploy helper no longer certify unsupported readiness or
  compliance. Published legal wording is inventoried, unchanged, for approval.
- Complete generated web/native snapshot and matched native dependency metadata.
  No golden refresh or owner layout decision change.

## Verification

Fresh patched isolated install on Node22:

| Check | Result |
|---|---|
| Full client Jest |134 suites,1507 tests,0 failures/open handles |
| Full server Jest |238 suites,5249 tests,0 failures/open handles |
| Final static stage |All10 checks passed, including38 tooling tests |
| Lint |680 existing errors,0 new |
| Fresh PG17 |54 migrations,repeat0 pending,canonical0049b matched;4 storage verifiers passed |
| Guarded builds |0 network attempts,0 migrations |
| Web/native artifact guard |198 coherent web files,full native parity |
| Device pages |204/204 passed |
| Tutorials |88/88 passed,22 on each context;complete/restart/complete/reload |
| Public payment states |24/24 passed |
| Chunk abort/hang/reload |8/8 passed |
| Terminal exact10.01/single-flight |4/4 passed |
| Harness self-test |23 faults caught,5 clean controls passed |
| Current source secret scan at checkpoint |Clean,0 findings |
| History scan after checkpoint |2351 findings,2227 dispositioned,124 unresolved candidates |

The unfiltered tutorial process was deliberately stopped for scheduling; it was
not counted as a pass. All four final batches completed successfully with the
same assertions/deadlines. CI schedules contexts separately with fail-fast=false.
Strict chunk/terminal checks now reject unsettled required requests and late
errors;3 fail-first regressions cover that behavior. An initial self-test command
used a relative build directory; the corrected absolute-path run passed.

Lock digest:e9886957ba7e697192731a20ff478c4745739e4934391f70dda3d244cb8dec36.
Web index digest:752b816726ceed8973211e93f1d755e6e07a884f45093a4b032949c064412e8d.
Source-change and complete web SHA256 manifests bind implementation340e284b;
verify them against that commit when later commits change those paths.

## Preservation and authority

Preserve owner app PID4196 and root node_modules. Updated installs/tests used
/tmp/taptpay-r8/frozen-install (an archived source copy, not a Git checkout).
A Git-inventory test used read-only GIT_DIR/GIT_WORK_TREE pointing at the repository.
Never git add -A; exclude local Claude state, env, dumps, logs and raw evidence.
Pre-existing logs remain intact. No shared/live database, provider traffic,
message delivery, deployment, native entitlement or payment enablement occurred.
Frozen SQL, D10, property feed-under-dock, locked D13 and prior release gates remain.
A web deploy does not update the installed native SDK; a new signed binary is open.

## R8 still open

- Lock audit:80 affected packages,0 critical,61 high,17 moderate,2 low;139 advisory
  IDs. High/critical gate remains red. Production-filtered audit still has58 high;
  moving tools alone cannot clear the full audit gate. No blind audit fix/major.
- History:124 unresolved candidates (108 generic-api-key,10 JWT,6 connection URI).
  Candidates are not124 confirmed live credentials. No rotation is asserted.
  Scanner exceptions are exact reviewed checksum lines/synthetic verifier values;
  planted real-credential shapes still fail. No file/commit-wide waiver.
- Actual production-only import failure reproduced: npm ci --omit=dev succeeds,
  but dist/index.js imports Vite from a development dependency at module load.
  The next repair has a separate preflight; inspect its current implementation
  and proof rather than assuming complete from this first-slice handoff.
- Normative22.5: remaining tool placement, direct/transitive consumers, scripts/
  package-name/email-provider decisions with delivery proof, licensing/PII/design
  provenance and remaining storage-verifier adapters. Metadata inventory preserves
  all ambiguous artifacts;0 deletions. Tracked-file inventory is not live upload
  discovery or a content/privacy clearance.
- R4 integration and all deferred R3/R5/R6/R7, actual target/restore/locks/UAT/
  operations/Safari/VoiceOver/native/visual/legal/professional acceptance remain.
- No remote CI pass, branch protection activation or release sign-off is claimed.

## Local tools and setup persistence

Use /workspace/.onboarding/r8-node22/bin first in PATH. Chromium is
/usr/bin/chromium; PHP_BIN=/workspace/.onboarding/r8-php/bin/php;
GITLEAKS_BIN=/workspace/.onboarding/r8-gitleaks/gitleaks. Private raw evidence is
/tmp/taptpay-r8; publish only sanitized summaries. For owned PG17, use only
/workspace/.onboarding/taptpay-r8-start-postgres.sh and its private test-env.sh;
never print that file or retarget strict source-specific R3/R5/R6 rehearsals.

Cloud setup draft saved verified Node/PG/PHP/scanner tooling and startup guidance.
It requires review/save in environment settings and Publish to activate. It is
not published, application dependencies were not replaced and fresh-task
restoration remains unverified. No new network/secret bindings were requested.
