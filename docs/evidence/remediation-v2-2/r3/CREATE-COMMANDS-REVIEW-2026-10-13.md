# R3 creation and manual command completion review

## Verification of Prior Fixes
Current owned PostgreSQL: 72 payment durability checks, 12 subscription checks
and 10 receiver checks pass. The split/decline repair passes 22 targeted tests
and typecheck. Provider-created completed sessions retain identity and expose no
new payment widget; 77 provider/served card tests pass.

## Blocking Issues
No blocker to this bounded implementation. The existing quote response has a
read/write race and separate invoice creation; it must be replaced atomically.
Create retries must reuse their aggregate before this candidate can be released.

## High-Risk Concerns
Use concrete tenant foreign keys for creation receipts, not unconstrained
polymorphic IDs. A changed request under the same UUID conflicts. Audit and
outbox must commit with the created or changed aggregate.

## Missing Steps
Add one merchant/UUID creation registry with exactly one checked retail,
property or trades aggregate. Integrate both retail create APIs and all invoice
creation callers. Make public quote response/deposit and balance creation atomic
and replayable. Record remaining subscription manual transitions with an actor.

## Unsafe Assumptions
A lost create response is not authorization to create another bill. Raw retail
credentials cannot be reconstructed from a stored hash. Derive the credential
for a new creation command using a domain-separated HMAC and the existing return
secret; store only its hash. If the secret changes, retain the original aggregate
and refuse to return a replacement credential. Existing invoices retain their
reviewed raw-token compatibility during expansion; R5 removal is separate.

## Required Ordering Changes
Creation UUID advisory lock, then existing parent/aggregate locks, then creation
receipt/audit/outbox in the same transaction. Quote response locks client then
quote, creates its invoice once, and records its concrete response event. Do not
repeat dispatch merely because the create response was lost.

## Open Product / Provider / Legal Questions
Keep current invoice/quote and subscription policy. Lifetime quote response and
one-time split configuration use deterministic aggregate command identities;
new bill creation needs the persisted client UUID. No provider contract changes.

## Compliance and Data-Handling Notes
Authenticated creation replay can return the original credential for the same
intent; raw retail credentials never enter the registry, audit or outbox. Store
original authenticated user/API-key actor once. Public quote/split uses
`public_checkout`, never a invented merchant identity.

## Test and Rollback Adequacy
Test lost/concurrent create responses, mismatched fingerprint, wrong tenant,
secret change, audit/outbox rollback, concurrent quote accept/decline, one deposit,
balance replay and captured-attempt freezes. Use owned PostgreSQL and synthetic
senders. Keep schema/records on rollback; do not re-enable independent finalizers.

## Final Recommendation (Approve / Do not approve)
Approve this bounded remaining R3 repository implementation on `27d235b8` plus
the reviewed working tree. Final candidate review, provider UAT and restored
production-sized rehearsal remain required for phase exit.

Separately recorded reread: property can reuse a live invoice for a later owner
intent, so store separate immutable creation receipts rather than a single key on
the invoice. Replay reads current aggregate state without repeating an older
amount change. Quote response and invoice creation must share one transaction.

October 14 namespace reread: billing history has a global key constraint, while
owner command UUIDs are scoped to a concrete subscription. The new two-merchant
same-UUID test fails after the second synthetic bank approval. Approve prefixing
new server billing keys with subscription ID plus the original UUID. Preserve
stored receipt keys and existing attempt identity on replay; do not modify sent
keys or provider X-IDs. Verify both merchants record independent history once.
