# R1-T7 S5a — the business's own settings row

Exact branch `remediation/r1-continuation-20260907`, code `c294f007`, base `e836c60a`.
[Preflight and separate reread](../../../PLAN-2026-10-04-r1-t7-s5-settings.md).
S5a is code-complete; independent review is owed. S5b, S6, R1-T7 and R1 remain
active. Owner October 3 authorization directs continuation.

## What the S5 starting query found

Rerun on the S4c commit, the query in the S4c evidence listed **41** signed-in
registrations calling a storage method with no required `merchantId` parameter, as
the handoff predicted. All 41 handlers were read. 26 of them touch only the
business's own row, and are this batch; the other 15 are S5b's (six kinds, in the
plan).

## What changed

Six signed-in routes wrote the business's row through the general update, which
writes **any column it is handed** except the Windcave key: onboarding, the daily
goal, the plain update, the rent and trades reminder switches, and GST. Each parses
its body first, so no request reached another column; the storage layer itself
offered no such limit, and three of the six passed `data as any`.

They now call one contract, `updateMerchantSettings(merchantId, change)`. `change`
names its purpose and each purpose has its own columns, picked at runtime by one
pure function both implementations call:

| Purpose | Route | Columns it may write |
|---|---|---|
| `onboarding` | `POST /api/merchants/:id/onboarding` | director, NZBN, GST number, website, turnover, description; storage sets `onboardingCompleted` itself |
| `profile` | `PUT /api/merchants/:id` | business name, director, address, NZBN, phone, GST number, contact email, contact phone, business address |
| `daily-goal` | `PUT /api/merchants/:id/daily-goal` | the daily goal |
| `rent-reminders` | `PUT /api/property/reminder-settings` | the four rent reminder settings |
| `trade-reminders` | `PUT /api/trades/reminder-settings` | the trades reminder switch |
| `trade-gst` | `PUT /api/trades/gst-settings` | GST registered, GST price mode |

A purpose cannot write another's columns, and none can write the row's identity,
sign-in, status, credentials, rates, links, branding, billing or tutorial columns. An
unknown purpose writes nothing. Omitted fields are kept and an explicit null is
written, as before. The statement sets only the purpose's columns, so a settings
write beside another change to the same row keeps both.

The row's own methods (`getMerchant`, the details, theme and logo updates) are keyed
by the business itself: the parameter now says so, and a value that is not a positive
32-bit integer issues no query. The database's details update wrote the whole object
it was handed; it now writes its four named columns, as the memory one did.

The general update stays for the Google link (account entry) and the admin's Windcave
merchant id. A test pins that those two are its only route callers.

**What each of the 26 passes as the business.** Read by call site: every one passes
the session's business or a path id already held to the caller by
`checkMerchantOwnership` or `checkAccountOwnership`. This is now held by a test, not
only by reading: the served-route tests (every route, every allowed caller) record
each business named to the row's methods while a request is served, and fail if a
business's login was served from any row but its own.

No status, message, DTO, role or email changed.

## Verification

- Original red, replayed on an archived copy of `e836c60a`: **50 of 64 fail** — 31
  memory storage, 13 captured SQL, 6 HTTP (each of the six routes still on the general
  update) — and the new pin fails. The 14 that pass on the base state what already
  held: a body's stray fields reach no column (each route's own schema), another
  business's path is refused, the business comes from the sign-in, and the memory
  details update already wrote four fields.
- Focused green **64 pass**; the pin passes.
- Affected regression **76 suites / 2,663 tests pass**, including every served-route
  suite with the new recorder: no served request by a business's login named another
  business's row.
- Fresh actual PostgreSQL 16 **18 pass / 0 fail** on a new empty database through
  the existing migration runner: each purpose's exact columns, with and without
  stray fields, on its own business only; the onboarding flag; omitted and null;
  unknown purposes and a missing business; invalid businesses; details, theme and
  logo; the general update's credential strip; and each purpose written while
  another transaction held the row, keeping both changes.
- Mutation check, on a scratch copy only: **33 of 34 planted defects caught**: 20 by
  both the unit tests and PostgreSQL, 12 by unit tests only (six in the memory
  implementation, six in the routes), and one by PostgreSQL only (the row read, merged
  and written back, which only the waited check can see). The served-route recorder
  caught a start-up read naming another business that still answered 200. The one
  survivor is equivalent: handing the plain update the raw body instead of the parsed
  fields changes nothing, because its strict schema admits only the nine fields and
  the projection drops anything else.
- Typecheck, production build and whitespace pass. Inventories: **187 registrations
  / 0 unclassified / 0 gaps; 253 storage contracts**.
- **Full server: 163 suites / 4,053 tests pass**, exit 0, 567.665 seconds, run on
  `c294f007` with a clean tree apart from this untracked documentation. No new client
  or browser run is claimed.

## Phase handoff record

- Scope/files: `git show --stat c294f007`: storage, routes, route policy and
  review, the served-route support (the recorder), the inventory test, two new tests,
  the SQL verifier and both generated inventories.
- Migrations/target: no repository migration or application target. The existing
  runner only on new empty `taptpay_s5_verify_a1` (loopback 55531) and the mutation
  databases (loopback 55541–55542). Preflight: 0 pre-existing application tables.
- Commands/logs: the base replay, focused and affected runs, the SQL verifier, the
  mutation script, typecheck/build, both generators, the full server run. Synthetic
  logs under `.local/claude-scratch/session-2026-10-04/` (git-ignored; no application
  rows or contact data).
- Negative/effect proof: a refused path changes neither business's row and sends
  nothing (HTTP refusal-effect observer; row snapshots; SQL column diffs).
- Provider/UAT, devices, external actions, deploy: none. No app DB/provider, live
  migration, client UI, flag or payment-mode change, push or deployment.
- Security/privacy: reviewed the per-purpose projection, the guard, the statement's
  predicate and column list, and response disclosure (unchanged DTOs).
- In-flight: none. Every disposable PostgreSQL was stopped and deleted by the
  command that started it.
- Rollback/constraints: no rollback commit; fix forward without returning the six
  routes to the general update. No schema or data migration to undo.
- Approvals/stops: the S5a preflight and separate reread approve exactly this scope
  on `e836c60a`. Owner continuation authorization persists. No application, provider
  or production gate was crossed.
- Deferred/next: S5b (stock create, the team reads, the property tenant history, the
  push stop, the print request's board, and the pin on the remaining reviewed
  exceptions); then S6 uploads, Apple, R1-T10. Independent review of S1–S5 is owed.
