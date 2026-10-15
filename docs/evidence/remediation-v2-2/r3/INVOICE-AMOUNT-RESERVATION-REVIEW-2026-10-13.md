# R3 invoice amount selection and share reservation review

Base `27d235b8`, owner-approved flow recorded in the October 13 decision.

## Verification of Prior Fixes
The original retail attempt engine remains in use. Fifty synthetic PostgreSQL
checks passed, including two-instance settlement and cross-share rejection.
Scratch and restored schemas match through 0040; the old snapshot reproduces
the previous CI baseline. The full regression suite is still not green.

## Blocking Issues
No blocker for this bounded invoice change. Preparing the full bill before the
split choice must stop. All unknown and approved attempts retain their original
identity. Existing duplicate invoice/UUID pairs must abort the new uniqueness
migration; do not delete or rewrite historical attempts.

## High-Risk Concerns
Reserve under the concrete invoice parent lock before provider send. Explicit
share requests retain their meaning. Reservation-mode retries locate their
UUID's original share before considering a free share. Never choose the next
share during settlement. Optional email is frozen with the request.

## Missing Steps
Forward uniqueness migration, bounded free-share selection, actual assigned
share/amount in every response, browser assignment persistence, one prepared
invoice session shared by payment methods, tests and restored rehearsal.

## Unsafe Assumptions
The displayed paid-count guess is not a reservation. Payment methods may not use
the guessed amount once the server assigns a share. A timeout does not authorize
a fresh UUID or another provider create. An already-sent claim never expires into
a free share merely because its local lease ends.

## Required Ordering Changes
Add failing customer-flow and real PostgreSQL concurrency tests. Rehearse a
forward 0041 migration on owned synthetic databases. Implement explicit
reservation mode, preserve existing explicit-share behavior, then wire the
approved amount-first UI. Record 0041 for Claude's R4 migration coordination.

## Open Product / Provider / Legal Questions
The owner has approved the flow and concurrent reservations. Provider expiry,
UAT and historical sessions remain separate gates. The newer owner cancellation
and multi-transaction decisions on Claude's branch must also be applied to R3;
this bounded change does not approve their finalizers or the phase exit.

## Compliance and Data-Handling Notes
No new mandatory information. Receipt email stays optional and per attempt.
Keep raw return state in the customer's private browser state, hash-only on the
server. Keep request and provider identities out of logs and public DTOs.

## Test and Rollback Adequacy
Test no provider create on page open, full/split choices, one session across
methods, exact cents, parallel payers, stale-count/reload retries, frozen email,
exhausted shares, uniqueness and no amount change after an attempt. Additive
uniqueness is retained during rollback; return only to a compatible build.

## Final Recommendation (Approve / Do not approve)
Approve this bounded implementation and synthetic rehearsal. Do not approve
R3 exit, feature activation, live migration or deployment.

Separately recorded reread: sharing a prepared session must not mean two
concurrent create calls. Session preparation needs a single in-flight promise.
Persist the server assignment before a wallet/card is used, preserve the UUID
across reassignment of a stale browser guess, and release it only on the exact
attempt's confirmed terminal result. A failed split must show its error and must
not start a full-amount session.
