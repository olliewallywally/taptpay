# What CI is allowed to migrate — decision requested

Date: 2026-09-08 UTC. Status: **Option A chosen; awaiting the branch details and repository variables.**

## Why this needs deciding now

R0-T6A gave the migration runner an explicit target boundary: every invocation
must declare the database it means, and a command that does not is refused
before it connects. See [naming the migration target](../operations/migration-target.md).

`.github/workflows/verify.yml`'s `browser-gates` job previously ran
`npm run db:migrate` against `secrets.DATABASE_URL` on every push to `main` and
`feat/**`, with nothing recording which database that is. That step now reads
four repository variables — `MIGRATION_TARGET`, `MIGRATION_EXPECTED_HOST`,
`MIGRATION_EXPECTED_PORT`, `MIGRATION_EXPECTED_DATABASE` — and **fails with an
explicit message while they are unset**, rather than migrating an undeclared
database. That failure is deliberate and is the decision point.

This is continuation gap 9 ("CI is not the final isolated release gate. The
existing workflow still uses repository database/JWT secrets, migrates that
target") reaching the surface, not a new problem introduced by the boundary.

## The environments, established 2026-09-08

| Environment | Host | Database | URI `sslmode` | Classification |
| --- | --- | --- | --- | --- |
| Development | `helium` | `heliumdb` | `disable` | `workspace` |
| Production | `ep-mute-grass-af2foouy.c-2.us-west-2.aws.neon.tech` | `neondb` | `require` | `production` |

Development and production are genuinely separate databases. Development was
confirmed read-only on 2026-09-08 at **19 applied, 0 pending, 0 drifted, 0
orphaned** — identical to the clean-database convergence, so it is current and
already carries the `0010a`/`0013` foreign-key repairs.

Two consequences worth recording:

- The development database is neither loopback nor TLS-capable, so it needs the
  pinned-hostname `workspace` classification. That is a reviewed exception, not
  a general relaxation.
- **Production's URI carries `sslmode=require`, which the runner refuses for a
  remote target**, because it encrypts without authenticating the server. Any
  future release against production must supply `sslmode=verify-full`. Neon
  serves publicly-trusted certificates, so this is expected to work, but it has
  not been tested — an agent must not connect to production. Verify it with a
  read-only `--status` run before ever relying on it for a release.

**Still unestablished: what `secrets.DATABASE_URL` points at.** If it is
development or production, CI has been applying migrations to it on every push
to `main` and `feat/**`. Option A replaces it regardless, but it is worth
knowing whether anything needs unwinding.

## Options

**A. A disposable Neon branch owned by CI — CHOSEN.** The owner created a `ci`
branch on 2026-09-08. Point `secrets.DATABASE_URL` at it with
`?sslmode=verify-full` and declare it `--target=ci`. CI then migrates only its
own throwaway database and can never reach development or production.

Repository variables for this option:

```text
MIGRATION_TARGET            = ci
MIGRATION_EXPECTED_HOST     = <the ep-….neon.tech host>
MIGRATION_EXPECTED_DATABASE = <the database name>
MIGRATION_EXPECTED_PORT     = (leave unset; defaults to 5432)
```

Note that Neon connection strings are issued with `sslmode=require`. The runner
refuses that for any remote class, because it encrypts without authenticating
the server, so the secret must be stored with `verify-full`.

**B. Declare the existing database honestly.** Point the variables at whatever
the current secret is and set `MIGRATION_TARGET` accordingly. Restores CI to
green fastest, and the target becomes recorded rather than implicit — but every
push still migrates a shared database, so gap 9 stays open. Acceptable only as a
stopgap with a dated follow-up.

**C. Stop migrating in `browser-gates` entirely.** The gates need a database
that is *already* at the right schema; migrating is incidental to them. Pair
with a separately triggered release step. Cleanest separation, most workflow
churn.

## What is already decided and needs nothing

The migration *correctness* proof no longer depends on any of this. A new
`migration-convergence` job runs the full runner against a `postgres:16` service
container on loopback, declared `--target=local`, and needs **no secrets** — so
it is green on forks and on every pull request. Its first real run is recorded in
[the convergence evidence](../evidence/remediation-v2-2/r0/R0-T6A-convergence-2026-09-08.md):
19 migrations applied to an empty isolated database, 29 public tables, 0 pending
/ 0 drifted / 0 orphaned.

That job is possible because the migration runner talks plain `pg`. The app
cannot use a stock service container — it reaches Neon over WebSocket
(`server/db.ts:1`) — which is why `browser-gates` still needs a real Neon
database and why this decision is only about that job.

## Recommendation

Option A. It is the only option that closes gap 9 rather than recording it, and
the cost is one Neon branch and four repository variables.
