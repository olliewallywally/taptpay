# R1-T7 S4b1 — trades quote/invoice reads, signed-in PDF and manual invoice state changes

Exact branch `remediation/r1-continuation-20260907`, code `394da7d6`, base `c0fb5bc3`.
[Preflight and separate reread](../../../PLAN-2026-10-03-r1-t7-s4-trades.md).
S4b1 is code-complete; independent review is owed. S4b2 (creation and delivery), S4c
(recurring invoices), R1-T7 and R1 remain active. Owner October 3 authorization
directs continuation.

Six registrations moved: the quote and invoice lists, the signed-in quote PDF, and
void, paid outside TaptPay and job complete. Reads and lists need the row and its
current client both to be the signed-in business's, in one statement. Each state
change finds its candidate, locks the owned client, then locks the invoice by id,
business and that client, rechecks the current state, and commits its fixed fields
with its history line in one transaction. Completion keeps deposit-before-unpaid; a
repeated void or completion is still taken and logged; an archived client's issued
invoices stay manageable (owner decision 2026-09-27).

The signed-in PDF is made from the quote read together with its owned client; the
shared helper that read a client by a global key is split, so the signed-in route
has no global client read in its path, and the public link's route keeps its own.
The receipt after an external payment is read as one invoice/owned-client snapshot
after the commit, sent to that captured contact, and logged by a scoped insert that
needs the current owned invoice of that client. A line refused afterwards is never
written through a global key; the server logs the invoice id for reconciliation and
the response stays the committed row, which makes no delivery claim. The receipt's
rendering was extracted so the payment lane and the scoped service send the same
email.

The global invoice, quote, client and event methods stay for the public quote,
checkout, provider completion, WhatsApp status and cron lanes, and until S4b2 for
authenticated creation and sending. None is retired here.

Verification:

- Original red, on `c0fb5bc3` before any production edit: **51 of 51 fail** — 30
  storage (contracts absent), 7 receipt-service, 14 HTTP. Of the HTTP ones, 11 are
  real post-lookup races answered 200 with a write (six ownership moves of the
  invoice or its client, five state changes), one printed another business's client
  in the signed-in PDF (200), two are the missing scoped contracts.
- Focused green **51 pass**. Affected regression **31 suites / 1,693 tests pass**. One served
  recipe asserted the old unscoped receipt call and now asserts the scoped one with
  the business id, and that the unscoped service is not called.
- Receipt rendering: the payment lane's email and history for four fixed cases
  (job details, deposit, balance, recurring; GST on and off; markup in names) were
  captured before and after the extraction and are **byte-identical**
  (sha256 `899d7a5e…ad2e3` both). A committed test also holds the scoped receipt
  equal to the payment lane's for the same rows.
- Fresh actual PostgreSQL 16.10 **27 pass / 0 fail**: scoped reads and writes
  refusing foreign, missing and inconsistent rows; list filters and order; joined
  snapshots; fixed-field changes with one history line each; archived-client
  management; settled, voided, deposit and unpaid refusals; repeats; history
  rollback for all three changes; void and external payment serialized over eight
  rounds; receipt history; nine waited ownership/reparent races, six waited state
  races and a waited receipt race; invalid scopes. The first run was 26 of 27: the
  verifier's own helper defaulted an undefined business to tenant a. Corrected in
  the verifier (direct calls), no production change.
- Mutation check, on a scratch copy only: **28 of 28 planted storage defects caught**
  (unmutated control 27 pass / 0 fail), each by both the actual PostgreSQL verifier
  and the SQL-capture unit test. The working tree was never edited by the check. One
  check was added to the verifier for it first: an invoice stamped with another
  business under an owned client belongs to neither.
- Typecheck, production build and unstaged/staged whitespace pass. Inventories:
  **187 registrations / 0 unclassified / 0 gaps; 246 storage contracts** (238
  declared, 8 inherited).
- **Full server: 156 suites / 3,847 tests pass**, exit 0, 683.698 seconds, run on
  `394da7d6` with a clean tree. No source change during the run. No new client or
  browser run is claimed.

Phase handoff record:

- Scope/files: 15 paths in `394da7d6` (`git show --stat 394da7d6`): storage,
  routes, the trades delivery module, route facts/policy/review, the shared trades
  fake, the served-trades recipe, the inventory test, three new tests, the SQL
  verifier and both generated inventories.
- Migrations/target: no repository migration or application target. The existing
  runner through 0031 only on new empty `taptpay_s4_verify_invoices_*`, loopback
  55522, and the mutation databases on loopback 55532. Preflight: 0 pre-existing
  application tables, 0 upload inventory entries.
- Commands/logs: red and green focused runs, the affected run, `npm run test:server`,
  the invoice SQL verifier, the mutation script, the before/after receipt capture,
  typecheck/build, both generators, whitespace. Synthetic logs under
  `.local/claude-scratch/session-2026-10-03/` (git-ignored; no application rows or
  contact data).
- Negative/effect proof: every refusal leaves clients, invoices and history
  unchanged and sends nothing (HTTP refusal-effect observer; SQL snapshots). A
  missing or foreign receipt snapshot sends no email. Stubbed email; the SQL
  verifier sends no messages.
- Provider/UAT, devices, external actions, deploy: none. No app DB/provider, live
  migration, client UI, flag or payment-mode change, push or deployment.
- Security/privacy: reviewed joined scope, lock order (client before invoice, as
  the archive), fixed-field writes, history rollback and response disclosure.
  Independent final review still owed.
- In-flight: none. Every disposable PostgreSQL was stopped and deleted by the
  command that started it.
- Rollback/constraints: no rollback commit; fix forward without restoring globally
  keyed authenticated writes. No schema or data migration to undo.
- Approvals/stops: the S4b1 preflight and separate reread approve exactly this scope
  on `22c6dc9c`; `c0fb5bc3` adds documentation only. Owner continuation authorization
  persists. No application, provider or production gate was crossed.
- Deferred/next: a provider payment landing beside a manual void or external payment
  and voiding a split invoice with shares paid remain the recorded R3/R4 findings.
  S4b2 authenticated creation and delivery (and the one-balance race), S4c recurring
  invoices; S5 settings/exports; S6 uploads; Apple; R1-T10. External, device and
  review gates remain.
