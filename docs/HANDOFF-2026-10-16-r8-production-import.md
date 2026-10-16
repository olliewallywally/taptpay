# R8 production imports and verified first-slice closeout

Branch:remediation/r8-ci-20261016. Code commit:
1c7fdf2f5b606798f39e588492d25e4265fb3516, based on the pushed first implementation
340e284b0f8ee1bd91337ca2a97bf09614e70eeb. A subsequent documentation commit may be
the branch tip; verify Git and remote refs. No merge, deployment or R8 exit.
Claude retains R4. Preserve owner PID4196 and root node_modules.

Read docs/HANDOFF-2026-10-16-r8-inflight.md for the completed first slice. That
filename is historical; its rewritten body records all completed checks. Read
R8-FINAL-REVIEW-2026-10-16.md and R8-INDEPENDENT-REREAD-2026-10-16.md under
docs/evidence/remediation-v2-2/r8 before further dependency/tooling work.

## Completed follow-up

The actual dist entry failed on missing Vite after a fresh npm ci --omit=dev.
Vite, its source configuration and nanoid now load only inside setupVite. The
configuration uses an explicit dynamic source URL so esbuild cannot hoist its
external development plugin imports into the production entry.

The actual old middleware also stalled during close with speculative optimized
module transforms pending. The cold source/HTTP diagnostic reproduced this on
340e284b. Disabling only preTransformRequests fixes that development lifecycle;
requested transforms and HMR remain enabled. The real cold-cache HTML/source
entry and clean close pass with the same10-second request budget. There was no
client source, generated web, dependency version, lock or SQL change in this slice.

The CI build stage now includes real production-only install and development
middleware proof. Each install is newly owned and private; lock bytes must match.
The actual built entry runs with no DATABASE_URL under a connection-denying hook
and must reach the existing configuration refusal. Separate real static HTTP
checks compare HTML/JS digests. This does not launch the full production daemon.

Cancellation propagates to nested owned command groups. A bounded zero kill grace
stops them before the enclosing runner's existing grace; invalid values fail
before file/command effects. Other callers keep their original grace. A real
installer cancellation returned aborted=true/exit1, then another fresh install
passed. Raw logs remain private and no user process was discovered/killed by port.

## Verified results

- First implementation:134 client suites /1507 tests and238 server suites /
  5249 tests, all passed with0 open handles; all328 browser cells passed
  (204 pages,88 tutorials,24 states,8 chunk recovery,4 exact-cents/single-flight).
- First complete static/PG/lint/native checks passed.23 planted faults caught,
  5 clean controls passed. Full lint remains680 existing errors with0 new.
- Follow-up:application and R8 typechecks passed;39 tooling tests passed with
  0 failures/skips; every changed source file has0 ESLint errors.
- Guarded full build, unchanged198-file web snapshot, fresh production-only install,
  configuration refusal and actual static serving passed. Real development
  middleware and shutdown passed. The production installer passed again after the
  cancellation refinement. Request/test timeouts were not increased.
- Source secret scan passed with0 findings after the code changes. History scan
  after340e284b still had2351 findings /2227 dispositioned /124 unresolved.
  No rotation or all-history clearance is asserted.

The verification JSON files and separate SHA256 manifests bind first source340e284b
and follow-up1c7fdf2f. The latter manifest has9 source paths. The first web manifest
still matches every generated asset. No physical-device, remote CI or full
production SQL readiness claim follows from these checks.

## Next R8 work

1. Classify remaining build/test/native/operator consumers, then move proven
   development-only tooling in small groups using the new production-install gate.
   The post-fix conservative application graph has320 files,48 packages and152
   dynamic imports. Its one computed import is the explicitly verified development
   vite.config.ts URL. It is not sufficient alone to authorize uninstalls.
2. Continue targeted compatible advisory repairs and separately reviewed majors.
   Full lock audit remains80 affected /0 critical /61 high /17 moderate /2 low.
   Production-filtered audit still has58 high; tool relocation cannot waive the
   full high/critical gate. No blind audit fix or blanket override.
3. Triage124 history candidates with metadata-only evidence; rotate/revoke actual
   exposures through approved owners. Do not call candidates confirmed secrets
   or mark anything rotated without evidence.
4. Finish normative22.5 portable scripts, approved package name, email-provider
   decision/delivery proof, artifact licensing/PII/design provenance and remaining
   guarded storage-verifier adapters. Metadata inventory removed0 artifacts.
5. Keep R4 integration and all real-target/restore/locks/provider/UAT/native/
   Safari/VoiceOver/visual/legal/professional/operations and release approvals open.

No payment initiation/native flags, owner decisions or frozen migrations changed.
Use the isolated Node22 dependency candidate for more package work; do not replace
root dependencies while the owner app runs. The owner deploys on Replit separately.
The saved cloud setup draft needs review/save and Publish to activate; it is not
published and fresh-task restoration remains unverified.
