# R3 retail split and decline retry correction

## Verification of Prior Fixes
The delivery receiver passed ten owned PostgreSQL fault checks. Twelve
subscription PostgreSQL checks pass; served owner/privacy tests pass. No live
provider or communication request was made.

## Blocking Issues
New evidence: retail split configuration does not inspect retained attempts,
so it can invalidate a full-amount session. A declined unsplit parent also
cannot claim its next safe attempt. Approve only the bounded repairs below.

## High-Risk Concerns
Never change share amounts after any live, sent or attached provider attempt.
Keep unknown attempts held. Retain exactly matched configured split replays.
Only a new durable attempt may authorize a retry of a failed parent.

## Missing Steps
Inspect attempts under the parent lock before creating shares. Append one
split audit/outbox in the same transaction. Remove route-local split broadcasts.
Permit failed-parent claims/finalization without bypassing verifier checks.

## Unsafe Assumptions
A pending aggregate does not mean no provider request exists. Lease expiry
does not release a sent attempt. R2 expectations alone do not prove a send.

## Required Ordering Changes
Parent, attempts, shares; provider I/O remains outside row locks. Test refusal
without state/message mutation before applying the split correction.

## Open Product / Provider / Legal Questions
Preserve the approved amount-first flow and cancellation policy. This repair
adds no new payment method or provider retry policy.

## Compliance and Data-Handling Notes
Public split configuration records service actor `public_checkout`; numeric
retail remains subject to the reviewed board route policy. No raw tokens in
audit/outbox. Configuration is not a provider authorization.

## Test and Rollback Adequacy
Verify live/expired-sent/bound-attempt split refusal, identical replay, one
audit/outbox, terminal-decline retry and no release of uncertain money. Keep
stored attempts, shares and events on code rollback.

## Final Recommendation (Approve / Do not approve)
Approve the stated bounded repairs in the current R3 working tree. The known
defects must pass their new regressions before inclusion in the final candidate.
No phase exit or deployment approval is given.

Separately recorded reread: match the persisted send marker rather than expected
fields when releasing an expired unsent claim. A split replay cannot rebalance
shares or broadcast a second configuration event.
