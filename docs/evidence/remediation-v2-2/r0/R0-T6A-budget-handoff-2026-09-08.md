# R0-T6A — bounded migration execution

Base: `ec2072795fa3adc48b508e227884b3837685a3aa`.
Branch: `remediation/r1-continuation-20260907`; changes uncommitted.

## Changes and review

The migration runner previously acquired its session advisory lock with no
deadline, ran statements with no transaction-local budgets and swallowed unlock
failures. Six failing fake-client regressions demonstrated those gaps before
implementation (0 passed / 6 failed).

The runner now validates positive safe-integer budgets capped at five minutes
before queries. Defaults: 5-second lock wait, 10-second advisory statement and
60-second migration statement budget. Advisory acquisition sets session limits
before waiting; ledger/baseline work inherits bounded session limits. Each
migration sets transaction-local lock and statement budgets before its SQL and
ledger write, rolling back on configuration failure. Previous session settings
are restored after success or failure; unlock/restore errors cannot report success.
The dedicated CLI connection has a 5-second connect timeout and 65-second client
query timeout, and is closed even if connection establishment fails.

Custom budgets flow from the frozen lock callback argument through
`RunOptions.timeouts` to every `applyMigration`. Callers composing these helpers
must pass that argument into the pending runner, as the CLI now does. The public
helpers require a dedicated connection; discard it after acquisition/cleanup
failure rather than returning a potentially locked session to a pool.

Preflight: [independent scoped review](R0-T6A-budget-preflight-2026-09-08.md).
Subagent `migration_preflight` reviewed the implementation, initially blocked
custom-budget propagation, and approved after the code and regression covered
that path. It also approved work-budget setup failure and restoration-failure
coverage. Approval is for this code slice only, not production execution.

The budget semantics follow PostgreSQL 16's
[client timeout settings](https://www.postgresql.org/docs/16/runtime-config-client.html)
and [configuration functions](https://www.postgresql.org/docs/16/functions-admin.html).
These are per-statement/per-lock bounds, not a total release wall-clock budget.
Production-sized timing and database cancellation behavior still need rehearsal.

## Verification

```text
node node_modules/jest/bin/jest.js --config jest.server.config.cjs --runTestsByPath server/__tests__/migration-budgets.test.ts server/__tests__/migrate.test.ts server/__tests__/migration-runner-hardening.test.ts server/__tests__/migration-baseline-contract.test.ts --runInBand
4 suites passed / 99 tests passed
npm run check — pass
npm run build — pass
git diff --check — pass
```

New coverage uses fake clients only. The inherited startup failure test targets
the reserved documentation address, not an actual database. No migration command,
real database, restore, baseline adoption or provider operation was run.
Existing ts-jest deprecation, stale browser-data and large-chunk build warnings
remain unsuppressed. No applied SQL migration or lockfile changed.

## Remaining R0-T6A scope

This is **partial T6A**, not its exit:

- CLI still selects ambient DATABASE_URL; require explicit validated target
  identity and reject connection-option overrides before connecting.
- Add reviewed destructive/nontransactional preflight and migrate-first release
  controls. Do not regex-waive existing DO blocks or edit historical migrations.
- Finish structured/redacted CLI and migration-error reporting; existing raw
  driver error paths remain. Do not run the current CLI against sensitive targets.
- Obtain named isolated empty/restored targets and authorized schema metadata.
  Prove canonical all-history fingerprints, constraints, lock timings, restoration
  and N/N+1 compatibility. Existing schema verifier is not that proof.
- R0's incident/access/retention/device/deployment gates remain open.

Rollback: revert only this code/test slice or correct forward. No schema rollback
exists because no database was changed. All inherited work and retained data
remain intact; nothing was committed, pushed, deployed or enabled.
