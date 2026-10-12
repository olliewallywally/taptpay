# R2 ↔ R3 schema conflict — owner decision needed before either branch merges, 2026-10-12

Found by Claude while starting the phase after R3. Compared `ccr-e07e3100-0wm8kr` (R2, at
the R2-T7 commit) with Codex's `fix/qwen-aligned-20261010` (R3, at `f1e34585`). Their
merge base is `e408f597`: the R3 branch contains none of R2 (T1–T7), and R2 contains none
of R3. Each followed the owner's split ("Claude handles all of R2; Codex moves to R3"); the
R3 ADR (`docs/decisions/2026-10-12-r3-durable-payment-storage.md` on the R3 branch) was
written at `e408f597` and leaves R2 integration to "the eventual R2-integrated runtime".

**Nothing is applied anywhere, so this costs nothing to fix now and a migration to fix
later.** It must be settled before either branch merges into the other or into `main`.

## Conflicts

| # | Conflict | R2 (`ccr-e07e3100-0wm8kr`) | R3 (`fix/qwen-aligned-20261010`) |
|---|---|---|---|
| C-1 | **Migration number 0034 used twice** | `0034_payment_attempt_expected_values.sql` (committed 00:59 UTC, `673a7043`), then `0035_payment_attempt_processor_x_id_unique.sql` (T7) | `0034_durable_payment_reconciliation.sql` (04:40 UTC, `9d52d8a5`) |
| C-2 | **Expected provider values stored twice** | Four columns on `payment_attempts` (`expected_amount_cents`, `expected_currency`, `expected_merchant_reference`, `provider_environment`) with CHECKs; recorded before the session, required to attach; read by the T5 verifier on every retail path | A separate `payment_attempt_expectations` table, immutable by trigger |
| C-3 | **Provider transaction ID stored twice** | `payment_attempts.provider_transaction_id` + `payment_attempts_provider_transaction_id_uq`, written at finalize | `payment_attempts.processor_transaction_id` + `payment_attempts_processor_transaction_id_uq`, and `payment_session_bindings.provider_transaction_id` UNIQUE |
| C-4 | **X-ID uniqueness in two places** | `payment_attempts_processor_x_id_uq` (0035) | UNIQUE `processor_x_id` on `payment_attempt_expectations`, `invoice_payment_attempts` and `payment_session_bindings` |
| C-5 | **Runtime incompatibility (the serious one)** | Updates `expected_*`/`provider_environment` (after claim), `provider_transaction_id` (finalize), `last_reconciliation_code`/`last_reconciled_at` (every retail query, T6) | Trigger `retail_attempt_immutable` refuses any `payment_attempts` update that changes a column outside `{state, outcome, receipt_share, processor_session_id, processor_x_id, processor_transaction_id, return_state_hash, return_state_expires_at, updated_at}` (SQLSTATE 23514, "immutable payment identity") |
| C-6 | **Two verifiers** | `server/windcave-verify.ts` (T5), wired into every enabled completion path | `evidenceMatchesExpectation` in `server/payment-reconciliation.ts`, for the inbox worker (not yet wired to a provider) |
| C-7 | Textual merge conflicts | `shared/schema.ts`, `server/storage.ts`, `server/payment-attempt-service.ts`, `server/migration-baseline-contract.ts`, `migrate.test.ts`, `payment-schema.test.ts`, the ledger, `CLAUDE.md` | the same files |

**C-5 in practice:** with both migrations applied, every retail payment session would fail
at `recordExpectedValues` (an UPDATE of `expected_*`), so no retail link could take a
payment; finalize and the reconciliation-code write would fail the same way. Neither
branch's tests can see this, because neither branch has the other's migration.

## Options

**A. R2's representation for retail; R3 adapts (recommended).** Plan §10.1 says to keep
`payment_attempts` and "extend it additively with expected provider fields from R2", and
R2's columns are already wired into every retail path and the T5 verifier. R3 would:
drop `payment_attempt_expectations` and `processor_transaction_id` for retail (keeping
`invoice_payment_attempts` and `payment_session_bindings`, which R2 does not have); protect
R2's columns with a write-once trigger (its own `taptpay_r3_attached_identity` style:
immutable once non-null) instead of the all-other-columns-frozen trigger, and leave
`last_reconciliation_code`/`last_reconciled_at` mutable; have its worker call
`verifyWindcaveOutcome`; and renumber its migration after R2's (0036).

**B. R3's representation; R2 adapts.** R2 moves expected values, the provider transaction
ID and the X-ID index onto R3's tables, rewrites 0034/0035 (never applied) and re-points
the T5/T6 code and tests. More churn on code that is already wired and tested, and it
departs from plan §10.1's wording.

**C. Merge first, decide after.** Not recommended: C-5 makes the merged tree unusable for
retail payments until resolved, and both migrations would have to be rewritten anyway.

## What I did not do

- Change Codex's branch, or rewrite R2's migrations to fit R3. Either is the owner's call.
- Start R4 code: refunds reference the captured provider transaction (C-3) and reconcile
  through R3's worker and outbox, so R4's schema depends on this decision. R4's preflight
  (read-only) is written; its implementation waits on this.
