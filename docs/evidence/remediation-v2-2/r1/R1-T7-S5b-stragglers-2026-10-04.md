# R1-T7 S5b — the stragglers and the closing pin

Exact branch `remediation/r1-continuation-20260907`, code `587842cb`, base `c294f007`.
[Preflight and separate reread](../../../PLAN-2026-10-04-r1-t7-s5-settings.md).
S5b is code-complete, and with it the S5 engineering scope (S5a, S5b); independent
review is owed. S6, R1-T7 and R1 remain active. Owner October 3 authorization
directs continuation.

## What changed

Nine signed-in registrations moved to one scoped storage call each.

| Route | Before | Now |
|---|---|---|
| `POST /api/merchants/:merchantId/stock-items` | `createStockItem({ merchantId, ...body })`: the business first, the parsed body spread over it | `createStockItemForMerchant(merchantId, data)`: the business is its own argument and storage takes the five stock fields only. The global create is retired |
| `POST /api/team/:userId/resend`, `DELETE /api/team/:userId` | the login read by its global id, its business compared in the route | `getTeamMemberForMerchant(userId, merchantId)`: another business's login reads as missing |
| `POST /api/property/tenants`, `…/:id/archive`, `…/:id/unarchive` | the history line written from the route, after the write had committed | the tenant's write and its `Tenant_Created`, `Tenant_Archived` or `Tenant_Restored` line commit in one transaction; the routes log nothing |
| `POST /api/push/unsubscribe`, `POST /api/push/native-unsubscribe` (one iPhone) | the business's devices read, compared in the route, then the device stopped **by its address alone** | `deactivatePushSubscriptionForMerchant(merchantId, endpoint)`: one statement names the business, the address and the active state, and says whether a device was stopped |
| `POST /api/board-builder/submit` | its board read by a global id, compared in the route | `getTaptStoneForMerchant` (S1's read) |

Two of these were real defects, not only structure:

- **A tenant made, archived or restored with no history, and a doubled tenant.** A
  failed history insert answered 500 after the write had committed. A retried create
  then made a second tenant. Now a history failure rolls the write back.
- **Another business's device stopped.** A device re-registered to another business
  between the route's read and its write was stopped for that business. Now the stop
  finds nothing to stop and answers 403.

One consequence, recorded: a database fault while stopping a device answers 500. The
route's read used to swallow it and answer 403 "Not authorized", which the route's
review carried as a finding against R1-T9's rule; that finding is removed.

Who may stop a device (any login of the business), the sender's stop by address for
an address its push service reports gone, the repeat archive and restore, statuses,
messages and DTOs are unchanged.

## The closing pin

Asked again after S5b, the S5 starting query lists **9** registrations (it listed 41
on the S4c commit). Each is a reviewed exception, now held by a test with its reason;
a new unscoped call on a signed-in business route fails that test until it is scoped
or reviewed.

| Registration | Storage call | Why it takes no business |
|---|---|---|
| `POST /api/auth/sign-out-everywhere` | `advanceUserSessionVersion` | account scope: the signed-in login's own sessions |
| `PUT /api/merchants/:id/change-password` | `getUserById`, `updateUserPassword`, the throttle pair | account scope: the signed-in login itself; the path is only a precondition |
| `GET /api/merchants/:id/active-transaction`, `GET /api/merchants/:id/events` | `getTaptStone` | the public branch (a board's page and its live updates); the signed-in branch is held to the business |
| `POST /api/transactions/:id/cancel` | `getTransaction` | the validated platform-admin branch only |
| `POST /api/push/subscribe`, `POST /api/push/native-subscribe` | `createPushSubscription` | per login (owner decision 2026-09-22): the business rides in the data and is checked against the login under its row lock |
| `POST /api/board-builder/submit` | the throttle pair | the business's own print limit: the counter's key is built from the session's business |
| `GET /api/invoice-documents/:name` | `getUploadedFile`, `recordInvoiceDocumentAdminRead` | the validated platform-admin branch only |

This is structural evidence. A required argument proves nothing about a predicate;
the batches' own storage, HTTP and PostgreSQL tests do that.

## Earlier batches' tests that moved

A deliberate contract change, not a weakening: the S1 stock tests and verifier make
their fixtures through the scoped create (an item with no business is planted as old
data); the S3a storage test finds the create's insert inside its transaction; the
four S3 verifiers set aside a tenant's own `Tenant_Created` line when they count the
history of what is done to it afterwards, and one expects the archive's own line;
C10 batch 5's "a failed stop is a 500" fails the scoped stop the routes now call. The
shared property fake records a tenant write's history line itself, as storage does.

## Verification

- Original red, replayed on an archived copy of `c294f007`: **46 of 52 fail** — 34
  storage (11 stock create, 9 login read, 11 device stop, 3 tenant history) and 12
  HTTP — and the three pins fail. Five HTTP ones are real behaviour, not a missing
  contract: on both stop routes a device another business registered while the stop
  was handled **was stopped for that business**; and tenant create, archive and
  restore each logged from the route after the write. The 6 that pass on the base
  state what already held: another business's stock path is refused, another
  business's login answers as a missing one, another business's device is refused,
  and a foreign, removed or missing board is not found.
- Focused green **52 pass**; the inventory test, with its three new pins, **18 pass**.
- Affected regression **87 suites / 2,874 tests pass**, including every served-route
  suite and the property, push, team and stock suites.
- Fresh actual PostgreSQL 16 **14 pass / 0 fail** on a new empty database through
  the existing migration runner: the stock create's fields and business; the login
  read; the tenant create's row and line together; one line per archive and restore,
  for the business's own tenant only; a history line that cannot be written (a
  trigger) rolling back the create, the archive and the restore, with the automation
  left active; an archive and a restore that waited for a committed ownership change
  writing and logging nothing; invalid businesses; the stop's four cases, a stop that
  waited for the device's move to another business leaving it on, and a stop that
  waited for another stop reporting nothing stopped; the sender's stop unchanged.
- The five earlier verifiers this touches were rerun on new empty databases: stock
  and board **10**, property profiles **9**, schedules **17**, invoices **18**,
  invoice send **24**, all passing after the adjustments listed above.
- Mutation check, on a scratch copy only: **36 of 36 planted defects caught**, 20 by
  both the unit tests and PostgreSQL and 16 by the unit tests only (five in the
  memory implementation, eleven in the routes). Among them: a stop that reads and
  then stops by address alone, a tenant write outside one transaction, a history
  line under the wrong business, and a stop answering 200 when nothing was stopped.
- Typecheck, production build and whitespace pass. Inventories: **187 registrations
  / 0 unclassified / 0 gaps; 255 storage contracts**.
- **Full server: 165 suites / 4,107 tests pass**, exit 0, 578.5 seconds, run on
  `587842cb` with a clean tree apart from untracked documentation. No new client or
  browser run is claimed.

## Phase handoff record

- Scope/files: `git show --stat 587842cb`.
- Migrations/target: no repository migration or application target. The existing
  runner only on new empty disposable databases on loopback (55533, 55543,
  55551–55555). Preflight: 0 pre-existing application tables.
- Commands/logs: the base replay, focused and affected runs, the SQL verifiers, the
  mutation script, typecheck/build, both generators, the full server run. Synthetic
  logs under `.local/claude-scratch/session-2026-10-04/` (git-ignored; no application
  rows or contact data).
- Negative/effect proof: a refusal changes no row and sends nothing (HTTP
  refusal-effect observer; storage snapshots; SQL row counts and history counts).
- Provider/UAT, devices, external actions, deploy: none. No app DB/provider, live
  migration, client UI, flag or payment-mode change, push or deployment.
- Security/privacy: reviewed input projection, scope predicates, the transaction
  boundary of the three property writes, the single-statement stop and response
  disclosure.
- In-flight: none. Every disposable PostgreSQL was stopped and deleted by the
  command that started it.
- Rollback/constraints: no rollback commit; fix forward without restoring the global
  stock create, route-level tenant history or the stop by address in a signed-in
  route. No schema or data migration to undo.
- Approvals/stops: the S5b preflight and separate reread approve exactly this scope
  on `c294f007`. Owner continuation authorization persists. No application, provider
  or production gate was crossed.
- Deferred/next: S6 private upload lifecycle (owner decisions of 2026-09-29: scan
  before a document is shown, quarantine, 12-month deletion of unattached uploads);
  Apple; R1-T10. Independent review of S1–S5 is owed.
