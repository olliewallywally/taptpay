# Naming the migration target

This documents R0-T6A's target identity boundary in `server/migrate.ts`. It is
the answer to "which database did that migration actually run against?", and it
is enforced in code, not by convention.

Every invocation must declare the database it means before it is allowed to
connect to one. The declaration is checked against the URI, and then against the
server's own answer. A command that does not say what it is aiming at fails
before a socket is opened.

This boundary does not authorise execution. Running migrations against any real
target still needs the named target, owner authorisation, the separate
[release and destructive-SQL gates](migration-release.md), and a restore
rehearsal that does not exist yet.

## Command shape

```text
npm run db:migrate -- --target=<local|workspace|ci|staging|production> \
  --expected-host=<host> [--expected-port=<port>] --expected-database=<name>
```

`--target`, `--expected-host` and `--expected-database` are required; the port
defaults to 5432. The same arguments apply to `db:migrate:status`,
`db:migrate:baseline` and `db:release`. Modes are `--status`, `--dry-run`,
`--release`, and `--baseline` with `--confirm`/`--force`; exactly one mode per
invocation. The four classifications and the flag vocabulary deliberately match
`scripts/db-backup.mjs` so both operator tools read the same way.

For what the runner refuses to *execute* — destructive and non-transactional
statements — and for the release command itself, see
[running a migration release](migration-release.md).

The URI still arrives as `DATABASE_URL`, through the approved secret channel.
Never paste a URL or password into a command line, shell history or evidence
file.

## What is enforced, in order

**Arguments, before anything is constructed.** An unrecognised, repeated or
conflicting argument is refused. A repeat is never a merge — the later value
would silently win — and two modes in one invocation is a contradiction. Only
the flag *name* is ever recorded, so an argument's value cannot leak into a
diagnostic.

**The URI, before `pg` is imported.** It must be a `postgres:`/`postgresql:`
URI carrying an explicit user and password, exactly one database path
component, valid percent-encoding, a port in range, no fragment, and a real
host — a percent-encoded socket directory is not one. Only `sslmode` and a
bounded `connect_timeout` may appear as query parameters, once each; anything
that could redirect the connection (`host`, `dbname`, `user`, `options`,
`passfile`, …) is refused. The driver is then given explicit host, port, user,
password and database fields rather than the string, because `pg` backfills
whatever a URI omits from the ambient `PG*` environment.

**The declaration, before classification.** Host, effective port and database
must match what was declared. A URI pointing somewhere unexpected reads as a
mismatch rather than as whatever rule the wrong host happens to trip first.

**The classification.** `local` accepts only the explicit loopback literals
`127.0.0.1`, `::1` and `localhost`. A hostname that merely resolves to loopback
is not one. `ci`, `staging` and `production` must not point at loopback and
require `sslmode=verify-full`; encryption without server authentication is not
accepted. Use `ci` for the disposable database a pipeline owns, so it is never
confused with `staging`.

`workspace` is the one reviewed exception, and it exists because the
Replit-attached development database is neither. It answers to a private
hostname over the workspace's own network and offers no TLS, so it can be
neither `local` nor remote — which would have locked developers out of their own
database. Rather than weaken `local` to fit it, `workspace` names the situation
and is **pinned to a closed hostname allowlist in source** (`helium`). It can
never be pointed at anything else, and a loopback or public host declared
`workspace` is refused.

The everyday development command is therefore:

```text
npm run db:migrate:status -- --target=workspace \
  --expected-host=helium --expected-database=heliumdb
```

**The server's own identity, before any work.** The runner asks
`current_database()` and `current_user` and compares both. On a mismatch it does
no ledger, status, apply or baseline work and closes the connection.

## Failures

Errors are fixed `MIGRATE_*` codes with fixed explanations. They never contain
the URI, the arguments, the credentials or a row value, because the first thing
an operator does with a failure is paste it into a chat window. The code names
the rule that refused; this document names the fix.

A connection that cannot be opened reports `MIGRATE_TARGET_CONNECT_FAILED`
without the driver's own message, which would carry the target.

## Callers

Commands that predate this boundary now fail before connecting, which is the
point: they never said which database they meant.

- `npm run db:migrate` with no target arguments fails with
  `MIGRATE_TARGET_EXPECTATION_MISSING`.
- The `apply migrations` step in `.github/workflows/verify.yml` reads its
  declaration from the `MIGRATION_TARGET`, `MIGRATION_EXPECTED_HOST`,
  `MIGRATION_EXPECTED_PORT` and `MIGRATION_EXPECTED_DATABASE` repository
  variables and fails with an explicit message when they are unset. Configuring
  them is an owner decision about what CI is allowed to migrate — an isolated
  service container (`local`, loopback) or a disposable pipeline-owned database
  (`ci`). It is not a decision this boundary makes, and CI migrating a shared
  database remains an open R0 gate.

The read-only startup check in `reportPendingMigrations` is deliberately
unchanged. It never applies anything and must not be able to stop the server.
