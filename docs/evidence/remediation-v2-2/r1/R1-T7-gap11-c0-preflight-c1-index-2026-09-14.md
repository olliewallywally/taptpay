# R1-T7 — gap 11, steps C0 (duplicate preflight) and C1 (partial unique indexes) only

Date: 2026-09-14. Branch: `remediation/r1-continuation-20260907`. HEAD at start
and end: `cd51f3b9` (git-tracked). This task's source changes
(`shared/schema.ts`, `server/__tests__/migrate.test.ts`,
`server/__tests__/payment-schema.test.ts`,
`server/migration-baseline-contract.ts`, and the new
`migrations/0022_gap11_session_single_use_indexes.sql` /
`scripts/count-gap11-session-replay-duplicates.mjs` /
`scripts/count-gap11-session-replay-duplicates.test.mjs`) remain **uncommitted**
in the working tree, as handed in — no commit was made by this pass and none
was asked for. The migration's database-side effect (applied to the dev
database) is independent of git and is not undone by the source being
uncommitted.

## Docs read first

- `docs/decisions/2026-09-13-gap11-split-session-single-use-design.md` — the
  design memo. Section 4 ("Recommendation" / "Suggested sequence") defines the
  six-step plan `C0`–`C5` this task implements two steps of.
- `docs/evidence/remediation-v2-2/r1/R1-T3-property-tenant-scoping-2026-09-13.md`
  — read as the format/rigor model for this file only; its content (property
  tenant scoping) is unrelated to gap 11.

## Scope, stated up front

This task is **only** the memo's `C0` and `C1`:

> **C0.** Count-only preflight: duplicate non-null `processor_session_id` in
> `payment_attempts`; duplicate non-null `windcave_transaction_id` in
> `split_payments`; `split_payments` rows `completed` with a null provider
> transaction id; transactions whose `completedSplits` disagrees with their
> completed split rows. Numbers only, no remediation.
>
> **C1.** Add the partial unique index on
> `payment_attempts(processor_session_id)` (R2 §9.4) and on
> `split_payments(windcave_transaction_id)`. Additive, no behaviour change,
> immediate defence in depth.

`C2` (compare-and-set contract on `updateSplitPaymentStatus` + transactional
counter increment), `C3` (migrate `/pay` and both completion routes to the
`payment_attempts` engine), `C4` (callback/notification reconciliation by
session instead of finalisation), and `C5` (the durable inbox) are **explicitly
out of scope** and were not touched — no code in `finaliseHostedPayment`,
`getNextPendingSplit`, `updateSplitPaymentStatus`, `incrementTransactionCount`,
or the four call sites the memo's §1.1 table names
(`server/routes.ts:2941, 3014, 3989–4012, 4173–4202`) was read for modification
or modified.

---

## C0 — duplicate preflight, as executed and handed to this pass

Script: `scripts/count-gap11-session-replay-duplicates.mjs`. Invocation:

```
GAP11_C0_DATABASE_URL="$DATABASE_URL" node scripts/count-gap11-session-replay-duplicates.mjs \
  --expected-host=helium --expected-database=heliumdb
```

Result (exit 0):

| Check | Count |
| --- | --- |
| Duplicate non-null `processor_session_id` values in `payment_attempts` | 0 (0 duplicate values, 0 duplicate rows) |
| Duplicate non-null `windcave_transaction_id` values in `split_payments` | 0 (0 duplicate values, 0 duplicate rows) |
| `split_payments` rows `completed` with a null provider transaction id | 0 |
| Transactions whose `completedSplits` disagrees with actual completed split rows | 0 |
| `safeToAddIndexes` | `true` |
| Connected target | `database=heliumdb role=postgres` (matches `--expected-host`/`--expected-database`) |

**Honesty caveat, carried forward from the handed-in report and independently
confirmed below, not softened:** `payment_attempts` has 0 rows and
`split_payments` has 0 rows in this database, and of `transactions`' 8 rows,
none has `total_splits > 1`. No split-bill transaction exists here yet. All
four zero counts are therefore **vacuously true in this database today** — the
preflight proves "no existing-data violation in this dev DB right now," not
that the indexes are safe under real split-payment load (production, or this
database once split billing is actually used).

