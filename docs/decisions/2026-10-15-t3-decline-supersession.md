# ADR — T-3: a later approval in a session supersedes its recorded decline (2026-10-15)

Status: **revision 2 — an interim guarantee is adopted; full supersession is deferred.**
Revision 1 (below, unchanged) was refused by
[review pass 1](../evidence/remediation-v2-2/r4/T3-review-pass-1-2026-10-15.md): the 0044
transaction registry, handlers that skip declined attempts, and a possible live second attempt on
the same share make it incomplete, and two of its claims are false. Owner direction 2026-10-15: "fix
the open stuff first" ([R3 integration §5](../evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md)).

## Revision 2 (2026-10-15)

Full supersession needs every condition of review pass 1 (a 0044 registry change, deferred binding
checks, a policy for a live or approved second attempt on the same share, handler and pre-change
reconciliation changes, notification suppression, and keeping the declined card's ID). It matters
only if Windcave reports a session `complete` after a decline and later approves another card in
it. That is unknown, and it is now a case on the [UAT checklist](../operations/r3-uat-checklist.md).

**Adopted now: a later approval is never lost silently.** Each part has a failing test first.

1. The payer's return and completion handlers (retail and invoice) still ask Windcave when the
   attempt is `declined`. They skip only `approved` and `cancelled`.
2. A finished inbox receipt whose session has only a declined settlement is reopened by any new
   arrival, whatever its age (D1's one-minute rule still applies to other finished receipts).
3. An approval that cannot be recorded dead-letters as `settlement_conflict` with its provider
   transaction ID kept on the inbox row (`observed_transaction_id`) and `settlement_conflict:approved`
   on a retail attempt. It raises its own signal, `PAYMENT_APPROVAL_NOT_RECORDED {domain}`, after
   commit. This covers both a later card in a declined session and a second payment for an
   aggregate already paid, which also needs a refund.

**Deferred:** revision 1's supersession, rewritten to meet review pass 1's conditions, if UAT shows
the case occurs or the owner asks for it before UAT.

---

*The sections below are revision 1, kept as reviewed and refused.*

## Problem

R3 records any verified outcome of a session as that session's one settlement. A verified decline
closes the attempt (`declined`), writes the declined card's provider transaction ID on the session
binding, and inserts the session's settlement event (`payment_settlement_events.session_id` is
unique). If the payer then pays with another card **in the same Windcave session**, the verified
approval cannot be recorded: the attempt is terminal, the binding's transaction ID is write-once,
and the session already has its event. The worker dead-letters it as `settlement_conflict`, so
the card is charged and the sale shows unpaid. (Since D1, the alert at least fires.)

Whether Windcave reports a session `complete` after a decline and then accepts another card in
it is not known; it is a UAT question. This design is correct either way: if Windcave never does
it, the new path is never taken.

## Decision

A verified **approval** for a session whose attempt was closed by a verified **decline** of that
same session is recorded, as the approval it is. Nothing else is superseded.

1. **What may supersede what.** Only `declined` → `approved`, only by verified evidence for the
   same session, binding and attempt, passing every existing check (expected money, reference,
   account, environment; the provider transaction not used by another attempt or session).
   Never an approval or a cancellation; never by browser or unverified input.
2. **A second decline is a no-op.** A verified decline for an attempt already declined is
   `reused`, whichever declined transaction it names (OI-2 picks by ID, and another declined card
   changes the pick). Today it is a `settlement_conflict`.
3. **Effects of a supersession**, in the finalizer's existing transaction and lock order:
   attempt `declined` → `approved` with the approval's provider transaction ID; the binding's
   provider transaction ID becomes the approval's; a second settlement event (`approved`) for the
   session, with its two outbox rows (merchant update, payer receipt); the aggregate moves exactly
   as for any approval (retail: `failed`/`pending`/`processing`, or `cancelled` under
   reconciliation as a late payment, to `completed`; a split share to `completed`; invoice: as the
   existing approve edge, including voided and paid-externally). Usage counted once.
4. **Unchanged.** If the aggregate was paid by another attempt meanwhile, the approval is a
   `conflict` and dead-letters with its signal, as any other late approval on a paid aggregate
   does today: two cards were charged and one needs a refund (R4). This design does not change
   that path.

## Database (migration 0050, applied nowhere)

- Settlement events: replace the unique `session_id` with at most one `declined` and at most one
  non-declined event per session, and refuse a `declined` event for a session that already has a
  non-declined one (trigger).
- Binding `provider_transaction_id` stays write-once **except** while the session's only
  settlement is a decline (trigger replaces `payment_binding_transaction_immutable`).
- Retail attempt `provider_transaction_id` stays write-once **except** `declined` → `approved`
  (trigger replaces it in `retail_attached_immutable`; every other field there is unchanged).
- Invoice attempts carry no transaction ID; their state and outcome are already mutable.

## Code

- Retail finalizer (`DatabaseStorage` and `MemStorage`), invoice finalizer
  (`DurablePaymentStorage.finalize`): the supersede branch and the second-decline no-op.
- Every read of "the session's settlement event" names the outcome it wants.
- Transition graphs: `paymentAttemptGraph.supersedeDecline` (`declined` → `approved`, processor,
  verified evidence only).

## Tests (failing first)

PostgreSQL, for retail unsplit, retail split share and both invoice verticals: decline recorded,
then approval in the same session recorded once, with two events and the right outbox rows; a
replayed approval is `reused`; a second decline is `reused`; an approval after another attempt
paid is a `conflict`; the database refuses each forbidden write directly (a second approval, a
decline after an approval, a binding change after an approval, a retail transaction change
outside `declined` → `approved`). MemStorage mirrors the retail cases.

## Alternatives rejected

- **Patch cancel only** (do not record a decline at cancel). The FPRN or browser return records
  the decline anyway, so the approval is still lost.
- **Leave a declined attempt open.** An attached live attempt blocks every new claim on the sale,
  so a payer could never start again after a decline.
- **Alert only** (D1's reopen plus the dead-letter signal). The money stays unrecorded until a
  person fixes the sale by hand.
