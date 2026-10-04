# R1-T7 S5 — settings, exports and the stragglers

Branch `remediation/r1-continuation-20260907`. Authority: v2.2 §8.5 and §22.9, the
supplied integration plan's R1-T7/P2/P8.5, and `docs/PLAN-2026-10-02-r1-t7-tenant-storage.md`.
The owner's finish-R1 authorization of 2026-10-03 persists. No product, role, schema,
provider, deployment or live-data decision is made here.

## Starting facts, remeasured on `e836c60a`

The S5 starting query (in the S4c evidence) was rerun on the S4c commit: **41**
signed-in (merchant-branch) registrations still call a storage method with no
required `merchantId` parameter, the same 41 the handoff predicted. Every one of the
41 handlers was then read. By kind:

| Kind | Registrations | What S5 does |
|---|---|---|
| The business's own row (`getMerchant`, `updateMerchant`, `updateMerchantDetails`, `updateMerchantTheme`, `updateMerchantLogoUrl`) | 26 | **S5a** |
| A create that takes its business inside the data (`createStockItem`) | 1 | S5b |
| A login read by a global id, then compared (`getUserById`) on the two team routes | 2 (one also in the 26) | S5b |
| History written from the route by a global insert (`logTransactionEvent`): property tenant create, archive, restore | 3 | S5b |
| A device stopped by its address alone after a route check (`deactivatePushSubscriptionByEndpoint`) | 2 | S5b |
| A board read by a global id, then compared (`getTaptStone`) in the print request | 1 (also in the 26) | S5b |
| Not a tenant read at all: account scope (sign-out everywhere, password change), per-login push registration, the validated-admin branch (sale cancel, invoice document), the public board branch (open sale, live updates), the print limit's counter | 9 | S5b records each as a reviewed exception and pins the list |

## Decomposition

- **S5a — the business's own settings row.** One purpose-projected update contract,
  the row's own methods named and guarded by the business, and a check on every
  served request of what is passed as the business.
- **S5b — the stragglers and the closing pin.** Stock create, the team reads, the
  property profile history, the push stop, the print request's board, and a test
  holding the remaining exceptions to a reviewed list with a reason each.

## S5a preflight — the business's own settings row

Base `e836c60a` (S4c code `df54069e`; the two commits above it are documentation).

### Verification of Prior Fixes

S4c was verified in the preceding session and its full server run read after the
handoff: 161 suites / 3,988 tests on `df54069e`. This session started on a clean tree
at `e836c60a`, with no background work in flight, and reran the S5 starting query
(41). Reread for this scope: the 26 handlers, both implementations of the five
merchant-row methods, the ownership helpers (`checkMerchantOwnership`,
`checkAccountOwnership`), the six settings schemas, the R0-T5 credential strip in the
general update, and the S1 stock/board contract this mirrors.

### Blocking Issues

None. Two things are true on the base and shown red before production edits:

- The general update writes **any column it is handed** except the Windcave key
  (`set({ ...updates })`): identity, sign-in secrets, status, billing and reset
  columns included. Six signed-in routes use it, three of them with `data as any`.
  Today only each route's own schema stands between a request body and those columns.
- The database's details update is `set(details)`, the whole object; the memory
  implementation copies four named fields. The two disagree on a stray field.

No request reaches either today: every one of the six routes parses its body with a
schema that drops or refuses other fields. This is the storage-level defence S1 gave
stock and boards, not a live cross-business defect.

### High-Risk Concerns

One contract, `updateMerchantSettings(merchantId, change)`, where `change` names its
purpose (`profile`, `daily-goal`, `rent-reminders`, `trade-reminders`, `trade-gst`,
`onboarding`) and each purpose has its own columns, picked at runtime by one pure
function both implementations call. A purpose can never write another's columns
(a teammate's reminder switch cannot become the owner's GST switch), and no purpose
can write identity, ownership, credentials, status, billing, links or tutorial state.
Completing onboarding sets its own flag; a caller cannot. An unknown purpose writes
nothing. Omitted fields are kept; an explicit null is written, as today.

