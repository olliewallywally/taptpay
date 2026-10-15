# R7 native capability and regression — handoff

Phase / release: R7 master plan14, repository implementation. D13 remains locked
off; no native enablement, deployment or official phase/release exit is claimed.
All available repository checks below are complete; external release gates remain.

Exact branch and commit: `remediation/r7-capabilities-20261015`, source
`62a80d9cb41bb5b137e2d78b691db76bf62f9819`, including initial implementation
`2d0c8c5b` and the hosted-billing navigation/audit correction, pushed from R6 base
`82bc816ad70817ab18b9ce7369172386e6b8dbfc`. Later evidence-only commit resolves
with `git log -1 --format=%H --` and this path. Verify actual status/remote.

Scope completed: shared locked capability, bare true startup refusal, removed
global JS proxy and out-of-target fake Swift, removed unused placeholder wallets
and retired attended provider transport. Three terminal controllers cannot start
native/simulated payments. View props cannot restore Paywave. The retained Tap
endpoint preserves strict input/auth/CSRF/ownership and always refuses valid
owned requests with503, with no billing/transaction/provider/push/stream effect.
Ordinary hosted checkout/wallets, native platform detection and physical NFC tag
links remain separate. Route policy/review/inventories describe actual behavior.

Native audit: existing production URL/HTTPS and phone/iPad orientations retained;
only exact appleid.apple.com and sec.windcave.com exceptions remain for existing
cookie-bound Apple sign-in and Settings' sessionStorage-bound production HPP
card setup. Broad Replit/Apple/payment domains removed. Capacitor sync succeeds
and managed SPM includes the three already locked plugins. Installed push package
and both Swift sources match the vendored originals. Xcode compilation and actual
native auth/redirect/push/device behavior are not proven by this Linux run.

Generated snapshot: old225-file client/public/app contained compiled fake code.
Replaced the whole snapshot from verified root production output, excluding root
app to avoid recursion. Both checked-in and actually served app copies match all
198 root files. Full build396 files matches native398 with only two explicit
empty Cordova CLI additions. No unsupported payment markers remain. Native public
and generated config are ignored, locally verified output. Keep source, snapshot
and managed metadata together. The source-built index hash is
`34210529db88f44378ba001d8fe9d7437c61598a4d332428739a086df192d56d`.

Files changed: exact source paths, commands, outcomes and private-log hashes are
in [R7-VERIFICATION-2026-10-15.json](evidence/remediation-v2-2/r7/R7-VERIFICATION-2026-10-15.json);
the198-file build manifest is in
[R7-BUILD-SHA256-2026-10-15.json](evidence/remediation-v2-2/r7/R7-BUILD-SHA256-2026-10-15.json).
330 reviewed initial paths and10 correction paths include the coherent output
rollover, native metadata, route records, tests and runbook. Read the final review.

Migrations: none. Every migration, shared schema, package lock, Info.plist and
Xcode project remains unchanged from82bc816a. No database was opened or changed
for R7 checks. Browser fixtures use isolated MemStorage, real routes/sessions and
injected synthetic property/trades list storage. They are not PostgreSQL or UAT
proof. Parent R6 migrations/policies are not activated on a real target here.

Commands/results: final regression passes11 server suites270 tests,
the complete134-suite client project1506 tests,2 artifact-guard tests, app/R5/R6 typechecks,
production build and native sync/integrity checks passed. Ordinary device matrix
passed204 cells (51 each), and real-route public outcome mode passed24 (6 each).
Tutorial completion/restart passes all88 merchant cells,176 completed/persisted
rounds, with Settings restart, reload, route departure and browser Back checks.
Together316 browser cells pass with zero faults. Receipts name exact commands,
hashes and counts; overlapping earlier runs are not added to these totals.
Normal/tutorial processes loaded the base harness before the separate optional
public-outcome mode was added; its default behavior and all acceptance rules are
unchanged. The final source-built browser bytes exactly match the frozen candidate.

Negative/no-side-effect tests: malformed money/IDs/token fields, missing session,
CSRF and foreign merchant remain refused; concurrent valid taps create no sale,
billing or provider call. Spoofed iOS/platform/bridge and an explicit view prop
cannot enable payment. Public pending/wrong-transaction states cannot become
approved through a forged URL query. The real-route outcome matrix also covers
approved receipt navigation, declined, cancelled and unmatched return notice.
Artifact guard refuses stale source/served copies, simulated markers, modified
or missing output, symlinks, nonempty compatibility files and arbitrary additions.

