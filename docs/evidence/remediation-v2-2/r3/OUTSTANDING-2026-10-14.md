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
  - **Verified declined, or can't say yet:** the sale is cancelled and the attempt is left
    able to settle, so a second card paid in the same session is still recorded.
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

## Independent review (2026-10-14) and what changed

Six read-only reviewers, one per area, each finding re-checked by a skeptic. Two agents stopped
at a session limit: the tests skeptic and the completeness critic. This session checked the
tests reviewer's findings directly instead.

**Fixed, failing tests first:**

- **R-1 (medium):** the legacy split writer (PostgreSQL) could reopen a sale the merchant had
  just cancelled. It read the sale unlocked and wrote "pending" after the cancel committed. The
  status is now decided by the UPDATE from the row it writes. A new PostgreSQL race check
  failed before the fix.
- **R-2 (medium):** both retail Google Pay completions still sent a wallet charge for a
  cancelled sale. Now TaptPay sends no wallet token for a cancelled sale. A payment that already
  reached Windcave is still asked about and recorded; anything else gets 410.
- **R-3b (low):** a board session the notification marked `approved`, whose record then failed,
  now counts as money taken.
- **T-3 (medium):** a verified decline closed the attempt at cancel time. A second card in the
  same session would then have been lost. The attempt is now left open, as for "can't say yet".
  The owner decision's implementation note is amended and dated.
- **Test gaps closed:**
  - PostgreSQL checks: the open invoice windows a void asks about, the cancel route's
    context, an unsent claim committed during the cancel's wait, and an approval after a cancel
    through the status writer;
  - an HTTP test of the trades replacement (23505) late payment;
  - the graph test is labelled a specification.
- **The R1 refund test** expected 400 for a sale paid during the cancel. It now asserts OI-1's
  409 `PAYMENT_COMPLETED` and its body. This is the full suite's one failure, found after the
  first push.

**Open, for the owner (one question):** should a merchant's cancel, void or mark-paid record a
payment Windcave verifies at that moment (R-3a for board sales, I-1 for invoices)?

- **Today:** it refuses with "just been paid" and leaves the recording to the completion paths.
  But the notification answers Windcave before it queries, and the payer's tab may be gone, so
  if those fail nothing records it. This was already true before OI-1 (the change was then
  refused outright).
- **Why it was not fixed here:** recording it from the merchant route needs the completion
  paths' finalizers, which write by ID without naming the business. R1-T7 forbids that on a
  merchant route.
  - The write was gated by a business-scoped read, so no cross-business write was possible.
  - It was implemented, then reverted: relaxing R1's rule is the owner's call.
- **Proposal:** business-scoped board and invoice finalizers (`…ForMerchant`) that the
  merchant routes can call.
- **Also found:** the route-fact extractor does not trace a helper called from a helper. The
  invoice version passed the R1 inventory unseen; the board version was caught. This is an R1
  tooling gap to fix.

**Recorded, not fixed (low; no money is lost; cost greater than benefit now):**

- **I-2:** a checkout session created while a void commits can still be pinned. A payment
  through it is recorded by the closed-invoice branch.
- **I-3:** a single-payment finalize can overwrite a just-committed `paid_external` with `paid`
  (a millisecond window). The `Payment_External` event remains.
- **I-4:** two completion paths racing on a closed invoice can each log the late-payment event
  and send the email. A closed split share is logged once per path.

  Each fix is a conditional write in storage. Proposed for R4-T5, where refund-due events
  become operations.
- **I-5:** a manually re-issued replacement for a voided invoice is not detected. The late
  payment makes the invoice paid without flagging a refund. This is an owner question: should
  a payment after a void always flag a refund?
- **R3, refuted as unreachable:** R3's invoice finalize refuses a closed invoice, and adoption
  queues no outbox. Neither can run today, and both are already on the activation list above.

## Owner / provider questions

- **UAT (carried from OI-1):** can a payer try another card in the same session after a decline?
- **UAT:** does create-session with a repeated X-ID return the original session, and within what
  window? (Needed before D5.)
- **Owner:** confirm `SHOW TimeZone` is UTC on the test database, and later on production.
- **Owner (cash):** the terminal now tells the merchant on a replay and on a conflict, then lets
  them record again. Say if you would rather it refused instead.

## Results

- **Full suites after the first push:**
  - server 211 of 212 files and 5,054 of 5,055 tests pass; the one failure was the R1 refund
    test, now fixed;
  - client 130 files and 1,480 tests, all pass.
- **After the review fixes:**
  - the affected server groups (oi1, tenant, r2-t5, r3, cash, checkout, token, invoice,
    r1-t7, route, payment, windcave, http-params): 92 files and 3,006 tests, all pass;
  - typecheck clean.
- **PostgreSQL 16 on fresh local databases:**
  - 0023–0038 rehearsal applied;
  - R3 durability 50/50 (5 checks new, including the share race that failed before its fix);
  - R2-T4 12/12;
  - R2-T7 7/7.
- **Full suites on `555686d8` (after the review fixes):** server 212 files and 5,060 tests,
  client 130 files and 1,480 tests, all pass.
- **Nothing** was applied to a shared database, deployed or sent to a provider.