The row's own methods (`getMerchant`, the details, theme and logo updates) are keyed
by the business itself: the parameter is renamed to say so, and an id that is not a
positive 32-bit integer issues no query. Details are projected in the database too.

### Missing Steps

Storage tests red first (both implementations and the captured SQL); the contract in
both; the six routes; a recorder in the served-route tests that fails if any served
request by a business's login passes another business to the row's methods; the pin;
actual PostgreSQL for projection, refusals, and two purposes written at the same
moment; route reviews and both inventories; affected and full server runs, typecheck,
build, evidence.

### Unsafe Assumptions

The general update stays, for the Google link (account entry) and the admin's Windcave
merchant id only; a test pins that no signed-in business route calls it. `getMerchant`
stays one method for every lane (public, provider, cron, sign-in): the guard changes no
valid read, and an invalid id already matched no row. Who may change what (owner or
teammate) is each route's existing gate and is not moved. Details and theme keep not
touching `updatedAt`. The HTTP harness proves decisions; SQL is proved on PostgreSQL.

### Required Ordering Changes

The pure projector and the contract first, then the routes one purpose at a time, then
the recorder and pin.

### Open Product / Provider / Legal Questions

None. Statuses, messages, DTOs, roles and the onboarding email are preserved.

### Compliance and Data-Handling Notes

Synthetic loopback PostgreSQL only; no application database, provider, live migration,
client UI, flag, push or deployment. No contact data in evidence.

### Test and Rollback Adequacy

Two businesses. Each purpose changes its own columns on the caller's row and nothing
on the other's; a stray identity, credential, status or billing field is never
written; an invalid business issues no query; a missing business answers as before.
Fix forward; nothing to migrate back.

### Final Recommendation (Approve / Do not approve)

**Approve S5a on `e836c60a`**, failing tests first. It does not close S5, R1-T7 or R1.

### Separate reread

Retraced the callers by call site. `updateMerchant` has eight production callers, all
in `server/routes.ts`: the Google callback (`{ googleId }`), the admin Windcave
merchant id, and six signed-in routes (onboarding, daily goal, the plain update, the
rent and trades reminder switches, GST). Nothing outside the routes calls it; tests
use it to arrange fixtures (status, brand, reminders), which is why it stays. Each of
the six parses first: onboarding with a strict schema, the plain update with a strict
inline schema of nine fields, the other four with schemas that drop unknown keys. The
nine plain-update fields, the six onboarding fields, the goal, the four rent fields,
the trades switch and the two GST fields are exactly the columns the projector must
allow, and no more. What must not move: `PUT /api/property/reminder-settings`
answers the defaults when the row is missing (it does not 404); the trades pair answer
their defaults likewise; the plain update answers 400 on an empty body before any
write; onboarding reads the row before it writes and sends its email after. All 26
pass either the session's business or a path id already held to the caller by
`checkMerchantOwnership` or `checkAccountOwnership`; the platform admin reaches a
path's business only through those two helpers. **Approve the same S5a scope.**

## S5a completion

Code `c294f007`. Red 50 of 64 and the pin on the base; 64 pass; affected 76 suites /
2,663 tests; actual PostgreSQL 18 of 18; 33 of 34 planted defects caught (the
survivor is equivalent); full server 163 suites / 4,053 tests on the commit.
[Evidence](evidence/remediation-v2-2/r1/R1-T7-S5a-merchant-settings-2026-10-04.md).
The served-route recorder found no route serving a business's login from another
business's row.

## S5b preflight — the stragglers and the closing pin

Base `c294f007` (the S5a code). Nine registrations change; nine more are recorded as
reviewed exceptions and pinned.

### Verification of Prior Fixes

S5a was checked at completion in this session (counts in its evidence): its tests red
first on the base, then green; the affected suites; actual PostgreSQL; the planted
defects; typecheck, build and inventories; and the full server suite on its commit.
Reread for this scope: the nine handlers below, both implementations of the storage
they call, the S1 stock contract (`stockItemChanges`), the S3a property profile
contract and its fake, the team storage (`rotateTeamInvite`, `removeTeamMember`,
already scoped), the per-login push decisions of 2026-09-22 and 2026-09-26, and the
print request's decision of 2026-09-26.

