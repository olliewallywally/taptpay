# Closing the live-drift findings: repair, adoption, and a gate that now covers both

Date: 2026-09-10 UTC.
Status: **Repository change only. No live database was modified.** Every database
used here was a throwaway PostgreSQL 16.10 built for the test and destroyed after.
Decision: [FK default repair and orphan column adoption](../../decisions/2026-09-10-fk-default-repair-and-orphan-column-adoption.md).

Closes recommendations 1, 2 and 3 of
[the live-drift finding](R0-T6A-live-drift-2026-09-09.md). Recommendation 4
(fingerprint production) is **not closed** — see the end.

## What shipped

| | |
| --- | --- |
| `migrations/0019_drop_rogue_fk_defaults.sql` | drops the `nextval` default from 7 foreign-key columns |
| `migrations/0020_adopt_orphan_columns.sql` | adopts the 7 orphan columns, shape copied from the live catalogue |
| `server/migration-baseline-contract.ts` | `column_nullable` kind; **exhaustive** index coverage; contracts for both new migrations |
| `server/__tests__/migration-baseline-contract.test.ts` | guards for indexes and `DROP NOT NULL` |
| `server/__tests__/migration-schema-parity.test.ts` | column-level exception pinning |
| `.github/workflows/verify.yml` | fingerprint gate repointed |

The contract grew from 78 requirements to **131**.

## The gate now covers every effect of its class

The blind spots were shape problems, so coverage was made exhaustive per class
rather than sampled, and each class is enforced by a test that parses
`migrations/` and fails on anything unexpressed:

| Class | Statements in history | Expressed before | Now |
| --- | ---: | ---: | ---: |
| `CREATE INDEX` | 43 | 11 | **43** |
| `ALTER COLUMN … DROP DEFAULT` | 10 | 0 | **10** |
| `ALTER COLUMN … DROP NOT NULL` | 2 | 0 | **2** |

The 44th `CREATE INDEX` that a naive `grep` reports is a comment, not a
statement; the parser ignores it.

Sampling is what let `0010a` — twelve statements, five of them indexes, none
covered — be baselined on a database missing one of them. Indexes and defaults
are cheap to check, so there is no reason to sample them.

## Proof

An isolated PostgreSQL 16.10, all **22** migrations applied through the runner:

```
db:migrate --dry-run   22 planned, no safety findings
db:release             22 applied, 0 failures; release verified 22 recorded, 0 pending
db:migrate:status      22 applied, 0 pending, 0 drifted, 0 orphaned
```

**All 131 requirements are satisfied by a clean build — 0 unmet.** So nothing
added here is a false positive.

### `0019` is a no-op on a clean build, and a real repair on a drifted one

The fingerprint proves the first half. Diffed against the recorded
`v2-2026-09-09` artefact:

| Section | Before | After | Delta |
| --- | ---: | ---: | ---: |
| columns | 490 | 497 | **+7** |
| **foreignKeyColumnDefaults** | 0 | 0 | **0** |
| tables, constraints, foreign keys, indexes, sequences, views, triggers, routines, policies, types, extensions, privileges | — | — | **0** |

Every added object is one of the seven adopted columns; **nothing was removed and
no pre-existing object changed.** `0019` moves nothing because a clean build
never had the defects.

The second half was proven by giving a clean database dev's five unrepairable
defaults — the ones no migration anywhere could fix — and running the gate:

| Step | Result |
| --- | --- |
| contract against the drifted database | **5 unmet**, naming exactly `refunds` ×2, `platform_fees` ×2, `merchant_settlements` |
| apply `0019` | applied |
| contract again | **0 unmet**, 0 rogue defaults remain |

Before this work the same contract reported **0 unmet** on that database. The
gate was blind to all five; it now sees all five and the repair clears them.

### Fingerprint

`sha256:8c40c156…` (was `5f3f248f…`), `fingerprintVersion` 2, regenerated twice
byte-identically, recorded as
[R0-T6A-empty-fingerprint-v2-2026-09-10.json](R0-T6A-empty-fingerprint-v2-2026-09-10.json).
`.github/workflows/verify.yml:115` gates against it. The 2026-09-09 artefact is
kept unmodified as the record of that dated run.

### Tests

`npx jest` — **98 suites, 1386 tests, all pass**; `tsc --noEmit` clean.

Note for anyone running the suite here: 22 suites fail to *import* unless
`WINDCAVE_API_KEY` is unset. The workspace environment has that variable without
`WINDCAVE_USERNAME`, and `server/config.ts:201` requires the pair together, so
every suite importing `server/routes.ts` dies at module load. It is an
environment gap, not a code defect — no individual test fails either way, and
`server/__tests__/support/test-env.ts` does not clear the Windcave pair the way
it clears the database URLs. Worth closing separately.

## Recommendation 4 is still open, and it is now the only one

**Production has never been fingerprinted.** I attempted it and the sandbox
classifier blocked the connection to `NEON_DATABASE_URL`, which is the correct
default for a production database. I did not work around it.

Everything measured in this lane is the development fork, which diverged from
production around 2026-06-30. The run is read-only — `scripts/schema-fingerprint.mjs`
touches only `pg_catalog` and `information_schema`, emits no database name, OID
or timestamp, and refuses an ambient `DATABASE_URL` — but it needs owner
approval to run:

```
FINGERPRINT_DATABASE_URL="$NEON_DATABASE_URL" node scripts/schema-fingerprint.mjs > prod.json
```

Until that runs, "the migration history reproduces production" remains
**unverified against production itself**, and these two migrations are written
against dev's observed state plus the checked-in history.
