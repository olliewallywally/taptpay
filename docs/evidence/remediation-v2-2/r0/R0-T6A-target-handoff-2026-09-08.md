# R0-T6A — explicit migration target identity

Base: `ec2072795fa3adc48b508e227884b3837685a3aa`.
Branch: `remediation/r1-continuation-20260907`; changes uncommitted.

Continues [R0-T6A bounded migration execution](R0-T6A-budget-handoff-2026-09-08.md),
whose "Remaining R0-T6A scope" named this as the first open item: *"CLI still
selects ambient DATABASE_URL; require explicit validated target identity and
reject connection-option overrides before connecting."*

Preflight: [independent scoped review](R0-T6A-target-preflight-2026-09-08.md),
recommendation **Approve local implementation and synthetic validation only**.
Every control it required is implemented below; no control was waived or
weakened.

## Changes and review

The runner previously connected to whatever `DATABASE_URL` happened to be
exported, passed that string straight to `pg` — which backfills anything a URI
omits from the ambient `PG*` environment — and echoed unknown arguments back to
the terminal. Nothing recorded which database the operator *meant*, so nothing
could contradict a wrong one.

`server/migrate.ts` now carries a target identity boundary. `--target`,
`--expected-host` and `--expected-database` are required on every invocation
(`--expected-port` defaults to 5432). The vocabulary deliberately matches
`scripts/db-backup.mjs` so both operator tools read the same way.

Enforcement runs in the order the preflight specified:

1. **Arguments, before anything is constructed.** Unrecognised, repeated or
   conflicting options are refused. A repeat is never a merge and two modes in
   one invocation is a contradiction. Only the flag *name* is recorded, so an
   argument's value cannot reach a diagnostic.
2. **The URI, before `pg` is imported.** Scheme, explicit user *and* password,
   exactly one database path component, strict percent-encoding, bounded port,
   no fragment, and a real host — a percent-encoded socket directory is not one.
   Only `sslmode` and a bounded `connect_timeout` survive as query parameters,
   once each; `host`, `dbname`, `user`, `options`, `passfile` and every other
   redirect is refused. The driver then receives explicit host/port/user/
   password/database fields, never the string.
3. **The declaration, before classification.** Host, effective port and database
   must match what was declared, so a URI pointing somewhere unexpected reads as
   a mismatch rather than as whatever rule the wrong host trips first.
4. **The classification.** `local` accepts only the loopback literals
   `127.0.0.1`, `::1` and `localhost` — a hostname that merely resolves to
   loopback is not one, which is what stops the legacy non-loopback workspace
   database being relabelled `local`. `staging`/`production` must not point at
   loopback and require `sslmode=verify-full`; encryption without server
   authentication is refused.
5. **The server's own identity, before any work.** `current_database()` and
   `current_user` are compared against the declaration. On a mismatch the runner
   does no ledger, status, apply or baseline work and closes the connection.

Errors are fixed `MIGRATE_*` codes with fixed explanations, free of hosts,
database names and examples so no message can echo its own input. A failed
connection reports `MIGRATE_TARGET_CONNECT_FAILED` without the driver's message,
which would carry the target.

Prior controls are preserved unchanged: the budgets from the previous slice, the
read-only non-fatal startup check in `reportPendingMigrations`, and the existing
history, drift and guarded-baseline semantics.

Operator documentation: [`docs/operations/migration-target.md`](../../../operations/migration-target.md).

## Verification

```text
node node_modules/jest/bin/jest.js --config jest.server.config.cjs --runTestsByPath \
  server/__tests__/migration-target-regression.test.ts server/__tests__/migration-budgets.test.ts \
  server/__tests__/migrate.test.ts server/__tests__/migration-runner-hardening.test.ts \
  server/__tests__/migration-baseline-contract.test.ts --runInBand
5 suites passed / 168 tests passed
npm run check — pass
npm run build — pass (existing chunk-size and ts-jest warnings unsuppressed)
git diff --check — pass
```

The regressions failed before implementation (54 failed / 14 passed of 68) and
pass after. They use pure URI inputs and an injected fake connection; no test
opens a socket. Two seeded expectations were corrected rather than the code
weakened: an authority with credentials and no host is refused one step earlier
as `MIGRATE_TARGET_URL_MALFORMED`, because Node's URL parser rejects it outright.

The CLI was additionally exercised end-to-end from an esbuild bundle against a
dead loopback port (`127.0.0.1:59999`), covering missing arguments, declaration
mismatch, non-loopback `local`, remote without authenticated TLS, a connection
parameter override, a repeated flag, and a correctly declared target with
nothing listening. Each printed its fixed code and the usage contract, and none
printed the URI, credentials or arguments. The probe bundle was deleted. **No
real database, migration, restore, baseline adoption or provider operation was
run**, and nothing was committed, pushed, deployed or enabled.

Full `npm run test:server` in this workspace reports 41/42 suites and 833/834
tests passing once `WINDCAVE_USERNAME`/`WINDCAVE_API_KEY` are present. Both
remaining conditions are environmental, not regressions from this slice: 22
suites otherwise fail at import on `ConfigValidationError` from `server/config.ts`
because R0 removed the tracked runtime secrets, and
`http-params-team-batch.test.ts`'s invite resend returns the handler's own 502
because no email provider is configured, so `sendTeamInviteEmail` returns false.
Neither path imports the migration runner.

## Caller impact — deliberate, and needing an owner decision

The preflight recorded that "legacy CI/release commands without them must fail
before connecting." That is now true, and it is visible:

- `npm run db:migrate` with no target arguments fails with
  `MIGRATE_TARGET_EXPECTATION_MISSING`. The package scripts are unchanged;
  operators append the declaration after `--`.
- `.github/workflows/verify.yml`'s `apply migrations` step now reads
  `MIGRATION_TARGET`, `MIGRATION_EXPECTED_HOST`, `MIGRATION_EXPECTED_PORT` and
  `MIGRATION_EXPECTED_DATABASE` repository variables and **fails with an explicit
  message while they are unset**, rather than migrating an undeclared database.
  Setting them is an owner decision about what CI may migrate — an isolated
  service container (`local`, loopback) or a declared `staging` database. CI
  migrating a shared repository-secret database remains open gap 9 in the
  continuation tracker and is not resolved here.

`replit.md`'s migration section records the new requirement.

## Remaining R0-T6A scope

This is still **partial T6A**, not its exit. Carried forward from the budget
handoff, with the target item now closed:

- ~~CLI selects ambient `DATABASE_URL`~~ — closed by this slice.
- Add reviewed destructive/nontransactional preflight and migrate-first release
  controls. Do not regex-waive existing DO blocks or edit historical migrations.
- Finish structured/redacted reporting for the *migration* error paths. This
  slice covers the target boundary's own output; raw driver errors from
  `applyMigration` and the ledger paths are untouched.
- Obtain named isolated empty/restored targets and authorized schema metadata.
  Prove canonical all-history fingerprints, constraints, lock timings,
  restoration and N/N+1 compatibility. The existing schema verifier is not that
  proof. Real TLS and restore tests remain outstanding.
- Decide what CI is permitted to migrate, then set the repository variables.
- R0's incident/access/retention/device/deployment gates remain open.

Rollback: revert only this code/test/doc slice or correct forward. No schema
rollback exists because no database was changed. All inherited work and retained
data remain intact.
