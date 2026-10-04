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

## S4b2 preflight — authenticated quote, invoice and balance creation and their delivery

Base `394da7d6` (the S4b1 code; the documentation commit above it changes no code).
Three registrations: `POST /api/trades/quotes`,
`POST /api/trades/invoices` and `POST /api/trades/invoices/:id/send-balance`.

### Verification of Prior Fixes

S4b1 (`394da7d6`) was checked at completion in this session: 51 new tests red
first, then green; 31 affected suites / 1,693 tests; 27 actual PostgreSQL checks; 28
of 28 planted mutations caught; the payment lane's receipt byte-identical across the
extraction; typecheck, build and inventories; and the full server suite on that commit (156
suites / 3,847 tests). Reread for this
scope: the three creates and their recorded reviews, the delivery module's quote and
invoice senders, the public quote acceptance (which also creates invoices), the cron
generate and dispatch passes, the gap-13 document ownership rule, and the S3c2
property creation/delivery contract this mirrors.

### Blocking Issues

None. To demonstrate before production edits: a client named in the body is read
through a global key and compared in the route, then the quote or invoice is created
and sent by global id, so a client moved after the lookup is still quoted, invoiced
and messaged; a linked quote and a deposit are held the same way; the hidden
prospect, the quote or invoice and its history are separate writes; and two balance
sends at the same moment each find no balance and each bill one (recorded R3 finding).

### High-Risk Concerns

Creation locks the owned client (or inserts the hidden prospect) and commits the
row and its creation history in one transaction. Input is projected at runtime: the
server makes the token and the status; identity, ownership, payment and lifecycle
fields are never taken from the caller. A linked quote must be the business's and
that client's, and an attached document the business's own upload, both held under a
share lock through the insert. The balance create locks the client, then the
deposit, rechecks kind, paid state and quote under those locks, and computes what is
left from the client's unvoided invoices on that quote inside the same transaction,
so authenticated balance sends serialize. Delivery uses an explicit-business service
and one joined row/owned-client snapshot; no lock is held across a provider call; the
delivery record locks client then invoice and saves state and history together.

### Missing Steps

Storage, service and HTTP tests red first; contracts in both implementations; the
three routes; the shared fake and the existing create fixtures (mobile quote,
attachment ownership, gap-13 regressions, served recipes); actual SQL for projection,
prospect atomicity, linked-quote and document rechecks, concurrent balance sends,
history rollback, waited ownership/reparent/state changes and delivery records;
route reviews and both inventories; affected and full server runs, typecheck, build,
evidence.

### Unsafe Assumptions

A delivery snapshot authorizes a point-in-time message to its captured owned
contact; it cannot promise zero external effect after a later change or a provider
exception. After an attempted send, an uncertain outcome or a refused or failed
delivery record returns a fixed reconciliation-required 503 with no row, as S3c2
does; it replaces today's 500 for the same cases and never claims no message was
sent. A known failed send keeps today's 201 with `delivered: false` and its fixed
reason, and the quote's second failure line stays. The public acceptance and the
cron keep the global `createJobInvoice`, `resendTradeInvoice`, `getJobInvoice`,
`updateJobInvoice` and `createJobEvent`; they take none of these locks, so a balance
raced by a customer's acceptance stays an R3 finding. An archived client can still
be quoted or invoiced here, as recorded. HTTP fakes prove decisions, not SQL. Memory
stays DB-only.

### Required Ordering Changes

Creation contracts and history first; snapshots and delivery records next; then the
explicit-business services and the routes. Retire the global `createQuote` and the
unscoped `sendTradeQuote` once nothing signed-in or public calls them; keep
`createJobInvoice` and `resendTradeInvoice` for the public and cron lanes.

### Open Product / Provider / Legal Questions

None. Validation order, statuses, messages, DTOs, roles and the billing gate are
preserved. A deposit's amount not being checked against its quote's deposit, and
hidden prospects never being removed, stay recorded findings. Serializing balance
sends closes the recorded one-balance race for signed-in callers without changing
the one-balance rule.

### Compliance and Data-Handling Notes

Synthetic loopback PostgreSQL and stubbed email, WhatsApp and SMS only; no real
contact or provider call, application database, live migration, client UI, flag,
push or deployment. No contact data in evidence.

### Test and Rollback Adequacy

Two businesses; foreign and missing indistinguishable; an invalid business issues no
query. Projection cannot set identity, ownership, token, status or payment fields. A
refused create leaves no prospect, row, history or message. A history failure rolls
back the prospect and the row. Eight concurrent balance sends make one balance.
Waited client ownership, deposit ownership, reparent and paid-state changes are
refused after the wait. The services are observed on every channel and on every
global escape hatch; post-send refusal is 503 and never a success. Final responses
are read back through scoped storage. Fix forward without restoring global
authenticated operations.

### Final Recommendation (Approve / Do not approve)

**Approve S4b2 on `394da7d6`**, failing tests first. S4c remains separately
reviewed; no closure of S4, R1-T7 or R1 is inferred.

### Separate reread

