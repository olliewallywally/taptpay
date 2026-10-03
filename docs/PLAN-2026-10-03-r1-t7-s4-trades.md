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

## S4a completion and S4b decomposition

S4a is committed as `22c6dc9c`
([evidence](evidence/remediation-v2-2/r1/R1-T7-S4a-trades-clients-2026-10-03.md)).
S4b is split the way S3c was. **S4b1**: scoped quote/invoice reads and lists, the
signed-in quote PDF, and the three manual invoice state changes (void, paid outside
TaptPay with its receipt, job complete). **S4b2**: authenticated quote, invoice and
balance creation and their delivery. S4c stays recurring invoices.

## S4b1 preflight — quote/invoice reads, PDF, void, external payment, completion

Base `22c6dc9c`. Six registrations: `GET /api/trades/quotes`,
`GET /api/trades/quotes/:id/pdf`, `GET /api/trades/invoices`, and
`POST /api/trades/invoices/:id/{void,mark-paid-external,complete}`.

### Verification of Prior Fixes

S4a reached this session as an uncommitted draft with no surviving check. It was
reread against its preflight and reverified before commit: its two new test files
fail 23 of 23 on `c5260cc1`; 28 affected suites / 1,641 tests, 16 actual PostgreSQL
checks, 16 of 16 planted mutations caught, typecheck, build and inventories pass;
and the full server suite passed on `22c6dc9c` (153 suites / 3,795 tests). Reread
for this scope: the S4a predicates and parent-first
archive, every trades quote/invoice route and its recorded review, the delivery
module, the cron passes, the public quote, checkout, provider-completion and WhatsApp
status consumers, and the 2026-09-27 batch 6d decisions.

### Blocking Issues

None for S4b1. To demonstrate before production edits: each state change is a route
lookup followed by a globally keyed `updateJobInvoice`, so an invoice moved or
settled after the lookup is still written, logged and (for external payment)
receipted; and the signed-in PDF reads the quote's client through a global key, so a
quote whose client row is another business's prints that client's details.

### High-Risk Concerns

Reads and lists need the row AND its current client's ownership in one statement.
Each mutation finds its candidate without a lock, locks the owned client, then locks
the invoice by id, business and that original client, rechecks the current state and
commits its fixed fields with its history line in one transaction; history uses the
locked row's client, not the route's stale read. No generic editable invoice patch.
External payment is a manual record, never provider approval. Its receipt is read as
one joined invoice/owned-client snapshot after the commit; no lock is held over the
email; its history line is a scoped insert that needs the current owned invoice of
the captured client.

### Missing Steps

Storage, service and HTTP tests red first; contracts in both implementations; the
six routes; the shared fake; actual SQL for filters, joined snapshots, fixed-field
changes, refusals, repeats, history rollback, serialized void/payment and waited
ownership, reparent and state changes; route reviews and both inventories; affected
suites, typecheck, build, evidence.

### Unsafe Assumptions

The global `getJobInvoice`, `updateJobInvoice`, `getQuote`, `getClientProfile` and
`createJobEvent` stay for the public quote, checkout, provider completion, WhatsApp
status and cron lanes, and until S4b2 for authenticated creation and sending; none is
retired here. A provider payment landing between a manual void or external payment
and the provider lane's own globally keyed write is the recorded R3/R4 finding and is
unchanged: that lane takes none of these locks. The receipt stays best effort as
today: none when the client has no email; a refused snapshot sends nothing; the
response is the committed row and makes no delivery claim; an exception is still the
existing 500. The foreign key makes a missing client impossible, so the joined PDF
read answers a quote whose client is not the business's as not found, and 'Quote
details unavailable' remains only for a missing business. HTTP fakes prove decisions,
not SQL. Memory stays DB-only.

### Required Ordering Changes

S4b1 before S4b2. Specific void, external-payment and completion methods. Extract
the receipt's rendering so the payment lane and the scoped service send the same
email without the scoped one reading by a global key.

### Open Product / Provider / Legal Questions

None. Voiding a split invoice with shares paid, a manual change while the client is
paying, and the one-balance race stay recorded findings for R3/R4 (the last is
revisited in S4b2, where the balance create is in scope).

### Compliance and Data-Handling Notes

Synthetic loopback PostgreSQL and stubbed email only; no application database,
provider, live migration, client UI, flag, push or deployment. No contact data in
evidence.

### Test and Rollback Adequacy

Two businesses; foreign and missing indistinguishable; an invalid business issues no
query. Lists keep their status and client filters and newest-first order, and omit
foreign rows and rows of foreign clients. A refusal changes no invoice or history
and sends nothing. Completion keeps deposit-before-unpaid; a repeated void or
completion is still taken and logged. A history failure rolls the change back. Void
and external payment at the same moment leave one state and one history line. Waited
ownership, reparent, paid, voided and no-longer-paid changes are refused after the
wait. Fix forward without restoring global authenticated writes.

### Final Recommendation (Approve / Do not approve)

**Approve S4b1 on `22c6dc9c`**, failing tests first. S4b2 and S4c remain separately
reviewed; no closure of S4, R1-T7 or R1 is inferred.

### Separate reread

Reread every consumer of the invoice and quote readers and writers by call site
rather than by method name: those in the delivery and cron modules, the checkout and
provider helpers, the WhatsApp status lane and the public quote routes all key by a
token, a provider session, a message id or the scheduler, and stay global. Only the
six registrations above and (S4b2) three creates are signed-in. The receipt is sent
from two places: the provider completion, which stays, and external payment, which
moves. The existing tests fix what must not change: the list methods' names and
arguments, the 404/409 bodies, one receipt per external payment, a missing and a
foreign record answering alike with no write. Parent-before-child matches the S4a
archive and the S3 order; the provider and cron lanes issue single statements on the
invoice only, so no lock cycle is introduced. An archived client keeps its issued
invoices manageable (owner decision 2026-09-27). The fake must refuse a row whose
client is foreign, or the HTTP race tests prove nothing. **Approve the same S4b1
scope.**