Companion unit test `scripts/count-gap11-session-replay-duplicates.test.mjs`
(`node --test`): 6/6 passed, covering argument parsing, refusal on a
host/database mismatch, read-only/rollback behaviour, that the queries never
project a raw session or transaction id, and both a zero-result and a
nonzero-result response shape.

## Independent review, as executed and handed to this pass

Recommendation: **PROCEED.** The review re-verified C0 via two paths
independent of the script itself:

1. Re-ran the identical script against `DATABASE_URL` — identical output to
   the report above.
2. Wrote separate, differently-phrased read-only SQL (explicit row-listing
   `GROUP BY`/`HAVING` for duplicates; a `LEFT JOIN` aggregate instead of the
   script's correlated subquery for the split-count mismatch check) inside its
   own `BEGIN READ ONLY, REPEATABLE READ ... ROLLBACK`, and got matching
   results: `heliumdb`/`postgres` confirmed as the connected target;
   `payment_attempts` 0 rows / 0 duplicate groups; `split_payments` 0 rows / 0
   duplicate groups / 0 completed-with-null-tx rows; `transactions` 8 rows, all
   `total_splits=1, completed_splits=0`, 0 mismatches.

It also cross-checked the column and table names both scripts query against
`shared/schema.ts` (`payment_attempts.processor_session_id` — then line 272;
`split_payments.windcave_transaction_id` — then line 223;
`transactions.total_splits`/`completed_splits` — then lines 171–172), ruling
out a wrong-column false negative, and ran the companion unit test itself
(6/6 passed).

The review names the same vacuous-zero-rows caveat as its one disclosed
limitation, and gives the operative rule it applied: the task's fail-closed
criterion is "stop only if duplicates/conflicts are found"; none were found by
either path, so C1 was cleared to proceed.

---

## C1 — implementation, as executed and handed to this pass

### Migration

`migrations/0022_gap11_session_single_use_indexes.sql` — 6 statements inside
one `BEGIN`/`COMMIT`:

1. `LOCK TABLE payment_attempts IN SHARE MODE;`
2. A `DO $$ ... $$` block that re-runs the duplicate-`processor_session_id`
   check natively and `RAISE EXCEPTION`s (naming the memo and refusing to
   remediate) if any duplicate exists — a second, database-native gate
   independent of the external script, so the migration fails closed even if
   applied later without `count-gap11-session-replay-duplicates.mjs` having
   been re-run first. No-op here (0 rows).
3. `CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_processor_session_id_uq ON payment_attempts (processor_session_id) WHERE processor_session_id IS NOT NULL;`
4. `LOCK TABLE split_payments IN SHARE MODE;`
5. The equivalent `DO $$ ... $$` duplicate gate for
   `split_payments.windcave_transaction_id`. No-op here (0 rows).
6. `CREATE UNIQUE INDEX IF NOT EXISTS split_payments_windcave_transaction_id_uq ON split_payments (windcave_transaction_id) WHERE windcave_transaction_id IS NOT NULL;`

Plain `CREATE UNIQUE INDEX`, never `CONCURRENTLY` — the project's migration
runner (`server/migrate.ts`) transaction-wraps every migration, and
`CONCURRENTLY` cannot run inside a transaction (same reasoning as migration
`0021`). Applied via the project's own runner, not `drizzle-kit push`:

```
npm run db:migrate -- --target=workspace --expected-host=helium --expected-database=heliumdb
  → applying 0022_gap11_session_single_use_indexes.sql ...
  ✅ 0022_gap11_session_single_use_indexes.sql (6 statement(s), 288ms)
  ✅ Applied 1 migration(s).
```

Zero rows were modified anywhere; this is index/DDL only.

### Schema

Two additive `uniqueIndex(...).where(sql\`...\`)` entries added to
`shared/schema.ts`, matching the table's existing partial-unique-index idiom
(`liveTransactionShareUnique`, `returnStateHashUnique`):

- `paymentAttempts`: `processorSessionIdUnique` — unique on `processorSessionId`
  where not null (index name `payment_attempts_processor_session_id_uq`),
  placed immediately after `returnStateHashUnique`.
- `splitPayments`: `windcaveTransactionIdUnique` — unique on
  `windcaveTransactionId` where not null (index name
  `split_payments_windcave_transaction_id_uq`), placed immediately after
  `transactionSplitUnique`.

No column, table, constraint, or existing index was altered or dropped; no
application code (`server/routes.ts`, `server/storage.ts`) was touched.

Three test-contract fixtures were also updated — required for this repo's own
exhaustive migration/index self-consistency contract, not a schema change:

- `server/__tests__/migrate.test.ts` — added
  `"0022_gap11_session_single_use_indexes.sql"` to the `REAL_MIGRATIONS`
  fixture list.
- `server/migration-baseline-contract.ts` — added the two new indexes as
  `Requirement` entries in `BASELINE_EFFECT_REQUIREMENTS` (this repo asserts
  every `CREATE INDEX` in every migration file is an expressed requirement).
- `server/__tests__/payment-schema.test.ts` — added
  `"payment_attempts_processor_session_id_uq"` to the exact sorted index-name
  list asserted for `paymentAttempts`, and a `toContain` assertion for
  `"split_payments_windcave_transaction_id_uq"` on `splitPayments`.

### Reported verification (typecheck, suite, fingerprint, `pg_indexes`)

- `npm run check` (tsc): clean before and after, zero errors either run.
- `npm run test:server`: baseline (before any change) 55 suites / 1046 tests
  passed. A **transient** post-change run — before the three test-contract
  fixtures above were updated — showed 3 suites / 4 tests failing
  (`migrate.test.ts`, `payment-schema.test.ts`,
  `migration-baseline-contract.test.ts`), because this repo's own
  self-consistency contract requires a new migration to register itself in
  those three places. Not a functional regression; fixed by the fixture
  updates, after which the suite returned to 55 suites / 1046 tests passed —
  identical to baseline.
- `pg_indexes` query for both new index names: both present, `unique: true`,
  not `INVALID` (moot, since `CONCURRENTLY` was never used), matching the
  intended `CREATE UNIQUE INDEX ... WHERE ... IS NOT NULL` definitions exactly.
- `scripts/schema-fingerprint.mjs` before/after diff against `heliumdb`:
  indexes count 82→84, every other catalogue count identical (tables=30,
  sequences=26, columns=497, constraints=111, primaryKeyConstraints=30,
  uniqueConstraints=9, checkConstraints=21, foreignKeyConstraints=51,
  foreignKeys=51, views=0, triggers=0, routines=0, policies=0, extensions=1,
  types=0). Before digest `sha256:9121c10d82e77da37ce20728e8fe40dd11ebb1ff0ac9f228b73068902cb048f1`;
  after digest `sha256:672ed1d3ec686150fea9999bacf112c392b4ac240d87455f4182e1eb6de82604`.

### Handed-in verdict

`VERIFICATION`: **PASS**, no issues.

---

## Further independent re-verification performed in this pass

The above is what was reported to this pass as already done. Rather than take
it on trust, this pass re-ran the falsifiable parts itself, right now, against
the live dev database and the live working tree:

1. **Migration file content** — read `migrations/0022_gap11_session_single_use_indexes.sql`
   in full: matches the description above exactly (6 statements, two `DO $$`
   duplicate gates, both `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE ... IS
   NOT NULL`, plain, no `CONCURRENTLY`).
2. **Schema and test-contract diffs** — `git diff shared/schema.ts
   server/__tests__/migrate.test.ts server/__tests__/payment-schema.test.ts
   server/migration-baseline-contract.ts`: the four diffs match the "Schema"
   section above line for line (both new `uniqueIndex` entries with their
   `where(sql\`... is not null\`)` clauses and comments; the one new line in
   `REAL_MIGRATIONS`; the two new `Requirement` entries; the two new index-name
   assertions).
3. **C0 script, re-run fresh**:
   `GAP11_C0_DATABASE_URL="$DATABASE_URL" node scripts/count-gap11-session-replay-duplicates.mjs --expected-host=helium --expected-database=heliumdb`
   → `database=heliumdb role=postgres`,
   `duplicateProcessorSessionIds: {duplicateValues:0, duplicateRows:0}`,
   `duplicateWindcaveTransactionIds: {duplicateValues:0, duplicateRows:0}`,
   `completedSplitsWithNullProviderTxId: 0`, `transactionsWithSplitCountMismatch: 0`,
   `safeToAddIndexes: true` — identical to both the original report and the
   review's own re-run.
4. **Companion unit test, re-run fresh**: `node --test
   scripts/count-gap11-session-replay-duplicates.test.mjs` → `tests 6, pass 6,
   fail 0`.
5. **Migration ledger status, checked fresh**: `npm run db:migrate:status --
   --target=workspace --expected-host=helium --expected-database=heliumdb` →
   `24 applied, 0 pending, 0 drifted, 0 orphaned.`
6. **`pg_indexes`, queried directly against `heliumdb` in this pass** (not
   relayed): both indexes exist with exactly the reported definitions —
   `CREATE UNIQUE INDEX payment_attempts_processor_session_id_uq ON
   public.payment_attempts USING btree (processor_session_id) WHERE
   (processor_session_id IS NOT NULL)` and `CREATE UNIQUE INDEX
   split_payments_windcave_transaction_id_uq ON public.split_payments USING
   btree (windcave_transaction_id) WHERE (windcave_transaction_id IS NOT
   NULL)`.
7. **Typecheck, re-run fresh**: `npm run check` → clean, zero output.
8. **Full server suite, re-run fresh**: `npm run test:server` →
   `Test Suites: 55 passed, 55 total. Tests: 1046 passed, 1046 total.` —
   identical to the reported after-count.
9. **Schema fingerprint, re-run fresh** (`FINGERPRINT_DATABASE_URL="$DATABASE_URL"
   node scripts/schema-fingerprint.mjs`): digest
   `sha256:672ed1d3ec686150fea9999bacf112c392b4ac240d87455f4182e1eb6de82604`,
   `indexes=84`, and every other named count (`tables=30 sequences=26
   columns=497 constraints=111 primaryKeyConstraints=30 uniqueConstraints=9
   checkConstraints=21 foreignKeyConstraints=51 foreignKeys=51 views=0
   triggers=0 routines=0 policies=0 extensions=1 types=0`) — matches the
   reported "after" state exactly. (The reported "before" digest was not
   independently re-derived in this pass, since the migration is already
   applied and there is no pre-migration snapshot left to fingerprint against;
   the 82→84 index-count arithmetic is internally consistent with the "after"
   figure of 84 and the two indexes added.)

Every independently-checkable claim in the handed-in report reproduced
exactly. No discrepancy was found between what was reported and what the live
database, working tree, and test suite show right now.

---

## What this closes, and — stated explicitly — what it does not

**This closes only `C0` and `C1` of gap 11's six-step plan.** `C2`
(compare-and-set on `updateSplitPaymentStatus` and a transactional counter
increment), `C3` (migrate `/pay` and both completion routes onto the
`payment_attempts` engine, deleting `finaliseHostedPayment`'s split
advancement), `C4` (make the callback and notification handlers reconcile the
persisted attempt by session instead of finalising), and `C5` (the durable
notification inbox) **remain open**, not started, and are separately
scheduled — sequencing and timing are an owner decision per the memo's §7
(engineering-choice vs. owner-decision split) and §4's own "each step
independently shippable" framing.

**Gap 11 itself is not closed by this task.** The replay defect described in
the memo's §1 — that a Windcave session, once it has legitimately funded one
finalisation, is never marked spent, so `finaliseHostedPayment` /
`getNextPendingSplit` / `updateSplitPaymentStatus` and all four call sites
(`server/routes.ts:2941, 3014`, the notification handler at `~3989–4012`, and
the unauthenticated callback at `~4173–4202`) will credit the next pending
split (or re-run `incrementTransactionCount`) on replay — **is still live in
application code today**, byte for byte as the memo describes it. No route
handler, storage method, or finalisation path was changed by this task.

The two indexes added here are **defense in depth only**: they make it
impossible for the *storage layer* to ever hold two rows with the same non-null
`processor_session_id` or the same non-null `windcave_transaction_id`, which
is a real, additive safety property (and one R2 §9.4 already requires
independently for the `payment_attempts` index). They do **not** stop the
replay described in the memo, because the replay's actual mechanism —
`getNextPendingSplit` selecting a *different* `split_payments` row and
`finaliseHostedPayment` writing a *different* `payment_attempts`/
`transactions` state each time — never produces two rows with the same
session id or provider transaction id in the first place; each replay
manufactures a *new*, distinct such value on a *different* row, which these
indexes have no opinion about. (This is exactly why the memo scopes the
"close the mechanism" work to `C3`, not `C1` — see its §3, Option C's
"Concurrency" and "Split ordering" analysis.) And in this specific database
right now, the safety property is additionally **vacuous**: with 0 rows in
`payment_attempts` and 0 rows in `split_payments`, the indexes have not yet
had anything to reject.

## Production caveat

`scripts/count-gap11-session-replay-duplicates.mjs` must be **re-run against
production, by someone with production access**, and must again report all
four counts as zero, before migration `0022` is applied there. This task
covers **only** the dev database (`heliumdb`, reached via the `workspace`
target and `DATABASE_URL` available in this environment); it has no
production credentials and made no production change. Production apply of
prior migrations is separately gated in this program — the existing record at
[R0-T6A closure](../r0/R0-T6A-closure-2026-09-10.md) and
[2026-09-10 owner directions](../../decisions/2026-09-10-owner-directions-and-live-migration.md)
already note that production apply is pending after the sandbox classifier
refused it, and that the restore-ACL repair has never been exercised against a
real restore — this task changes nothing about that standing constraint, and
migration `0022` is subject to it exactly like every other pending migration.

---

## Remaining risk / open items

- **`C2`–`C5` open** (see above), each gated on an engineering decision the
  memo already scopes (§4) and, for `C3`/§10.3, on an owner decision (retire
  vs. migrate the legacy numeric `/checkout/:id` and `/split/:id` flow — see
  memo §7 item 1) that changes `C3`'s size materially.
- **The migration's own duplicate gate is untested against a nonzero case in
  this pass.** The `DO $$ ... $$` blocks were exercised only in their no-op
  (0 duplicates) branch, because this database has no duplicates to trigger
  the `RAISE EXCEPTION` path. The companion script's own test file
  (`scripts/count-gap11-session-replay-duplicates.test.mjs`) does cover a
  nonzero-result shape for the *script*, but nothing in this pass exercised
  the migration's in-database `RAISE EXCEPTION` branch itself (that would
  require seeding a duplicate row in a throwaway database, which was not
  done).