Provider/UAT activity:0 real provider/card/message calls. Existing tests use only
injected synthetic outcomes. Browser outbound requests are refused. No production
size/performance, actual mobile Safari or native execution proof is inferred.

Device/browser evidence: system Chromium151 on Linux, phone390×844 coarse,
tablet1194×834 coarse full bleed, desktop1440×900 fine centered frame,
desktop-short1440×650 fine D10. Owner property feed-under-dock decision, existing
frames/device gate/tutorial design and lazy/chunk machinery are preserved.
No golden, geometry threshold, timeout or browser error allowance was relaxed.

Security/privacy review: required ten-heading preflight, implementation, billing
navigation correction and final reviews,
separately recorded rereads of new findings. Private logs/manifests/screenshots,
env/dumps, local Claude state and excluded logs are not staged. Public evidence
contains hashes/counts only. Source diff-check is clean; eight generated whitespace
notices are exact retained third-party license text. No sub-agent/delegated,
external professional review or remote CI execution is claimed.

Failure history: failing-first capability tests reproduced false capability,
flag enablement and unsafe native artifacts/navigation. Missing bundled browser
failed before any cells; reran with system Chromium. Preliminary browser run was
aborted when missing QRCodeDisplay import was found and restored; only the final
frozen build counts. Removal of attended tail also removed shared retry delay;
provider regression caught it and the original generic helper was restored.
Four App suites initially could not load obsolete plugin mocks (zero tests);
only those declarations were removed, then363 assertions passed. Stale route and
storage expectations were updated to zero effects. Strict native asset compare
initially caught CLI's two empty extras; their exact hashes are now required,
with negative tests for executable/unknown additions. A new served-copy drift
test failed first and now guards the actual app subtree. No failure was waived.
Broader API-address audit initially retained deleted wallet entries and old
literal counts. Removed the two entries and only the seven retired terminal
addresses, tightening the budget118→104 across12 files; all43 contract tests pass.
Further native rereview caught the Apple-only allowlist breaking Settings' HPP
browser context. Two failing-first tests reproduced it; exact sec.windcave.com
was retained from the server's production link contract. Config, artifact guard,
sync, all focused server suites and source build were rerun green. No deployment
occurred between the initial push and this compatibility correction.

External actions: repository commit/push only. No shared/live DB or data changes,
real provider/message calls, deployment, feature activation, R4/main merge or live
reconciliation. Owner app PID4196 remains running and was never signalled.
Exact owned preliminary verifier814556 was stopped by inspected argv only.

Feature flags/payment mode after deploy: no deployment/configuration change.
Tap true refuses startup. D13 stays false; provider/payment/reconciliation gates
from earlier phases remain intact. Uncertain attempts/jobs keep their holds and
stable identities. No live in-flight reconciliation was inspected or resolved.

Known warnings/deferred items: browser-data/chunk-size/ts-jest deprecation notices.
Actual Xcode/native build/signing/entitlement checks; matching remote web build
and native Apple/other sign-in/HPP/3DS/wallet/back/return/push tests; iPhone12
Safari/VoiceOver and separate iPad; owner visual/golden acceptance and independent
review. No public test URL was created. The runbook links the isolated Replit
preview instructions. Existing R3 UAT, Claude's R4 canonical integration, the six
deferred R5 release checks and R6 real-target/UAT/operations gates remain open.

Rollback commit/constraints:82bc816a is a source reference, not approved live
rollback. Keep D13 off and revert source/output/metadata coherently. Never restore
nondurable attended charging or mutate existing migration/history/holds. Do not
bypass R6 controls with an old reader or run old/new cron together.

Approvals: owner “Ok start on r7”, existing D13/D10/feed-under-dock decisions and
continuing repository commit/push instructions. Local review approves only the
recorded repository scope. Real deployment/provider/native enablement and any new
product/security tradeoff require their existing separate approval/evidence.

Stop conditions checked: all stated repository checks pass, including complete
four-context tutorial runs and exact native/web artifact checks. No simulated
payment source, native navigation wildcard, unsupported approval or unpaired
compiled snapshot remains. External acceptance remains explicitly open.

Next phase prerequisites: retain the external gates above. R8 is the next planned
repository phase; it has not started.
Do not take Claude's R4, infer live completion or activate anything from these
test counts. Re-derive processes/branches/results after a session reset.

Environment: existing dependencies/proxy/CA/auth retained. Shell login:false;
Node24.19.0, PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium. CI's Node22 was not run
remotely here; Node pin/dependency work remains R8. No environment draft, dependency,
package-lock or worktree change. Never stage private logs/manifests/env/dumps,
.claude-home/** or .claude/settings.local.json; stage reviewed explicit paths.
