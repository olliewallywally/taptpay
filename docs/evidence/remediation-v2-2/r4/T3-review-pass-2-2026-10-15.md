# T-3 decline supersession — independent review pass 2 (2026-10-15)

Same independent read-only reviewer as pass 1, on
[ADR revision 3](../../../decisions/2026-10-15-t3-decline-supersession.md).
**Verdict: APPROVE WITH CONDITIONS C1–C10.** Revision 3 answers every pass-1 condition in
substance; none of the gaps needs a new product decision. The revision-2 code (`d04d4702`) was
re-checked and confirmed.

| # | Condition |
|---|---|
| C1 | Before any write, pre-check that the approval's ID is not held by another source in `provider_transaction_claims` (the 0044 trigger's 23505 has no constraint name, so it cannot be mapped). |
| C2 | 0050 backfills `payment_settlement_events.provider_transaction_id` from the binding, then sets it NOT NULL (a pre-0050 decline would otherwise fail at commit). The deferred binding trigger: `CONSTRAINT TRIGGER … AFTER UPDATE OF provider_transaction_id … DEFERRABLE INITIALLY DEFERRED`, `WHEN (OLD … IS NOT NULL AND OLD … IS DISTINCT FROM NEW …)`, re-reads the binding and requires it to equal NEW; invoice attempts are checked by state only (they hold no transaction ID). |
| C3 | The quiet decline of a second attempt triggers on the *target* being paid (the share, or the unsplit sale, including retail `partially_refunded`/`refunded`; invoice `paid`). It writes only B, B's binding and B's event: no share row, no sale session/X-ID/state/payment-method fields, no outbox. |
| C4 | Supersession compare-and-sets from `state='declined'` in both finalizers and never writes `finalizing`. |
| C5 | Attempt guards fire only on a state change; `approved` and `cancelled` are frozen; `declined` may only become `approved`, on both tables. |
| C6 | `payment_settlement_events` is append-only (UPDATE and DELETE refused). |
| C7 | `pendingSessionsForMerchant` returns every live session first; decline-only sessions are added separately. |
| C8 | The invoice finalizer maps the new errors; the deferred trigger raises with a constraint name and the mapping matches by name; a commit-time failure on approved evidence still raises `PAYMENT_APPROVAL_NOT_RECORDED`. |
| C9 | Define what suppression does with delivery targets already prepared (SSE included) and record the reason. |
| C10 | Supersession only in the reconciliation branch; the non-reconciliation finalize keeps its `terminal` → `reused`/`conflict` behaviour. |

Failing-first PostgreSQL tests are required for C1, C2 (a pre-0050 decline row), the C3 retail split
share, C5, C6 and C7.

Verified true: the retail and invoice split counts, the usage counter, the lock order, and R4 refunding
a superseded capture. No existing code path moves an attempt out of a terminal state.
