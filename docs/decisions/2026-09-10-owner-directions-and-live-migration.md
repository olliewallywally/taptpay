# Owner directions, 2026-09-10, and the first live schema change of this lane

Date: 2026-09-10 UTC.
Status: **Recorded as given. Development applied; production outstanding.**

## What the owner decided

| # | Question put | Answer |
| --- | --- | --- |
| 1 | May the two migrations be applied to the live databases? | **Approved.** |
| 2 | Any suspicious account activity in the exposure window? | **No.** |
| 3 | Disposition the ~38 tracked uploads? | **Leave them for now.** |
| 4 | The Figma OAuth client secret | **Delete rather than rotate** (recorded separately). |

## 1 — applied to development, not yet to production

`0018`, `0019`, `0020` and then `0021` were applied to the development database
(`helium/heliumdb`) through `npm run db:release` with the target declared. No
statement was run by hand.

```
19 applied, 3 pending   ->   23 applied, 0 pending, 0 drifted, 0 orphaned
0018  1 statement    3 ms
0019  7 statements  96 ms
0020  2 statements  13 ms
0021  1 statement   28 ms
```

**The drift is gone.** Development's fingerprint moved from 6 foreign-key column
defaults to **0**, and from 81 indexes to **82**. Compared section by section
against a clean build of the same history, what remains is only:

| Difference | Nature |
| --- | --- |
| 99 columns | **`position` and nothing else** — no type, nullability, default or collation differs |
| 18 constraints, 17 foreign keys, 1 index | **name only** — 0 unmatched once names are ignored |
| 5 sequences | orphans left behind by `DROP DEFAULT`; nothing can consume them |

So the development database and the checked-in migration history now agree
completely on substance. That was not true this morning.

### Production is still pending, and it is the harness that stopped it

Production accepted `--status` and `--dry-run` and reports the same **3 pending**
migrations. `--release` was refused by the sandbox classifier, which is the
correct default for a write to a production database, and it was not worked
around. It needs to be run by the owner:

```
export DATABASE_URL=$(node -e 'const u=new URL(process.env.NEON_DATABASE_URL); u.searchParams.set("sslmode","verify-full"); process.stdout.write(u.toString())')
npx tsx server/migrate.ts --release \
  --target=production \
  --expected-host=ep-mute-grass-af2foouy.c-2.us-west-2.aws.neon.tech \
  --expected-database=neondb
```

The `sslmode=verify-full` rewrite is required: the runner refuses a remote target
without authenticated TLS, and `NEON_DATABASE_URL` carries `sslmode=require`.
Verified working against production — Neon's certificate validates.

Expected effect there: `0018` and `0020` are **no-ops** (production already has
the table and all seven columns), `0019` drops six defaults, `0021` creates one
index. After it, production should read 0 foreign-key column defaults and 82
indexes. Re-run `--status` to confirm.

## 2 — no suspicious activity

The owner reports no suspicious account activity across the exposure window.
Recorded as an owner statement, which is what R0-H4 asks for at this stage.

**This is not a completed log review.** No access log was retrieved, parsed or
dispositioned by an agent, and the exposed credentials were valid for
approximately three months, so absence of *noticed* activity is not evidence of
absence. R0-H4's verified-review half stays open, and this record does not close
it. Rotation is still required regardless of what the logs show.

## 3 — uploads deferred

The ~38 tracked upload entries stay unclassified by explicit choice. R0-H5
remains PARTIAL. No contents were inspected. Revisit before any public push of
`main`, since that history is where they live.
