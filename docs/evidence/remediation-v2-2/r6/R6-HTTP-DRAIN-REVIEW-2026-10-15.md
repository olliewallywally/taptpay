## Verification of Prior Fixes

Real signal/SSE/active-response tests and native readiness/cron proofs pass. The
bundle entrypoint defect is fixed with a byte-preserving pure-core extraction.
No applied migration or uncertainty policy changed.

## Blocking Issues

Socket closure alone does not prove an async handler has finished: a client can
disconnect while provider/DB work continues. Do not approve normal pool closure
until actual handler promises are included in the bounded drain.

## High-Risk Concerns

Keep accepted handler promises tracked after response finish/client disconnect.
Never cancel an accepted provider effect by assertion. After a disconnected
request's callback middleware eventually calls next during drain, prevent a new
handler initiation. Existing real-promise detection must not execute lazy Drizzle
thenables or wrap Express error middleware/mountable routers incorrectly.

## Missing Steps

Add an explicit per-app HTTP work tracker, attach it in the existing admission
middleware, and use the existing async-route wrapper to register native promises.
Drain all active promises, including handlers registered by an earlier middleware
while waiting. Stop the tracker with other resources before listener close. It
must suppress new handler dispatch for an already destroyed response during drain.
Index passes and registers the same tracker; explicit harnesses opt in for tests.

## Unsafe Assumptions

Do not equate res.close/server.close with handler completion. Do not claim that
arbitrary fire-and-forget work can be cancelled or tracked; existing R3 durable
keys/claims and the hard nonzero timeout remain the recovery boundary. The extra
tracking is active only with the explicitly injected application tracker.

## Required Ordering Changes

Record review/reread, add a real disconnect case against missing integration,
then wire app/guard/index. Re-run the entire async-route guard/security/lifecycle
suites, compile and rebundle. Preserve arity/name/rejection/thenable protections.

## Open Product / Provider / Legal Questions

No new policy choice: this implements the already reviewed bounded HTTP drain.
All D9, UAT and external release gates remain open. No provider/live action.

## Compliance and Data-Handling Notes

The tracker retains promises only, not payloads, credentials or request objects.
Only a symbol on the server-owned request supplies the opt-in tracker. Tests use
ephemeral loopback HTTP and controlled promises; no real payment/client data.

## Test and Rollback Adequacy

Prove that a disconnected response does not let normal pool cleanup overtake the
remaining async handler. Prove a delayed callback cannot initiate the next handler
after its response is destroyed during drain. Existing wrapper tests must remain
unchanged and pass. A timeout exits1 and retains durable unknown evidence.

## Final Recommendation (Approve / Do not approve)

**Approve** this exact HTTP promise-drain correction within R6 readiness on base
b7fa2de9, subject to failing-first disconnect and final regression proof. No phase
exit, deployment, provider action or alteration of R3 money outcomes is approved.

Separate pre-implementation reread checked late middleware registration, native
promise vs lazy thenable behavior, tracker stop before pool closure, socket loss,
promise rejection forwarding, opt-in harness isolation and retained nonzero hard
deadline. Same scoped approval; no external/delegated review claimed.
