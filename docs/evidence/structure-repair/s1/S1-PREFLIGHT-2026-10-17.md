## Verification of Prior Fixes

Baseline 1cbf5c04463121453093584db0fa8c9e7e3d2927 publishes the reviewed plan.
Actual source map: app.ts 2 routes/8 middleware; routes.ts 194 routes; index.ts 0
routes/2 middleware; vite.ts 0 routes/4 middleware. Current fact map 196 entries.
Fresh baseline inventory/facts/review/extractor suites pass (private run record).
Prior 6772 results remain dated; no new full application result is inferred.

## Blocking Issues

No blocker to this tooling-only slice. No real route, guard, business storage,
SQL, client, feature flag, provider call or R4 change is in scope. S2 remains
blocked until S1 supported-module proofs and concrete extraction review pass.

## High-Risk Concerns

Current runtime route check compares Sets, losing order/multiplicity. Registration
files and payment factory analysis are fixed to present source structure. Add a
pure AST composition analyser with explicit root/registrar declarations, same-app
passing and ordered flattening. Unknown/unlisted/unreachable/conditional/cyclic
registrars, duplicate registrations and unsupported dynamic forms must fail.
Keep original discovery and middleware gates. Pin current 196 route order before
moving code; compare source and actual runtime arrays, not Sets.

## Missing Steps

Fail-first tests for missing/unlisted/duplicate/reordered composition, wrong app,
unknown or indirect registrar calls and unsupported modes. Prove guard/effect
facts survive a module boundary, and retained payment factories are analysed
where registered rather than only routes.ts. Preserve source-reading security
assertions while finding the actual registration file. Run relevant existing
policy/contracts/async/security checks and type/lint/tooling before acceptance.

## Unsafe Assumptions

A regenerated policy is not independent proof. Explicitly approved named
registrars and bounded source dependency resolution are supported, not arbitrary
runtime metaprogramming. Do not import app/database/provider modules to inspect
source. Keep shared limiter/service identities and Express async guards intact.
Unsupported dependency aliases/handlers must refuse rather than erase facts.

## Required Ordering Changes

Record baseline and new failing tests first. Add reviewed AST/manifest support,
then wire it into the existing actual harness/generator checks and reverify the
unchanged 196 route/fact inventory. No domain extraction within S1. Keep fresh
fail/pass logs private and commit sanitized metrics and exact source hashes.

## Open Product / Provider / Legal Questions

No product decision needed for this behaviour-preserving verification work.
Claude retains R4, D10 and D13 unchanged. Existing R8 owner/provider/device/restore/
operations/legal gates remain open and independent of safe tooling progress.

## Compliance and Data-Handling Notes

Synthetic source fixtures and owned loopback test harness only. No live targets,
credentials, raw provider payloads or outbound services. Existing source discovery
and no-network guards stay enabled. No owner process is stopped or repurposed.

## Test and Rollback Adequacy

Negative fixtures must prove the failure classes, plus positive same-app modules
and unchanged actual source/runtime/facts. Run affected HTTP/security suites with
open-handle checks. Revert analyser/manifest/tests together; no data rollback or
SQL change. Final evidence states exact supported syntax and unrun external checks.

## Final Recommendation (Approve / Do not approve)

Approve this concrete S1 verification-tooling scope after the separate reread.
This is not approval for S2 extraction, all architecture work, R8 exit or deployment.
