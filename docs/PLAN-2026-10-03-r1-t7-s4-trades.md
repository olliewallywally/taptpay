# R1-T7 S4 — trades tenant storage

Branch `remediation/r1-continuation-20260907`. Continues the owner-authorized finish-R1
work after S3 property. No new role, billing, payment, provider or client policy.

S4a covers client profile management/history and the explicit ownership argument
when creating hidden prospects for quotes/quick invoices. S4b covers quote/invoice
reads, creation, balance and manual state changes plus authenticated delivery/PDF.
S4c covers recurring schedules. S5 settings/exports and S6 uploads remain later.

## S4a preflight — client profiles and history

Base code `1b80cb8d`; reviewed candidate originally based on `5f532095` before the
full check completed. S3c1 had 17 suites / 528 tests and 18 SQL checks; S3c2 affected
20 suites / 562 tests and 24 SQL checks passed. Full server 151 suites / 3,771 pass,
final typecheck/build and inventories verified before S4a implementation.
Read the September 27 batch 6d owner decisions and current profile/prospect callers,
archive cascade, history, public quote/checkout and delivery consumers.

### Verification of Prior Fixes

The S3c2 focused/affected tests, actual SQL checks and full server run passed.
Reread client storage, role/state checks, prospects and the
September 27 archive/pause decisions. S4a cannot begin from an assumed prior pass.

Introduce merchant-required create/read/update/archive/restore/promote/history
contracts in both implementations. Project editable client fields at runtime.
Archive the owned client, cancel only its owned live schedules and save cancellation
history in one transaction. Restore does not restart schedules; issued invoices
remain payable. Preserve owner/member authority and all input/status/DTO behavior.

### Blocking Issues

None for S4a. Current global profile mutations after a checked read can act on moved
clients. Promotion can overwrite a status changed after the initial read. Demonstrate
these before production edits. Quotes/invoices/schedules remain distinct later scopes.

### High-Risk Concerns

Archive locks the owned parent before any schedule; event failure must roll back the
entire cascade. Promotion locks/rechecks current ownership and prospect state. History
requires event AND current profile ownership. Empty optional fields remain explicit
null clears; omitted fields stay unchanged. Hidden prospect creation keeps empty
link-only contacts and uses explicit authenticated merchant scope.

### Missing Steps

Storage/HTTP red first; both implementations and all profile/prospect callers; remove
obsolete global profile mutations/history; update shared fake and attachment/mobile
quote fixtures; actual ownership/status waits and archive-history rollback; affected
served routes, role defaults, inventories, typecheck/build and evidence.

### Unsafe Assumptions

Global profile read still has public/provider/PDF/delivery consumers; do not retire it
until those lanes are separately reviewed. S4a does not make the old quote/invoice
workflows transactional. Memory remains DB-only; route fakes prove decisions, not SQL.
No arbitrary status filter on profile reads/list and no new authority restrictions.

### Required Ordering Changes

Complete and commit S3c2 after required checks; then S4a failing tests and implementation.
Use a specific promotion contract rather than letting generic edits change status.
Migrate the two hidden-prospect creates when retiring the global create contract.

### Open Product / Provider / Legal Questions

None for S4a. September 27 authorized archive cancellation and no restart on restore.
Quote acceptance, deposits, balances, provider attempts and recurring scheduling
semantics remain preserved and separately reviewed in S4b/c or R3/R4 as appropriate.

### Compliance and Data-Handling Notes

Synthetic loopback PostgreSQL only; no application migration/database, real delivery,
provider, client UI, flags, push or deployment. No contact data printed in evidence.

### Test and Rollback Adequacy

Two tenants, missing/foreign equivalence, invalid merchant no-query, runtime identity
projection, allowed owner/member management, paused/active archive cancellation,
preserved issued invoices, already-cancelled/foreign/other-parent schedules untouched,
transactional event rollback, status/ownership waits and scoped history. Fix forward
without restoring global authenticated writes.

### Final Recommendation (Approve / Do not approve)

**Approve S4a on `1b80cb8d`**, with completed S3c2 checks and commit recorded;
tests first. No owner question or independent-review closure inferred.

### Separate reread

Rechecked all global profile mutator consumers: only authenticated routes create/edit
clients and prospects. Create status must be forced to active or the server's hidden
prospect; generic edits cannot inject status/identity. Archive history uses persisted
same-merchant schedules, and cancelled children do not gain new events on repetition.
Promotion and archive recheck ownership at their writes; current status under lock
gates promotion. Current-profile history existence must be in the SQL predicate so
a stale route lookup cannot expose former-tenant events. **Approve S4a.**
