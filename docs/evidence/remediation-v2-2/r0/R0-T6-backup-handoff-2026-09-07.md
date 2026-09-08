# R0-T6 manual backup safeguard — handoff

Date: 2026-09-07 UTC
Branch: `remediation/r1-continuation-20260907`
Base SHA: `ec2072795fa3adc48b508e227884b3837685a3aa`
Change status: local, uncommitted; no final release SHA asserted.
Review: `R0-T6-backup-preflight-2026-09-07.md`.

## Completed scope

The operator command now requires a dedicated connection input, named target,
matching host/database, full encryption-recipient fingerprint, external encrypted
destination and typed terminal confirmation. It refuses CI/unattended execution,
ambiguous arguments, libpq target overrides and remote connections without
authenticated TLS. It never selects ambient development/production URLs.

`pg_dump` streams directly into GnuPG; only encryption output reaches an
exclusively-created private file. The URI is absent from argv and from the
encryption child's environment. Errors are fixed codes. Timeouts/cancellation and
subprocess failures terminate children and remove only the new partial file.
Retained files and symlinks are neither overwritten nor pruned.

Files: `scripts/db-backup.sh`, `scripts/db-backup.mjs`,
`scripts/db-backup-safety.test.mjs`, `server/__tests__/r0-t6.test.ts`,
`package.json`, `.github/workflows/verify.yml`, and
`docs/operations/encrypted-backup.md`. The CI addition runs only the synthetic
safety suite, not the operator backup command. Existing CI deficiencies are
recorded in the continuation audit, not silently treated as closed.

## Original failing evidence

Before replacing the script:

```text
node scripts/db-backup-safety.test.mjs
not ok: the operator command refuses CI before creating files or selecting ambient databases
Expected actual to be strictly unequal to 0
expected: 0
actual: 0
tests 1 / pass 0 / fail 1
exit 1
```

This used an explicit environment without any database credentials and confined
the old command's directory creation to a synthetic temporary directory. It
made no database call and read no retained file.

A second pre-existing test defect surfaced: `r0-t6.test.ts` called a directory
listing “tracked”, then required it to be empty. It failed with 38 ignored
workspace backup entries (2 checks passed / 1 failed). Corrected it to inspect
`git ls-files` and assert the **tracked count** is zero. Ignored retained backups
are legitimate pending owner review and must not be deleted to make a test pass.
The test now reports counts only, avoiding filenames in assertion output.

## Verification

- Backup safety: **17 tests passed**, zero skipped/cancelled, about 0.4 seconds.
  Covers CI/non-TTY refusal, strict confirmation/arguments, ambient URL rejection,
  exact identity/TLS/URI-query validation, checkout/symlink output refusal,
  isolated subprocess environments and argv, private encrypted-stream output,
  dump/encryption/empty-output failure, timeout, missing executables, existing
  file/dangling symlink preservation and cancellation before/during execution.
- Existing R0-T6 startup/build/index tests: **3 passed**. Historical `ts-jest`
  configuration deprecation warning remains; it was not suppressed.
- `npm run check`: passed after restoring branch dependencies.
- `npm run build`: passed; Vite's existing large-chunk warning remains. No app
  server, migration runner or database connection was started by this build.
- `node --check scripts/db-backup.mjs`, `bash -n scripts/db-backup.sh` and
  `git diff --check`: passed.
- `package-lock.json`: unchanged.

Dependency note: the initial workspace modules belonged to the older UI checkout
and lacked `supertest`/types, causing typecheck errors in existing R1 tests.
Restored this branch's unchanged lockfile with
`npm ci --ignore-scripts --cache /tmp/taptpay-continuation-npm-cache --no-audit --no-fund`:
1,414 packages installed. The sandboxed attempt failed with `EAI_AGAIN` and an npm
exit-handler error; the approved network rerun succeeded. Lifecycle scripts and
automatic dependency upgrades were not run. Synthetic subprocess tests and the
read-only Git test likewise required sandbox subprocess permission after `EPERM`.

## Individual preserved-control mapping for this scope

Source line numbers refer to `docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md`.
Each row retains its wider requirement even where this change closes one part.

| Source checkbox | Plan task / owner | Test and artifact | Remaining acceptance |
|---|---|---|---|
| §22.3 line 1567: managed snapshot/encrypted logical backup/restore | R0-T6 engineering; R0-T6A database owner | 17 synthetic backup tests; operator runbook; this handoff | Managed snapshot, actual encrypted backup/decryption, restored schema/counts/tenancy, RPO/RTO |
| §22.3 line 1573: build-only deployment | R0-T6 engineering | Existing deployment-build source test and successful build | Named release pipeline acceptance under R0-T6A/R8 |
| §22.3 line 1574: no automatic production dumps | R0-T6 engineering | Existing startup source test; operator-only CLI refusal tests | Deployment/runtime acceptance by operator |
| §22.5 line 1597: classify/preserve artifacts | R0-T0/H5 owner; R0-T6 engineering | Existing-file preservation tests, Git tracked-count test, count-only inventory | Owner disposition of 38 current ignored entries; wider asset classification |
| §22.6 line 1602: explicit target and migration safety | R0-T6 backup target validation; R0-T6A database owner | Identity and URI-override tests; this handoff | Migration runner identity, timeouts and empty/restored convergence remain separate |
| §22.12 line 1679: backup/restore runbooks | R0-T6 engineering; R8 operations owner | `docs/operations/encrypted-backup.md` | Real restore drill and remaining incident runbooks |
| §22.13 line 1689: retention/deletion/legal hold | R0-H5 and legal/privacy owner | No-prune and existing-file preservation tests | Approved retention/disposition policy; no retained object was changed |

## Limits, external work and rollback

No database URL or row data was read, no real dump/encryption/restore was executed,
and no backup was opened, moved, pruned or deleted. Subprocess tests use explicit
synthetic executables; they prove orchestration, not cryptographic validity or
restore correctness. GnuPG availability, trusted recipient provisioning and the
actual restore/decrypt rehearsal remain operator acceptance prerequisites.

Count-only current workspace inventory: **38** ignored backup entries, versus
the earlier handoff's 41. No explanation or disposition is inferred from that
difference. R0-H5 remains open. No provider/production action, capability enablement,
deployment, schema mutation or in-flight operation was performed.

R0-H2 is separately complete by Oliver's 2026-09-07 direction. **R0 as a phase is
still incomplete**, including R0-T6A, remaining R0-T7 work and external acceptance.
Do not start additional R1 implementation based on this handoff alone.

Rollback: disable the operator command or fix forward. Do not restore the old
ambient dual-database dump/prune implementation. Preserve the source base and all
retained data; no schema rollback exists for this change.
