# R0-T2 bounded review — environment-read guard

Base: `3d9736cf397d23fa0073f40704302d91a449a835`.
Branch: `remediation/r1-continuation-20260907`.
Scope: test-only configuration boundary and matrix verification.

## Verification of Prior Fixes

The existing repository scan passes. Synthetic scanner tests added before any
scanner edit report **14 failed, 7 passed**. Bracket/optional/whitespace access,
process aliases/destructuring and process-module imports escape detection;
comments and strings are incorrectly classified as executable reads.

## Blocking Issues

Replace the regex scanner with a TypeScript AST walk, following the existing
`server/route-inventory.ts` convention. Preserve the exact file/key allowlist.
Reject indirect process handles and process-module imports rather than permitting
aliases whose environment use the guard cannot establish.

## High-Risk Concerns

This is a source regression check, not a sandbox for arbitrary malicious code.
Do not claim full JavaScript dataflow or reflection analysis. Do not print values.

## Missing Steps

Run mutation fixtures through the same allowlist decision as repository files.
Verify the payment-environment matrix uses valid database targets, so a database
target error cannot masquerade as rejection of an invalid payment mode.

## Unsafe Assumptions

A green scan alone cannot prove its detector works. A thrown configuration error
alone cannot establish which invariant rejected the input.

## Required Ordering Changes

Original failing scanner run captured first. Apply the bounded test-tool repair,
exercise all valid/invalid matrix cells with exact error keys, then run typecheck
and server regression.

## Open Product / Provider / Legal Questions

None for this test-only R0-T2 correction. Existing R0 human gates remain open.

## Compliance and Data-Handling Notes

Only synthetic source snippets and explicit test configuration objects. No
database, network, provider, secret, runtime config or merchant UI change.

## Test and Rollback Adequacy

Keep negative scanner controls, bootstrap allowlist checks and the original red
summary. Reverting this test-only diff restores the weaker source gate without
affecting application behavior. No migration or deployment rollback needed.

## Final Recommendation (Approve / Do not approve)

Approve this bounded test-only scope on the exact base above. No phase or release
approval is implied.

Separate reread before implementation (same agent, not independent personnel):
checked all current production `process` references, the two migration exceptions,
Jest credential isolation, the AST inventory precedent and the matrix fixtures.
Current non-environment uses (`cwd`, `exit`, `on`, `argv`, `exitCode`) must continue
to pass. An import/alias finding cannot inherit a per-key migration exception.
No additional blocker in this scope.
