# Production, measured at last — and it carries the defect

Date: 2026-09-10 UTC.
Status: **Read-only. Nothing in production was modified, and no row was read.**
Owner approval for this connection was given explicitly this session; the
sandbox classifier had refused it, correctly, on the previous attempt.

Closes recommendation 4 of [the live-drift finding](R0-T6A-live-drift-2026-09-09.md),
the last of its four. Method: `scripts/schema-fingerprint.mjs` against
`NEON_DATABASE_URL` — `pg_catalog` and `information_schema` only, no database
name, OID or timestamp in the output, owner normalised to `@owner`.

Production: `sha256:0bc00801…`. Clean build (all 22 migrations):
`sha256:8c40c156…`. Both `fingerprintVersion` 2. Recorded as
[R0-T6A-production-fingerprint-2026-09-10.json](R0-T6A-production-fingerprint-2026-09-10.json).

## The headline

**Every prior finding in this lane was measured on the development fork**, which
was forked from production around 2026-06-30 and has diverged since. It was
therefore an open question whether any of it was true of production. It is.

| Section | clean build | production | |
| --- | ---: | ---: | --- |
| tables | 30 | 30 | ✅ |
| **columns** | **497** | **497** | ✅ exact |
| constraints | 111 | 111 | ✅ |
| foreign keys | 51 | 51 | ✅ |
| views, triggers, routines, policies, types, extensions, schemas | — | — | ✅ all equal |
| indexes | 82 | 81 | 🔸 −1, plus one renamed |
| sequences | 21 | 26 | 🔸 +5 |
| **foreign-key column defaults** | **0** | **6** | 🔴 |
| default privileges | 0 | 2 | ⚪ Neon platform |

## 1. Production carries all six rogue foreign-key defaults

Observed in production for the first time, and it is exactly dev's set:

```
merchant_settlements.merchant_id   platform_fees.merchant_id
platform_fees.transaction_id       refunds.merchant_id
refunds.transaction_id             transactions.merchant_id
```

Five of those are the ones **no migration in the repository could repair** until
`0019_drop_rogue_fk_defaults.sql`. This settles the question the drift finding
had to leave open: the repair is not a dev-only cleanup. A production INSERT
that omits one of these columns takes a sequence value and links the row to
whatever merchant or transaction owns that id — silently, with no error.

The five owned sequences are the `+5` in the sequence count.

## 2. Production is missing `tapt_stones_merchant_id_idx`

The index `0010a:20` creates is absent from production, as it is from dev — the
same baselined-and-never-executed history on both. `0010a` is in the contract
now, exhaustively, so a future baseline of it cannot pass while the index is
missing.

## 3. All seven orphan columns are in production — and `0020` matched it exactly

**Column count is 497 on both sides.** Before `0020_adopt_orphan_columns.sql`
a clean build had 490. Production has the seven orphan columns, the migration
history now creates them, and the two column sets agree exactly — not
approximately. Adopting them was the right call and the shapes copied from the
live catalogue were correct.

## 4. New, minor: one index differs by name only

| | |
| --- | --- |
| production | `invoices_rent_requests_token_unique` |
| clean build | `invoices_rent_requests_token_key` |

Same definition — `CREATE UNIQUE INDEX … ON public.invoices_rent_requests USING
btree (token)`. This is Drizzle's `_unique` generated name against Postgres'
`_key` auto-name, the same construction-method residue as the 18 name-only
constraint differences already recorded on dev. Not a defect; recorded so a
future comparison does not read it as one.

## 5. Neon's platform grants are not drift

The two default-privilege entries are `cloud_admin` granting `neon_superuser`
rights over future tables and sequences in `public`. That is the managed
provider's own infrastructure, present in any Neon database and absent from a
local `initdb`. Nothing is granted to `PUBLIC` beyond the stock schema grant —
`grantsBeyondOwner` reads 1 on both sides, the same stock value.

**Consequence:** a locally built database can never match production's digest,
because these two entries cannot be reproduced by `migrations/`. Comparing the
two requires a section-by-section diff, which is the same conclusion the dev
comparison reached for a different reason.

## What this means for the two new migrations

`0019` and `0020` were written against dev's observed state plus the checked-in
history, before production had ever been measured. Production now confirms both:
it has the six defaults `0019` repairs and the seven columns `0020` adopts, and
nothing else in its structure disagrees with the migration history.

Applying them is still a release action, not an agent action. Nothing here was
applied to production.

## What remains

After `0019` and `0020` run, production's expected remaining differences from a
clean build are: the missing `tapt_stones` index (created by `0010a`, which
production baselined), the one name-only index difference, and Neon's two
platform grants. The five rogue sequences will remain as objects — deliberately,
since `DROP DEFAULT` leaves them and nothing can consume them once the default
is gone.

**Not established here:** production row counts, and whether the seven orphan
columns are empty in production as they are in dev. This run read no rows by
design. The retention question (D8) is still untouched.
