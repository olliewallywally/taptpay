# R1-T7 S4b2 — trades quote, invoice and balance creation and their delivery

Exact branch `remediation/r1-continuation-20260907`, code `9b124dea`, base `51e0b186`.
[Preflight and separate reread](../../../PLAN-2026-10-03-r1-t7-s4-trades.md).
S4b (b1 and b2) is code-complete; independent review is owed. S4c (recurring
invoices), R1-T7 and R1 remain active. Owner October 3 authorization directs
continuation.

Three registrations moved: the quote create, the invoice create and send-balance.
Each is now one scoped storage call. It locks the business's own client, or makes
the hidden prospect a quote or quick invoice needs, and commits the row with its
creation history in one transaction. Input is projected at runtime: the server makes
the token and the first status; identity, ownership, payment and lifecycle fields
are never taken from the caller, and the invoice create takes only a deposit or a
full invoice. A deposit's quote must be the business's and that client's, and an
attached document the business's own upload; both are held under a share lock
through the insert. Every check comes before the prospect is made, because a refusal
returned from a transaction still commits what was written before it.

The balance create locks the client, then the deposit, rechecks kind, paid state and
quote under those locks, and works out what is left from the client's unvoided
invoices on that quote inside the same transaction. Signed-in balance sends
therefore serialize, through one deposit or two: the recorded finding that two sends
at the same moment each made a balance is closed for signed-in callers. The
one-balance rule itself, its statuses and its words are unchanged.

Sending uses explicit-business services. Each reads the row and its owned client in
one statement after its other prerequisites and sends to that captured contact; no
database lock is held across a provider call. An invoice's delivery record locks the
client then the invoice and saves state and history together; a quote's delivery
line is a scoped insert. After an attempted send, a provider exception or a refused
or failed record is a fixed reconciliation-required 503 with no row
(`TRADES_QUOTE_…` / `TRADES_INVOICE_DELIVERY_RECONCILIATION_REQUIRED`), replacing
today's 500 for the same cases; it never claims that nothing was sent. A known
failed send keeps its 201 with `delivered: false` and a fixed reason, and a quote's
second failure line stays. Final answers are read back through the business's scope.

The global quote create and the unscoped quote sender had no other caller and are
retired. The global invoice create and unscoped invoice sender stay for the public
quote acceptance and the cron, which take none of these locks.

Verification:

- Original red, on `51e0b186` before any production edit: **94 of 94 fail** — 45
  storage, 26 service, 23 HTTP. Seven HTTP ones are real post-lookup races answered
  201 with a row made and a message sent (a client moved before a quote or an
  invoice; a deposit's quote moved to another business or another client; a deposit
  or its client moved, or the deposit voided, before a balance); 16 are the missing
  scoped contracts.
- Focused green **94 pass**. Affected regression **34 suites / 1,788 tests pass**. Five existing
  fixtures stubbed the retired global create and sender and now stub the scoped
  contracts: mobile quote, attachment ownership, the gap-13 regression, the served
  recipes, and the shared trades fake.
- Fresh actual PostgreSQL 16.10 **34 pass / 0 fail**: refusals writing nothing;
  projection; prospect, row and history committed together; history failure rolling
  back the prospect and the row for every create; document and linked-quote rules;
  archived clients; the balance's sum, channel, due date and split switch; its six
  refusals; eight sends through one deposit and four rounds through two deposits of
  one quote each making one balance; eight mixed creates for one client; both
  delivery records and their refusals and rollback; 16 waited races (client,
  document, linked quote, deposit, reparent, paid and voided state); invalid scopes.
- Mutation check, on a scratch copy only: **49 of 49 planted defects caught**
  (unmutated control 34 pass / 0 fail). All 42 storage defects fail both the actual
  PostgreSQL verifier and the SQL-capture unit test; the 7 service defects fail the
  service test (the verifier does not exercise the services). Two checks were added
  to the verifier for it first: sends through two paid deposits of one quote still
  make one balance (this is what proves the client's lock; one deposit's own row
  lock would hide it), and a quote stamped with another business under an owned
  client belongs to neither. The working tree was never edited by the check.
- Typecheck, production build and unstaged/staged whitespace pass. Inventories:
  **187 registrations / 0 unclassified / 0 gaps; 250 storage contracts** (242
  declared, 8 inherited).
- **Full server: 159 suites / 3,942 tests pass**, exit 0, 692.166 seconds, run on
  `9b124dea` with a clean tree. No source change during the run. No new client or
  browser run is claimed.

Phase handoff record:

- Scope/files: 18 paths in `9b124dea` (`git show --stat 9b124dea`): storage,
  routes, the trades delivery module, route facts/policy/review, the shared trades
  fake, four updated fixtures, the inventory test, three new tests, the SQL verifier
  and both generated inventories.
- Migrations/target: no repository migration or application target. The existing
  runner through 0031 only on new empty `taptpay_s4_verify_create_*`, loopback 55523,
  and the mutation databases on loopback 55533. Preflight: 0 pre-existing application
  tables, 0 upload inventory entries.
- Commands/logs: red and green focused runs, the affected run, `npm run test:server`,
  the creation SQL verifier, the mutation script, typecheck/build, both generators,
  whitespace. Synthetic logs under `.local/claude-scratch/session-2026-10-03/`
  (git-ignored; no application rows or contact data).
- Negative/effect proof: a refused create leaves no prospect, row or history and
  sends nothing (HTTP refusal-effect observer; SQL counts). Post-send refusal is
  explicitly uncertain, not a claim of zero messages. Stubbed email, WhatsApp and
  SMS; the SQL verifier sends no messages.
- Provider/UAT, devices, external actions, deploy: none. No app DB/provider, live
  migration, client UI, flag or payment-mode change, push or deployment.
- Security/privacy: reviewed input projection, joined scope, lock order (client,
  then invoice or deposit, then quote and document under share locks), history
  rollback and response disclosure. Independent final review still owed.
- In-flight: none. Every disposable PostgreSQL was stopped and deleted by the
  command that started it.
- Rollback/constraints: no rollback commit; fix forward without restoring global
  authenticated operations. No schema or data migration to undo.
- Approvals/stops: the S4b2 preflight and separate reread approve exactly this scope
  on `394da7d6`; `51e0b186` adds documentation only. Owner continuation authorization
  persists. No application, provider or production gate was crossed.
- Deferred/next: a customer's acceptance of a quote makes its invoice in the public
  lane without the client's lock, so one landing beside a balance send is not counted
  in that balance (R3). A deposit's amount is still the one typed; hidden prospects
  are still never removed; an archived client can still be quoted and invoiced
  (recorded findings). S4c recurring invoices; S5 settings/exports; S6 uploads;
  Apple; R1-T10. External, device and review gates remain.
