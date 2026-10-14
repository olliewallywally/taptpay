# R3 subscription provider recovery port review

Base `27d235b8`; bounded prerequisite for concrete subscription attempts. This
does not approve activation, renewal, upgrade or notification cutover.

## Verification of Prior Fixes
The integrated R2 transport uses pinned configured addresses and conditional
stored-card amount/reference checks, per the owner's pending-UAT decision.
Current R3 PostgreSQL verification passed 50 checks. Subscription attempts and
delivery receivers remain open. No real provider request was performed.

## Blocking Issues
A 202 transaction identity currently exists only inside a polling call. A crash
can lose it before the caller records billing history. No blocker for adding a
commit-before-poll port and query-only resume operation. Full subscription
cutover requires concrete pre-send claims and atomic subscription finalization.

## High-Risk Concerns
Never repeat a purchase to recover an unknown outcome. Freeze exact cents,
reference, account/environment, period and card credential digest in the billing
attempt. A final transaction identity must match a previously accepted pending
identity. Do not authenticate an arbitrary provider self-link.

## Missing Steps
Concrete card and billing attempt schemas, claim/send/unknown leases, card
setup routes, activation/renewal/upgrade callers, atomic history/event/outbox,
receivers and actual UAT remain necessary after this port.

## Unsafe Assumptions
A boolean without a provider transaction identity cannot settle money. The
owner's conditional expected-field policy is retained pending UAT; no claim is
made that an omitted amount/reference is official provider evidence.

## Required Ordering Changes
Add failing transport tests. Add an optional awaited pending-identity persistence
hook before the first GET. If persistence fails, return unknown with its identity
and issue no query. Resume uses GET only. Validate IDs and reconstruct the pinned
transaction address rather than forwarding provider URL components.

## Open Product / Provider / Legal Questions
Owner-arranged UAT must confirm stored-card setup and purchase fields, 202 polling,
identity stability and X-ID/reference recovery where acceptance has no returned
identity. Unknown operations stay held if that recovery contract is unavailable.

## Compliance and Data-Handling Notes
The persistence port receives an identity, never a card token or raw reply. Keep
logs redacted and fixed error categories. Credential encryption is R5; do not
duplicate card tokens in attempt storage. External delivery-provider documentation
was inaccessible through the configured network proxy; its contract is unverified.

## Test and Rollback Adequacy
Test delayed/failed commit, query-only resume, missing/malformed/mismatched
identities and an unsafe self-link. Preserve existing card protocol tests and
conditional expected-field checks. No database migration or external side effect.

## Final Recommendation (Approve / Do not approve)
Approve only the pending-identity port, query-only resume, pinned polling address
and transaction identity checks described here. R3 remains open.

Separately recorded reread: approval of this prerequisite is not approval of
the current billing caller's retry loop. Every real caller still needs the
concrete attempt before send; adding a hook alone cannot prevent repeat charges.
The optional port preserves old callers while the cutover is prepared. Validate
the final response against the persisted pending identity before returning success.
