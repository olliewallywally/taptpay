# R1-T7 S3c1 — property invoice reads, void and external payment

Code `ff237d24`, base `c250343f`, branch `remediation/r1-continuation-20260907`.
[Preflight and separate reread](../../../PLAN-2026-10-03-r1-t7-s3-property.md).
Code complete; independent review remains owed. S3c2 and the remaining R1 work
continue under the owner's recorded October 3 authorization.

Invoice reads and lists require both invoice ownership and current parent-profile
ownership in their SQL predicates. List name/address enrichment is scoped too.
Void and external-payment recording use specific merchant-required contracts,
lock parent then child, recheck current identity and payment state, and save the
fixed invoice changes and history in one transaction. History failure rolls back
the write. A moved/reparented row returns the same result as a missing one.

Archived profiles retain their issued invoices and these operations, as the owner
decided September 27. Repeated voiding remains allowed; paid invoices refuse both
operations, and an externally paid request cannot resurrect a voided invoice.
Owner/member authority, validation order, messages and DTOs are preserved. Memory
property support stays DB-only. Global creation/provider/cron/public lanes remain
for S3c2 or their separately reviewed scopes. No schema or client changes.

Verification:

- Red first: **14 storage tests fail; 7 HTTP race tests fail** against the committed
  base. HTTP races intercept both old and new reader names so the failures exercise
  the actual existing global lookup, including unchanged storage/history assertions.
- Focused green: **14 storage + 7 HTTP pass**.
- Final affected regression: **17 suites / 528 tests pass**, including property,
  trades null-reference compatibility, owner/member served routes, attachments,
  role defaults and all inventory/policy checks.
- Fresh actual PostgreSQL: **18 pass / 0 fail**. Scoped/filtered reads, archived
  issued invoices, state refusals, real trigger-induced history rollback, concurrent
  void/manual payment, and actual lock waits for child/parent ownership, reparenting,
  paid/externally-paid/voided changes. Refusals preserve every other field and history.
- `npm run check`, `npm run build`, unstaged/staged whitespace pass.
  Regenerated inventories: **187 registrations / 0 unclassified / 0 gaps;
  235 storage contracts**. No full-server/client/browser run is claimed for c1.

Commands: focused red/green `--runTestsByPath`, the 17-suite affected run,
`scripts/verify-tenant-property-invoices-postgres.ts`, typecheck/build and both
inventory generators. Synthetic logs: `/tmp/taptpay-s3c1-*`.

No application database/provider, live migration, feature enablement, push or
deployment. Only a fresh empty synthetic database on the disposable loopback
PostgreSQL server was migrated. That server stays running for the next S3c2
verification in this active turn and must stop before handoff. Existing build
chunk/browser-data and Jest configuration warnings remain.

Rollback: fix forward without reintroducing globally keyed authenticated writes.
Review focus: current-parent SQL predicates, parent-before-child locks, post-wait
identity/state checks, atomic history, archived-profile and repeated-void behavior.
The split-paid void/manual-paid and in-flight provider completion concerns remain
explicit R3/R4 findings; this batch does not redesign payment semantics or close R1.

Next: S3c2 atomic authenticated creation/reuse and scoped delivery; S4–S6, Apple
implementation and R1-T10 acceptance. Independent and external/provider/device
gates remain explicit.
