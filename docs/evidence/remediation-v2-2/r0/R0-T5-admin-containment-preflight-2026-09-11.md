# R0-T5 bounded review — admin ecommerce tombstones

Base: `5c2384360f0c1dccaa39d011c46b45e7b0be0bfd`. Scope: five admin
ecommerce registrations only, plus runtime containment tests. PDF pages 17–18.

## Verification of Prior Fixes

The inherited runtime suite passes 10 tests. Its ecommerce GET targets a
nonexistent route; replace it with the registered POST and GET-by-ID routes.
Expanded checks pass 11 tests and fail the admin key-list check: expected 404,
received 200. No provider was contacted. This is pre-fix defect evidence.

## Blocking Issues

Admin key listing fabricates two integrations; create hardcodes merchant 1;
revoke reports success through a storage stub. Metrics/usage also return
placeholder data. Remove these five handler bodies, preserving authentication
and strict revoke-ID validation, and respond with an unavailable 404.

## High-Risk Concerns

Do not enable ecommerce or replace placeholders with an improvised key system.

## Missing Steps

Exercise every tombstone, retry/concurrency, storage snapshots, fetch, SSE and
push interception. Full R0 device and operational acceptance remains outstanding.

## Unsafe Assumptions

A storage snapshot cannot detect a transport or notification attempt. Add spies.
An HTTP 404 on an unregistered URL does not establish capability containment.

## Required Ordering Changes

Capture the failing HTTP assertion first (done), remove fake handlers, rerun
containment and admin parsing tests, then the server suite and typecheck.

## Open Product / Provider / Legal Questions

None for these tombstones: R0-T5 explicitly mandates stripping admin mock success.
Existing R0 human gates remain open.

## Compliance and Data-Handling Notes

Synthetic MemStorage fixtures only. No migrations, secrets, external systems,
financial data or device layouts change.

## Test and Rollback Adequacy

Retain the original red result above. Update the prior revoke characterization
that explicitly expected stub success; the source requirement now requires 404.
Revert only this scoped diff if necessary; doing so restores the known defect.

## Final Recommendation (Approve / Do not approve)

Approve the bounded containment correction on the exact base above, conditional
on the stated post-change tests. This is not phase/release approval.

Separate reread before implementation (same agent, not independent personnel):
inspected both storage implementations, all five registrations, existing admin
parsing tests and the public ecommerce gate. Preserve the registration shapes
and invalid-ID 400 contract; remove all five placeholder handler bodies. No
additional blocker within this bounded correction. Full R0 stays incomplete.
