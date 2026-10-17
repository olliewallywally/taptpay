# R8 isolated verification

Use the Node version in `.nvmrc` (22.23.3, npm10.9.9) and `npm ci` with the
committed lockfile unchanged. Preserve any running owner's node_modules; use an
isolated source/install candidate for dependency work. No additional Git worktree
is required. PHP CLI is required for the contained WooCommerce checks (locally
tested with PHP8.4.24); no WordPress service or live merchant is used.

## Current commands and coverage (October17 follow-up)

`npm run verify:ci` runs all stages and fails on a missing prerequisite. Individual
stages are `--stage=static`, `unit`, `build`, `postgres`, `browser`, `lint`, `secrets`
and `audit`. Browser runs accept `--context=phone|tablet|desktop|desktop-short`;
without that option the runner schedules all four contexts as separate owned
processes. CI uses a four-context matrix with fail-fast=false so slow tutorial
cells cannot consume another device's deadline or silently remove coverage.
Unknown/duplicate arguments fail; no empty browser matrix can pass.

- Static:13 stages: application/R5/R6/R8 typechecks; real package-loader/Drizzle
  contracts; CSS/configuration contracts; portable environment/watch scripts;
  tool contracts (48 tests); backup/fingerprint/R5/R6/R7 safety tests.
- Unit: full client then server Jest runs, with actual nonzero test counts and
  no failures/open handles. Tests prohibit off-machine network access.
- Build: explicit Vite/esbuild build with network connections blocked and
  recorded in every Node child, then strict source-built/web-snapshot parity.
  npm update notifications/audit are off during build. No DB/migration/seed step.
- PostgreSQL:25 stages on separately owned fresh databases in a disposable
  PostgreSQL17 service: canonical0049b replay/repeat plus24 named storage stages.
  The fixed allowlist and target authority are described below.
- Browser: frozen production output, owned HTTPS server and certificate,
  /readyz503 before boot and200 after synthetic fixtures, real cookie login,
  device pages/tutorials, public payment outcomes, chunk abort/hang/reload and terminal exact-cents/
  single-flight checks. All328 original cells remain, with4 additional actual map
  package render/selection/zoom proofs, one per context. No provider credentials or
  outbound browser traffic. The map proof uses production CSS and serves local
  built font files; its exact Google Fonts stylesheet request receives empty CSS.
  Remote font delivery and font fidelity are not validated.
- Lint: corrected parser/globals/file scope plus zero new errors against the
  reviewed baseline. Full lint is not represented as clean.
- Secrets: pinned gitleaks8.30.1, checksum/install in secret-scan.yml, metadata-only
  current-tree and history findings. Known unresolved exposure keeps the gate red.
- Audit: lockfile-only npm audit. Missing/malformed reports fail. Any high or
  critical affected package blocks this gate, with no implicit waiver. Lower
  severities remain visible for reviewed follow-up; no blind major upgrade.

`verify:desktop`, `verify:tutorial`, `verify:chunk` and `verify:terminal` select
browser modes. Build first. Chromium must be installed; set
PLAYWRIGHT_CHROMIUM_PATH to a known executable if it is outside Playwright's
cache. In this environment it is /usr/bin/chromium. PHP_BIN may name the isolated
PHP wrapper. These executable paths are configuration, not credentials.

## Database authority and fixed PostgreSQL allowlist

Supply only R8_CI_ADMIN_URL for the disposable loopback PostgreSQL17 service's
postgres administrative database, plus TAPTPAY_TEST_DATABASE=1. Never fall back to
an application DATABASE_URL. The runner creates r8_ci_<16 random hex> targets,
sets TEST_DATABASE_URL only for each owned verifier, and refuses remote hosts,
non-test names, unsafe/duplicate URL options and application identity collisions.
Phase-specific storage verifiers instead receive
`taptpay_s[234]_verify_r8_<16 random hex>` names; the separate storage guard accepts only those reviewed namespaces. Both guards
refuse application identity collisions, including loopback hostname aliases.
No IF NOT EXISTS adoption is allowed. Cleanup drops only a database this process
successfully created. All DDL is confined to those targets.

The upload ownership inventory is empty only because this process just created
an empty database. Its source digest and exact random target are bound by the
real inventory parser. A fixed inventory for another database cannot be reused.
The canonical fingerprint path is pinned through0049b and must not be changed
merely to obtain a pass. Frozen SQL/checksums are immutable.

The25-stage allowlist in [verify-ci-postgres.ts](../../scripts/verify-ci-postgres.ts)
is fixed in source; it does not accept an arbitrary verifier path or database:

| Group | Stage names | Count |
| --- | --- | ---: |
| Canonical migration | canonical-0049b-repeat | 1 |
| Original native storage | google-sessions, split-sessions, admin-delete, push-sessions | 4 |
| Phase2 identities and payments | apple-identities, apple-connect, r2-t4-expected-values, r2-t7-processor-x-id | 4 |
| Phase2 tenant storage | tenant-transactions, tenant-stock-board, tenant-merchant-settings, tenant-stragglers | 4 |
| Phase3 property storage | tenant-property-profiles, tenant-property-invoices, tenant-property-invoice-send, tenant-property-schedules | 4 |
| Phase4 trades storage | tenant-trades-clients, tenant-trades-create, tenant-trades-invoices, tenant-trades-schedules | 4 |
| Upload storage | uploaded-file-scans, upload-lifecycle, upload-ownership | 3 |
| Canonical current server storage | server-storage | 1 |

