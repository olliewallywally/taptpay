# Owner decision — a sale or invoice can be cancelled after someone has tried to pay (OI-1)

Date: 2026-10-13 UTC. Owner: Oliver.
Branch: `ccr-e07e3100-0wm8kr` at `e7c4abf3`.
Question: OI-1 in [R2-R3-MERGE-REVIEW-2026-10-13.md](../evidence/remediation-v2-2/r3/R2-R3-MERGE-REVIEW-2026-10-13.md).
Codex's guard refused a retail cancel, and an invoice void or "mark paid externally",
once any Windcave session had been recorded. That included after R2 had verified a
decline.

## Decision

The owner wrote, verbatim:

> Ok i want you to be able to cancel a payment even if someone has attempted to pay.

Applied to the three merchant changes OI-1 named: cancelling a retail sale, voiding an
invoice, and marking an invoice paid externally.

## How it is applied (Claude's implementation; the owner can change any of these)

The owner's words cover an *attempt*. These limits keep money from being lost or taken
twice. They do not refuse the merchant because of an attempt.

1. **Money already taken is not an attempt.** A captured sale or a paid split share still
   refuses the cancel or void, with a truthful message. Undoing a payment is a refund.
2. **Ask Windcave first when a payment window might still be open.**
   - Before cancelling, the server asks Windcave for the verified outcome of any attempt
     whose session is attached and not finished. This uses R2's verified query with the
     attempt's recorded expected values.
   - If Windcave says it was paid, the payment is recorded as paid and the cancel is
     refused: "This sale has just been paid."
   - If it was declined or not paid, the attempt is closed and the cancel goes ahead.
3. **If Windcave can't say yet, the cancel still goes ahead** (the owner's decision). This
   covers the customer still being on the payment page, and Windcave not being reachable.
   The open attempt is left able to settle. If the customer then finishes paying, the
   payment is recorded and the merchant is told, never lost.
4. The provider is never called while database rows are locked.

## Consequences

- Codex's tests that assert the old refusals change with this decision. Each change is
  listed in the evidence for this work.
- A sale cancelled while a payment page is still open can later show as paid. That
  reflects money that really moved.

## Rollback

Revert the implementing commit. No schema change is part of this decision.
