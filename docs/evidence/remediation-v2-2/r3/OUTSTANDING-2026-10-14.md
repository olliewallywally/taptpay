# OI-1, OI-2 and the merge review's outstanding items, 2026-10-14

[Merge review](R2-R3-MERGE-REVIEW-2026-10-13.md) ·
[OI-1 decision](../../../decisions/2026-10-13-cancel-after-payment-attempt-owner-decision.md) ·
[OI-2 decision](../../../decisions/2026-10-13-multi-transaction-sessions-owner-decision.md)

```text
Phase / release: the R2+R3 merge's outstanding work (repository work only). Nothing applied to a
  shared database, nothing deployed, no provider request. The R3 worker/inbox stays unmounted.
Exact branch and commits: ccr-e07e3100-0wm8kr; 9888af20 (OI-2, H-3), db9f9ea4 (OI-1),
  4168b2be (H-1, D2, D4), 45f5525b (same-tab retry, cash). Evidence: the commit containing this file.
Owner asked (2026-10-13): cancel after an attempt (OI-1); more than one attempt is not an error
  (OI-2); finish the rest of what is outstanding.
How it was mapped: seven read-only readers, one per item (two stopped at a session limit and
  were re-run). Every change was written failing-tests-first.
```

## OI-1 — cancel, void or mark paid after someone has tried to pay

**Retail sales** (`POST /api/transactions/:id/cancel`):

- **Refuses only money already taken** (409 `PAYMENT_CAPTURED`): a provider transaction, a paid
  or processing share, or an approved attempt. A refund is the way back.
- **Asks Windcave first.** Each open attempt (ready or finalizing, with a session) is asked
  once, with no retries and no database lock held, through R2's verified query and the
  attempt's recorded expected values.
  - **Verified paid:** the payment is recorded through the normal finalizer (with the
    merchant's push) and the cancel is refused: 409 `PAYMENT_COMPLETED`, "This sale has just
    been paid".
  - **Verified declined:** the attempt is closed after the cancel commits, so the sale stays
    cancelled rather than failed.
  - **Can't say yet:** the sale is cancelled and the attempt is left able to settle.
- **Unsent claims** (no session, no send intent) are abandoned with the sale.
- **A payment completing after the cancel is recorded, never lost.**
  - Finalize now accepts a cancelled sale. An unsplit sale becomes completed. A split share is
    recorded and the sale stays cancelled.
  - Before this, such a payment was taken but never recorded: finalize refused, and the
    attempt stuck in "finalizing".
- **A cancelled sale is never reopened.**
  - The status, session and split writers refuse to.
  - Legacy `/pay` opens no new session on it (410).
  - A token session attached while the cancel ran is not served (410).
- **Board (numbered) sales:** their own pending session is checked the same way. A verified
  payment refuses the cancel; the board's own notification or callback records it, as it
  always has.
- **Screens:** the merchant screens show the server's reason when a cancel is refused.

**Invoices** (property void / mark-paid-external, trades void / mark-paid-external):

- **Refuses only a card payment already taken** (409 `PAYMENT_CAPTURED`).
- **Asks Windcave about each open window,** once each, in parallel, with no lock held. A
  verified payment refuses with 409 `PAYMENT_COMPLETED`, and that payment is recorded by its
  completion path.
- **A payment after a void or an external payment is now recorded.** Before this it was lost
  (the completion paths returned early for closed invoices).
  - A voided invoice becomes paid, with a `*_received_after_void` event.
  - A trades invoice a schedule has replaced stays voided, with the payment recorded and a
    refund due.
  - An invoice paid another way keeps its status, with a `*_received_after_external` event and
    a refund due.
  - A split share is logged for a refund, with the real reason.
- **Closed invoices are still verified.** The checkout callback and both invoice notifications
  now verify a closed invoice's session instead of returning early.
- **Google Pay** completion refuses a closed invoice before the payer's token is submitted.
  Before this, it would have charged them.

**Limits (pre-existing, recorded):**

- Only the latest single-invoice session is pinned. A payment through an earlier wallet
  session is found by no lookup.
- A voided invoice's late split share is an event on a row the screens hide.
- A complete Windcave session with no transaction (the payer pressed cancel) is unverifiable.
  Its attempt stays open after a cancel; this is harmless.

## OI-2 and H-3 — sessions with more than one card attempt

- **R3's adapter follows R2's verifier.**
  - One authorised purchase among matching attempts settles as approved on that transaction.
  - All declined settles as declined, on a transaction chosen independently of reply order.
  - Two approvals stay ambiguous: retried, never settled.
  - `transactionCount` is information only.
- **H-3: the worker's mismatch path keeps R2-T6's signals.** It writes one sanitized
  `PROVIDER_OUTCOME_MISMATCH {field}` event and records `integrity_mismatch:<field>` on a
  retail attempt, best effort, then dead-letters as before.

## H-1, D2, D4 and the missing steps (latent; the worker is unmounted)

- **H-1 (Option A, as the adaptation spec says).** Binding recovery and the reconciliation
  finalize use R2's four expected values and X-ID with the configured account (a pinned account
  still wins). Every live retail payment recorded since 0034 is now reconcilable; before, none
  was.
