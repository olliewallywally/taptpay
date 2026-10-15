# D9 entitlement classification and rollout

Owner approved the [policy](r6-entitlement-policy-proposal.md) in the
[dated D9 decision](../decisions/2026-10-15-r6-d9-entitlement-and-dunning.md).
Repository implementation and synthetic verification do not activate a real
target. Real stored-card charging remains disabled pending UAT/scope review.

## What the migration does

Forward `0049b_subscription_entitlements.sql` adds an initially `legacy`
singleton control, append-only service periods and append-only reviewed
revocations. It classifies no historical row and updates no subscription/bill.
Its frozen SHA256 is
`e8d4303ab2463f9e8aa9d2cfd95d0e8383e5e8cb61eaf9253cb1e6afbab157dc`.
Applied0048a/b/c and0049a remain unchanged.

Confirmed applied activation/renewal billing captures a paid period in the same
database transaction as its bill/outcome. A rollback removes all those uncommitted
effects; R3 recovery retains the original provider identity. Upgrade charges do
not invent a new monthly entitlement. Unknown/declined/unapplied outcomes create
no paid period. Historical success is never automatically inferred.

The canonical strict schema through0049b is
`sha256:3d6ff3e4471e623cfed35fc5971521e537142ece22eae6a546e3ebdf52969c40`.
Readiness expects the complete ledger and this reviewed catalog. Release the
compatible code/schema together through the existing migration process. Claude's
R4 integration must reconcile its canonical schema separately; never edit applied
SQL, bypass readiness or learn a new baseline from an arbitrary target.

## Evidence and manifest

Run the [read-only inventory](r6-observability-and-entitlement-inventory.md) against
the approved restored target first. Obtain actual per-row evidence for historical
classifications. Missing lastBillingDate, active status or0014's ledger entry does
not establish that a particular row received a grant. Historical paid evidence
must identify a confirmed successful positive monthly bill with the same tenant
and exact period. Other classifications must match the subscription's recorded
period and have reviewed source evidence. Keep unresolved cases unclassified.

Prepare a private local JSON manifest (do not commit real row identities or
source evidence). Example shape using synthetic identifiers:

```json
{
  "version": 1,
  "periods": [{
    "subscriptionId": 1,
    "merchantId": 1,
    "source": "migration_grant",
    "start": "2026-10-01T00:00:00.000Z",
    "end": "2026-11-01T00:00:00.000Z"
  }],
  "revocations": []
}
```

Sources are paid/migration_grant/complimentary/trial. A reviewed historical paid
entry additionally requires billingHistoryId; unpaid sources prohibit it. Dates
must be valid UTC ISO timestamps, start before end. Unknown keys, duplicate
entries, over500 combined entries or files over256KiB are refused. Prefer small
batches (25 or fewer) on a restored target before measuring a real run. Pin the
exact file bytes with SHA256 and separately record the digest of the approved
evidence/review. Do not use the manifest digest as a substitute for source review.

This is controlled historical classification tooling. It exposes no HTTP grant
creation or complimentary/trial offering. Future applied paid periods are captured
automatically, without creating a fictional historical charge.

## Dry-run, classify and compare

Supply `R6_ENTITLEMENT_DATABASE_URL` securely. Reuse the inventory's named-target
and verified remote TLS rules; ambient application/PG credentials do not select
the tool's target. No secrets belong in shell arguments or evidence.

```sh
node --import tsx scripts/r6-entitlement-policy.ts \
  --expected-host=APPROVED_HOST --expected-port=5432 \
  --expected-database=APPROVED_RESTORE --action=classify \
  --manifest=/PRIVATE_PATH/reviewed-periods.json \
  --manifest-sha256=EXACT_FILE_SHA256 --review-digest=SOURCE_REVIEW_SHA256
```

Default is a physical repeatable-read READ ONLY transaction: validation and
would-insert/revoke counts only. Its report describes **currently stored** periods;
dry-run does not pretend to have inserted the manifest. Rehearse the exact command
with `--execute=true` on the approved owned/restored target, then run the read-only
inventory again for the recorded comparison. Repeating the same classification
keeps the original evidence and returns unchanged counts; mismatched paid sources
are refused. Any error rolls back the batch and prints one fixed error code.

The report includes legacy before/proposed after/effective allowed/blocked counts,
newly allowed/newly blocked transitions, subscription states, unclassified current
periods, source membership, actual paid/granted period current/expired/future/
revoked counts, missing token presence and due/overdue counts. Source membership
can overlap when a merchant has multiple recorded sources. Token presence does
not establish token validity. No PII, tokens or row identities are emitted.

## Explicit activation

Do not activate while intended current merchants are unclassified or unexpectedly
blocked. Resolve evidence; do not fabricate dates/bills/grants to make counts pass.
Rehearse the combined candidate's migration and gate on an approved real restore,
review before/after counts, and satisfy the release/UAT gates. Stop old incompatible
instances before activation: old raw subscription readers do not enforce D9.

Preview:

```sh
node --import tsx scripts/r6-entitlement-policy.ts \
  --expected-host=APPROVED_HOST --expected-port=5432 \
  --expected-database=APPROVED_DATABASE --action=activate \
  --review-digest=APPROVED_RELEASE_REVIEW_SHA256
```

After the actual release checks, the exact command additionally needs both
`--execute=true --acknowledge-release-checks=true`. Activation serializes the
control and locks the affected data tables before comparing, with bounded
statement/lock timeouts. It refuses newly blocked legacy access or unclassified
intended-current periods. Default remains legacy; there is no environment bypass.
The result's stage describes the resulting control state; its report is the
comparison snapshot taken immediately before the control update.

All existing HTTP/payment-send/job gates use the shared policy. Database getters
read the parent, policy control and active periods in one SQL statement. Current
unpaid grants survive past_due/suspended billing. Renewal-card readiness stays
separate. Paid renewal grace/attempt limits follow D9; initial/unpaid failures and
provider uncertainty cannot manufacture paid grace.

## Corrections and rollback

History cannot be updated/deleted. A reviewed correction manifest may append a
revocation with entitlementId, subscriptionId and merchantId under revocations.
In enforced mode, tooling locks the affected parents and refuses any loss of
currently effective access; the legacy comparison alone cannot detect that loss.
An already cancelled/blocked period can be revoked without erasing its history.
Any policy change or intended removal of current access needs separate review.

The control transition is one-way. Do not reset it, delete evidence or deploy an
old reader to bypass access enforcement. Stop new work and review/reconcile
uncertain provider effects before any rollback. Preserve paid/granted periods,
bills, attempts, holds and revocations. Existing real-target and professional
review gates remain in force; no live action was performed by these tests.
