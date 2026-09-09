# Widening the schema fingerprint: views, triggers and permissions

Date: 2026-09-09 UTC.
Status: **Implemented, tested and gating.** `fingerprintVersion` 1 → 2.

## Why

`scripts/schema-fingerprint.mjs` is what lets CI assert that the checked-in
migrations still build the reviewed schema, and what let the restore rehearsal
compare production against a clean build. Version 1 compared **tables, columns,
constraints, foreign keys, indexes and sequences** — and nothing else.

Whole classes of object were outside its field of view. Every one of these could
have differed between production and a rebuild, or been added to production by
hand, and the digest would not have moved:

| Invisible to version 1 | Why it matters |
| --- | --- |
| views, materialized views | the standard way to expose a column the base table protects |
| triggers | silent writes on every insert; invisible in a column list |
| functions / procedures | what a trigger actually executes; `SECURITY DEFINER` is an escalation surface |
| row-level security policies | the tenant-isolation boundary itself |
| table, column and schema privileges | a `GRANT ... TO PUBLIC` is not a schema change in version 1's eyes |
| default privileges | grants that apply to tables *not yet created* |
| extensions | a rebuild missing one fails at the first query |
| enum and domain types | a value set the application relies on |

Version 1's own header called the digest's job "telling schema drift from
noise". It could not tell either way about any row in that table.

## What version 2 records

Eight new collections — `views`, `triggers`, `routines`, `policies`, `schemas`,
`defaultPrivileges`, `extensions`, `types` — plus ownership and ACL fields on
tables and columns, an `ownership` block, and eight new `counts` keys. `columns`
and `indexes` now also cover views and materialized views, which version 1's
`relkind IN ('r','p')` filter excluded.

The read-only contract is unchanged and still enforced by test: every statement
reads only `pg_catalog` / `information_schema`, and no statement may contain a
write verb. **No row data can enter the document.**

### Three decisions worth recording

**1. Role names are normalised, not dropped.** Privileges are the one genuinely
environment-specific thing here: the same schema provisioned twice carries
different role *names*, and recording them raw would make every cross-environment
comparison differ for a reason that is not drift — destroying the digest's only
job. So when every relation in `public` shares one owner, that name becomes
`@owner`; any other grantee keeps its literal name, because a grant to somebody
who is not the owner is precisely the drift worth seeing. `PUBLIC` is never
normalised away. When ownership is mixed nothing is normalised, the literal
names stay visible, and `ownership.normalised` reports which happened — the
mixture is itself a finding.

Tested both ways: renaming the owning role leaves the digest unchanged; granting
to anyone else changes it.

**2. Function bodies are digested, never copied.** A body is unbounded
procedural code that can embed a literal secret, and this document is committed
to a repository that is public. `bodyDigest` (sha256) and `bodyLength` still
change whenever the body changes, which is all drift detection needs.
`securityDefiner` is carried in the clear on purpose — it is a privilege
escalation surface and must be readable, not hashed. View definitions *are*
recorded verbatim: a view definition is schema of the same kind as
`pg_get_constraintdef`, which version 1 already recorded in full.

**3. `null` ACL and empty ACL are different facts.** `null` means the catalogue
holds no explicit grants — default privileges, owner only. `[]` means an
explicit but empty grant list. They digest differently, and a malformed ACL
literal stops the run rather than being fingerprinted as prose.

## What it reports on a clean build

Built from `migrations/` alone on a throwaway PostgreSQL 16 (20 applied,
0 pending / 0 drifted / 0 orphaned):

```
tables=30 sequences=21 columns=490 constraints=111 indexes=82
foreignKeyColumnDefaults=0
views=0 triggers=0 routines=0 policies=0 types=0 defaultPrivileges=0
extensions=1 grantsBeyondOwner=1
```

- **No views, triggers, routines or policies.** The migrations build tables and
  nothing else. That is now an asserted fact rather than an assumption.
- **`extensions=1`** — `plpgsql` 1.0, the stock default.
- **No table or column carries an explicit grant.** Every relation is at default
  privileges: owner only.
- **`grantsBeyondOwner=1`**, and it is the shipped PostgreSQL 15+ default
  `GRANT USAGE ON SCHEMA public TO PUBLIC`. Anything above 1 was granted by
  somebody.
