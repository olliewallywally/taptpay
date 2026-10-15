## Verification of Prior Fixes

R3/R5 entitlement helper still requires lastBillingDate and period end; no D9
answer has arrived. Reviewed §13.1, 0014, canonical subscription columns, R5 named-
target connection parser and original tests. Logging work is separately in flight.

## Blocking Issues

No blocker for a read-only counts-only inventory. Runtime entitlement changes and
an after-policy projection remain blocked on explicit D9/provenance approval.

## High-Risk Concerns

Do not project PAN/card token, credentials, PII or row IDs into report output. Token
presence is not token usability/validity. An active row missing a billing date is
not proof that 0014 granted it. Preserve truthful payment history.

## Missing Steps

Pure classification, read-only named-target scanner/CLI, failing-first boundary/
privacy/target tests and owned synthetic PG evidence. Real report remains external.

## Unsafe Assumptions

Current gate counts must use the existing shared helper, not a guessed replacement.
Proposed blocked-after is null/unassessed while D9 is pending. Missing provenance
is explicitly unclassified; no inferred paid or migration-grant history.

## Required Ordering Changes

Inventory can precede D9 without changing access. It selects only needed state/
date/count fields and SQL token-presence boolean, in repeatable-read READ ONLY,
with bounded keyset pages. Validate named URI/server identity before projection.

## Open Product / Provider / Legal Questions

D9 approval remains pending. Any future provenance backfill needs concrete
source-of-truth evidence and a restored before/after report before gate activation.

## Compliance and Data-Handling Notes

No mutation, provider/email/push, secret configuration or deployment. Fixed errors
must not print raw database/URI/row data. No new data collection or retention rule.

## Test and Rollback Adequacy

Require all current states, boundary dates, invalid payment-date claims, missing
token presence, due/overdue, unknown state redaction, rollback on failure and
actual read-only PostgreSQL refusal. Tool import starts no I/O.

## Final Recommendation (Approve / Do not approve)

**Approve** this counts-only inventory scope on R6/base3534978f, with current
logging changes present. No D9 policy/after-projection or runtime gate approval.
Separate pre-implementation reread checked helper semantics, misleading grant
inference, minimal SQL projection, connection-name guards, raw credential omission
and rollback. Same scoped approval; no external reviewer is claimed.

Inventory coverage reread before the coverage correction: a subscription-only
scan omits merchants without a subscription and understates blocked merchants.
The failing-first missing-merchant test demonstrates this. Approve adding only
aggregate merchant/subscription/no-subscription counts inside the same read-only
snapshot, counting the missing rows as blocked under the unchanged shared gate,
and refusing inconsistent totals. A separate reread checked FK/unique merchant
coverage, read-only query qualification and no row/PII projection. Same approval;
no runtime policy change, invented grant, or external review is claimed.
