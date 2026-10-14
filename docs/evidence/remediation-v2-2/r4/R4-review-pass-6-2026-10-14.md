# R4 §21.1 review — pass 6 (independent reread of R4-T2 revision 3), 2026-10-14

A third independent reviewer (a separate, read-only agent of this session, neither pass 4's
nor pass 5's) reread the [ADR at revision 3](../../../decisions/2026-10-14-r4-t2-refund-operation-schema.md)
and the whole implementation:

- the migration, its verifier and the runbook;
- the Drizzle declaration and MemStorage;
- the baseline-contract entries and the tests.

Recommendation: **Approve, scoped**, with five conditions before commit. None of them changes
the schema. This session met each condition, then committed.

## Verification of Prior Fixes
- **Pass 5's blockers are fixed.**
  - N-1, a split capture as share 0: the unsplit test in the trigger. The verifier case is
    shown not to be vacuous.
  - N-2, a null method: the CHECK, and a null-safe trigger. The method is also in the
    immutable identity.
- **Pass 5's concerns, adopted.**
  - One refund ID from pending to final.
  - The lease CHECK.
  - Approved attempts in the same environment.
  - The KEY SHARE lock.
  - The DELETE guard.
  - Surfacing parked rows: recorded as an R4-T4/T5 obligation.
- **Pass 4's B-1 to B-5** remain fixed.

## Blocking Issues
None. Candidates checked against the code and refuted:

| Candidate | Why it is not a blocker |
|---|---|
| A deadlock from KEY SHARE | The existing foreign key already takes that lock on the same row. |
| Owner logins without a business | Owners always carry `users.merchant_id`. |
| An admin initiating | Admins are not in `users`; this is the open admin-path question. |
| A legacy capture becoming unrefundable | Branches 1 and 2 cover legacy unsplit sales and legacy shares. |

## High-Risk Concerns, and what was done

| # | Concern | Done |
|---|---|---|
| 1 | Four mutations passed the verifier: the attempt's `outcome = 'approved'`, the CHECK's non-null method alone, the trigger's null-safety alone, and the KEY SHARE lock. | Cases added: a declined attempt, and the null method refused by each layer (the CHECK alone is checked with the trigger disabled, in a rolled-back transaction). A two-connection case shows an ownership move waits for an operation insert. Mutations re-run: the first three are now caught. Removing the trigger's KEY SHARE still passes, because the existing foreign key takes the same lock. This is recorded in the ADR as a second layer. |
| 2 | The trigger proves ownership, not capture validity: a failed or cancelled sale can carry a declined transaction's ID. | ADR: R4-T3 checks the completed status under the lock, and takes the environment from configuration. |
| 3 | The KEY SHARE lock depends on 0036's `UNIQUE (id, merchant_id)`. | ADR records the dependency. |
| 4 | Branches 1 and 2 do not check the environment. | ADR: R4-T3 takes the environment from configuration, never the request. |
| 5 | `attempt_count > 0` is allowed on `requested` or `cancelled`. | Recorded, not changed. The approved schema is kept. R4-T3 sets the count only when it submits; reconsider in R4-T4's migration. |

## Missing Steps (done)
- Verifier cases: concern 1 above.
- **Runbook fixes:**
  - The `sales_out_of_step` query now counts pending, processing and completed legacy
    refunds, and uses a LEFT JOIN.
  - A count of completed card sales without a capture.
  - The timeout wording: per lock and per statement.
  - The queries were run locally: counts only.
- **R1 S2a verifier re-run with 0039 applied:** 25/25 (the ledger shows 0039 applied).
- **Pass 5's record corrected:** the declined-attempt case was claimed before it existed.
- **CI fingerprint gate (`.github/workflows/verify.yml`):** still records R1-T5b (0033).
  This is pre-existing. It needs re-recording for 0034–0039 when CI next runs migrations;
  recorded as a follow-up.

## Unsafe Assumptions (recorded)
- **Membership ignores user status and role.** R4-T3/T5 enforce owner-only. Owner question:
  enforce `role = 'owner'` in the database?
- **MemStorage `deleteMerchant` leaves refunds dangling;** PostgreSQL refuses. Pre-existing.

## Required Ordering Changes
**Lock order, binding on R4-T3/T4:** the sale FOR UPDATE before any operation row. Recorded
in the ADR.

## Open Product / Provider / Legal Questions
Unchanged (ADR), plus owner-only initiation in the database.

## Compliance and Data-Handling Notes
- Trigger messages are fixed text. The only one that names a state uses the stored,
  already-checked value.
- The runbook prints counts only.
- `reason_text` can only be cleared.

## Test and Rollback Adequacy
- **The SQL holds under three-valued logic.**
- **Drizzle matches the SQL:** types, nullability, defaults, index names and predicates.
- **Rollback is adequate:** a code revert while the flag is off and no operation is live.

## Final Recommendation
**Approve, scoped:**
- ADR revision 3;
- migration 0039;
- the Drizzle, MemStorage, baseline-contract and test changes, as repository work on
  `ccr-e07e3100-0wm8kr`;
- the owner applying 0039 to the **test** database only, by the runbook, after 0034–0038,
  with the app stopped.

**Not approved:** production, `FEATURE_REFUND_INITIATION`, and any R4-T3/T4 code.
