# R1-T7 S4a — trades client profiles, archive cascade and history

Exact branch `remediation/r1-continuation-20260907`, code `22c6dc9c`, base `c5260cc1`.
[Preflight and separate reread](../../../PLAN-2026-10-03-r1-t7-s4-trades.md).
S4a is code-complete; independent review is owed. S4b (quotes/invoices), S4c
(recurring invoices), R1-T7 and R1 remain active. Owner October 3 authorization
directs continuation.

**Recovery.** The implementation was drafted in the preceding (Codex) session and
left uncommitted: ten changed files and three new ones, with no check recorded. Its
temporary logs and disposable PostgreSQL did not survive the environment reset. This
session treated the tree as an unverified draft: reread it against the preflight,
replayed its tests on the committed base, repeated every check below, regenerated the
stale storage inventory, and only then committed. Nothing in this record is carried
over from the earlier session's memory.

Authenticated client management names the signed-in business to storage, and storage
checks it in the statement that reads or writes: create, read, update, archive,
restore, promote and client history. Create and update project the seven editable
fields at runtime; identity, ownership, status and archive metadata cannot be
injected, and create takes only the server's `active` or hidden `prospect`. Archive
changes the owned client, cancels only its own live recurring invoices and saves each
cancellation's history in one transaction (owner decision 2026-09-27); a history
failure rolls the whole archive back. Restore does not restart them; issued invoices
stay payable. Promotion rechecks ownership and the current `prospect` status under a
row lock. History needs the event's and the current client's ownership in one query.

The five global client mutators and the global history reader are retired from the
storage contract. The global profile read remains for the public quote, checkout,
PDF, delivery and provider lanes, which S4b reviews separately. The hidden prospect
made by a quote or quick invoice now uses the explicit-merchant create.

Verification:

- Red, replayed here on `c5260cc1` (an archived copy of the committed tree, with only
  the two new test files added): **23 of 23 fail**. 17 storage (the contracts do not
  exist); 6 HTTP, each a real defect: update, archive, restore and promote of a client
  moved to another business after the route's lookup returned 200 and wrote it; its
  history returned the moved client's events; promotion of a client archived after
  the lookup returned 200.
- Affected regression **28 suites / 1,641 tests pass** (trades batch, quote, split,
  checkout, attachment and WhatsApp suites; the trades, checkout and provider served
  matrices; roles, records, own gates; route facts, policy, review and inventories).
  A first six-suite focused run was 76 of 77: the checked-in storage inventory still
  described S3c2. Regenerated, then the affected run.
- Fresh actual PostgreSQL 16.10 **16 pass / 0 fail**: projection and forced
  tenant/status, foreign and missing equivalence, explicit null clears, archive of
  active and paused schedules with terminated, foreign and other-client schedules
  untouched and the issued invoice preserved, no restart on restore, single
  promotion, scoped history with limits, a real second-history failure rolling back
  the client, both schedules and the first event, four waited ownership races, a
  waited status race, two waited schedule races, and invalid scopes.
- Mutation check, on a scratch copy only: **16 of 16 planted storage defects caught**
  (unmutated control 16 pass / 0 fail). Every one fails the actual PostgreSQL
  verifier; 15 also fail the SQL-capture unit test. The one the unit test cannot see
  is history written outside the transaction, which only the real rollback check
  catches. The working tree was never edited by the check.
- Typecheck, production build and unstaged/staged whitespace pass. Inventories:
  **187 registrations / 0 unclassified / 0 gaps; 239 storage contracts** (231
  declared, 8 inherited). Regenerating the route policy and its table reproduced the
  draft's files byte for byte.
- **Full server: 153 suites / 3,795 tests pass**, exit 0, 679.439 seconds, run on `22c6dc9c`
  with a clean tree. No source change during the run; only scratch drafts outside the
  test roots were written. No new client or browser run is claimed.

Phase handoff record:

- Scope/files: 14 paths in `22c6dc9c` (`git show --stat 22c6dc9c`): storage, routes,
  route policy/review, the shared trades fake, three updated fixtures, the inventory
  test, two new tests, the SQL verifier and both generated inventories.
- Migrations/target: no repository migration or application target. The existing
  runner through 0031 only on new empty `taptpay_s4_verify_clients_a`, loopback
  55521; the mutation run on `taptpay_s4_verify_mut_00`…`_16`, loopback 55531.
  Preflight: 0 pre-existing application tables, 0 upload inventory entries.
- Commands/logs: base replay, 28-suite affected run, `npm run test:server`, the
  client SQL verifier, the mutation script, typecheck/build, both generators,
  whitespace. Synthetic logs under `.local/claude-scratch/session-2026-10-03/`
  (git-ignored; no application rows or contact data).
- Negative/effect proof: every refusal leaves clients, schedules and history
  unchanged and makes no delivery (HTTP refusal-effect observer; SQL snapshots).
- Provider/UAT, devices, external actions, deploy: none. No app DB/provider, live
  migration, client UI, flag or payment-mode change, push or deployment. Build and
  Jest keep their existing chunk-size and configuration warnings.
- Security/privacy: reviewed input projection, scope predicates, lock order
  (client before its schedules), history rollback and response disclosure.
  Independent final review still owed.
- In-flight: none. Both disposable PostgreSQL instances were stopped and deleted by
  the commands that started them.
- Rollback/constraints: no rollback commit; fix forward without restoring global
  authenticated client writes. No schema or data migration to undo.
- Approvals/stops: the S4a preflight and separate reread approve exactly this scope
  on `1b80cb8d`; `c5260cc1` adds documentation only. Owner continuation
  authorization persists. No application, provider or production gate was crossed.
- Deferred/next: a recurring invoice created for a client at the moment it is
  archived can still slip past the archive (the create is a read, then a write):
  S4c locks the owned client for that create. S4b quote/invoice reads, creation and
  delivery; S5 settings/exports; S6 uploads; Apple; R1-T10. External, device and
  review gates remain.
