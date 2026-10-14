# R2 + R3 merge — Claude's independent review of Codex's integration, 2026-10-13

[Option A decision](../../../decisions/2026-10-12-r2-r3-option-a-owner-decision.md) ·
[adaptation spec](../R2-R3-OPTION-A-ADAPTATION-2026-10-12.md) ·
[Codex's integration review](R2-INTEGRATION-REVIEW-2026-10-12.md) ·
[Codex's ADR](../../../decisions/2026-10-12-r2-r3-schema-integration.md) ·
[owner runbook for the test database](../../../operations/runbook-2026-10-13-apply-0034-0038-test-database.md)

**Follow-up 2026-10-14:**
- OI-1 and OI-2 were decided by the owner and implemented.
- H-1–H-3 were fixed, along with the missing steps that did not need a schema change.
- See [OUTSTANDING-2026-10-14](OUTSTANDING-2026-10-14.md).
- Correction to H-1 below: 0037's triggers do *not* refuse a first write of the account or
  fingerprint after attachment; only a service check does (as "Missing steps" says).

Reviewed: Codex's `fix/qwen-aligned-20261010` at `27d235b8` (four commits after R2's
`14942392`: `9d52d8a5`, `f1e34585`, the integration merge `3e1bf582` and the cash commands in
`27d235b8`). Merged into `ccr-e07e3100-0wm8kr` on top of `332b0153`, which carries the Option A
decision and R4-T1. This is the reviewer pass the program requires for another agent's
work. It is not owner approval and not R3 exit.

```text
Phase / release: R2 + R3 merge (repository work only). Nothing applied to a shared
  database, nothing deployed, no provider request.
Exact branches and commits: R3 fix/qwen-aligned-20261010 27d235b8; R2/R4
  ccr-e07e3100-0wm8kr 332b0153; merge commit on ccr-e07e3100-0wm8kr (this file's commit).
How it was reviewed: six read-only reviewers were started, each on one risk dimension.
  Four completed: Option A conformance; database triggers against every write; migration
  safety; R2's guarantees after the merge. Two stopped at a session limit before
  reporting: R3's inbox/worker/provider adapter, and the cash commands and routes. The
  planned adversarial verify pass and the closing critic did not run either.
  Coverage of the two missing dimensions: the Option A and R2 reviewers both read the
  worker and provider adapter (H-1–H-3 come from them), and Claude read the cash commit
  directly (below). Claude re-checked every finding below against the code. B-1 was
  reproduced with failing tests before it was fixed.
```

## Verification of prior claims

- Codex's head, re-run independently: typecheck passes; full server suite 204 suites /
  4,935 tests with 3 failures, all in `tenant-storage-inventory.test.ts` (the cash route
  wrote through an unscoped storage method; fixed in the merge, below).
- Codex's PostgreSQL claims, re-run on fresh PostgreSQL 16 databases from the merged tree:
  the rehearsal applies 0023–0038 in order; the R3 durability verifier, R2-T4 verifier
  (12) and R2-T7 verifier (7) pass. 0036 is byte-identical to R3's original 0034.
- Codex's claim that the live retail route "preserves stored account/fingerprint/X-ID/send
  intent" does not hold. The live route writes R2's expected values only; the R3-only
  columns are written by `prepareRetailExpectation`, which only the verifier scripts call
  (finding H-1).

## Blocking issues

**B-1 (fixed in the merge). A failed session creation locked the sale for good.** Three of
the six reviewers found this independently. Codex widened the claim guard from R2's
"held while a session is attached" to "held while a session is attached, R3 send intent
is recorded, *or expected values are recorded*". DB attach was narrowed the same way. But
R2 records expected values on every attempt before it asks Windcave for a session. So
when session creation failed (a Windcave timeout, 5xx or rejection), the attempt stayed
`claiming` with no session. Every later payment request for that sale, under any key,
then answered 503 "still being reconciled" forever, and nothing could reconcile it,
because there was no session to query. Codex's new cancellation guard also refused the
merchant's cancel (409 `PAYMENT_ACTIVE`) forever. A short Windcave outage would have
stranded every sale tried during it.

Fix: R2's rule is restored for R2-recorded attempts. R2 serves a session's links only after
attaching it, so an expired attempt with no session and no R3 send intent never reached a
payer and cannot be charged (`paymentAttemptReleasable` in `server/storage.ts`).

- Claim (both stores): held only by an attached session or R3 send intent. Expected values
  alone no longer hold it.
- DB attach: a session returned after the lease ran out is not attached, and the attempt is
  abandoned (unless it carries R3 send intent). This matches MemStorage again.
- Merchant cancel (both stores): releases such attempts together with the sale.
  - The new lookup is locked in the parent's order and scoped through the business's own
    row (R1-T7 S2a).
  - A cancel refused for any other reason writes nothing.
- R3's holds are unchanged: send intent, an attached or abandoned-with-session attempt,
  legacy sessions and captured shares still refuse cancellation.

The fix was tested failing first:

- `r2-r3-merge-unattached-expiry.test.ts`: the HTTP retry and owner-cancel cases were red
  before the fix.
- `verify-r3-durability-postgres.ts`: a new check, red against the unfixed storage.
- Codex's test "cannot erase a live or expired unattached attempt" asserted the stuck
  behaviour for the expired case. It is narrowed to "a live attempt, or an expired one that
  may have reached the provider". The live, send-intent and session cases are kept.
- `tenant-transaction-refund-storage.test.ts` now expects four scoped queries in cancel,
  not three.

**B-2 (fixed in the merge). The cash route wrote through an unscoped storage method.**

- On Codex's head, `tenant-storage-inventory.test.ts` failed: the new cash route called a
  storage write that does not name its business, which breaks R1-T7 S5's rule for
  `*ForMerchant` writes.
- `recordCashSaleForMerchant(merchantId, input, options)` now takes the business first and
  refuses an input naming another one before anything is written. There is a new test for
  that refusal.
- The route, the R3 verifier and the inventory expectation are updated.

## High-risk concerns (latent: none of this code is mounted)

R3's inbox, reconciliation worker, provider adapter, notification handlers and durable
invoice checkout are not wired into any route at this merge (verified by grep). These
findings must be fixed before any of it is switched on. They change nothing that runs
today.

- **H-1. The R3 worker cannot reconcile a live retail payment.**
  - Binding recovery (`durable-payment-storage.ts` `resolveSession`) and the
    reconciliation finalize require `expected_provider_account` and `request_fingerprint`.
  - Only `prepareRetailExpectation` writes those, and the live route never calls it.
    (Corrected 2026-10-14: 0037's triggers do not refuse adding them after attachment;
    only `prepareRetailExpectation`'s own check does.)
  - So every live retail notification would be retried and then dead-lettered
    (`unbound_session`), and none would ever be settled by the worker.
  - Activation must first make the route record them through `PaymentAttemptService`, or
    make the worker use R2's four columns only.
- **H-2. The R3 provider adapter is stricter than R2's verifier.**
  - `windcave-reconciliation-provider.ts` returns `mismatch` unless the session has exactly
    one transaction and it is a purchase. The worker then dead-letters the payment.
  - R2's normalizer and verifier settle a session with a declined card and then an approved
    one as approved. So would the R2 route.
  - Under the worker, that payer would be charged and the invoice left unpaid.
  - Codex chose this on purpose ("multiple transactions are not one unambiguous charge").
    The owner should decide before activation which rule wins (owner item OI-2 below).
- **H-3. The worker's mismatch path drops R2-T6's signals.** It writes no
  `PROVIDER_OUTCOME_MISMATCH` security event and does not record the mismatched field or
  update `last_reconciliation_code`. R2's route does both.

## Missing steps (also latent)

- The settlement-event registry (`payment_session_bindings.provider_transaction_id`,
  `payment_settlement_events`) is written only on the worker path. A payment settled by the
  route and later seen by the worker would be dead-lettered as `settlement_conflict`.
- The durability preflight counts live R2 attempts as "missing expectations" once 0037
  is applied, because it also checks the two R3-only columns. Only the rehearsal script
  uses it today; `db:release` does not.
- After attachment, 0037's `retail_expected_identity` still allows
  `expected_provider_account`/`request_fingerprint` to be set for the first time (only a
  service check stops it). A direct SQL write could therefore make an attached attempt look
  as if it had a pre-send expectation.

## Unsafe assumptions

- `payment_attempts_send_started_check` compares `timestamptz` with `timestamp` columns,
  so its result depends on the session time zone. It is safe on UTC databases, which every
  documented target is. It only affects R3's unwired send-intent path and 0037's copy of
  compatibility data (empty on any database that never had R3's original 0034).

## Required ordering changes

- **Migrations 0036 and 0037 must be applied with the app stopped.** Each runs in its own
  transaction. Between them, or if 0037 stops (it has a 5-second lock timeout and aborts
  on conflicting data), 0036's trigger refuses R2's expected-value, finalize and
  reconciliation writes. Every card payment would fail until 0037 is applied. The test
  database runbook now says to stop the app first. A production release needs the same
  maintenance window.

## Open product / provider / legal questions (for the owner)

- **OI-1. Codex's cancel/void/mark-paid guard holds after a verified decline.**
  - Retail cancel, and invoice void and "mark paid externally", refuse while any Windcave
    session was ever recorded, even once R2 has verified a decline.
  - Examples: a split sale whose first share was declined; a rent invoice whose tenant was
    declined and then paid by bank transfer. The merchant cannot cancel, void or mark it
    paid; it was possible before R3.
  - Holding is the safe choice if Windcave lets a payer try another card in the same session
    after a decline. That is unconfirmed and needs UAT. Left as Codex wrote it; your call
    once UAT answers it.
- **OI-2.** H-2's rule for sessions with more than one transaction.
- Not fixed here, and it predates the merge: the payment page keeps its idempotency key
  until a final outcome. A payer who retries in the same browser tab after the 5-minute
  lease has run out keeps getting 503. A new tab, or any other payer, can pay.

## Cash commands (`27d235b8`), read by Claude

- The route validates with the existing schema, checks ownership, requires a UUID
  `Idempotency-Key`, and reuses a committed sale only when its fingerprint matches; a
  changed retry is a 409. The billing-card and board checks run before a new record. The
  sale, its `Cash_Recorded` event and the manual outbox row are written in one
  transaction under an advisory lock on the business and key. A board is re-checked there
  under lock.
- 0038's trigger makes the cash identity immutable and refuses a key added after creation.
  Later refund reservations change only refund columns, which the trigger allows (the
  trigger reviewer checked this against every writer).
- Low: `deleteMerchant` now refuses a business that has a cash sale, because of
  `transaction_events`' new foreign key. It rolls back and deletes nothing, which is the
  same as for businesses with refunds or split payments today.

## Compliance and data-handling notes

The R3 modules contain no logging calls. The cash route and the merged code put no provider
text, identifiers or personal data in logs, errors or evidence. Every test uses synthetic
data on loopback databases.

## Test and rollback adequacy

- Merged tree with both fixes: typecheck passes; full server suite 208 suites / 4,993
  tests, all pass; full client suite 128 suites / 1,471 tests, all pass. Route policy:
  194 registrations, 0 unclassified, 0 suspected gaps.
- PostgreSQL 16 on fresh databases from the merged tree: rehearsal 0023–0038 applied;
  R3 durability verifier 40/40, including the new release check; R2-T4 12/12; R2-T7 7/7.
- Rollback: 0034–0038 are applied nowhere shared. Reverting the merge commit restores
  `332b0153`.

## Final recommendation

**Approve the merge as repository work**, with B-1 and B-2 fixed in it. The test database
may take 0034–0038 by the runbook, with the app stopped. **Do not approve** switching on
any R3 worker, inbox or notification path until H-1–H-3 and the latent missing steps are
fixed. **Do not approve** R3 exit or a production migration. OI-1 and OI-2 are owner
decisions.
