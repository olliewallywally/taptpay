# R1-T7 S3 — property storage

Base: `6c2fafab`; branch `remediation/r1-continuation-20260907`.
Owner direction: finish R1 without routine permission questions.
S3a: profiles, archive cascade and history; S3b: schedules and replacement;
S3c: invoices and authenticated resend. Every batch needs both implementations,
actual SQL and route tests. Public checkout/provider/cron retain explicit lanes.

## Verification of Prior Fixes

S2 independently verified in this session: 268 affected tests, 25 actual PostgreSQL
checks, typecheck/build/inventory/whitespace pass. Read S2 changes and actual property
routes/storage/fakes. Memory property is DB-only: preserve throwing creates, undefined
single reads/mutations and empty lists; do not invent partial property support.

## Blocking Issues

None for S3a. S3b/S3c remain separately reviewed batches; no claim of whole S3 closure.

## High-Risk Concerns

Tenant AND id in every query/update. Profile archive currently cancels all schedules
with the profile id; new transaction must change profile and only same-merchant
schedules together, and touch no child on a refused profile. Runtime update projection
permits only profile fields; scope controls create identity. History requires event
tenant AND current parent tenant in the same SQL query.

## Missing Steps

Failing SQL/stub and HTTP races, implementations/callers, real SQL concurrent ownership,
archive rollback/cascade, existing family matrix, inventory/typecheck/build/evidence.
Remove profile global mutations after confirming no provider/cron consumers.

## Unsafe Assumptions

Property HTTP fakes prove decisions, not actual PostgreSQL. Existing DatabaseStorage
property methods use global getDb; new methods use the injected instance's DB so they
can be genuinely verified. Keep public profile lookup global for checkout/provider.
Do not silently change archived-profile reads or automatic schedule reactivation.

## Required Ordering Changes

S3a tests first; verify real SQL before proceeding into schedules/invoices.

## Open Product / Provider / Legal Questions

None for scoped profile hardening; preserve prior archive and replacement decisions.

## Compliance and Data-Handling Notes

Synthetic loopback verification only; no schema/live database/provider action or UI change.

## Test and Rollback Adequacy

Invalid tenants issue no query; foreign/missing results match; update fields cannot move
ownership/identity; archive refusal has no child/event/delivery effects. Real two-tenant
SQL and ownership races plus existing positive owner/member cases. Fix forward.

## Final Recommendation (Approve / Do not approve)

**Approve S3a only on `6c2fafab`**, tests first.

## Separate reread

Separately reread profile routes, archive cascade, history query and all consumers.
Only routes and test fakes use profile create/update/archive/unarchive, so retire those
global methods. Profile reads remain needed by public checkout/email services. Archive
and unarchive log only after a returned mutation; no resurrected schedules. Schema
allows contact/address/channel edits, not identity/status metadata. History needs its
own scoped query despite a checked route parent. **Approve the same S3a scope.**

## S3b preflight — property schedules

Base: `c7741b3f`. This recovery independently repeated the profile storage/HTTP and
existing property contracts: **3 suites / 78 tests pass**. The sandbox refused HTTP
listening; the identical command passed outside it. Actual PostgreSQL profile
verification is repeated before building on its locking contract.

### Verification of Prior Fixes

Reread S3a predicates, archive transaction, schedule callers, schemas, cron and the
2026-09-27 decisions. A new schedule replaces running/paused schedules; resuming
skips missed cycles; cancelled schedules remain cancelled. Owners and members retain
the same actions. No schema or UI change.

### Blocking Issues

None for the bounded S3b design. Replacement currently inserts, then lists and
terminates globally, independently; concurrent replacements can cancel each other.
Routes also write by id after an ownership/state lookup. Tests must demonstrate
these defects before implementation.

### High-Risk Concerns

Use explicit merchant contracts, runtime field projection, and a transaction for
replacement and its events. Lock the owned parent profile before its schedules,
matching archive's lock order. Mutation rereads the schedule after acquiring that
parent lock, including tenant/profile identity and cancellation state. Resume date
is derived from the locked row, not the route's stale read. Event failure rolls back
the schedule changes. A moved parent/child refuses without an event or delivery.

### Missing Steps

Storage/HTTP red first; scoped implementations and fakes; concurrent replacement,
archive/replacement, ownership/state waits and event-failure rollback on real SQL;
existing owner/member contracts; inventory, typecheck/build, evidence and commit.

