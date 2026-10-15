# T-3 decline supersession — independent review pass 1 (2026-10-15)

Reviewer: an independent read-only agent, checking
[the ADR, revision 1](../../../decisions/2026-10-15-t3-decline-supersession.md) against the code on
`ccr-e07e3100-0wm8kr`. **Verdict: REFUSE revision 1.** The direction (only `declined` → `approved`,
only on verified evidence, inside the finalizer's transaction and lock order) was judged sound.

Blocking findings, each with file:line evidence in the review:

- **B1.** `provider_transaction_claims` (0044) allows one claim per session and its rows are
  immutable, so every supersession of a binding's transaction ID would throw 23505, retry as
  `internal_error` and dead-letter as `retry_exhausted`. The ADR did not mention it.
- **B2.** The approval often never reaches the finalizer. The return and completion handlers skip
  reconciling a `declined` attempt (`payment-checkout-handlers.ts`, `invoice-checkout-handlers.ts`).
  The inbox reopen rule ignores a second card's notification within one minute of the decline. And
  the merchant's pre-change reconcile looks only at live attempts.
- **B3.** After A's decline the payer may start attempt B on the same sale or share. Superseding A
  while B is live leaves an approved and a live attempt on one share. B's later outcome then becomes
  a false alert, or an unmapped unique-index throw on invoice split shares.

Other findings:
- The ADR's MemStorage claim is vacuous: Mem refuses every reconciliation finalize.
- A stale decline arriving after a supersession becomes a false `settlement_conflict`.
- Event lookups take an arbitrary row.
- An undelivered decline notification would be sent after the approval.
- The declined card's ID would survive only in the registry.
- The binding trigger as described is too loose; it needs a deferred check, and the invoice write
  order matters.
- A second event must be restricted to `approved`.
- Invoice attempts need their own guard.

False claims in revision 1:
- A late approval on a paid invoice split share does not dead-letter as a conflict; it throws.
- R4 cannot refund a dead-lettered second capture: refunds use the sale's recorded capture.

Checked and unaffected:
- refund capture lookup
- the usage counter
- the retail cancel guard
- lock order with cancels, voids, refund claims and a second worker

What followed is recorded in the ADR's revision note.