### Blocking Issues

None. To demonstrate before production edits:

- **Stock create** hands storage `{ merchantId, ...body }`, the business first and the
  parsed body spread over it. Only the schema's dropping of unknown fields keeps a
  body's `merchantId` from replacing the path's.
- **Team resend and remove** read a login by its global id and compare its business in
  the route. Remove then ends that login's sessions before its scoped delete.
- **Property tenant create, archive and restore** write their history line from the
  route, after the write has committed: a failed history insert answers 500 with the
  tenant already made, archived or restored, and a retried create makes a second tenant.
- **Push stop** (web and one iPhone) reads the business's devices, compares in the
  route, then stops a device **by its address alone**. A device re-registered to
  another business between the two is stopped for that business.
- **The print request** reads its board by a global id and compares in the route.

### High-Risk Concerns

Each becomes one scoped storage call. Stock create takes the business as its own
argument and projects the five stock fields. The team routes read the login through
the business. The three property writes commit their history in the same transaction
(a history failure rolls the write back), and the routes stop logging. The push stop
puts the business and the address in one statement and answers whether a device was
stopped. The print request reads its board through the business (S1's read).

### Missing Steps

Tests red first (storage in both implementations, captured SQL, HTTP races); the
contracts; the nine routes; the shared property fake; the S1 tests and verifier moved
to the scoped stock create, with the global one retired; actual PostgreSQL for the
property history rollback, the push stop's waited re-registration and the team read;
a pin holding every remaining signed-in registration's unscoped call to a reviewed
list; route reviews and both inventories; affected and full runs, typecheck, build.

### Unsafe Assumptions

Who may stop a device is unchanged: any login of the business, as today. The sender
keeps the global stop for an address its push service reports gone. Registering a
device still moves it to the login that registers it (owner decision 2026-09-22).
A repeated archive or restore is still taken and logged again. Memory stays DB-only
for property. A database fault while stopping a device answers 500, where the
route's read used to swallow it and answer 403.

### Required Ordering Changes

Contracts first; then the routes; the S1 fixtures move before the global stock create
is retired.

### Open Product / Provider / Legal Questions

None. Roles, statuses, messages and DTOs are preserved.

### Compliance and Data-Handling Notes

Synthetic loopback PostgreSQL only; no application database, provider, live migration,
client UI, flag, push or deployment. No contact data in evidence.

### Test and Rollback Adequacy

Two businesses; foreign and missing indistinguishable; an invalid business issues no
query. A refusal changes no row and sends nothing. A history failure rolls back the
tenant create, archive and restore. A device re-registered while a stop waits is left
on. Fix forward; nothing to migrate back.

### Final Recommendation (Approve / Do not approve)

**Approve S5b on the S5a commit**, failing tests first. With it S5's engineering
scope is implemented; S6, R1-T7 and R1 are not closed by it.

### Separate reread

Retraced by call site. `createStockItem` has one production caller (the route); the
S1 tests and verifier use it for fixtures only, so it can be retired once they move.
`getUserById` keeps its sign-in, reset and password-change callers, which name the
signed-in login itself. `logTransactionEvent` keeps the WhatsApp status callback and
the delivery services; the three property routes are its last signed-in route
callers. `deactivatePushSubscriptionByEndpoint` keeps the sender. What must not move:
stock create answers 201 with the item and 400 with the issues; resend answers 404
"Invite not found" for a foreign, missing or accepted login, after its rate limit;
remove answers 404 "Login not found, or it is the account owner" and 409 for a
pending invite; the three property events keep their names and the create its
payload (first name, last name, address); the push stops answer 403 with their two
messages when the device is not the business's, and 200 `{ success: true }`; the
print request answers 404 "Payment board not found" for a foreign, missing or removed
board. **Approve the same S5b scope.**
