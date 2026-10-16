## Verification of Prior Fixes

Fresh Node22.23.3 npm ci --omit=dev succeeds on the repaired R8 lock. Starting
its actual dist/index.js under a connection-denying preload exits with
ERR_MODULE_NOT_FOUND for vite, with zero connection attempts. server/vite.ts
imports Vite, vite.config.ts and nanoid at module load; production needs only
serveStatic. Vite/config plugins are devDependencies. Normal full-dependency
builds and synthetic device routes do not catch this import-resolution failure.

## Blocking Issues

Production-only startup is blocked. Do not represent the first CI/dependency
slice as R8 exit or a production-install pass.

## High-Risk Concerns

A dynamic local config import can still be bundled into a single ESM output with
its external imports hoisted. Merely moving a static import into a local module
is insufficient. Prove the actual bundled output on an isolated production-only
install. Preserve the owner app, its port/dependencies and every initiation gate.

## Missing Steps

Resolve development-only dependencies inside setupVite. Keep build configuration
loading deferred through an explicit source-file URL, so esbuild cannot hoist its
external development imports into production. Prove module resolution with dev
packages absent, unchanged fail-closed configuration, static serving of the same
frozen assets, and actual development middleware/close behavior. Only then review
further development-tool placement. No bulk dependency movement in this repair.

## Unsafe Assumptions

Passing node --check does not prove external module resolution. Reaching a
configuration refusal proves resolution progressed; it does not prove production
boot, SQL readiness or provider behavior. A small static-serving harness does not
establish full deployment acceptance. No claim of restored-data rehearsal.

## Required Ordering Changes

Freeze and push the first R8 slice with its honest open gates. Keep any next-slice
experiment outside that frozen tree. Retain the actual missing-package failure,
then narrow repair and production-only/development runtime proofs, then source
and build review. Do not change old web bytes by hand or rerun unrelated payment
work merely to inflate validation.

## Open Product / Provider / Legal Questions

None for preventing an unconditional import of a development dependency.
Provider consolidation, package naming, major version migrations and real-target
release decisions remain separate.

## Compliance and Data-Handling Notes

Use only disposable install/source directories and synthetic configuration. No
provider credentials, external delivery, shared DB or production daemon startup.
Do not discover or terminate the owner process/port. Keep raw logs private;
commit metadata-only results.

## Test and Rollback Adequacy

Retain fail-first actual dist import output. Rebuild server with the network guard
and unchanged lock; verify the production-only installed module graph no longer
fails for Vite or its configuration plugins. Test real static HTTP on an owned
loopback ephemeral listener and real development middleware with explicit cleanup.
Run relevant type/regression/lint checks. Reverting the narrow import repair
restores the known startup defect; it is not a release rollback approval.

## Final Recommendation (Approve / Do not approve)

**Approve** this narrow next R8 repository repair and isolated proof after the
first slice is frozen. No package reclassification, live startup or release is
approved by this review. Separate independent reread checked the actual esbuild
external-package setting, Vite configuration imports, static route, production
configuration refusal and fixed owner port. Same scoped Approve; actual new
runtime findings return to review.
