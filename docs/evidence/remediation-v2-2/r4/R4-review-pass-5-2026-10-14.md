# R4 §21.1 review — pass 5 (independent reread of R4-T2 revision 2), 2026-10-14

A second independent reviewer (a separate, read-only agent of this session, not pass 4's)
reread [ADR revision 2](../../../decisions/2026-10-14-r4-t2-refund-operation-schema.md),
[pass 4](R4-review-pass-4-2026-10-14.md) with its dispositions, the draft migration and the
draft verifier, against plan §11 and the code at `555686d8`. Recommendation: **Do not
approve** revision 2.

- **Pass 4's blockers:** B-1 to B-4 are verifiably fixed. B-5's replacement was incomplete
  (N-1).
- **Re-checked here:** every finding below was checked in the code by this session before
  revision 3. The verifier gained a case for each blocker and adopted concern.

## Verification of Prior Fixes
Confirmed fixed, with citations: B-1 (exact cents), B-2 (pending refund ID), B-3 (cancel only
before the send), B-4 (record-only balance, as a recorded decision), and pass 4's concern 1
(only `refunds` locked). B-5 was fixed for legacy rows and the lock, but see N-1.

## Blocking Issues

| # | Finding | Checked | Revision 3 |
|---|---|---|---|
| N-1 | A split sale's own `windcave_transaction_id` holds its **last share's** capture (`server/storage.ts:6240-6241`). The share-0 branch accepted it as share 0, and the balance rule would cap it at the whole sale price. | Yes. | The share-0 branch requires an unsplit sale. Verifier case added. |
| N-2 | A null `refund_method` passes every check and the trigger, by three-valued logic, giving a succeeded operation with no method. | Yes, by reading the SQL. | The method must be set. The trigger's method tests are null-safe. Verifier case added. |

## High-Risk Concerns (all adopted)

1. **A pending ID that differs from the final ID would stick the operation.** The ADR now
   requires one ID: a different final ID is a mismatch and parks the operation. Added to the
   Windcave questions.
2. **Lease semantics.** The real race is a worker finishing a `submitted` row before the
   sender's POST lands. The ADR now has a binding lease rule, and a `submitted` row must have
   a lease (CHECK). A 404 is never "not processed" without Windcave's confirmation.
3. **An attempt's capture is accepted in any state.** Now only an approved attempt, in the
   operation's environment. (The declined-attempt case was added after pass 6; see the
   correction under Missing Steps.)
4. **The tenant check takes no lock.** The trigger now holds the sale with KEY SHARE until
   the insert commits.
5. **DELETE is unguarded.** An operation is now never deleted; legacy rows still can be.
6. **Parked rows are not surfaced.** R4-T4/T5 must surface them (ADR).

## Missing Steps (adopted)
- The 0039 runbook with its count-only preflight.
- Verifier cases: null method, a split capture as share 0, a production attempt, DELETE, a
  legacy operation-ID change, a user of another business, a submit without a lease.

  *Correction (pass 6):* this record first also listed a non-approved attempt's capture.
  That case was not written until pass 6 found it missing, and the null-method case did not
  show each layer. Both were added before the commit.
- The migration header names every review.
- `insertRefundSchema` omits the operation columns, with a unit test.
- The initiating user must belong to the business (trigger).

## Unsafe Assumptions (corrected)
- **Legacy reserve and release:** R4-T3 must fence them entirely, not only for operations.
- **The no-foreign-key rationale:** restated. It covers deletion of the business or a future
  admin path; `removeTeamMember` cannot remove owners.

## Required Ordering Changes
**The refund flag stays off until R4-T5's DTOs ship.** The read routes return raw rows,
members included. Recorded in the ADR.

## Open Product / Provider / Legal Questions
- **Windcave:** are a 202's `id`/`self` the same transaction the final reply names?
- **Owner:** a split sale cancelled and then paid late has no refund path while split refunds
  are disabled.
- **Owner:** if an audit event copies the reason, clearing it must cover the copy.

## Compliance and Data-Handling Notes
A refused transition names only the stored state, never the writer's value.

## Test and Rollback Adequacy
The plpgsql semantics (row-variable probe, null-safe comparisons, trigger before CHECKs) were
judged sound. Rollback is adequate as stated; parked rows count as live.

## Final Recommendation
**Do not approve** revision 2. Revision 3 goes to pass 6.