- `schemas` records `public` as owned by the built-in `pg_database_owner`. That
  role name is fixed across installations, so it does not vary by environment.

New recorded digest
`sha256:5f3f248f3e3ee68cb981f85e0614183def4ab9d4651c91b5e5f958f6c1133988`,
regenerated twice to the same bytes, stored as
[`R0-T6A-empty-fingerprint-v2-2026-09-09.json`](R0-T6A-empty-fingerprint-v2-2026-09-09.json).
`.github/workflows/verify.yml` gates against it.

The version-1 artefacts are kept unmodified: `R0-T6A-empty-fingerprint-2026-09-08.json`
records the 29-table run, and `R0-T6A-empty-fingerprint-2026-09-09.json` the
30-table run at the moment `crypto_transactions` was adopted. A version 1 and a
version 2 document of the same database are **not comparable**, which is why the
version is a field in the document rather than folklore: a mismatch reads as a
version difference instead of implying drift.

## Tests

`npm run test:fingerprint`: **28 pass, 0 fail** (was 16). The twelve added cover
version declaration, collection and decoding of the new objects, view-definition
drift, body-digest-not-body, body-change detection, role normalisation in both
directions, `grantsBeyondOwner`, mixed ownership, null-vs-empty ACL, malformed
ACL rejection, and that adding a view, trigger, policy or extension each moves
the digest.

The pinned-digest test did its job: it failed the moment the shape changed,
which is the whole reason it exists.

## What the widened tool says about the live database

Run against the development database (a fork of production) and compared with
the clean build. **In every dimension version 1 could not see, the two agree
exactly:**

| New dimension | live | built | |
| --- | --- | --- | --- |
| views / materialized views | 0 | 0 | ✅ |
| triggers | 0 | 0 | ✅ |
| routines (functions, procedures) | 0 | 0 | ✅ |
| row-level security policies | 0 | 0 | ✅ |
| enum / domain types | 0 | 0 | ✅ |
| extensions | 1 (`plpgsql` 1.0) | 1 (`plpgsql` 1.0) | ✅ |
| default privileges | 0 | 0 | ✅ |
| tables with an explicit grant | 0 | 0 | ✅ |
| columns with an explicit grant | 0 | 0 | ✅ |
| `grantsBeyondOwner` | 1 | 1 | ✅ |
| ownership | single owner, normalised | single owner, normalised | ✅ |

The single grant beyond the owner is, in both databases, the stock
`GRANT USAGE ON SCHEMA public TO PUBLIC` that PostgreSQL ships with. **Nothing
has been granted to anyone.** No view exposes a protected column, no trigger
writes behind the application's back, no `SECURITY DEFINER` function exists to
escalate through, and no row-level security policy is silently absent.

That is a negative result, and it is the point: those were previously
*assumptions*, and they are now measured facts that CI re-checks on every push.

**However — the dimensions version 1 *did* cover are not clean:**

| Old dimension | live | built | |
| --- | --- | --- | --- |
| tables | 30 | 30 | ✅ |
| constraints | 111 | 111 | ✅ |
| foreign keys | 51 | 51 | ✅ |
| sequences | **26** | 21 | ⚠️ live has 5 more |
| columns | **497** | 490 | ⚠️ live has 7 more |
| indexes | **81** | 82 | ⚠️ live is missing 1 |
| **foreign-key column defaults** | **6** | **0** | 🔴 |

The last row is the known latent defect, observed live for the first time: six
foreign-key columns in the development database carry rogue `nextval(...)`
auto-increment defaults. `R0-T6A-convergence-2026-09-08.md` established that
this does **not** reproduce on a database built from the checked-in migrations
(0 there, confirmed again here) and concluded it was migration lag rather than a
repository defect. This is the other half of that finding: the lag is real, it
is still present, and it affects **six** columns, not the two the convergence
document traced.

These are differences in the **development** database, which was forked from
production around 2026-06-30 and has diverged since; they do not establish
production's state. Object-by-object causes are being traced separately; that analysis is
recorded in its own file.

**This is also the honest limit of the widening:** it did not find hidden drift
in views, triggers or permissions — it found that the drift was in plain sight
all along, in the dimensions the tool already covered, because nothing had ever
run the comparison against a live database.