The original four native verifiers cover Google/session/throttle/password-reset,
split-invoice session registration, admin merchant deletion and per-login push
preferences. The20 added storage stages use the existing verifier budgets and preserve
source-specific target guards. Each gets a separately created empty owned database. Only the original
phase2/3/4 scripts use the corresponding phase-specific names.

`npm run test:server:postgres` dispatches through the guarded `verify:postgres`
coordinator. It requires the disposable loopback PostgreSQL17 admin URL and
CREATEDB authority; it does not fall back to an application URL. The coordinator
calls `test:server:postgres:internal` only after preparing a separate fresh
canonical0049b server-storage database. The internal command is not a direct
operator entry: its harness requires the explicit canonical CI mode and strict
R8 target/marker/application-collision checks before connecting. The optional
`npm run verify:postgres -- --only=server-storage` runs this owned adapter alone.

The historical pre-index/index/subscription/rerun assertions remain in their
original random owned schemas. Current post-index storage uses public only in
the separately owned canonical database after exact fingerprint and empty-row
checks. The adapter preserves billing-claim concurrency, verifies8 concurrent
retired card callbacks cause no charge or persisted effects, and runs15 current
R3 command cases plus3 paid-plan upgrade/downgrade cases in
[r8-subscription-plan-postgres-cases.ts](../../scripts/r8-subscription-plan-postgres-cases.ts).
The paid-plan proofs cover exact proration/history/period snapshots,8 concurrent
upgrade commands with one purchase, stable UUID replay and a charge-free queued
downgrade. It then runs all19 current durable subscription cases through the same
two independent owned pools. Both helpers leave caller pools open for their
owner to close. All15 original command and19 subscription case bodies remain
byte-identical to their strict source entries; the latter are reusable through
[r3-subscription-postgres-cases.ts](../../scripts/r3-subscription-postgres-cases.ts).

The strict standalone R3 entry remains unchanged in authority:127.0.0.1,
port55440, database r3_integrated_scratch, marker and application URL guards all
precede test-env/application imports. Extracting reusable cases does not retarget
that entry. Fixed-source R3/R5/R6 operator rehearsals retain their original port,
template and operator guards. No frozen migration or historical SQL transformer
is relaxed. Review the dated [storage expansion](../evidence/remediation-v2-2/r8/R8-STORAGE-COVERAGE-PREFLIGHT-2026-10-17.md)
and [canonical adapter](../evidence/remediation-v2-2/r8/R8-CANONICAL-STORAGE-PREFLIGHT-2026-10-17.md)
preflights for the ordering and evidence boundaries.

## Output, teardown and limits

Owned orchestration requires POSIX; Linux is verified. Each command runs in its
own process group with a deadline. On timeout, abort or
parent completion, only that group's descendants are terminated; an existing
app is never discovered and killed by port or name. Cleanup is regression-tested
with descendants that ignore SIGTERM.

R8_REPORT_DIR is for allowlisted stage/status/exit-code JSON and advisory IDs/
severity counts only. CI uploads only that directory's JSON, never raw logs,
screenshots, traces, cookies or provider/database payloads. Private child output
is retained in a private temporary directory for local diagnosis.

The production build and native asset guard cover198 source web files, the
complete checked-in snapshot and, when requested, the full native copy plus only
the two empty Cordova CLI files. Native synchronization is not Xcode/signing/
device evidence. Synthetic memory readiness is not production SQL readiness;
empty database replay is not a real-data restore rehearsal. Older visual goldens
and physical Safari/VoiceOver acceptance are not silently refreshed or claimed
by this workflow. Real release/restore/provider/professional gates remain in
DEPLOYMENT.md and the current handoff. A workflow definition is not a remote CI
pass or proof of branch-protection activation.

## Historical production-import failure (October16)

At the October16 baseline, a fresh Node22 `npm ci --omit=dev` installed
successfully, but the frozen built server failed with ERR_MODULE_NOT_FOUND for
Vite before opening a
network connection. server/vite.ts imported Vite and the build configuration at
module load even when production used only serveStatic. The repair deferred those
imports into development setup. This records the original failure; the current
production-install proof is below. Full target startup remains open. A normal
build with all dependencies cannot establish production-only installation.

## Production-only installation and development middleware proof

The build stage runs `verify:production-install`, normal
`verify:development-vite` and its `--replit` variant after the guarded build/parity
checks. The production verifier creates a new private install, copies the lock/build, runs real npm ci
--omit=dev and checks lock bytes. It executes actual `npm start`, including the
runtime `cross-env` wrapper and built server entry, with no DATABASE_URL under a
connection-denying preload: module resolution must reach
the existing configuration refusal with zero connections. It separately compiles
the actual static-serving module and serves the frozen HTML/JS over an owned
loopback ephemeral listener with digest checks. No production daemon/DB is started.

