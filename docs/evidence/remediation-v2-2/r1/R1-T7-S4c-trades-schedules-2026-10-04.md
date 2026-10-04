# R1-T7 S4c — trades recurring invoices

Exact branch `remediation/r1-continuation-20260907`, code `df54069e`, base `22628b95`.
[Preflight and separate reread](../../../PLAN-2026-10-03-r1-t7-s4-trades.md).
S4c is code-complete, and with it the S4 engineering scope (S4a, b1, b2, c);
independent review is owed. R1-T7 and R1 remain active. Owner October 3
authorization directs continuation.

Four registrations moved: the recurring-invoice list, create, edit (pause, resume,
amount, frequency, channel) and cancel. The create locks the business's own client,
refuses an archived one under that lock, and commits the row, first run on its start
date, with its `schedule_created` history. Edit and cancel find their candidate, lock
the owned client, then the row by id, business and that client, recheck the
cancelled state, and commit with their history. Fields are projected at runtime:
amount, frequency, channel, and active or paused only. A resume's next date is
worked out from the locked row and the frequency asked for, by the existing cycle
rule (owner decision 2026-09-27: the paused time is skipped).

An archive and a create at the same moment can no longer leave an archived client
with a live recurring invoice: the create either commits first and is cancelled by
the archive, or waits and is refused. This closes the gap S4a's evidence recorded.

The cycle functions moved, unchanged, to a pure module (`server/trades-schedule.ts`)
so storage can use them without importing the cron; the cron re-exports the one the
routes used. The global create and read had no other caller and are retired. The
cron keeps its due list and its globally keyed advance and end-of-term cancel, and
takes none of these locks.

With this batch every signed-in trades registration (25) names the signed-in
business to storage. A test pins that none of them calls a globally keyed trades
method; those remain for the public quote link, checkout, provider completion, the
WhatsApp status callback and the cron.

Verification:

- Original red, on `22628b95` before any production edit: **43 of 43 fail** — 32
  storage, 11 HTTP. Eight HTTP ones are real: a client moved or archived after the
  lookup still got a recurring invoice (201); a row or its client moved, or the row
  cancelled, after the lookup was still edited or cancelled (200); and a resume was
  worked out from the route's stale read. Three are the missing scoped contracts.
- Focused green **43 pass**. Affected regression **36 suites / 1,833 tests pass** (run before the one added
  storage test, which then passed alone, 33 of 33),
  with the existing recurring-invoice, archive and cron tests unchanged.
- Fresh actual PostgreSQL 16.10 **21 pass / 0 fail**: projection and first run;
  foreign, missing and archived refusals; scoped reads and lists including a row
  stamped with another business; list order; editable fields and their three event
  kinds; resume dates; repeat cancel and no edit after it; archive leaving nothing
  live; history rollback for create, edit and cancel; twelve rounds of archive
  beside create; a create waiting for an archive; seven waited ownership and
  reparent races; a waited cancel; a resume waiting for an advance; invalid scopes.
- Mutation check, on a scratch copy only: **26 of 26 planted defects caught** after
  three were rerun. The first pass left one survivor (a monthly recurring invoice
  losing its start date's day on resume) and showed one verifier check to be
  order-dependent (a history line's time is its transaction's start). Added a
  deterministic fake-clock test and two verifier assertions, made that check
  order-free, reran the verifier five times (21 of 21 each), then the three mutants:
  all caught by both. One mutant in the pure cycle module is caught by unit tests only.
- Typecheck, production build and unstaged/staged whitespace pass. Inventories:
  **187 registrations / 0 unclassified / 0 gaps; 252 storage contracts** (244
  declared, 8 inherited).
- **Full server:** started on `df54069e` with a clean tree, but this session reached its usage limit
  before the result could be read. **Not claimed.** Its log is
  `.local/claude-scratch/session-2026-10-03/full-server-s4c.log` (last line `server exit <code>`);
  read it, or rerun `npm run test:server`, before relying on this batch.

Phase handoff record:

- Scope/files: 13 paths in `df54069e` (`git show --stat df54069e`): storage,
  routes, the new pure cycle module, the cron, route policy/review, the shared trades
  fake, the inventory test, two new tests, the SQL verifier and both generated
  inventories.
- Migrations/target: no repository migration or application target. The existing
  runner through 0031 only on new empty `taptpay_s4_verify_schedules_a`, loopback
  55524, and the mutation databases on loopback 55534. Preflight: 0 pre-existing
  application tables, 0 upload inventory entries.
- Commands/logs: red and green focused runs, the affected run, `npm run test:server`,
  the recurring SQL verifier, the mutation script, typecheck/build, both generators,
  whitespace. Synthetic logs under `.local/claude-scratch/session-2026-10-03/`
  (git-ignored; no application rows or contact data).
- Negative/effect proof: a refusal changes no client, row or history and sends
  nothing (HTTP refusal-effect observer; SQL snapshots).
- Provider/UAT, devices, external actions, deploy: none. No app DB/provider, live
  migration, client UI, flag or payment-mode change, push or deployment.
- Security/privacy: reviewed input projection, scope predicates, lock order (client
  before row, as the archive), history rollback and response disclosure.
  Independent final review still owed.
- In-flight: none. Every disposable PostgreSQL was stopped and deleted by the
  command that started it.
- Rollback/constraints: no rollback commit; fix forward without restoring globally
  keyed authenticated writes. No schema or data migration to undo.
- Approvals/stops: the S4c preflight and separate reread approve exactly this scope
  on `9b124dea`; `22628b95` adds documentation only. Owner continuation authorization
  persists. No application, provider or production gate was crossed.
- Deferred/next: the cron's globally keyed advance landing beside a signed-in pause
  or resume is unchanged (R3/R6). S5 settings/exports, S6 uploads, Apple, R1-T10;
  the S5 starting facts are in `docs/HANDOFF-2026-10-04-r1-t7-trades.md`. External,
  device and review gates remain.

The S5 starting query (read-only; run from the repository root):

```
node --import tsx -e '
import { currentRouteFacts } from "./server/route-facts";
import { ROUTE_REVIEW } from "./server/route-review";
import { storageContract } from "./scripts/generate-tenant-storage-inventory";
const contract = new Map(storageContract().map(m => [m.name, m.requiredTenant]));
for (const [key, fact] of currentRouteFacts()) {
  if (!ROUTE_REVIEW[key]?.branches.some(b => b.principal === "merchant")) continue;
  const unscoped = fact.storageMethods.filter(name => contract.get(name) === false);
  if (unscoped.length) console.log(key, "->", unscoped.join(", "));
}'
```
