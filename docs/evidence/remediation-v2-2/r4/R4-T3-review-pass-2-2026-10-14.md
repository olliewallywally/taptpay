# R4-T3 §21.1 review — pass 2 (independent), 2026-10-14

A second independent reviewer (a separate, read-only agent of this session, not pass 1's)
reviewed [R4-T3 revision 2](../../../decisions/2026-10-14-r4-t3-atomic-refund-claim.md).
Recommendation: **Do not approve.**

- **B-1 (the legacy fence):** resolved. Revision 2 answered it.
- **B-2:** resolved for 502 and 504. N-1 reopens the same failure class.

This session checked each finding in the code and answered it in revision 3.

## Blocking Issues

| # | Finding | Checked | Revision 3 |
|---|---|---|---|
| N-1 | The client cleared the key on refusals that never looked at it: 403 `CSRF_REJECTED`, `CROSS_SITE_REJECTED`, the owner and access 403s, body 400s and `REFUND_METHOD_UNAVAILABLE`. It also cleared it on `IDEMPOTENCY_KEY_REUSED`, which proves an operation exists. A lost reply, then a CSRF turnover on retry, then a new key, gave a second refund. | Yes (auth.ts and cross-site.ts are app-coded 403s; the key slot is per sale). | Two layers. **Server:** one live refund per sale; a second claim gets 409 `REFUND_IN_PROGRESS` (an owner default). **Client:** the key is cleared only on 200, 422, or a refusal carrying `keyConsumed: false`. Every pre-claim refusal and `KEY_REUSED` keeps it. |

## High-Risk Concerns (all adopted)

1. **The wrapper could not pass `refundPollLimit: 0`.** Its default client polls three
   times, so the worst case of 75 s exceeded the 45 s lease. Now a dedicated no-poll refund
   client, with the timeout constant exported for the lease test.
2. **The refund-ID rules contradicted each other.** Now one table: what `refunded`,
   `pending` and `declined` do with an absent, malformed, capture-equal or duplicate ID.
3. **A single-UPDATE fence would miss a claim that had just committed.** Now the sale is
   locked FOR UPDATE, then checked in a separate statement.
4. **MemStorage did not serialise the key.** Now a key lock, then a sale lock. The rules
   module mirrors the trigger as well as the CHECKs.
5. **A stale key replays an old refund.** The copy now says it is the earlier refund's
   result, and the dialog stays pinned to the stored payload.
6. **`rejected` 408, 423 and 425 may be ambiguous.** Added as a Windcave question.

## Missing Steps (adopted)

- **The takeover happens inside the send-intent transaction,** under the sale lock then the
  operation lock, never in the claim's reuse branch.
- **`updated_at` is set on every write.**
- **Seven more affected tests are listed.**
- **The clients parse the code.** Today they show raw status and body, or count 202 as
  success.
- **SSE nulls documented.**
- **A 202 with no ID is handled.**
- **The advisory lock namespace is a dedicated key.**

## Unsafe Assumptions (answered)

- **Isolation:** each read is a separate statement after its lock (READ COMMITTED).
- **"Never thrown away" holds only in T3.** From R4-T4 a worker's poll recovers the outcome.
- **The live-lease reuse message** no longer says "being checked": it is
  `REFUND_IN_PROGRESS`.

## Required Ordering Changes (adopted)

- **The claim's order:** the advisory lock, the key lookup, the sale lock, then separate
  reads, the insert and the event.
- **No path holding a row lock takes the advisory lock.** This is binding on R4-T4.
- **Settle's order:** validate, lock, a savepoint for the update, the totals, the event,
  commit, then notify.
- **MemStorage:** the key lock, then the sale lock.

## Open questions (carried)

- **Owner:**
  - one live refund per sale;
  - cash sales are refused until R4-T5.
- **Windcave:** the earlier list, plus 408, 423 and 425.
- **UAT** waits for R4-T4/T5, because the startup guard keeps the flag off.

## Final Recommendation

**Do not approve** revision 2. Revision 3 goes to pass 3.
