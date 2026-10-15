# R3 concrete subscription attempts — proposed cutover review

Base `27d235b8`; current uncommitted R3 tree. Approves the bounded repository
implementation below, not phase exit, provider activation or deployment.

## Verification of Prior Fixes
Owned PostgreSQL verification passes 72 checks, including cancellation/late
captures, fenced settlement, tenant scope and frozen property invoice amounts.
The full client suite passes 131 suites/1,491 tests. The pending transaction-ID
hook and GET-only stored-card recovery port already pass their provider tests.

## Blocking Issues
An uncertain card setup or billing POST currently has no concrete persisted
attempt. A lease release can issue another purchase. A crash between approval
and period/history commit can strand real money. These are implementation
requirements below; no current caller is approved as a completed R3 flow.

## High-Risk Concerns
Persist the subscription/merchant FK, UUID/fingerprint, stable X-ID, account,
environment, exact amount/reference, action/plan/period and send marker before
POST. Query only after possible acceptance. Preserve cancellation intent and
independently record money when a changed parent needs manual resolution.

Identity enforcement reread: add card verification as the third checked concrete
session-binding FK, without allowing zero amounts through the retail finalizer.
A provider-transaction registry contains exactly one real binding or billing
attempt FK. Immutable DB triggers claim that identity on both source tables;
cross-domain duplicates abort before financial application. Count-only duplicate
preflight and backfill precede trigger installation. This is an enforced concrete
FK registry, not a free-form aggregate ID. Approve this bounded identity extension
after its owned preflight; retain global identity semantics already used by R2.

Pre-send key reread: X-ID uniqueness must cover retail, invoice, card and billing
attempts before POST, including possible acceptance before session attachment.
Approve a registry with exactly one of those four concrete FKs and immutable
source-table triggers. A collision aborts preparation; it cannot select an
existing provider purchase from another domain. Card attempts also persist their
fixed expected zero cents/NZD/validate type, separate from observed outcomes.

## Missing Steps
Add concrete card and billing attempts and subscription event FKs, finite fenced
leases, immutable expectation/send/session/transaction fields, provider-ID
capture before polling, one history/audit/outbox commit, notification ingestion,
background GET-only recovery, and all retained activation/upgrade/cron callers.

## Unsafe Assumptions
Do not call the ordinary stored-card sender again after a timeout, even with
the same key. Do not recompute an unresolved upgrade's proration. Do not treat
the browser result or card setup's zero-value verification as a paid period.
Do not manufacture a provider transaction ID or an observed expected field.

## Required Ordering Changes
Add failing repository/provider checks, additive schema and isolated rehearsal;
then implement attempt/storage services, provider adapters and caller cutover.
Network calls occur after DB transactions. Record an accepted transaction's ID
before the first poll. Validate the current lease before financial application.

## Open Product / Provider / Legal Questions
Preserve the owner's R2 conditional-field direction for card/billing replies;
check supplied expected fields and require durable transaction identity for R3.
Official zero-value/card/charge UAT remains required. A possibly accepted POST
with no recoverable provider ID remains held for provider/operator resolution.

## Compliance and Data-Handling Notes
The attempts have concrete subscription and merchant FKs. Store a card-token
digest, not another raw token or provider body. Retain masked metadata and the
existing authoritative token column. Events are append-only; communications
use event keys. Query-only recovery works independently of initiation flags.

## Test and Rollback Adequacy
Test two instances, lost POST, pending-ID persistence failure, crash after bank
approval and before local commit, frozen retry amount, duplicate history/event/
outbox, tenant/account/environment mismatch and cancellation/plan races. Keep
forward schema and financial records on rollback; never restore blind resends.

## Final Recommendation (Approve / Do not approve)
Approve implementation of this bounded durable subscription cutover with the
specified failing checks and owned synthetic rehearsal. R3 exit is not approved.

Separately recorded design reread: card verification and positive-money billing
are separate domains. They may share inbox/lease mechanics but must not use the
positive retail finalizer. Parent drift cannot delete captured money or silently
clear cancellation; retain an explicit resolution state when necessary.

October 14 bounded cancellation reread: the owned PostgreSQL race test fails:
setup started while active, then cancelled, then verified, starts a new charge.
Approve repair within this subscription cutover: persist setup's original status,
check cancellation again under the parent lock before preparing/sending activation,
and allow ended-subscription restart only for that original explicit intent.
Already-sent billing remains query-only; a later cancellation requires retained
money/history and parent resolution rather than silently restoring access.
Confirmation must report a terminal cancellation so the browser can release only
that verified command. Add race/restart/confirmation checks before regression.

Second bounded reread: the preparation/send race test now demonstrates an unsent
activation remains live after cancellation and blocks a fresh explicit restart.
Approve abandonment only while `send_started_at IS NULL`, under the parent and
attempt locks, with one policy audit/outbox. Renewals/upgrades must likewise not
start after cancellation. A sent row never takes this branch and remains GET-only.
Preserve applied checksums and concrete identity; use the internal system actor
for newly recorded policy commands. Test withdrawal and subsequent new intent.

Third bounded reread: three owned checks fail for card intent supersession.
An initial activation can purchase a future month if another caller already paid
the period after zero-value verification; pending setup can also replace a card
after removal. Approve checking paid access under the subscription lock before
new activation, recording a concrete card event that permanently satisfies that
original activation, and excluding it from recovery. Return `not-required`, never
a manufactured bank approval. Refuse fresh removal during an unresolved setup;
after verified method removal/replacement, report a scoped terminal supersession
without restoring the old card or issuing a charge. Keep existing sent attempts
query-only and preserve original actors. Add controller/browser terminal tests.
