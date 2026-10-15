# R1-T7 S3c2 — property invoice creation and authenticated delivery

Exact branch `remediation/r1-continuation-20260907`, code `1b80cb8d`, base `5f532095`.
[Preflight and separate reread](../../../PLAN-2026-10-03-r1-t7-s3-property.md).
S3 engineering scope is code-complete across S3a/b/c1/c2; independent review is owed.
R1-T7 and R1 remain active. Owner October 3 authorization directs continuation.

Creation/reuse locks the owned profile, projects runtime fields, mints a server token,
rechecks attachment ownership under a share lock, and commits new invoice/history
together. Authenticated concurrent rent creates serialize. Charges remain separate;
latest-charge/new-rent and amount-only rent reuse behavior are preserved. Archived
profile behavior is preserved. The unused global live-invoice lookup is retired.

Manual send uses an explicit merchant service and a joined invoice/current-profile
snapshot after the other awaited prerequisites. Delivery uses the captured owned
contact and keeps current rendering and channel fallbacks. Network calls hold no DB
locks. Its delivery record locks parent then invoice, rechecks original parent,
ownership and current settled state, projects metadata, derives status from the
locked row, and saves delivery history in the same transaction. The unscoped manual
resend export is retired. Internal cron/provider/public lanes remain explicit.

A snapshot authorizes a point-in-time message; later concurrent changes cannot
erase that external effect. Provider uncertainty or refused/failed post-send
record returns fixed reconciliation-required 503 with no invoice DTO. Known send
failure behavior stays; create's final invoice response uses scoped storage.

Verification:

- Original red: **14 storage + 13 delivery-service + 3 genuine HTTP race failures**.
  The HTTP tests intercept the existing global reader as well as the new reader.
- Focused storage/service green **27 pass**; original HTTP races **3 pass**.
  Added create/resend 503 guards and final-response scope-loss checks afterward.
- Affected regression **20 suites / 562 tests pass**. Shared fixtures and attachment
  assertions now require the explicit merchant arguments. Side-effect extraction
  records the renamed service; final regenerated inventory is consistent.
- Fresh actual PostgreSQL **24 pass / 0 fail**: eight parallel rent creates, separate
  charges, projection, filtered ownership, preserved archive/dedupe rules, real
  event rollback, document reassignment wait, waited reuse ownership/reparent/paid
  changes, and waited delivery ownership/reparent/settlement/current-overdue changes.
- **Full server: 151 suites / 3,771 tests pass**, exit 0, 553.255 seconds, after final
  production/fact changes. No source mutation during the run; later edits were
  preflight documentation only. No new client/browser run is claimed.
- Final typecheck, production build and unstaged/staged whitespace pass.
  Inventories: **187 registrations / 0 unclassified / 0 gaps; 237 storage contracts**.

Phase handoff record:

- Scope/files: 17 paths in `1b80cb8d`; storage, routes, manual delivery, route facts/
  policy/review, shared/attachment/served fixtures, three tests, SQL verifier, preflight
  and both generated inventories (`git show --stat 1b80cb8d`).
- Migrations/target: no repository migration or application target; existing runner
  through 0031 only on fresh empty `taptpay_s3_verify_invoices_send`, loopback 55519.
  Preflight: 0 pre-existing application tables, 0 upload inventory entries.
- Commands/logs: focused red/green, 20-suite affected run, `npm run test:server`,
  invoice-send SQL verifier, typecheck/build, both generators, whitespace. Synthetic
  logs `/tmp/taptpay-s3c2-*`; no application rows/contact/provider IDs printed.
- Negative/effect proof: pre-send scope/state refusals change no invoice/history and
  call no delivery; post-send refusal/exception is explicitly uncertain, not a claim
  of zero messages. Stubbed email/WhatsApp/SMS; SQL verifier sends no messages.
- Provider/UAT, devices, external actions, deploy: none. No app DB/provider, live
  migration, feature/payment-mode change, push or deployment. Build/Jest retain
  existing chunk/browser-data/configuration warnings.
- Security/privacy: reviewed input projection, joined scope, lock order, history
  rollback and response disclosure. Independent final review still owed.
- In-flight: no test run remains. Disposable PostgreSQL stays running for active S4
  verification only; must stop before handoff. No real operation to reconcile.
- Rollback/constraints: no rollback commit; fix forward without reintroducing global
  authenticated operations. No schema/data migration to undo.
- Approvals/stops: preflight and separate reread approve exactly c2 on `5f532095`;
  owner continuation authorization persists. Application/provider/production gates
  were not crossed. S3c1 evidence remains separate.
- Deferred/next: partial-split/open-session amount editing, provider completion races
  and cron cross-lane idempotence remain explicit R3/R4 work. Continue S4 trades,
  S5 settings/exports, S6 uploads, Apple and R1-T10; external/device/review gates remain.