Retraced the callers by call site. The global quote create and the unscoped quote
sender are called only by the signed-in quote create: both can be retired. The
global invoice create and the unscoped invoice sender are also called by the public
quote acceptance (the deposit or full invoice it issues) and by the cron's generate,
dispatch and reminder passes: both stay, in those lanes only. A transaction that
returns a refusal after an insert would still commit that insert, so every check
(client, linked quote, document) comes before the hidden prospect is made. The
balance's sum must read the client's unvoided invoices on the quote inside the
client's lock, or two sends still race. The existing tests fix what must not move:
the statuses and messages of each refusal and their order, 201 with `delivered` and a
fixed reason for a known failed send, the server's totals and deposit, one creation
event, the balance of what is left with the deposit's channel and the caller's split
switch, and a refused attachment writing nothing. Fixtures that stub the retired
global create and sender must move to the scoped contracts, or they would pass
without exercising the route. **Approve the same S4b2 scope.**

## S4c preflight — recurring invoices

Base `9b124dea` (the S4b2 code; the documentation commit above it changes no code).
Four registrations: `GET /api/trades/schedules`, `POST /api/trades/schedules`,
`PUT /api/trades/schedules/:id` and `DELETE /api/trades/schedules/:id`. These are
the last signed-in trades registrations still on globally keyed storage.

### Verification of Prior Fixes

S4b2 (`9b124dea`) was checked at completion in this session: 94 new tests red first,
then green; 34 affected suites / 1,788 tests; 34 actual PostgreSQL checks; 49 of 49
planted mutations caught; typecheck, build and inventories; and the full server suite on that commit (159
suites / 3,942 tests). Reread
for this scope: the four schedule routes and their recorded reviews, the S4a archive
cascade these must lock in step with, the cron's generate pass (which advances and
ends recurring invoices by global id), the resume date rule, the 2026-09-27 batch 6d
decisions (skip the paused time; archive cancels; no new recurring invoice for an
archived client; no past start date), and the S3b property schedule contract this
mirrors.

### Blocking Issues

None. To demonstrate before production edits: the create reads its client through a
global key and compares in the route, then inserts, so a client moved or archived
after the lookup still gets a live recurring invoice (the gap S4a's evidence
recorded); pause, resume, edit and cancel write by id after a route lookup, so a row
moved or cancelled after it is still written and logged; and a resume works out its
next date from the route's stale read.

### High-Risk Concerns

Create locks the owned client, refuses an archived one under that lock, and commits
the row with its `schedule_created` history: an archive and a create at the same
moment can no longer leave an archived client with a live recurring invoice. Update
and cancel find their candidate, lock the owned client, then the row by id, business
and that client, recheck the cancelled state, and commit with their history. The
lock order is the archive's: client first. Fields are projected at runtime: amount,
frequency, channel, and active or paused only; identity, dates and cancellation are
never the caller's. A resume's next date comes from the locked row and the frequency
asked for, by the existing cycle rule.

### Missing Steps

Storage and HTTP tests red first; contracts in both implementations; the four
routes; the shared fake; the cycle helper moved to a pure module so storage can use
it without importing the cron (the cron re-exports it); actual SQL for projection,
refusals, resume dates, repeats, history rollback, the archive race, and waited
ownership, reparent and cancelled-state changes; route reviews and both inventories;
affected and full server runs, typecheck, build, evidence.

### Unsafe Assumptions

The cron keeps the global due-list read and its globally keyed advance and
end-of-term cancel; it takes none of these locks, and its interleaving with a
signed-in pause or cancel is unchanged (a signed-in write waits for the cron's row
lock, then works from the row as the cron left it). A client may still have several
recurring invoices: a create replaces nothing, unlike rent. A cancelled one is still
cancelled again and logged again. Setting an active one active still logs a resume.
No new refusal is added for an edit under an archived client: archiving already
cancels every one. HTTP fakes prove decisions, not SQL. Memory stays DB-only.

### Required Ordering Changes

Move the pure cycle functions first, with the cron's behaviour and export unchanged.
Then the contracts, the routes, and the retirement of the global create and read,
which have no other caller.

### Open Product / Provider / Legal Questions

None. The start-date rule, the end-date rule, the billing gate, roles, statuses,
messages and DTOs are preserved.

### Compliance and Data-Handling Notes

Synthetic loopback PostgreSQL only; no application database, provider, live
migration, client UI, flag, push or deployment. No contact data in evidence.

### Test and Rollback Adequacy

Two businesses; foreign and missing indistinguishable; an invalid business issues no
query. A refusal changes no row or history and sends nothing. A history failure
rolls back create, edit and cancel. Twelve rounds of archive beside create leave no
live recurring invoice under an archived client. Waited client and row ownership,
reparent and cancelled-state changes are refused after the wait; a resume that
waited for an advance is worked out from the advanced row. Fix forward without
restoring globally keyed authenticated writes.

### Final Recommendation (Approve / Do not approve)

**Approve S4c on `9b124dea`**, failing tests first. This is the last S4 batch; S4,
R1-T7 and R1 are not closed by it.

### Separate reread

Retraced the callers by call site. The global create and the global read are called
only by the signed-in routes and can be retired. The global update and cancel are
also the cron's (advance, and end-of-term) and stay for it. The cycle function is
imported by the routes from the cron module and tested through it, so the cron must
keep exporting it. The archive's cascade updates the client row and then its
recurring invoices; a create that locks the client first either commits before the
archive and is cancelled by it, or waits and is refused: both orders end safe, and
neither holds two locks in the opposite order. The existing tests fix what must not
move: the 400s for an end before the start and a past start, 404 'Client not found',
409 for an archived client, 409 for editing a cancelled one, the resume dates on a
weekly and a monthly cycle, one event per write with the change as its payload, and
a repeat cancel answering 200. **Approve the same S4c scope.**
