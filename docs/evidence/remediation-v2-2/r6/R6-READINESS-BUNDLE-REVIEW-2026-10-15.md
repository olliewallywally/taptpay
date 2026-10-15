## Verification of Prior Fixes

Current readiness/shutdown HTTP and real-signal tests pass, as do8 readiness and15
cron PostgreSQL scenarios. Strict schema remains unchanged. Final bundle review
found the canonical fingerprint CLI's direct-entrypoint guard inside dist/index.js.

## Blocking Issues

Do not release the current bundle. Bundling changes import.meta.url to the server
entrypoint, so importing the CLI can trigger its operator main and affect exit
status or perform unintended fingerprint I/O. Existing native module tests do not
prove bundled behavior.

## High-Risk Concerns

Application bootstrap must never run an operator CLI. Preserve the exact canonical
algorithm and CLI export/target-validation contract; do not replace the expected
digest, relax schema checking or add an environment bypass.

## Missing Steps

Extract the metadata SQL and pure normalization/digest/document functions to a
side-effect-free sibling core module. Keep CLI connection/collection/argument/
entrypoint code in the existing script, importing/re-exporting the pure API for
backward compatibility. Readiness imports the core only. Add a real bundled-process
test that invokes readiness with an explicit nonconnecting pool and proves no CLI
output or exit-code mutation. It must fail against the current import.

## Unsafe Assumptions

Direct native imports and green typechecking do not establish bundled entrypoint
safety. The extraction must preserve function/SQL bytes, canonical digest and
strict snapshot semantics. No dependency or expected migration/schema change.

## Required Ordering Changes

Record this review/reread, demonstrate the bundled failure, then extract. Run the
canonical fingerprint tests, real PostgreSQL proof, bundled fixture, typechecks
and final server bundle before final scoped approval.

## Open Product / Provider / Legal Questions

No new policy decision: this prevents unintended operator behavior. Existing
R6/D9/UAT/external operations/R4/R5 release gates remain unchanged.

## Compliance and Data-Handling Notes

The failing fixture has no database/provider credentials and a pool that refuses
connection, so CLI target validation fails before any external I/O. Temporary
bundles live in owned ignored node_modules children and are cleaned afterward.
No shared target, live SQL or migration-byte change.

## Test and Rollback Adequacy

Native canonical tests must still import the old CLI API unchanged. Real owned
schema fingerprints must stay identical. Bundled startup must emit only the test
marker with exit0 after the deliberate nonconnecting pool failure is handled.
Production bundle must contain pure catalog code without the fingerprint CLI main.

## Final Recommendation (Approve / Do not approve)

**Approve** this exact source extraction and verification follow-up within the R6
readiness step on base b7fa2de9. The current bundle remains blocked until its
failing-first test and all required checks pass. No release/phase-exit approval.

Separate pre-implementation reread checked import.meta relocation, export/local
bindings used by the CLI, private failure helper reuse, catalog snapshot ordering,
absence of core module I/O and unchanged canonical bytes/digest. Same exact scoped
approval; no delegated/external reviewer is claimed.
