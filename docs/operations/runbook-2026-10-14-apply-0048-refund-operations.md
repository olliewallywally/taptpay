# Runbook — apply migration 0048 (refund operations) to the test database (owner), 2026-10-14

**Renumbered (2026-10-14):** this migration was written as `0039` and is now `0048_refund_operations.sql`. Codex's completed R3 uses 0039–0047, which R4 keeps unchanged ([R3 integration](../evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md)).

For Oliver. Applies R4-T2's `0048_refund_operations.sql` to the **test/development**
database only, never production. See the
[ADR](../decisions/2026-10-14-r4-t2-refund-operation-schema.md). Claude cannot do this from
its cloud session: the session has no database credentials, and the plan makes applying
migrations to a shared database an owner step.

**Do this only after 0034–0047 are applied** (the 0034–0038 runbook, then Codex's R3 release for 0039–0047;
[runbook-2026-10-13](runbook-2026-10-13-apply-0034-0038-test-database.md)) on the same database. Do not start until Claude says the branch is ready.

Read-only commands come first. Step 4 is the only one that changes the database. Everything
runs from the TaptPay Replit shell, where `DATABASE_URL` is already set as a secret. Never
paste a database URL or password into a chat, a command line or a file.

## What 0048 does

- **Adds refund-operation columns, checks, one trigger and six indexes to `refunds`.**
  - No column is dropped or retyped.
  - Existing (legacy) refunds keep every value. Each gains an operation ID and stays legacy.
- **Takes an ACCESS EXCLUSIVE lock on `refunds`** while it rewrites the table to add the
  operation ID. No other table is locked.
  - The runner limits the wait for each lock to 5 s and each statement to 60 s.
  - **Stop the app first**, as for 0036/0037.
- **Refund initiation stays off** (`FEATURE_REFUND_INITIATION`). Nothing writes an operation
  until R4-T3, so no refund behaviour changes.

## 0. Get the code

```bash
git fetch origin ccr-e07e3100-0wm8kr
git checkout ccr-e07e3100-0wm8kr
git pull --ff-only origin ccr-e07e3100-0wm8kr
npm ci
TARGET="--target=workspace --expected-host=helium --expected-database=heliumdb"
```

(Use the staging variant from the 0034–0038 runbook, step 1, if your test database is Neon.)

## 1. Back up first

Take a backup or snapshot of the test database with Replit's database tools.

## 2. Look before changing anything (read-only)

```bash
npm run db:migrate:status -- $TARGET
npm run db:release -- $TARGET --dry-run
```

Expected: only `0048_refund_operations.sql` pending (0034–0047 already applied). Paste both outputs to Claude.

## 3. Count-only preflight (read-only)

These print counts only, never a value. Open the database's SQL console (Replit's database
tool) and run:

```sql
-- How big is the table the migration rewrites?
SELECT count(*) AS refunds_rows, pg_size_pretty(pg_total_relation_size('refunds')) AS refunds_size FROM refunds;

-- Legacy refunds by status. Pending or processing rows are already counted in
-- total_refunded and can never be reconciled; each needs a look from evidence.
SELECT status, count(*) FROM refunds GROUP BY status ORDER BY status;

-- Legacy refunds whose business does not match their sale (an R1 tenant defect;
-- 0048 leaves them alone, but each should be explained).
SELECT count(*) AS mismatched FROM refunds r
 WHERE r.transaction_id IS NOT NULL AND r.merchant_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.id = r.transaction_id AND t.merchant_id = r.merchant_id);

-- Sales whose total_refunded differs from their legacy refunds. The legacy route adds the
-- amount when it reserves, so pending and processing refunds count as well as completed ones.
-- The LEFT JOIN also finds a sale with total_refunded set but no refund rows.
SELECT count(*) AS sales_out_of_step FROM (
  SELECT t.id FROM transactions t LEFT JOIN refunds r ON r.transaction_id = t.id
   WHERE coalesce(t.total_refunded, 0) > 0 OR r.id IS NOT NULL
   GROUP BY t.id, t.total_refunded
  HAVING coalesce(t.total_refunded, 0) <> coalesce(sum(r.refund_amount)
    FILTER (WHERE r.status IN ('pending', 'processing', 'completed')), 0)) x;

-- Completed unsplit card sales with no recorded capture: they could not be refunded by card.
SELECT count(*) AS completed_without_capture FROM transactions
 WHERE status = 'completed' AND is_split IS NOT TRUE AND windcave_transaction_id IS NULL
   AND coalesce(payment_method, '') <> 'cash';

-- The session time zone (the 0037 question; 0048's rules do not depend on it).
SHOW TimeZone;
```

Paste the results to Claude. **Stop** if `refunds_rows` is unexpectedly large (more than a
few thousand): the lock time must then be measured on a restored copy first.

## 4. Apply (changes the database)

Stop the app, then:

```bash
npm run db:release -- $TARGET
npm run db:migrate:status -- $TARGET
```

Expected: `0048_refund_operations.sql` applied, nothing pending. Start the app again.

## 5. If something goes wrong

- **The migration fails partway.** It runs in one transaction, so nothing is applied. Paste
  the error code (not any values) to Claude.
- **A problem after it applies.** Revert the code, not the database. The new columns are
  inert while refund initiation is off. Restore from the step 1 backup only if Claude
  advises it.
