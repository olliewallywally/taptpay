# R3 adaptation for Option A — exact changes, 2026-10-12

For R3's owner (Codex) on `fix/qwen-aligned-20261010`, per the
[owner decision](../../decisions/2026-10-12-r2-r3-option-a-owner-decision.md). Line numbers
are at R3 `f1e34585` and R2 `14942392`. Nothing here is applied to any database.

## 0. Bring R2 in first

Merge `origin/ccr-e07e3100-0wm8kr` into `fix/qwen-aligned-20261010` (a merge commit, not a
rebase). Expect textual conflicts in `shared/schema.ts`, `server/storage.ts`,
`server/payment-attempt-service.ts`, `server/routes.ts`, `server/migration-baseline-contract.ts`,
`server/__tests__/migrate.test.ts`, `server/__tests__/payment-schema.test.ts`,
`server/__tests__/payment-attempt-service.test.ts`, the ledger and `CLAUDE.md`.
For routes and the retail engine, keep R2's T5 verification and T6 logging and add R3's
durable pieces around them.

## 1. Migration

1. Rename `migrations/0034_durable_payment_reconciliation.sql` to
   `0036_durable_payment_reconciliation.sql` (R2 holds 0034 and 0035). Update every
   reference: `migrate.test.ts`'s pinned list (append after `0035_…`),
   `migration-baseline-contract.ts` keys, `scripts/rehearse-r3-migration-postgres.ts`,
   `scripts/verify-r3-durability-postgres.ts`, and the R3 docs.
2. In 0036, remove:
   - `ALTER TABLE payment_attempts ADD COLUMN processor_transaction_id text;` and
     `payment_attempts_processor_transaction_id_uq` — R2's `provider_transaction_id` and
     `payment_attempts_provider_transaction_id_uq` (0034) replace them;
   - `CREATE TABLE payment_attempt_expectations …` and trigger
     `retail_expectation_immutable` — R2's `expected_amount_cents`, `expected_currency`,
     `expected_merchant_reference` and `provider_environment` (0034, with its CHECKs)
     replace them.
3. Trigger `retail_attempt_immutable` (it refuses an update to any column outside its
   list). Its list must include every column R2 writes after insert:
   `expected_amount_cents, expected_currency, expected_merchant_reference,
   provider_environment, provider_transaction_id, last_reconciliation_code,
   last_reconciled_at`; drop `processor_transaction_id` from it.
4. Trigger `retail_attached_immutable` (write-once: immutable once non-null). Add
   `expected_amount_cents, expected_currency, expected_merchant_reference,
   provider_environment, provider_transaction_id`; drop `processor_transaction_id`.
   Not `last_reconciliation_code`/`last_reconciled_at`: R2-T6 rewrites them on every query.
5. Keep `payment_session_bindings` (its `provider_transaction_id` UNIQUE is the global
   registry across retail and invoices), `invoice_payment_attempts`, the inbox, settlement
   events and outbox as R3 designed them.

## 2. Code

| R3 site | Change |
|---|---|
| `server/durable-payment-storage.ts` 180, 272, 280 (`JOIN payment_attempt_expectations e …`) | Read `a.expected_amount_cents`, `a.expected_currency`, `a.expected_merchant_reference`, `a.provider_environment` from `payment_attempts` itself. |
| `server/durable-payment-storage.ts` 227–231 (SELECT/INSERT into expectations) | Use R2's `PaymentAttemptService.recordExpectedValues` (recorded once; "reused" for the same values; "conflict" otherwise). |
| `server/storage.ts` 5450, 5545, 5748 (expectations reads in claim/attach/finalize) | The attempt row's R2 columns. R2's attach already refuses an attempt without expected values (`expected-values-missing`). |
| `server/storage.ts` and `server/payment-attempt-service.ts` uses of the `processorTransactionId` **column** | R2's `providerTransactionId` column. The service's finalize **input** is already named `processorTransactionId` on R2 and is stored in `provider_transaction_id`; keep that name. |
| `server/payment-durability-preflight.ts` 26–28 (live attempts lacking expectations) | `payment_attempts WHERE state IN ('claiming','ready','finalizing') AND expected_amount_cents IS NULL`. |
| `server/payment-reconciliation.ts` `evidenceMatchesExpectation`, and the worker's `ReconciliationProvider` | The provider adapter queries through R2's client (`createWindcaveClient(...).querySession`), parses with `normalizeSessionQuery`, and decides with `verifyWindcaveOutcome(expected, observed, { providerEnvironment, accountUsername })`. Map: approved/declined → verified; pending → pending; unverifiable → unknown (retry); mismatch → dead-letter with the field as the sanitized code and a `PROVIDER_OUTCOME_MISMATCH` event. R2's verifier never yields "cancelled" (owner item O-1). |
| `server/retail-reconciliation-adapter.ts` 12 | Unchanged input name; it lands in `provider_transaction_id`. |
| Logging in R3's handlers and worker | R2-T6's rule: no provider session ID, raw query/body or provider text; extend `r2-t6-provider-log-guard.test.ts` to the inbox handlers. |

## 3. Tests and proof

- `payment-schema.test.ts`: no `payment_attempts_processor_transaction_id_uq` and no
  `payment_attempt_expectations`; R2's indexes and checks stay.
- PostgreSQL, on one empty database: 0000–0035 (R2) then 0036 (R3); R2's
  `scripts/verify-r2-t4-expected-values-postgres.ts` (12/12) and
  `scripts/verify-r2-t7-processor-x-id-postgres.ts` (7/7) must still pass with 0036
  applied (they prove R2's writes are not refused by R3's triggers), and R3's verifiers
  likewise.
- A test that an UPDATE changing `expected_amount_cents` after it is set is refused
  (write-once), and one that `last_reconciliation_code` can change.
- Full server and client suites; route policy and tenant inventory regenerated.

## 4. Who and when

R3's owner, before either branch merges into `main`. If the owner prefers, this session
can do it instead on `ccr-e07e3100-0wm8kr` by merging R3 in; that would need the owner to
pause R3 on its own branch to avoid two copies of the same edits.
