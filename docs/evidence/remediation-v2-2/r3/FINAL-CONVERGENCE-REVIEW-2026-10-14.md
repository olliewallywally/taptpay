# R3 final convergence review

## Verification of Prior Fixes
Final client: 133 suites / 1501 tests pass. All five owned PostgreSQL groups pass
72/19/15/24/10 checks. Both migration ledgers/fingerprints agree through 0047.
The interrupted server candidate is not full-suite evidence. Typecheck found
three synthetic GST mocks returning boolean instead of the actual number type.
Read-only remote comparison fetched Claude's October 14 `021d3f05` and its
outstanding-work record; no R4 implementation is merged.

## Blocking Issues
Declined retail queries currently copy a declined transaction ID into the
parent/share money-received column. This can block a legitimate cancellation.
A saved cash command confirmed as a conflicting earlier sale remains stuck in
the phone tab. Fix both with failing-first checks before the final full run.

## High-Risk Concerns
Keep the declined provider transaction in its attempt/binding/event identity;
only approval fills aggregate money-received fields. Cash conflict disclosure
must use the authenticated merchant's existing sale DTO. Never automatically
send a replacement cash command; require the merchant's next explicit action.

## Missing Steps
Add finite attempt caps before another query/delivery when repeated expired
leases prevented completion, and fixed diagnostic signals after a committed
dead-letter. Repair the three fixture types; rerun final regression and build.

## Unsafe Assumptions
Claude's unmounted R3 draft is not this mounted converged implementation. Do not
restore its independent callback finalizers or overwrite canonical migrations.
Do not infer missing historical account identities from current credentials.
Do not rewrite a terminal decline into approval without provider lifecycle UAT.

## Required Ordering Changes
Stop only the identified owned candidate verifier before changing source.
Capture decline/cash/expired-lease failures, implement the bounded correction,
then freeze the complete source for the final checks. Dead-letter diagnostics
follow the fenced database commit, avoiding stale-worker success signals.

## Open Product / Provider / Legal Questions
Windcave UAT must establish whether a final declined session can later approve,
and session/X-ID recovery behavior after uncertain creation. Until demonstrated,
terminal contradictions and unknown acceptance remain held, never resubmitted.
The production-sized restore and historical-row preflight remain release gates.

## Compliance and Data-Handling Notes
No external provider/payment/email/push calls, deployment, shared migrations or
flag changes. Diagnostic fields are fixed enums, without session IDs, contact
data or provider error text. Owned synthetic PostgreSQL only.

## Test and Rollback Adequacy
Retain all successful verification/creation/receiver tests. Add real PostgreSQL
decline/cancellation checks and scoped cash replay/conflict tests. Verify an
expired worker cannot bypass the retry cap or settle using a lost lease. Keep
schema and accepted-operation history on rollback; no blind resend.

## Final Recommendation (Approve / Do not approve)
Approve these bounded final repository corrections and final verification.
Do not approve phase exit, release, shared migration or R4 integration.

Separately recorded reread: preserve both kinds of evidence—declines have valid
provider identity but zero captured money. A confirmed old cash command releases
only that owner's matching browser key, while unknown requests retain it. The
new caps must fence the receipt/outbox before emitting a diagnostic, and must
not weaken the current claim owner/attempt/expiry checks.

Final caller reread: an expired, confirmed unsent checkout command must not keep
the same tab permanently processing. Return a specific 409 only for an abandoned
attempt without session/send intent. Clear only the matching saved command on
that exact refusal; the next explicit payer action creates its new UUID. Unknown
acceptance, ordinary conflicts, provider errors and expired browser state keep
the original identity. Invoice expiry uses the same refusal contract. Approve
this bounded recovery correction, with served negative/positive and client tests.
