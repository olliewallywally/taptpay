# R8 isolated verification

Use the Node version in `.nvmrc` (22.23.3, npm10.9.9) and `npm ci` with the
committed lockfile unchanged. Preserve any running owner's node_modules; use an
isolated source/install candidate for dependency work. No additional Git worktree
is required. PHP CLI is required for the contained WooCommerce checks (locally
tested with PHP8.4.24); no WordPress service or live merchant is used.

## Commands

`npm run verify:ci` runs all stages and fails on a missing prerequisite. Individual
stages are `--stage=static`, `unit`, `build`, `postgres`, `browser`, `lint`, `secrets`
and `audit`. Browser runs accept `--context=phone|tablet|desktop|desktop-short`;
without that option the runner schedules all four contexts as separate owned
processes. CI uses a four-context matrix with fail-fast=false so slow tutorial
cells cannot consume another device's deadline or silently remove coverage.
Unknown/duplicate arguments fail; no empty browser matrix can pass.

- Static: application/R5/R6/R8 typecheck, CI/build/lint/PHP/readiness guard tests, existing
  backup/fingerprint/R5/R6/R7 safety tests.
- Unit: full client then server Jest runs, with actual nonzero test counts and
  no failures/open handles. Tests prohibit off-machine network access.
- Build: explicit Vite/esbuild build with network connections blocked and
  recorded in every Node child, then strict source-built/web-snapshot parity.
  npm update notifications/audit are off during build. No DB/migration/seed step.
- PostgreSQL: fresh random databases in a disposable PostgreSQL17 service,
  normal target-bound migration replay and repeat, canonical0049b fingerprint,
  then four existing actual storage verifiers on separate fresh databases.
- Browser: frozen production output, owned HTTPS server and certificate,
  /readyz503 before boot and200 after synthetic fixtures, real cookie login,
  device pages/tutorials, public payment outcomes, chunk abort/hang/reload and terminal exact-cents/
  single-flight checks. No provider credentials or outbound browser traffic.
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

## Database authority

Supply only R8_CI_ADMIN_URL for the disposable loopback PostgreSQL17 service's
postgres administrative database, plus TAPTPAY_TEST_DATABASE=1. Never fall back to
an application DATABASE_URL. The runner creates r8_ci_<16 random hex> targets,
sets TEST_DATABASE_URL only for each owned verifier, and refuses remote hosts,
non-test names, unsafe/duplicate URL options and application identity collisions.
No IF NOT EXISTS adoption is allowed. Cleanup drops only a database this process
successfully created. All DDL is confined to those targets.

The upload ownership inventory is empty only because this process just created
an empty database. Its source digest and exact random target are bound by the
real inventory parser. A fixed inventory for another database cannot be reused.
The canonical fingerprint path is pinned through0049b and must not be changed
merely to obtain a pass. Frozen SQL/checksums are immutable.

The four native-pg storage verifiers cover Google/session/throttle/password-reset,
split-invoice session registration, admin merchant deletion and per-login push
preferences. Source-specific R3/R5/R6 operator rehearsals keep their original
guards and are not silently retargeted. The old verify-server-postgres.mjs
pre/post-index harness stops at0016; current storage needs later columns. Its
historical failure is not reported as a current-schema pass. The new gate uses
current full replay plus the existing full-chain storage verifiers instead.

## Output, teardown and limits

Owned orchestration requires POSIX; Linux is verified. Each command runs in its own process group with a deadline. On timeout, abort or
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

## Next dependency slice: production install

A fresh Node22 `npm ci --omit=dev` installs successfully, but the frozen built
server previously failed with ERR_MODULE_NOT_FOUND for Vite before opening a
network connection. server/vite.ts imports Vite and the build configuration at
module load even when production uses only serveStatic. The import-resolution and
static/middleware proofs are now repaired below. Full target startup remains open.
Further tool relocation still requires consumer and production-install proof. A normal build with all dependencies cannot establish that
production-only installation works.

## Production-only installation and development middleware proof

The build stage now runs `verify:production-install` and
`verify:development-vite` after the guarded build/parity checks. The production
verifier creates a new private install, copies the lock/build, runs real npm ci
--omit=dev and checks lock bytes. It executes the actual built entry with no
DATABASE_URL under a connection-denying preload: module resolution must reach
the existing configuration refusal with zero connections. It separately compiles
the actual static-serving module and serves the frozen HTML/JS over an owned
loopback ephemeral listener with digest checks. No production daemon/DB is started.

Development proof starts the real middleware on an owned ephemeral listener,
checks transformed HTML and the actual source entry, then closes HTTP and Vite.
The request budget remains10 seconds. Vite5's old speculative pretransforms kept
optimized dependency work pending during shutdown; middleware now transforms
modules when requested. Cold-cache proof and full build-stage checks pass without
changing production assets or increasing test timeouts.

The installer clears runtime application/provider variables and forwards
cancellation to its nested owned commands. Those groups stop immediately before
an enclosing CI runner's termination grace; normal coordinators retain their
existing grace. Invalid grace values fail before any command/file action. An
actual canceled installer and39 tooling regressions passed. Raw logs stay private.
These checks establish dependency resolution and local serving, not a production
SQL/Neon boot, real-data restore or provider/professional release acceptance.
