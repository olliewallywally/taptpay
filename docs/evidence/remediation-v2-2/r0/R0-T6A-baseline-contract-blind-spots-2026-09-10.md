# The baseline contract can now see the two effects it was blind to

Date: 2026-09-10 UTC.
Status: **Repository change only. No database was modified.** The one live
database touched was a throwaway PostgreSQL 16.10 built for this test and
destroyed after it.
Scope: `server/migration-baseline-contract.ts` and its test.

Implements recommendation 3 of
[the live-drift finding](R0-T6A-live-drift-2026-09-09.md). Recommendations 1, 2
and 4 of that document are decisions or production access and remain open.

## What was wrong

`--baseline` records a migration as applied without executing it
(`server/migrate.ts:54`), so the only thing standing between a stamp and a lie
is this contract's list of observable effects. The drift finding proved the list
had a shape problem, not just a coverage problem:

- `Requirement["kind"]` had no way to express **"this column must have no
  default"**, so all three `ALTER COLUMN … DROP DEFAULT` statements in the
  history were unexpressible.
- `0010a`'s twelve statements were represented by four tables and one column.
  `tapt_stones_merchant_id_idx` was not among them.

Those are exactly the two effects that are missing on the development database.
The contract passed it honestly and wrongly.

## What changed

A `column_no_default` kind, matched in SQL by `column_default IS NULL` on an
existing column, and four new requirements:

| Migration | Requirement | Source |
| --- | --- | --- |
| `0010a` | index `tapt_stones.tapt_stones_merchant_id_idx` | `0010a:20` |
| `0010a` | no default on `transactions.merchant_id` | `0010a:25` |
| `0013` | no default on `merchant_subscriptions.current_period_start` | `0013:49` |
| `0013` | no default on `users.merchant_id` | `0013:222` |

That is every `DROP DEFAULT` in `migrations/`, and a test now enforces it:
**"every dropped column default is an expressed requirement"** parses each
migration for `ALTER COLUMN … DROP DEFAULT` — attributing multi-clause `ALTER
TABLE`s to the right table — and fails if any lacks a `column_no_default`
requirement. Removing one requirement was confirmed to fail the test by name.

`column_no_default` fails for two different reasons — an absent column and a
column that kept its default — so it does not reuse the `missing <kind> <name>`
wording. It reports `<table>.<column> must exist without a column default`,
which is true of both.

## A pre-existing defect this surfaced

Running the contract against a real database for the first time found that

```
r("0009_trades_gst_mode.sql", "column", "job_invoices", "gst_mode")
```

names the **wrong table**. `0009:7` adds `gst_mode` to `quotes`, and
`shared/schema.ts:1242` declares it inside the `quotes` block (1231–1284). A
correctly built database has `quotes.gst_mode` and no `job_invoices.gst_mode`,
so this requirement could never be satisfied by any correct database, and
`baselineMigrations` (`server/migrate.ts:1186`) would have refused **any**
baseline plan containing `0009`.

It failed closed, so nothing unsafe followed from it, and it never blocked the
one baseline that matters: it was introduced by `dd71ecf4` on **2026-08-10**,
one day *after* the development database was baselined on 2026-08-09. It has
been latent since. Corrected to `quotes`.

This has the same root cause as everything in the drift finding — **a gate that
was never exercised against a real database.**

## Proof

An isolated PostgreSQL 16.10, all 20 migrations applied by the runner
(`--target=local`), then the contract run over all 20 migration names.

**Clean build — 0 unmet requirements.** The four new requirements are all
satisfied by a correct database, so the change adds no false positive.

The database was then given the development database's two defects exactly:

```sql
ALTER TABLE transactions ALTER COLUMN merchant_id
  SET DEFAULT nextval('transactions_merchant_id_seq');
DROP INDEX tapt_stones_merchant_id_idx;
```

| Contract | Unmet | What it reported |
| --- | ---: | --- |
| pre-change (`69c3d576`) | 1 | only the spurious `0009 … missing column gst_mode` |
| this change | 2 | `transactions.merchant_id must exist without a column default`; `missing index tapt_stones_merchant_id_idx` |

The old contract saw **neither** real defect and raised **one** false one. The
new contract sees both and raises none.

`npx jest server/__tests__/migration` — 8 suites, 155 tests, pass.
`server/__tests__/migrate.test.ts` — 74 tests, pass. `tsc --noEmit` clean.

## Deliberately not done

**Exhaustive index coverage.** `migrations/` contains 44 `CREATE INDEX`
statements against 11 `index` requirements. The contract is a per-migration
sample by design — its header requires a contract for every *migration*, not
every statement — so making index coverage exhaustive would add 33 requirements
and change that design. `0010a`'s missing index is added because the drift
finding proved it load-bearing; the general question is Oliver's.

**`DROP NOT NULL`.** `0010a:26` and `0013:223` also drop `NOT NULL`, and are
equally unexpressible. No live database was observed to differ on nullability,
so no requirement was invented for an unproven defect. Recorded here as a known
remaining blind spot.

## Provenance — how this landed, and how it was put right

Every prior commit on this branch is a single `security(r0):`/`docs(r0):` change
with attribution. This work did not arrive that way, and the record should say
so rather than look tidy.

While it was in progress the Replit agent committed the working tree three times
unprompted, interleaving it with unrelated changes it was making at the same
time:

| Original commit | Its own work | This work, swept in |
| --- | --- | --- |
| `1e268c7d` "Implement analytics tracking and update server migration contracts" | umami instrumentation across `checkout`, `login`, `merchant-signup`, `merchant-onboarding` | the `column_no_default` kind, the four requirements, the test |
| `0e256a5d` "Implement new contract scratch files and update landing runtime logic" | `.replit`, `landingRuntime.ts` | the `0009` `quotes` correction |
| `9cb8f872` "Update remediation documentation and add baseline contract analysis report" | — | this document, the tracker update |

Nothing was lost and the resulting tree was the intended one, verified after the
fact: the four requirements and the correction were present, 229 migration and
runner tests passed, `tsc --noEmit` was clean. But three commit messages
described payment-page analytics and migration-gate hardening as one change,
none carried the branch's attribution trailers, and customer-facing
instrumentation sat in a security remediation lineage. `1e268c7d` had also
caught this file mid-edit — before the `0009` correction — so that commit
contained a contract no correct database could satisfy.

**Resolved 2026-09-10 on the owner's instruction.** Those three commits were
split into four, each carrying one concern: the analytics instrumentation, the
landing/`.replit` changes, the contract change *including* its `0009` correction
so no intermediate commit holds an unsatisfiable gate, and this evidence. The
rebuilt history reproduces the original tree byte for byte — verified by
`git diff` against the pre-split tip, which is empty — and the pre-split branch
is preserved at `backup/pre-split-20260910`. The two commits containing the
agent's own work keep authorship attributed to it in their messages.

The branch is unpushed and must stay so (R0-H2), so this rewrite touched no
published history.