- **Route-settled payments are adopted.** A payment the route already settled is recorded in
  the registry (the binding's transaction and one settlement event, with no outbox and no
  second count). A contradicting outcome stays a loud `settlement_conflict`.
- **D2:** a decline settled by the worker leaves R2's money columns empty, as the route does.
  Otherwise OI-1 would read it as money taken.
- **D4:** every dead-letter raises one sanitized signal; `retry_exhausted` names its last
  transient cause.
- **Preflight:** counts R2-recorded attempts as complete.
- **MemStorage attach matches PostgreSQL** for a pre-set X-ID and for send intent.

## Payer and cash fixes

- **Same tab after an unsent attempt expires.** The same key now gets 409
  `PAYMENT_ATTEMPT_EXPIRED`, and only when that key's attempt ended with no session and no send
  intent. The page replaces the key once and asks again; before, it answered "still being
  reconciled" forever in that tab.
- **Attach** abandons only an unattached claim at its lease's end, never an attempt whose
  session was already served (a cross-instance race the mapping found).
- **Cash (phone terminal).**
  - A replay is marked as such, and a conflict names the sale the key already recorded.
  - The terminal then releases its saved command and tells the merchant. It can no longer
    refuse every later sale in a tab, or silently treat an identical second sale as the
    first.
  - MemStorage refuses to delete a business with cash sales, as PostgreSQL does.
  - An outbox claim must name its source.
  - A failed cash command logs its error class, never a value.

## Left for R3 activation (Codex), with the exact proposals in the mapping

None of these is reachable today. Each must be settled before the worker, inbox or
notification receiver is mounted.

- **D1:** `receive()` never re-opens a completed or dead-lettered inbox row. A later approval
  in the same session would be swallowed.
- **D3:** the 60 s lease is shorter than a worst-case provider query. A lost lease skips the
  backoff and the retry cap (hot loop). The outbox has the same issue.
- **D5:** durable invoice checkout has no recovery for send intent without a session. It needs
  Windcave's answer on X-ID de-duplication first.
- **Cash outbox (cutover):** each cash sale's outbox row stays pending after the compatibility
  broadcast, so the first receiver run would announce it again. Decide at receiver cutover.
- **0037:** close the post-attach first-write gap in `retail_expected_identity`, and make
  `payment_attempts_send_started_check` time-zone independent. Both need a forward migration.
- **R3's unmounted invoice path still follows the pre-OI-1 rules.** Its `changeInvoice` holds
  on sessions, and its finalize refuses closed invoices. Align it with OI-1.
- **FPRN delivery method** (GET or POST): needs UAT. Mount the receiver behind a rate limit.

## Owner / provider questions

- **UAT (carried from OI-1):** can a payer try another card in the same session after a decline?
- **UAT:** does create-session with a repeated X-ID return the original session, and within what
  window? (Needed before D5.)
- **Owner:** confirm `SHOW TimeZone` is UTC on the test database, and later on production.
- **Owner (cash):** the terminal now tells the merchant on a replay and on a conflict, then lets
  them record again. Say if you would rather it refused instead.

## Results

Filled in on commit; see the ledger entry for this date.
