# R0-T5 count-only preflight — historical merchant Windcave credentials

Date: 2026-09-11. Branch: `remediation/r1-continuation-20260907`.

R0-T5 requires, before removing the merchant credential surface: "first run a
count-only preflight for non-null `merchants.windcaveApiKey` values and record
only the count, never a value." R5 owns what happens to any values found; R0-T5
only has to establish how many exist.

## Tool

`scripts/count-merchant-credentials.mjs`, with `scripts/count-merchant-credentials.test.mjs`
(6 tests, all pass). It deliberately reuses `connectionSettings()` from
`scripts/schema-fingerprint.mjs` rather than parsing a URI again, so it inherits
the same refusals: no ambient `PG*` backfill, explicit connection fields, a
bounded query-parameter allowlist.

Safety properties, each covered by a test:

- The connection comes from `CREDENTIAL_COUNT_DATABASE_URL`, never from ambient
  `DATABASE_URL`, so a target cannot be reached by accident.
- `--expected-host` and `--expected-database` are both **required**. The URI's
  own host/database must match them, **and** the server's own
  `current_database()` must match too — a URI alone can be redirected.
- The read runs inside `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`
  and always `ROLLBACK`s, including on a target mismatch. A test asserts the
  count query is never issued when the target is wrong.
- The query projects only `count(*)` aggregates cast to `int`. A test collapses
  every parenthesised group and asserts the column name does not survive in the
  projection — proving each mention is inside a `FILTER (WHERE …)` predicate and
  no credential value can leave the database.

## Result — development target only

Command (the target is named, per `docs/operations/migration-target.md`):

```text
CREDENTIAL_COUNT_DATABASE_URL="$DATABASE_URL" node scripts/count-merchant-credentials.mjs \
  --expected-host=helium --expected-database=heliumdb
```

```json
{ "database": "heliumdb", "role": "postgres",
  "merchants": 9, "with_credential": 0, "with_nonempty_credential": 0 }
```

**Development holds no merchant-stored Windcave credential at all.** There is
therefore no historical value to disposition on this target, and R5 inherits
nothing from it.

The same run also confirmed, read-only and independently of the tracker's own
claim, that this target reports **23 applied, 0 pending, 0 drifted, 0 orphaned**
— matching the R0-T6A closure record rather than merely restating it.

## What this does NOT establish

**Production is not counted, and this is the number that actually matters.**
An agent must not connect to production (plan P0, "things an agent must never
do"), so this preflight covers development only. The production count is a
single owner-run command — the same one above with production's
`CREDENTIAL_COUNT_DATABASE_URL` and its own `--expected-host` /
`--expected-database`. Until it runs, R0-T5's credential-count requirement is
recorded as **partially** satisfied: tooling proven, development clear,
production unknown.

Nothing was written. No credential value was read, printed or stored anywhere in
this evidence.
