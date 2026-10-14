# R4-T3 §21.1 review — pass 3 (independent), 2026-10-14

A third independent reviewer (a separate, read-only agent of this session, neither pass 1's
nor pass 2's) reviewed [R4-T3 revision 3](../../../decisions/2026-10-14-r4-t3-atomic-refund-claim.md)
at `c0ec2508`.

**Recommendation: approve, with conditions.**
- **Scope:** repository implementation only.
- **The flag** stays off, and is refused at startup outside `APP_ENV=test`.
- **Not included:** no migration, no UAT, no deployment.

The conditions are written into the ADR as §11 before any implementation commit. If any is
declined, the approval lapses.

## Verification of Prior Fixes

| Blocker | Evidence the reviewer cited | Result |
|---|---|---|
| Pass 1 B-1 (a legacy release erasing a refund) | ADR §6. Only the release methods ever lower `total_refunded`; R1's verifier uses them only without operations. | Fixed |
| Pass 1 B-2 (a gateway 5xx read as "not made") | ADR §1 and §5: 422 for "not made", every 5xx keeps the key, settle errors answer 202, the no-poll client | Fixed, subject to C-1 |
| Pass 2 N-1 (the key cleared on refusals that never looked at it) | ADR §1 and the claim order in §2: `keyConsumed: false` only after the key lookup under the advisory lock. `sessionFetch` retries a CSRF refusal with the same body. | Fixed, subject to C-2 |

## Blocking Issues

None. No path lets two provider calls go out for the same money, or releases a reservation
without a refusal:
- **The same key:** the advisory lock, and one commit of `requested → submitted`.
- **Different keys:** one live refund per sale, under the sale lock.
- **The legacy route:** fenced.
- **Deadlock:** none, in either store.

## Conditions (written into ADR §11)

1. **C-1 (from H-1).** The reply, broadcast and push follow the committed state. Before
   this, a `declined` or `refunded` reply that the ID rules park would have answered 422 or
   200 while the operation was `unknown`.
2. **C-2 (from H-2).** This key's own operation in flight gets the distinct code 202
   `REFUND_BEING_SENT`, with no `keyConsumed`.
3. **C-3.** The operation UUID is generated before the insert. 0039 needs the reference at
   insert and freezes it; the specification as first written would fail.
4. **C-4.** An error in the send intent or in the provider call never sends and never fails
   the operation. The send intent also checks the environment (H-5).
5. **C-5.** The listed tests and affected files.
6. **C-6 (from H-3).** R4-T4 exit criteria for stranded, parked and ID-less operations.

Also adopted (ADR §11):
- owner-only is `role === 'owner'`;
- audit for the send intent and takeover;
- the reply's sale DTO is scoped to the business;
- an escape from a pinned dialog;
- the dialog shows live refunds (H-4);
- MemStorage lock details;
- timeouts on submit and settle;
- every keyed writer takes the advisory lock;
- a stronger rollback precondition.

## Open Product / Provider / Legal Questions

- **Owner:**
  - Is a sale blocked by a parked or ID-less `unknown` acceptable until review?
  - What does the merchant see for a stranded operation?
  - Should a replay be served when the provider is unconfigured?
- **Windcave:** carried, plus whether R4-T1's `rejected` for 401, 403 and 404 is always "not
  processed".

## Final Recommendation

**Approve R4-T3 revision 3, with conditions C-1 to C-6** (now ADR §11), for repository
implementation only.
