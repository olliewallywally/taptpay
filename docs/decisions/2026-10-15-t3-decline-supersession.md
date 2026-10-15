# ADR — T-3: a later approval in a session supersedes its recorded decline (2026-10-15)

Status: **revision 3, proposed, under independent review (pass 2).** The owner decided on
2026-10-15 to build full supersession now ([decision](2026-10-15-t3-build-full-supersession-owner-decision.md)).
Revision 2's interim guarantee (below) stays as the safety net. Revision 1 (at the end, unchanged)
was refused by [review pass 1](../evidence/remediation-v2-2/r4/T3-review-pass-1-2026-10-15.md).

## Revision 3 (2026-10-15)

Each numbered rule answers review pass 1's condition of the same number.

### Rules

0. **What supersedes what.** Only a verified `approved` outcome may supersede, and only a
   verified `declined` of the **same session, binding and attempt**. It must pass every existing
   check: expected money, reference, account and environment, and the provider transaction not
   claimed by any other session or attempt. Nothing supersedes an approval or a cancellation.
   Browser text and unverified input never decide.
1. **Registry and binding.** The binding's provider transaction ID moves from the declined card's
   ID to the approval's. Migration 0050:
   - lets the provider-transaction registry hold one *supersession* claim per session besides its
     first claim, so the declined card's ID stays claimed for good;
   - keeps the binding ID write-once for card-attempt bindings and never lets it become NULL;
   - for payment and invoice bindings, checks any change at commit (a deferred constraint
     trigger): the bound attempt is `approved` with the new ID, the session has an `approved` event
     carrying the new ID, and a `declined` event carrying the old one.
2. **A second attempt B on the same sale or share.** After A's decline, B may be claimed (as
   today).
   - **Supersession goes ahead when B is live.** A moves `declined` → `approved` directly, never
     through `finalizing`, so no live-unique index is touched.
   - **Supersession is a `conflict` when another attempt already approved the same share or
     unsplit aggregate.** It is checked before any write, so it is never a unique-index throw, and
     the interim guarantee's `PAYMENT_APPROVAL_NOT_RECORDED` fires: two cards were charged.
   - **B's later verified decline or cancellation on an aggregate already paid** is recorded on
     B alone: B is terminal, its binding and a settlement event are written, the aggregate is
     unchanged, there is no outbox row and no alert.
   - **B's later approval on a paid aggregate** is a `conflict` checked before any write, so the
     alert fires.
   - Every new constraint name maps to `conflict` in both finalizers.
3. **Reaching the finalizer.** This is kept from revision 2:
   - handlers reconcile declined attempts;
   - a decline-only session's receipt reopens on any arrival.

   Added: a merchant's pre-change reconcile also asks about sessions whose only settlement is a
   decline (`pendingSessionsForMerchant`).
4. **Stale decline.** A verified decline for an attempt that is already `declined` or `approved`
   is `reused`, whichever declined card it names.
5. **Events.** Settlement events gain a `provider_transaction_id` column, written for every new
   event, so the declined card's ID is kept on its event.
   - At most one `declined` event and one non-declined event per session. The non-declined event
     that follows a `declined` one must be `approved`, and a `declined` event can never follow a
     non-declined one.
   - A BEFORE INSERT trigger enforces this. It locks the session's binding row first, so the
     check is race-free on its own.
   - Invoice and retail attempts are guarded the same way: `approved` stays `approved`, and
     `declined` may only become `approved`.
   - Every read of a session's event names its outcome.
6. **MemStorage** refuses every reconciliation finalize today and keeps refusing; this is stated
   in code. Supersession is PostgreSQL-only and tested there. `shared/schema.ts`, the baseline
   contract and the verifiers are updated.
7. **Notifications and refunds.**
   - A supersession marks the declined event's undelivered outbox rows (`pending` or `retry`)
     `complete`, so no "declined" email follows the receipt; one already delivered stays delivered.
   - A superseded approval is the aggregate's recorded capture, so R4 can refund it. A second
     capture that is a `conflict` cannot be refunded through R4 today: its ID is kept on the inbox
     row and the alert, for a refund by hand. Revision 1's claim otherwise was false.
8. **Tests, failing first, on PostgreSQL:**
   - supersession for a retail sale, a retail split share and both invoice verticals, each once:
     replay is `reused`, the outbox is exact, and usage is counted once;
   - B1: the registry keeps both claims;
   - B3: B live, then A supersedes, then B's decline is recorded quietly; B approved first, then
     A's approval is a `conflict` with no throw (retail and invoice split);
   - a stale decline after a supersession is `reused`;
   - a second decline is `reused`;
   - each forbidden database write refused directly;
   - pre-change reconcile includes a decline-only session.

### Unchanged

The finalizers' lock order (retail: sale → attempt → split rows → inbox lease → binding; invoice:
inbox fence → invoice → attempt → binding), usage counted only on approval, the retail cancel guard
and R4's capture lookup.

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

*The sections below are revision 1, kept as reviewed and refused. Revision 3 above replaces them.*

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
