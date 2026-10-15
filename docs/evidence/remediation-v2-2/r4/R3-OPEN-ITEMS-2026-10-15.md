# R3 integration open items — fixes (2026-10-15)

The owner asked for the open items in
[R3-INTEGRATION-2026-10-14 §5](R3-INTEGRATION-2026-10-14.md) to be fixed before R4-T3 part 2.
Each fix has a test that failed first. Nothing was applied to a shared database, nothing called
Windcave, nothing was deployed. Refunds stay off.

| Item | Fix | Test |
|---|---|---|
| **R-3a** (owner) | Decided: a payment Windcave confirms when a merchant's change asks first is recorded ([decision](../../../decisions/2026-10-15-r3a-record-verified-payment-from-merchant-route-owner-decision.md)). Codex's R3 already does this; no code change. | — |
| **Cutover: R2-written attempts** | `server/payment-cutover.ts` and the owner's `scripts/r3-cutover.ts check`: any live attempt without its account or fingerprint (or any other nonzero preflight count) blocks cutover. Counts only. [Runbook](../../../operations/runbook-2026-10-15-r3-cutover.md). | PG ×5 (`verify-r3-cutover-postgres.ts`) |
| **Cutover: delivery outbox** | The same tool retires (marks `complete`) the outbox rows earlier builds left undelivered: never claimed, due before the cutover time. Earlier builds had no delivery loop and announced those events themselves. Dry run unless `--apply`. | same |
| **D1** | A new arrival reopens a receipt dead-lettered for a transient reason (`retry_exhausted`, `unbound_session`, provider pending/unknown/unavailable, internal error), or one finished over a minute ago. One held for review (`integrity_mismatch`, `settlement_conflict`) stays closed. | PG |
| **D4** | Subscription-card dead-letters raise `PAYMENT_RECONCILIATION_DEAD_LETTER {code, cause?}`, and delivery dead-letters raise `PAYMENT_DELIVERY_DEAD_LETTER {channel}`, once and only after the dead-letter commits. | PG, unit ×3 |
| **FPRN rate limit** | The five notification receivers allow 120 per address per minute (429, `Retry-After: 60`, nothing written). An unknown session is looked up at Windcave only on its first three tries (reconciliation and subscription cards), so a forged ID costs a bounded number of queries. | unit ×3 |
| **0037, database** | Migration **0049** (applied nowhere): an attached or finished attempt cannot be given a provider account or fingerprint for the first time; send intent is compared with `created_at`/`lease_expires_at` in UTC, whatever the session time zone (a NZ-time session refused every retail checkout before). | PG ×2 (the time-zone check reproduced the 23514 first) |
| **R-1** | The unused legacy split writer `updateSplitPaymentStatus` is deleted from both stores and `IStorage`. | existing tests adapted |
| **R4 split refunds** | The legacy refund route refuses a split sale (409 `REFUND_SPLIT_SALE`) before any reservation or provider call; per-share refunds wait for R4. | HTTP |
| **T-3** | [ADR](../../../decisions/2026-10-15-t3-decline-supersession.md) revision 1 was refused by [review pass 1](T3-review-pass-1-2026-10-15.md). Revision 2 adopts a guarantee that a later approval is never lost silently: the payer's handlers still reconcile a declined attempt; a receipt whose session has only a decline reopens on any arrival; an approval that cannot be recorded keeps its transaction ID and raises `PAYMENT_APPROVAL_NOT_RECORDED`. The owner then decided to build full supersession; it is implemented ([T3-2026-10-15](T3-2026-10-15.md)). | PG (mutation-checked), unit ×4 |

## Verification

- `npx tsc --noEmit -p .`: clean.
- PostgreSQL 16, synthetic data, each R3 verifier on a freshly rehearsed database (0023–0049):
  durability 91, commands 15, delivery 11, served HTTP 24, subscriptions 20, cutover 5; R4-T2 28,
  R4-T3 14, R1 S2a 25, R2-T4 12, R2-T7 7.
- Route facts and the storage inventory regenerated (274 storage methods after R-1).
- Full server suite: 224 suites / 5,146 tests. No client file changed (client 134 / 1,507 at the integration commit).
