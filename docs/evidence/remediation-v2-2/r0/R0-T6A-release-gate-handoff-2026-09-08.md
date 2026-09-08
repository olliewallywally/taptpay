# R0-T6A — safety gate, release command, and CI convergence

Base: `ec2072795fa3adc48b508e227884b3837685a3aa`.
Branch: `remediation/r1-continuation-20260907`.

Third and final R0-T6A slice in this continuation, after
[bounded execution](R0-T6A-budget-handoff-2026-09-08.md) and
[explicit target identity](R0-T6A-target-handoff-2026-09-08.md). It closes three
of the four items those handoffs left open, and produces the first R0-T6A
evidence taken against a real database.

Owner direction for this slice was "do all of them" against a recommendation
listing the CI target decision, the isolated convergence job, the remaining
T6A order, a `ci` target class, and committing the work.

## Changes

**A `ci` target classification.** `local | ci | staging | production` now matches
`scripts/db-backup.mjs` exactly, so both operator tools share one vocabulary.
`ci` follows the remote rules — non-loopback and `sslmode=verify-full` — so a
pipeline's disposable database is never confused with `staging`.

**A safety gate for destructive and non-transactional statements**
(`inspectMigrationSafety`). Every pending migration is scanned before the ledger
is created and before any statement runs. Two hazards, deliberately not
collapsed into one:

- *Destructive* (`DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, `DROP DATABASE`,
  `DROP TYPE`, `TRUNCATE`, `DELETE` without `WHERE`) destroys rows. It is a
  decision, not a defect, so it is refused unless `--allow-destructive` is
  passed.
- *Non-transactional* (`CONCURRENTLY`, `VACUUM`, `REINDEX`, `ALTER TYPE … ADD
  VALUE`) cannot honestly run inside the single transaction the runner wraps
  each file in. It is refused **outright**; `--allow-destructive` does not
  override it, because the reviewed non-transactional mode the source plan asks
  for does not exist yet.

The scanner works on parsed statements, so comments and string literals cannot
trigger it, and `DO $$ … $$` blocks are scanned rather than waived — the source
plan's "do not regex-waive existing DO blocks" is honoured. Constraint, default
and index *reshapes* are deliberately not flagged: they destroy no rows, and the
checked-in history already uses the drop-then-re-add pattern. A test asserts all
19 checked-in migrations pass the gate unassisted, so a future migration needing
`--allow-destructive` announces itself in review.

**A migrate-first release command.** `npm run db:release` applies pending
migrations and then re-plans against the ledger, reporting success only at 0
pending / 0 drifted / 0 orphaned / 0 out-of-order. A release that cannot say that
has not finished, whatever the apply loop printed. Build and startup remain
read-only. `--dry-run` is the preflight: it lists what would be applied and
reports safety findings without touching anything.

**A `migration-convergence` CI job.** A `postgres:16` service container on
loopback, declared `--target=local`, running the safety preflight, `db:release`,
`db:migrate:status`, and a schema-fingerprint comparison. It needs **no secrets**,
so it is green on forks and on every pull request. This is possible because the
migration runner talks plain `pg`; the app needs Neon's WebSocket driver, but the
app is not involved.

**A schema fingerprint tool** (`scripts/schema-fingerprint.mjs`, built by a
subagent under a strict file boundary). Deterministic, sorted, `public`-schema
only, recording object names and definitions and never row data, with a SHA-256
digest. It refuses ambient `DATABASE_URL` and emits fixed `FINGERPRINT_*` codes,
matching the conventions of the other operator tools.

Operator documentation: [running a migration release](../../../operations/migration-release.md).
Decision requested: [what CI is allowed to migrate](../../../decisions/2026-09-08-ci-migration-target.md).

## Verification

```text
7 migration jest suites — 210 passed
node --test scripts/schema-fingerprint.test.mjs — 16 passed
node --test scripts/db-backup-safety.test.mjs — 17 passed
npm run check — pass
npm run build — pass
git diff --check — pass
full npm run test:server — 43/44 suites, 875/876 tests
```

The safety-gate and release regressions failed before implementation (27/27 and
the release suite respectively) and pass after.

The one remaining server-suite failure is environmental and predates this work:
`http-params-team-batch.test.ts`'s invite resend returns the handler's own 502
because no email provider is configured, so `sendTeamInviteEmail` returns false.
The suite additionally needs `WINDCAVE_USERNAME`/`WINDCAVE_API_KEY` present at
all, because R0 removed the tracked runtime secrets. Neither path imports the
migration runner.

## Real-database evidence

Recorded separately in [empty-database convergence](R0-T6A-convergence-2026-09-08.md).
In short: 19 migrations applied to an isolated PostgreSQL 16.10 on loopback, 29
public tables, 0 pending / 0 drifted / 0 orphaned, zero safety findings, and
schema fingerprint `sha256:4b709a2c…` reproduced **byte-identically two
independent ways** — once via `psql -f`, once through the runner into a
differently-named database under a different login.

That cross-check establishes two things worth stating plainly: the runner's
statement splitting, transaction wrapping and ledger writes produce exactly the
schema the raw SQL does, and the fingerprint carries no target-specific data, so
CI can compare a throwaway container against a recorded artefact.

It also resolved a long-standing suspected defect. The rogue `nextval(...)`
defaults on foreign-key columns **do not reproduce on a clean database**, and the
history already repairs them (`0000` created them; `0010a` and `0013` drop them).
Any live database still showing them has not applied `0010a`/`0013` — it is
migration lag, not a repository defect, and no catch-up migration should be
invented for it.

## What is still open

- **The CI target decision is the owner's** and is the one thing here that is
  not done. `browser-gates` fails until the four `MIGRATION_*` repository
  variables are set. See the decision record.
- **Restored-snapshot convergence.** The empty half is proven; the restored half
  needs an authorised snapshot, which an agent must not obtain for itself. When
  it exists, fingerprint it on PostgreSQL 16.x — `pg_get_constraintdef` and
  `pg_get_indexdef` deparse text can shift between major versions.
- **N/N+1 application compatibility** and **restore rehearsal** — untested.
- **Lock timings on a production-sized clone** — untested; the budgets are
  proven only against fake clients.
- **Structured redaction of the migration error paths.** The target boundary and
  the fingerprint tool emit fixed codes; raw driver errors from `applyMigration`
  and the ledger paths remain.
- **Fingerprint scope.** Views, materialised views, triggers, functions, RLS
  policies, extensions and grants are not fingerprinted. If R0-T6A's exit needs
  them, that is a further slice.
- R0's incident, access, retention, device and deployment gates remain open.
  Nothing here establishes R0 exit.

Rollback: revert this code/test/doc slice or correct forward. No schema rollback
exists — every database this touched was a disposable local cluster that has
since been deleted.