### Unsafe Assumptions

Keep global schedule read for public checkout and global update for cron's date
advance in their existing separate lanes. Retire global create/terminate and unused
tenant schedule list after checking consumers. Merchant schedule list also requires
its current parent's ownership. Memory property remains DB-only.

### Required Ordering Changes

Extract the existing pure UTC date calculation so storage can use it without
importing the cron module and causing a storage/cron import cycle. Preserve its
public re-export and behavior. Tests and fresh SQL proof precede final claims.

### Open Product / Provider / Legal Questions

None for this scope; replacement, cancellation and missed-cycle behavior already
have dated owner decisions. End-date/backdated-start cron policy remains outside S3b.

### Compliance and Data-Handling Notes

Synthetic loopback database only. No application database/provider, live migration,
capability enablement, upload, UI, deployment or push.

### Test and Rollback Adequacy

Invalid merchant causes no query; foreign and missing are indistinguishable.
Projected fields cannot reassign identities or inject lifecycle/cron fields.
Terminated/archived races produce the existing 409 or tenant-safe 404. Eight
concurrent replacements must leave one active schedule and correct history;
failures must roll back replacement and history together. Fix forward without
restoring globally keyed authenticated writes.

### Final Recommendation (Approve / Do not approve)

**Approve S3b on `c7741b3f`**, tests first, with actual SQL verification.

### Separate reread

Separately traced parent archive, replacement, public checkout and cron consumers.
Locking a schedule before its parent would deadlock against archive: acquire parent
first and recheck the child with its original parent identity afterwards. Concurrent
replacement is serialized by the parent's row even when no schedule exists yet.
Cancellation is checked under the child lock, and resume uses the latest cycle.
Persist schedule history inside the same transaction; HTTP fakes alone cannot prove
rollback/concurrency. **Approve the same S3b scope**, no S3c/whole-R1 closure.

## S3c1 preflight — invoice reads, void and external-payment records

Base: `c250343f`. S3b was independently rechecked: 419 affected tests, 17 fresh
PostgreSQL checks, typecheck/build and inventories passed. S3c is split into c1
(read/void/external-payment storage) and c2 (creation, reuse and scoped delivery).

### Verification of Prior Fixes

Reread invoice routes/storage, attachment tests, provider/public checkout and cron
consumers. Existing archive leaves issued invoices payable. Owner/member permissions
and existing settled-state 409 messages remain. Earlier provider money-state findings
remain R3/R4; this scope changes no capture/split/provider semantics.

### Blocking Issues

None for c1. Current route lookup followed by globally keyed update can write a
moved or newly settled invoice and log false success. Demonstrate races first.

### High-Risk Concerns

Invoice AND current parent merchant scope on reads/lists. Mutations lock owned
parent then invoice, recheck the original parent identity and current settled state,
and commit void/external-payment history with the mutation. External payment is a
manual record, never provider approval. Archived parents remain readable/payable.

### Missing Steps

SQL/storage and HTTP red first; scoped contracts and callers/fakes; actual ownership,
reparent and settlement waits; event-failure rollback; existing family and inventory
checks; final typecheck/build/evidence. Authenticated list enrichment also uses a
scoped profile read so it never fetches another merchant's current contact details.

### Unsafe Assumptions

Retain global invoice read/create/update for their separately reviewed provider,
public and cron lanes; c2 moves authenticated creation/resend later. No interface
retirement yet. Memory stays DB-only. HTTP fake decisions are not SQL proof.

### Required Ordering Changes

c1 precedes c2. Introduce specific void/external-payment methods rather than a
generic editable invoice patch. Preserve current input/status/DTO behavior.

### Open Product / Provider / Legal Questions

None for c1 tenant/transaction hardening. Existing split-paid void/manual-paid and
amount-edit/provider-race concerns remain explicitly tracked for R3/R4.

### Compliance and Data-Handling Notes

Synthetic disposable loopback verification; no application database/provider, live
migration, UI, payment enablement, deployment or push.

### Test and Rollback Adequacy

Foreign/missing results match; invalid tenant performs no query. Concurrent ownership
or settlement refuses without history or delivery. Trigger failure rolls state and
history back together. Fix forward without restoring global authenticated writes.

### Final Recommendation (Approve / Do not approve)

**Approve S3c1 on `c250343f`**, tests first. S3c2/whole S3 remain separately reviewed.

