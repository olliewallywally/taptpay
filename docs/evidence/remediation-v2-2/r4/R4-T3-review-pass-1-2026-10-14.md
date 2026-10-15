# R4-T3 §21.1 review — pass 1 (independent), 2026-10-14

An independent reviewer (a separate, read-only agent of this session) reviewed
[R4-T3 revision 1](../../../decisions/2026-10-14-r4-t3-atomic-refund-claim.md) against plan §11,
R4-T2's approved schema and binding rules, R4-T1's client, the legacy storage methods, the
cash command pattern and the three client callers, at `b6c5def5`. Recommendation: **Do not
approve** (two blockers).

This session checked each finding in the code and answered all of them in revision 2.

## Blocking Issues

| # | Finding | Checked | Revision 2 |
|---|---|---|---|
| B-1 | The legacy release method subtracts any amount and resets the sale's status, unguarded, in both stores. Revision 1 fenced only sales with a *live* operation. So a confirmed operation refund could be erased from `total_refunded`, and the same money refunded again. This also broke R4-T2's "retire or fence entirely". MemStorage's update-status could rewrite an operation row. | Yes (`storage.ts` release methods; MemStorage update-status). | Reserve and release refuse any sale with any operation row. Update-status refuses operation rows, in both stores (§6). |
| B-2 | 502 was the definitive "not made", but a gateway's own 502 or 504 during an in-flight call (up to about 75 s with polling) looks the same. A client clearing its key would send a second partial refund. | Yes (the three clients treat any non-2xx alike). | A decline is 422 `REFUND_NOT_MADE`. The final answers are listed. Every 5xx, 202, network error or uncoded body keeps the key. The key lives in sessionStorage per business and sale. Settle errors answer 202 (§1, §5). |

## High-Risk Concerns (all adopted)

1. **A provider refund ID that 0039 refuses would fail settle after money moved.** Now it is
   validated first: shape, not the capture, a duplicate caught. A failure parks the
   operation.
2. **App-clock timestamps against 0039's ordering CHECK, and lease expiry across
   instances.** The database clock is used everywhere.
3. **Lease semantics at settle.** Settle checks the owner and the state, not expiry. The
   lease is derived from the client's timeout, with a test.
4. **The 202's ID was lost if the process crashed while polling inside the client.** The
   route now asks for no polling; the pending ID is persisted and polling moves to R4-T4.
5. **A malformed capture ID** (MemStorage seed data contains a dot). Validated in the claim:
   `capture_invalid`.
6. **The flag rests on an environment boolean.** A startup guard now refuses it outside tests
   until R4-T4.
7. **Logs could carry the failing row.** The route logs the error class only.

## Missing Steps (adopted)

- The full column set for each transition.
- The reply for every replayed state, including a reused `requested` under a live lease.
- The `isWindcaveConfigured()` gate before the claim.
- `SET LOCAL` timeouts, and the advisory lock (no 23505 re-read).
- MemStorage: `withMemLock`, a shape validator and an event store.
- An allowlisted reply body.
- The existing tests that change, with their intent kept.
- Client handling of 202.

## Factual errors in revision 1 (corrected)

- The cash command serialises its key with `pg_advisory_xact_lock`, not a 23505 re-read.
- MemStorage's cash command uses `withMemLock`; it is not "synchronous between awaits".

## Unsafe Assumptions (answered)

- **Other writers can rewrite the sale.** Settle recomputes the status from the totals, and
  `total_refunded` is coalesced.
- **R4-T1's `refunded` does not check the original capture link.** Recorded as an accepted
  limit for UAT.

## Open questions (carried)

- **Fingerprint:** it now excludes the reason text. This answers the owner question and the
  guessing concern.
- **Stranded operations until R4-T4:** none exist while the flag is off.
- **Windcave:** query by X-ID; what a 404 means; whether the 202's ID is final; the X-ID
  namespace; reference visibility; `transaction2Id`.

## Final Recommendation

**Do not approve** revision 1. Revision 2 goes to pass 2.