- **Production re-run of the preflight has not happened** (see caveat above);
  this is a hard prerequisite this record does not treat as satisfied.
- **Pre-existing risk carried over from the memo, unchanged by this task**:
  any session already spent (had its one legitimate finalisation) before a
  future `C3`/`C4` deploy still buys one free replay under any option the
  memo considers, including the option actually taken here — the indexes added
  in `C1` do not retroactively affect sessions already recorded before they
  existed, and in any case do not address the replay mechanism at all (see
  above).

## What was done, and what was deliberately not done

**Done:** `C0`'s preflight (re-run and independently re-verified three times
across this task — the original run, the review's two independent paths, and
this pass's own fourth independent run — all agreeing: zero duplicates, zero
mismatches, `safeToAddIndexes: true`); `C1`'s two partial unique indexes,
applied via the project's own migration runner and recorded cleanly in the
dev ledger (24 applied, 0 pending/drifted/orphaned); the three test-contract
fixtures this repo requires a new migration to register itself in; a clean
`tsc` and a clean, unchanged (55/1046) full server-suite result before and
after.

**Deliberately not done:** any change to `finaliseHostedPayment`,
`getNextPendingSplit`, `updateSplitPaymentStatus`,
`incrementTransactionCount`, or any of the four call sites named in the memo
§1.1 (`C2`–`C4`'s work); the durable notification inbox (`C5`); any commit of
the working tree (not asked for — the four modified files and three new files
remain uncommitted, exactly as handed to this pass); any production action
(no production access in this task; see the caveat above); any retroactive
reconciliation of pre-existing data (there was none to reconcile — both
tables have 0 rows).