### Separate reread

Rechecked invoice parent identity, both settled branches, archived-profile behavior,
public/provider/cron consumers and attachment callers. Parent-first locks match S3a/b
and child reread prevents reparent/ownership races after waiting. Current invoice
ownership and parent ownership must both hold in a read query. Void repeats remain
allowed; externally paid repeats and voided external payments remain 409. History
must use the persisted invoice's parent, not the route's stale row. **Approve c1.**

## S3c2 preflight — authenticated invoice creation/reuse and delivery

Base `5f532095`; S3c1 independently checked at completion: 17 suites / 528 pass,
18 actual PostgreSQL checks, typecheck/build. This scope moves the two remaining
authenticated global invoice workflows; provider/public/cron lanes stay explicit.

### Verification of Prior Fixes

Reread S3c1 predicates, parent-before-child locks and transaction history against
its test and SQL evidence, plus the current creation, attachment and cron consumers.
Its affected suites and actual PostgreSQL checks independently passed in this turn.

Create/reuse must lock the owned profile before deciding whether to update or
insert an invoice. Creation history belongs in that transaction. Manual delivery
needs an explicit merchant service, a joined invoice/parent snapshot and a scoped
transaction for the delivery record/history. Preserve current billing, roles,
validation, delivery rendering/fallbacks, archived-profile and rent/charge behavior.

### Blocking Issues

None. Demonstrate current post-lookup ownership races and missing scoped contracts
before editing production. No application database or provider calls for verification.

### High-Risk Concerns

Project input at runtime; generate tokens on the server, never accept caller identity,
ownership, payment or lifecycle fields. Recheck attached-document ownership under a
share lock through the write. Reuse only current same-merchant children and recheck
post-wait state. Parent-before-child locking matches S3a–c1. No network under locks.

### Missing Steps

Red storage/service/HTTP tests; contracts in both implementations; atomic creation
and scoped delivery-record history; migrate callers/fakes/attachment expectations;
actual concurrent create, history rollback, ownership/reparent/settlement waits and
document reassignment checks. Regenerate inventories, affected/full server checks,
typecheck/build, evidence and independent review brief.

### Unsafe Assumptions

A delivery snapshot authorizes a point-in-time message to its captured owned contact;
it cannot promise zero external effects after a later concurrent change or a provider
exception. After an attempted send, any uncertain outcome or refused/failed delivery
record returns fixed reconciliation-required 503 without another tenant's invoice or
a false success. Before sending, missing/settled scope refuses with no message. No
locks are held over providers. Revalidate the final response using scoped storage.

### Required Ordering Changes

Create/reuse and history first; snapshot and record contracts next; then the explicit
merchant service and routes. Retire unused global live-invoice lookup and unscoped
manual resend; retain internal cron delivery and provider/public storage operations.

### Open Product / Provider / Legal Questions

No new policy decision needed. Preserve the existing latest-live-invoice dedupe rule
(a latest charge causes a new rent invoice), amount-only rent reuse and every separate
charge. The partial-split/open-session amount edit and payment-finalization races stay
R3/R4 findings. This does not claim idempotence against the separately scoped cron.

### Compliance and Data-Handling Notes

Synthetic loopback SQL and stubbed delivery only; no real contact/provider call,
application migration, live database, UI, flag enablement, push or deployment.

### Test and Rollback Adequacy

Verify foreign/missing/invalid tenants, input projection, archive compatibility,
dedupe/charge rules, concurrent creation, transactional rollback and actual waited
races. Service tests must observe every channel and global escape hatch; post-send
refusal is 503, preserves moved/settled rows and never claims no message was sent.
Fix forward without restoring global authenticated operations.

### Final Recommendation (Approve / Do not approve)

**Approve S3c2 on `5f532095`**, failing tests first; S4–S6 remain separate scopes.

### Separate reread

Rechecked creation/dedupe, document reference parsing, cron/provider consumers and
manual resend. Preserve parent archive behavior and the exact latest-live query
selection. Joined snapshots prevent mixing invoices with a later foreign profile;
merchant/subscription reads precede the final snapshot. Record rechecks original
parent and current ownership/state under locks, projecting only delivery metadata
and deriving status from the locked row. Never report success on undefined rows,
post-send scope loss or history rollback. Both final create response and unsuccessful
send response must fetch only the currently owned invoice. **Approve c2.**
