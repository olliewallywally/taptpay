## Verification of Prior Fixes

Core2d0c8c5b is pushed, not deployed. D13/no-effect containment, all1506 client
tests,226 focused server tests,43 API-address contract tests,204 page cells and24
public-state cells pass. Phone/desktop tutorials pass; other contexts continue.
No source-built client asset or monetary state needs changing for this correction.

## Blocking Issues

The Apple-only native navigation rule misses an existing same-browser billing
flow. client/src/pages/settings.tsx and desktop/DesktopSettingsPage.tsx store the
card setup session in sessionStorage, then navigate to the returned HPP URL.
Removing all Windcave navigation would open HPP in the system browser, losing
the original WebView cookie/storage context on return. Correct this before any
native release; do not treat a future device test as a substitute for a known
source-level compatibility repair.

## High-Risk Concerns

Use exactly sec.windcave.com, the production HPP host already validated by
server/windcave-links.ts. It is a narrowing of the existing wildcard, not a
guessed provider/issuer host. Keep exact Apple host and own production app URL.
Do not restore broad domains, include UAT in production navigation, or change
the billing command/session/finalization contracts.

## Missing Steps

Failing-first native config/HPP contract test, exact two-host config and generated
artifact assertions, regenerate native config with cap sync, repeat artifact and
focused tests/typecheck/build. Update runbook/preflight/handoff/receipts to the
correct final boundary. Browser assets must still match the frozen tested build.

## Unsafe Assumptions

Payment HPP is not only a customer-browser flow: merchant billing uses it too.
The earlier Apple-only review missed that sessionStorage dependency. Code can
prove the selected production host; it cannot prove every real 3DS/issuer/native
redirect. Retain physical native UAT as an explicit release gate.

## Required Ordering Changes

Pause final R7 native approval, record this review/reread, reproduce the missing
host with the contract test, then correct config/assertions and sync. No deploy,
SDK enablement, provider call, golden or threshold change. Ongoing Linux browser
tutorials use unchanged client assets and can continue independently.

## Open Product / Provider / Legal Questions

No new product decision. Preserving the documented existing hosted card flow is
within plan14.3's exact-host exception and R7's approved compatibility scope.
UAT native builds need their separately recorded test origin/mode; unknown bank
hosts require actual evidence before any later policy change. D13 remains off.

## Compliance and Data-Handling Notes

Only repo/native generated configuration and synthetic checks. No live/shared DB,
credentials, card data, messages, provider actions or owner-process signals.
Do not claim native/device/provider or professional acceptance from Linux checks.

## Test and Rollback Adequacy

Require the actual production HPP validator and native allowlist to agree on
sec.windcave.com, while broad, UAT and unrelated hosts stay absent. Artifact guard
checks generated exact URL/HTTPS/two-host policy and all source-built bytes.
Keep D13 off; rollback metadata/source/output together. Never restore wildcard
navigation or the unsupported attended implementation.

## Final Recommendation (Approve / Do not approve)

**Approve** the exact production HPP host compatibility correction above from
2d0c8c5b before release. Separately recorded independent reread traced Settings
sessionStorage write, provider redirect, billing callback to Settings and shared
return confirmation; checked R2's exact mode/host/path validator and Capacitor's
allowNavigation behavior. Same scoped Approve; official R7/native release exit
continues to require external evidence.
