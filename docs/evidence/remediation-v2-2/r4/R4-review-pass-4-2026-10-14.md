# R4 §21.1 review — pass 4 (independent reread of R4-T2), 2026-10-14

An independent reviewer (a separate, read-only agent of this session) reread the
[ADR](../../../decisions/2026-10-14-r4-t2-refund-operation-schema.md) as first written and
[pass 3](R4-review-pass-3-2026-10-14.md), against plan §11, the refund route and storage,
R4-T1's client and migrations 0034–0038. Recommendation: **Do not approve.** Every blocker
was re-checked in the code by this session before the ADR was revised; the disposition column
says what changed. The revised ADR goes to pass 5.

## Verification of Prior Fixes
Pass 1's blockers are resolved (Option A; flag off by default, `server/config.ts:309`;
`transactions_id_merchant_uq` at `0036:7`). Pass 3's "the 503 is first" is loose: an invalid ID
(400) and a missing business (403) come first, neither with side effects. RD-5 is still live
code until R4-T3.

## Blocking Issues

| # | Finding | Checked | Disposition |
|---|---|---|---|
| B-1 | The ADR says `refund_amount` equals `amount_cents / 100`; bigint division would drop the cents. | The ADR wording, yes. The draft SQL already used `refund_amount * 100 = amount_cents`. | ADR wording fixed; the verifier uses 0.01, 10.50 and 99999999.99. |
| B-2 | A pending refund reply's ID (`windcave-client.ts:98`) is the only polling handle, and the ADR forbade it on `submitted`/`unknown`. | Yes. | The provider refund ID is allowed from `submitted` on, written once, and never changed by a later state. |
| B-3 | `requested → cancelled` releases a reservation. It is safe only if `submitted` is committed before any provider call; the ADR did not say so. | Yes; today's route sends with no recorded intent. | The ADR makes the commit of `submitted` the send intent, before any network call. The verifier proves a sent operation cannot be cancelled. |
| B-4 | A record-only refund is inserted `succeeded`. It is never live, and the totals rule applied only to "becoming" succeeded, so it never reduced the balance (a double refund). | Yes. | The ADR's balance rule now names both: a record-only insert and a provider success each update the totals in the same transaction, under the sale's lock. `cancelled` is removed for record-only rows (unreachable). |
| B-5 | The composite foreign key breaks the R1-T7 S2a verifier (`verify-tenant-transactions-postgres.ts:75-76,116,147`): it inserts mismatched legacy refunds and moves sales that have refunds. | Yes. | The foreign key is dropped. The trigger checks that an operation's business owns its sale, and that the capture belongs to that sale, at insert. Legacy rows and R1's evidence are unaffected, and `transactions` takes no lock. |

## High-Risk Concerns
1. **The foreign key would lock `transactions`** (SHARE ROW EXCLUSIVE) for the migration.
   Removed with B-5. The `refunds` rewrite remains; the app should still be stopped (runbook).
2. **The original capture is not tied to the sale.** Fixed: the insert check requires that the
   capture is this sale's own provider transaction, its share's, or an attempt's recorded one.
3. **"Captured cents" is undefined; Windcave caps refunds per capture.** Defined in the ADR:
   per capture, and split refunds stay disabled by default (owner question).
4. **The totals rule is a convention, not enforced.** Recorded as an alternative considered.
   R4-T4's verifier asserts the invariant. A trigger maintaining totals was rejected for T2
   (see the ADR).
5. **No parked or dead-letter state.** Fixed: `unknown` with no next reconciliation time is
   parked for review. Its reservation is kept, and it is never released without confirmation.
6. **MemStorage has no trigger.** R4-T3 adds one pure transition function used by both stores
   and tested against both.

## Missing Steps (all adopted)
- The R1 verifier is no longer affected (B-5's fix). It is re-run with 0039.
- The parity test covers `refunds`.
- A count-only preflight and a runbook for 0039.
- The tenant abort is gone with the foreign key. The trigger's tenant check is fixed text.
- A due index covers `requested`, so a stranded request is found.
- `updated_at` may change with `customer_notified`; the fee columns are set in the success
  update.
- R4-T4 will need a migration for exactly-once audit and notification. This is recorded, and
  T2 does not claim it.
- `initiated_by_user_id` has no foreign key: it is an audit record that outlives a removed
  member (`storage.ts:8993-9003`).
- Baseline entries cover the function and the trigger.

## Unsafe Assumptions (corrected in the ADR)
- The wording "every new column is null" versus `operation_id`.
- "Which the preflight proves" (the foreign key is gone).
- Pass 3's "the schema allows each answer": invoice refund-due cases and system-initiated
  refunds are not in R4-T2. They are listed as owner questions.
- "The table is small" is unmeasured; the runbook measures it.
- The 64-character X-ID limit is the client's bound.

## Required Ordering Changes
Revise the ADR, then an independent reread (pass 5), before any migration or code is written.
Applying 0034–0038 to the test database is the owner's operational step. It must precede
applying 0039 anywhere; it does not block repository work.

## Open Product / Provider / Legal Questions
- **Windcave:**
  - Can a refund be queried by X-ID?
  - Does a 404 mean "not processed"?
  - Do refund and session X-IDs share a namespace?
- **Owner:**
  - Does a manual or bank refund reduce what can be refunded by card? (The ADR's default:
    yes.)
  - Are invoice refund-due cases and system-initiated refunds in R4?
  - Is a redaction-only change to a finished refund's reason allowed? (The ADR allows clearing
    it.)

## Compliance and Data-Handling Notes
`reason_text` may hold a customer's details. Clearing it is allowed on any row (IPP 7). The
trigger's messages are fixed text with no identifiers.

## Test and Rollback Adequacy
- **Tests adopted:**
  - amounts that are not whole dollars;
  - the whole verifier under a non-UTC session time zone;
  - every legacy writer after 0039;
  - a pending ID, a cancel after the send intent, and the record-only balance rule;
  - the full terminal freeze;
  - each identity column one at a time.
- **Rollback precondition:** the refund flag is off and there are no live operations.

## Final Recommendation
**Do not approve** the ADR as first written. The revised ADR goes to pass 5.