Development proof starts the real Vite7 middleware on an owned ephemeral
listener, checks transformed HTML and the actual source entry, then closes HTTP
and Vite. It runs both normally and with a synthetic REPL_ID that enables the
actual Replit-specific configuration. The request budget remains10 seconds. The
separate portable-script proof uses the real `cross-env` assignments and
`tsx watch` command with an owned synthetic entry; editing that entry must trigger
a restart, then cancellation must stop its own process group. It starts no
application daemon. The earlier Vite5 speculative-pretransform shutdown issue is
historical; timeouts have not been raised to accommodate it.

The installer clears runtime application/provider variables and forwards
cancellation to its nested owned commands. Those groups stop immediately before
an enclosing CI runner's termination grace; normal coordinators retain their
existing grace. Invalid grace values fail before any command/file action. An
actual canceled-installer regression remains part of the tooling suite. Raw logs
stay private.
These checks establish dependency resolution and local serving, not a production
SQL/Neon boot, real-data restore or provider/professional release acceptance.

## Current dependency and regression checkpoint (October17, groups C–G)

The private package is named taptpay. Portable development/start scripts use
cross-env; tsx watch replaces the obsolete development loader. Targeted compatible,
ORM/mail/build-loader, frontend, CSS/YAML and proven-unused-root changes are
reviewed separately. Runtime React18 and both motion packages remain; actual email
adapters remain pending the owner's provider choice and successful delivery proof.
The final groups C–G lock SHA256 is
`d8f43cb1aa9dc93e7956d420e45e32ac9b41f69d1181fbf4f223ef586db01c5e`.
The prior [compatible](../evidence/remediation-v2-2/r8/R8-COMPATIBLE-VERIFICATION-2026-10-17.json),
[runtime-major](../evidence/remediation-v2-2/r8/R8-RUNTIME-MAJORS-VERIFICATION-2026-10-17.json)
and [frontend](../evidence/remediation-v2-2/r8/R8-FRONTEND-VERIFICATION-2026-10-17.json)
verification files retain their own earlier lock hashes and scoped results; do
not relabel them as final-tree evidence. The
[unused-root preflight](../evidence/remediation-v2-2/r8/R8-UNUSED-ROOTS-PREFLIGHT-2026-10-17.md)
records the final dependency delta.

The latest full audit has39 affected packages, all high, from one unpatched
braces advisory (GHSA-vfj7-8cjw-p6xm) propagated through the development tool tree.
Low/moderate/critical counts are0. Production-filtered audit has0 findings. The
full high/critical gate remains blocked; production filtering grants no waiver.
History credential disposition and owner/external release inputs also remain
open.

The final dependency tree has passed the full6772 unit tests and all328 original
browser cells plus4 additive map proofs. This statement does not certify later
storage-harness edits. The refreshed13-stage static run, including48 tooling
tests, has also passed. The complete default25-stage PostgreSQL run has now passed, including
all15 command,3 paid-plan and19 durable subscription cases in current server
storage. Earlier partial or historical runs are not substituted for this result.
Build/native snapshot parity, synthetic serving and these browser results do not
establish actual provider delivery, UAT, native/device/VoiceOver acceptance,
restored-data operation or official R8 exit.

## Historical groups A–B: relocation and server repairs (October17)

The counts and unchanged-byte statements in this section describe the earlier
A/B checkpoint, before dependency groups C–G; they are not current audit or final
regression counts.

Build, tests, lint, native sync and operator tools use a full frozen `npm ci`.
The38 reviewed tooling/type packages, including Capacitor CLI/iOS, now reside in
devDependencies; Capacitor core stays runtime and all three stay8.4.3. A prebuilt
production daemon uses `npm ci --omit=dev` with the committed lock. Do not run a
native build from a production-only install or replace a running owner's tree.

At that checkpoint the fresh production install contained626 packages, versus
1314 before the slice. Relocation alone fixes no advisory. Compression1.8.2,
multer2.4.0 and
ws8.22.0 removed8 targeted advisory IDs; that checkpoint's full audit was77
affected /58 high /17 moderate /2 low /0 critical. Its security gate was blocked.
Both upload
APIs accept one file and no multipart text fields, with the existing20MiB cap.
This prevents unneeded append-field nesting/array allocation; all existing
source callers send that shape. Eight negative HTTP cases failed before the
bounds; all12 new cases and468 affected regressions passed after the repair.

R8-TOOL-RELOCATION-VERIFICATION-2026-10-17.json records the full6756 unit tests on
the unchanged-version relocation. R8-DEPENDENCY-VERIFICATION-2026-10-17.json records
the subsequent runtime patches and targeted regression. Full unit/browser counts
are not relabelled as a new full run after those patches. At that A/B checkpoint
all198 web bytes remained
unchanged, full native parity passed, and the fresh production entry/static
serving and development middleware checks passed. Source manifests and separate
final review/reread are under docs/evidence/remediation-v2-2/r8. No release approval.
