# R3 active payment convergence review

October 14 bounded diagnostics reread: actual served PostgreSQL approval tests
show R2's retail reconciliation code/time are no longer recorded by the new
worker. Approve restoring those existing fields when the fenced inbox result
commits, using fixed enum codes only. Lock retail parent, then attempt, then
inbox, matching the original retail finalizer; never add parent locks after an
inbox lock. Preserve money/identity and test approval/mismatch timestamps and
concurrent receipt recovery. No schema, provider or release scope changes.

Base `27d235b8`. Implement the retained payment flow inventory, not new products.

## Verification of Prior Fixes
R2 transport/parser/verifier and canonical R3 finalizers passed actual synthetic
PostgreSQL checks. Cash checkpoint is pushed. Active notifications still ACK
before saving and callbacks retain independent finalizers; these are open debt.

## Blocking Issues
No blocker for bounded runtime/notification/retail/invoice convergence. Missing
official UAT, historical identity reconciliation and real delivery verification
remain phase/release gates. Never infer missing expected money from provider data.

## High-Risk Concerns
Persist before send; retain unknown acceptance. Bind exact share/session and
immutable expectations. Browser/result hints cannot choose financial outcome.
Timers must not bypass initiation flags or run during module import/tests.

## Missing Steps
One injected R2 runtime, durable notifications, exact-session worker invocation,
client UUID/share persistence, durable browser state, callback convergence,
legacy reconciliation disposition, concrete card/billing and real keyed delivery.

## Unsafe Assumptions
Windcave GET notifications are recorded in R2 review pass 2 and existing callers;
a POST-only handler would lose supported notifications. Retain GET `sessionid`
and existing `sessionId` compatibility, reject duplicate/conflicting aliases.
Accept only bounded JSON/form POST; query/body fields remain hints. An absent
database cannot durably ACK. An expired browser state cannot prevent FPRN recovery.

## Required Ordering Changes
Failing served-pipeline receipt tests → skip general parsers on exactly reviewed
notification routes → bounded receipt handlers → injected worker/runtime →
canonical pre-send expectations → all retained callback/client convergence →
PostgreSQL route/fault proof → final regression and separate reread.

## Open Product / Provider / Legal Questions
Preserve product choices and all false initiation flags. Reconciliation remains
separate from initiation. Existing sessions without independently persisted exact
identity stay held for operational reconciliation; never apply them to the next
open share. Stored-card semantics retain R2 owner decisions until official UAT.

## Compliance and Data-Handling Notes
Fixed error codes only, no raw session/token/query/provider text. Return narrow
local outcome DTOs. No live provider, payment, email/push or shared migration in
verification. Preserve property feed-under-dock and owner app process.

## Test and Rollback Adequacy
Require commit-before-ACK, failed-write retry status, GET/POST shape/size refusal,
duplicate/concurrent receipts, callback/worker race, unknown acceptance, disabled
initiation with retained reconciliation, exact share isolation, and full atomic
financial/audit/outbox rollback. Additive schema remains on code rollback; drain
or retain durable work, never restore old unsafe callback completion.

## Final Recommendation (Approve / Do not approve)
**Approve** the bounded active convergence implementation against §10 and this
inventory. **Do not approve** R3 exit or deployment until the remaining criteria
are evidenced. Separate Codex reread: direct runtime uses actual R2 typed client,
notification hints cannot authorize money, and general parser bypass is restricted
to four exact payment-notification patterns. No independent-agent review claimed.

## New concurrency evidence and revised bounded approval

The first actual retail coordinator test failed with PostgreSQL `40P01`: registry
repair can insert a binding while another path locks its attempt, against claims
that already hold the parent. Return to review before route cutover. Require the
original attachment and registry operations to use parent → attempt → binding,
and skip recovery insertion for an existing binding. Separately reread this
ordering against claim/finalize/cancellation: no provider call is made under a
database transaction. **Approve** this lock-order correction and its competing
instance regression; retain the prohibition on route cutover until it passes.

42 PostgreSQL checks now pass after fixing the order, including 12 simultaneous
retail opens issuing one create request, pre-send return hashing, unknown holds
after expiry and exact-session browser claims. Wallet completion also needs a
durable send marker rather than the old process-local latch: approve additive
0039 with one session-FK command, immutable method/send time and no stored wallet
token. Record intent before submission; after an ambiguous answer query the
original session without resubmission. Card/billing remains a distinct domain.
