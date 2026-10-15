## Verification of Prior Fixes

Base82bc816a is pushed and clean except excluded logs. Read the R6 handoff,
master plan14/21, D10 and R1 terminal follow-up. R0 already retired the /nfc
simulator page and hides Paywave in the active terminal, but it still imports a
global Capacitor proxy. Swift outside the app target fabricates approval. Three
terminal sources retain simulated tokens; legacy NFC handlers call retired
endpoints. Config still permits a bare Tap flag to enable a nondurable attended
route. Two unused wallet components contain placeholder merchant integrations.

## Blocking Issues

No blocker to enforcing locked D13 and removing these paths. Real native SDK,
Apple entitlement, iOS build/device proof and provider UAT remain absent; do not
invent an integration. Readiness/migrations/R4 implementation stay out of scope.

## High-Risk Concerns

Capacitor proxy existence is not capability. Reject Tap flag enablement and make
the retained validated/authenticated endpoint a side-effect-free unavailable
response. Retire its unsupported attended transport and fake native/JS bridge.
Protect regular hosted checkout/wallets, physical NFC tag links and native push.
Remove broad navigation without guessing provider/bank host allowlists.

## Missing Steps

Failing-first false-capability/config/no-effect tests; remove unsupported handlers
and unused wallet placeholders; narrow Capacitor navigation to its existing own
origin plus the exact existing Apple OAuth host; update truthful route policy/inventory/review; production build and
coherent checked-in legacy app snapshot rollover; local Capacitor sync/asset audit;
device/public-payment/tutorial matrix, source/result hashes and handoff.

## Unsafe Assumptions

Old plan findings are not assumed fixed by passing R0 tests. Existing client
public/app is a tracked225-file stale generated snapshot; Vite copies it to the
served build, so source-only repair leaves unsafe compiled code distributable.
Refresh its complete output from the verified candidate, excluding recursive app
copying. Preserve historical design sources. Linux checks cannot prove iOS SDK,
system-browser redirects, Safari/VoiceOver or real payment UAT.

## Required Ordering Changes

Review first, then failing tests and narrow source repairs. Keep app URL
https://taptpay.co.nz/app-login and existing orientations. Preserve only the exact
existing Apple OAuth host appleid.apple.com: server/apple-sign-in.ts and
client/src/lib/apple-sign-in.ts prove that redirect and its same-browser signed
cookie binding. Remove other extra navigation so untrusted sites do not share
the app WebView. Verify source
and build before generating/copying coherent assets, then validate generated
config/assets against that source. Never sync stale artifacts or enable money.

## Open Product / Provider / Legal Questions

D13 and D10 already answer current capability/device behavior. Native/provider
enablement remains a future gated workstream; no SDK guesses or new product
policy. Actual Apple build/device/UAT proof and visual/golden acceptance remain
external evidence. Existing owner feed-under-dock decision stands.

## Compliance and Data-Handling Notes

Owned loopback servers with synthetic users/data and simulated email only; block
outbound browser/provider requests. Do not restart owner4196 or use live/shared
DBs. Preserve auth/CSRF and DTO boundaries. Never commit logs, dumps, private
credentials, screenshots with real data or local Claude state. No sub-agents.

## Test and Rollback Adequacy

Require config refusal even in development/test, capability false on spoofed iOS
and proxy objects, no bridge/network/transaction effects on attempted tap, retired
wallet/native code absence and generated asset scans. Preserve input validation
and auth/ownership tests while replacing formerly-enabled unsafe route success
tests with unavailable/no-effect expectations. Run client/server regression,
typechecks/build, real local page matrix and native configuration/asset checks.
No assertion/timeout/golden relaxation. Rollback source/output together; keep D13
off and preserve every applied migration/history.

## Final Recommendation (Approve / Do not approve)

**Approve** the R7 containment/native-boundary and available regression scope on
82bc816a above. Locked D13 resolves the capability choice; retained own-origin URL
and orientations preserve existing product intent; full artifact rollover closes
the stale-copy hazard. No approval of Tap to Pay or deployment/native release.

Separately recorded independent reread checked App import and active/legacy
terminal reachability, global bridge spoofing, input/auth ordering, hosted wallet
separation, native push dependency on isNativeIOS, generated/public artifact
exposure and R4/R6 boundaries. Same scoped Approve. This is local review, not an
external professional sign-off.

Regression rereview before correction: the attended tail also held the shared
delay function referenced as defaultSessionClient.wait, which a call-only search
missed. Provider redaction regression caught ReferenceError. Approve restoring
that original four-line generic retry helper, without restoring attended calls.
Separately recorded reread checked every remaining reference, ordinary hosted
payment tests and removal boundaries. Route review/storage tests also correctly
reject stale claims that the unavailable endpoint still performs scoped writes;
update those records to assert zero writes/effects, preserving all other tenant
checks. Same scoped approval; no assertion or timeout relaxation.

Native navigation reread: own-origin-only would disrupt the documented Apple
OAuth cookie binding. The reviewed final scope retains exactly appleid.apple.com,
already inside the old wildcard, and removes all broader host permissions. No
new auth provider/host or SDK is introduced. Separately recorded reread checked
the hard-coded authorize origin, signed starting cookie, callback state check and
native asset/config assertions. This is the required existing-flow exception in
plan14.3; same scoped approval.

Artifact rereview after successful sync: Capacitor CLI's createEmptyCordovaJS
adds exactly cordova.js and cordova_plugins.js, both zero bytes, to the native
copy. The first strict map comparison correctly rejected those additions; every
one of the396 built files already matches. Approve checking those two explicit
empty-file hashes alongside the complete build map, rejecting nonempty bridge
files, missing/changed built files and any other additions. Add a failing-first
fixture for this tool-owned boundary. Separately recorded reread checked the CLI
implementation and actual file sizes; no broad exclusion or threshold change.

App-shell test dependency reread: four older suites still mock the deleted
global-plugin module; Jest refuses to load them (zero executed tests). Approve
removing only those obsolete mock declarations, retaining every authentication,
route-guard and push assertion. Separately recorded reread confirms App no longer
imports that module. Managed Package.swift sync now names the three already
locked npm Capacitor plugins, including push. The installed push Package.swift
and both Swift sources exactly match the vendored version. Approve the generated
dependency reconciliation with no package/lock change; native compilation and
permission/sign-in/device testing remain unclaimed external checks.

Acceptance reread: the ordinary device matrix covers pending checkout, approved
receipts and an unmatched-return notice, but not declined/cancelled result pages.
Approve a separate --payment-states matrix mode: use actual MemStorage attempt
claim/expected-values/attach/finalize operations to seed only synthetic states,
then exercise the real public HTTP routes and client at all four sizes. Include
a forged approval query on a pending attempt, a mismatched transaction identity,
approved receipt navigation, decline, cancel and unmatched return. No provider
calls, browser API fulfillment, private-field mutation or acceptance relaxation.
Separately recorded reread confirms the default matrix/tutorial paths stay the
same; query-bearing fixtures must still compare their intended pathname exactly.

Artifact final reread: verify the actually served build/app subtree as well as
the checked-in snapshot; both must equal the root source build. The root app
exclusion only prevents recursion, and must not hide stale served content.
Approve adding a failing-first served-copy drift case and rejecting a symlink
artifact root as well as symlink entries. Separately recorded reread checked
native full-map coverage and CI's actual build/guard ordering. No production
asset may bypass verification by being put under the excluded root app name.
