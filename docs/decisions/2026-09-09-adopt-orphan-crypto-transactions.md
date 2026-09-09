# The orphan `crypto_transactions` table is adopted, not dropped

Date: 2026-09-09 UTC.
Status: **Decided by the owner on 2026-09-09 (option 2 of three). Implemented and verified in the same session.**

## What was decided

`public.crypto_transactions` exists in production and was created by no
checked-in migration. The owner chose to **add a forward migration that creates
it** — `migrations/0018_adopt_crypto_transactions.sql` — over leaving the drift
recorded-but-open (option 1) or archiving and dropping the table (option 3).

## Why this needed deciding

The R0-T6A restore rehearsal
([R0-T6A-restore-rehearsal-2026-09-09.md](../evidence/remediation-v2-2/r0/R0-T6A-restore-rehearsal-2026-09-09.md))
restored production into an isolated database and compared it against a
database built from `migrations/` alone. They differed by exactly one table.

So R0-T6A's convergence claim — *a database built from the checked-in migration
history reproduces production* — was **false by one table**, and would have been
false during a real restore. The table predates `0000`; it was created by an old
`drizzle-kit push` from the crypto-payment feature that the 2026-07-20 handoff
removed. Removing the code did not remove the table.

Nothing reads it: no live source in `server/`, `client/` or `scripts/` mentions
it (the only hit is `client/public/app/assets/schema-h7-17eaE.js`, stale build
output), and `FEATURE_CRYPTO` remains a false-only kill switch that throws
`ConfigValidationError` if ever set true (`server/config.ts:267`).

## What was built

`migrations/0018_adopt_crypto_transactions.sql` — a single
`CREATE TABLE IF NOT EXISTS`, so it is a **no-op against dev and production**,
which already have the table. It reads no rows, backfills nothing and deletes
nothing.

Its shape was copied from the **live catalogue**, not from the deleted Drizzle
declaration, so a rebuilt database matches production exactly rather than
approximately.

## Verification (2026-09-09)

Reproduced CI's `migration-convergence` job locally on a throwaway PostgreSQL
16 on loopback — `initdb`, apply all 20 migrations through the runner, fingerprint:

```
db:migrate --dry-run   20 planned, no safety findings
db:release             20 applied, 0 failures; release verified 20 recorded, 0 pending
db:migrate:status      20 applied, 0 pending, 0 drifted, 0 orphaned
```

**The fingerprint diff against the 2026-09-08 empty-database record is exactly
this table and nothing else** — 30 objects added, **0 removed**:

| Section | Before | After | Added |
| --- | --- | --- | --- |
| tables | 29 | 30 | `crypto_transactions` |
| columns | 470 | 490 | its 20 |
| constraints | 107 | 111 | pkey, unique, 2 foreign key |
| indexes | 80 | 82 | its 2 |
| sequences | 20 | 21 | `crypto_transactions_id_seq` |
| foreign-key column defaults | 0 | **0** | none — the `nextval` defect stays absent |

Every added object names `crypto_transactions`; no pre-existing object changed.

**The built table is catalogue-identical to the live one.** Compared against the
development database (a fork of production) by direct catalogue query:

| Compared | Result |
| --- | --- |
| 20 columns — position, name, type, nullability, default | identical |
| 4 constraints — names and definitions | identical |
| 2 indexes — definitions | identical |
| owned sequence name | identical (`crypto_transactions_id_seq`) |

New recorded fingerprint:
`sha256:964f4251beea3ba52d1e23d973ae354d3bee9aac3539392c27aa04b7c59398b0`
(was `sha256:4b709a2c…`), regenerated twice to the same digest and stored as
[R0-T6A-empty-fingerprint-2026-09-09.json](../evidence/remediation-v2-2/r0/R0-T6A-empty-fingerprint-2026-09-09.json).
`.github/workflows/verify.yml` gated against that file until later the same day,
when the fingerprint was widened to cover views, triggers and permissions
(`fingerprintVersion` 2) and the gate moved to
[R0-T6A-empty-fingerprint-v2-2026-09-09.json](../evidence/remediation-v2-2/r0/R0-T6A-empty-fingerprint-v2-2026-09-09.json). The 2026-09-08
artefact is kept unmodified as the record of that dated run.

## A correction to the record

When the options were put to the owner, this table was described as holding
payment records, and "deleting retained financial data" was given as the reason
an agent may not drop it. **That claim was not verified and appears to be
wrong**: the development database — forked from production on ~2026-06-30 —
holds **0 rows** in `crypto_transactions`.

That does not establish production's count, which remains unverified here, and
the fork predates the crypto removal. But option 3 was presented as more costly
than the evidence supports. The decision stands on its own merits regardless:
option 2 is what makes the migration history true, and it is the only option
that closes the convergence gap whether the table holds rows or not.

To settle it: `SELECT count(*) FROM crypto_transactions;` on the restored
isolated copy. On the development database the answer is **0 rows**, and the two
orphan Coinbase credential columns are non-null on **0 of 9** merchants.

**Also corrected the same day:** the crypto residue is not only this table. Six
orphan columns on `merchants` (`coinbase_commerce_api_key`,
`coinbase_webhook_secret`, `crypto_enabled`, `enabled_cryptocurrencies`,
`auto_convert_to_fiat`, `min_confirmations`) are in the live database and in
neither `migrations/` nor `shared/schema.ts`. `0018` adopted the table but not
these. Deciding them is open — see
[the live drift analysis](../evidence/remediation-v2-2/r0/R0-T6A-live-drift-2026-09-09.md).

## The deliberate exception this creates

`crypto_transactions` is now the **only** table created by a migration that is
not declared in `shared/schema.ts`. That is intentional — declaring it would
re-import a removed feature's surface into the ORM — but it has a consequence:

> `drizzle-kit push` (`npm run db:push`) diffs `public` against
> `shared/schema.ts` and **will offer to DROP this table.**

That hazard predates this migration; the table has always been invisible to the
Drizzle schema, and `npm run db:push` has always been unsafe in this repository.
What changes is that the exception is now *declared*: `server/__tests__/
migration-schema-parity.test.ts` asserts that the set of migration-created
tables absent from `shared/schema.ts` is exactly `{crypto_transactions}`, with
the reason recorded beside it. A future table drifting out of the ORM fails that
test instead of being discovered by a restore rehearsal months later.

## Still open, deliberately

Adopting the table records what production has; it does not decide how long
those rows should be kept. **D8's retention question remains unresolved**, and
option 3 (archive and drop, under a dated retention decision and
`--allow-destructive`) stays available.

Separately: `client/public/app/assets/schema-h7-17eaE.js` is stale build output
that still carries crypto schema references. Not source, but a shipped asset
naming a removed feature.
