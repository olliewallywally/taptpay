# TaptPay structure repair plan

Prepared 2026-10-17. The owner authorised publishing this plan and starting it
on October 17. Codex owns S0/S1; Claude retains R4. This is the planning baseline;
implementation progress is recorded in [the execution ledger](EXECUTION.md). Reviewed checkout: `remediation/r8-ci-20261016` at
`df33a139a8e887f90498ee51445a917ef6e3a018`.

## The simple explanation

TaptPay has important safety controls and tests already. Some large files contain
too many different jobs, which makes future changes harder to understand and
review. We should move each business area into a clear home, a small piece at a
time, while checking that customers see the same behaviour.

Qwen identified that structural problem, but reviewed a September 29 snapshot.
Many of its security fixes already exist. Its example payment service would
contact the provider before saving durable payment intent; we must not copy it.
Its claim that eight fixes make the app production-ready is unsupported.

The plan therefore has three tracks: safer structure, the existing R8 cleanup,
and real release evidence. Start independent work in parallel; do not make safe
refactoring wait for external approvals. Releasing real payments still requires
all applicable existing approvals and evidence.

## What was verified

| Area | Current finding | Treatment |
| --- | --- | --- |
| HTTP routes | `server/routes.ts`: 7,135 lines / 377,410 bytes. | Confirmed concentration; extract reviewed business domains. |
| Storage | `server/storage.ts`: 10,178 lines / 485,348 bytes. | Larger than Qwen reports; separate domain ports and implementations while preserving atomic commands. |
| Frontend | Property terminal 1,918 lines; mobile merchant terminal 1,727; settings 1,720; other large screens. | Extract controllers, views and types within the existing feature structure. |
| Services | Durable checkout, billing, notification, delivery, runtime and repository interfaces already exist. | Reuse them; extract remaining inline responsibilities. |
| Named security leftovers | Retired merchant middleware, JWT fallback, IPv6 limiter, audit logger, Tap to Pay validation, cash command, base64 and OAuth claims are largely stale. | Preserve actual controls and regression coverage; do not recreate retired code. Proxy topology still needs actual-target verification. |
| API/errors | `/api/v1` exists for ecommerce; a safe global error handler exists; request typing and some internal error paths still vary. | Improve boundary types and internal mappings without changing existing URLs or JSON contracts. |
| Documentation | Root README is absent; LINTING.md contains stale commands/advice. | Add a truthful entrypoint and repair current instructions. |
| Tests | Existing browser, contract, SQL and injected-failure tests are substantial. | Identify the remaining SQL-backed journey and capacity gaps, rather than claim no such tests exist. |

See [the findings register](QWEN-FINDINGS-REGISTER.md) for the report's 28
recommendations, the specific alleged vulnerabilities and source anchors.
No new full test suite was run for this planning review. The latest recorded
acceptance is 6,772 tests, 328 browser cells plus four map proofs, 25 PostgreSQL
stages and 13 static stages, on the source named by the October 17 handoff.

## Authority and limits

This supplements the existing [remediation plan](../../../docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md),
[current handoff](../../../docs/HANDOFF-2026-10-17-r8-closeout.md) and
[R8 closeout checklist](../../../docs/operations/r8-closeout-checklist.md).
It does not replace recorded owner decisions, approve production, close R8 or
claim that the current structure alone proves an exploitable defect.

- Keep the Replit/Neon deployment model, Node pin, lockfile and Neon WebSocket
  adapter. No Kubernetes, Redis, Turborepo, microservice or React Native migration.
- No new product feature, payment method or redesign. Preserve cookie/CSRF
  authentication, tenant/role checks, D10 feed-under-dock, device gating, tutorials,
  direct lazy page imports, and locked D13.
- Preserve frozen migration names/checksums/paths; no schema change is needed for
  this structural refactor. Any genuine schema need becomes a separate review.
- Preserve durable intent before provider sends, stable identities, uncertain
  result handling and exactly-once financial/event/outbox effects.
- Preserve public paths, route order, status codes, JSON shapes, headers, cookies,
  parsing/rate-limit order and denial side effects. A separate evidenced bug fix
  may deliberately change a contract only through its own reviewed scope.
- Claude retains R4. Refund changes wait for Claude's reviewed integration.
- A universal 500-line cap, arbitrary test ratios, package rebranding and fixed
  launch/certification dates are not acceptance criteria.

## Intended structure

Use domain modules inside the current application, not a second application.
The exact files below are created only where responsibilities justify them.

```text
server/
  app.ts                         # existing HTTP pipeline
  routes.ts                      # ordered composition / compatible entrypoint
  storage.ts                     # compatible facade during migration
  domains/
    stock/
      routes.ts                  # parsing, auth, HTTP responses
      contracts.ts               # narrow dependency/input/output types
      postgres-repository.ts     # scoped persistence when extracted
      memory-repository.ts       # supported memory behaviour
    property/                    # profiles, schedules, then invoice commands
    trades/                      # clients, schedules, then quote/invoice commands
    merchants/                   # settings, team and reporting
    auth/                        # later sensitive extraction
    payments/                    # existing durable services, moved only safely
    subscriptions/               # existing durable card/billing commands
client/src/
  features/                      # extend existing feature homes
  desktop/                       # retain separate desktop shell/lazy pages
  lib/                           # existing transport and shared money helpers
shared/                          # existing browser-safe contracts
```

Do not create an empty service class for a simple read. Where a business command
already exists, the route calls it. Where it does not, extract a typed command
only when its responsibility and transaction boundary are clear.

## Ordered work packages

Each numbered package is split into small, independently reviewable commits.
No package is permission for an all-at-once rewrite.

### S0 — Establish the map and owners

**Owner:** Codex/integration reviewer. **Dependency:** none.

- Record actual local/remote source, dirty work, Claude's integration boundary and
  existing verification results before implementation.
- Map each route to its owner, security policy, handler, service, storage command,
  background/provider effects, clients and tests. Map important import cycles and
  module-scope state, including limiters, caches, timers and auth/storage loading.
- Create a task ledger with exact paths, owner, dependencies, acceptance tests,
  evidence and rollback unit. Keep the Qwen disposition register linked.
- Start arranging provider UAT, restored-backup, device and operations evidence
  now. Scheduling those checks must not wait until the final refactor is done.

**Done when:** there is a reviewed source/dependency/route map and a narrow first
pilot. Existing R8 and owner gates remain explicitly open.

### S1 — Make the safety checks understand multiple route files

**Owner:** Codex/integration reviewer. **Dependency:** S0. **First coding task.**

Change the route inventory, route-fact analysis, generated contracts and test
harness before moving any real domain:

- Extend the explicit registration manifest in `server/route-inventory.ts` and
  the real production/test assembly checks. Discovery remains fail-closed.
- Extend `server/route-facts.ts` so extracted helpers and existing payment
  handler factories cannot disappear from security/effect analysis after a move.
- Adapt source-reading assertions to inspect the real implementation. Keep
  runtime and generated route/parameter/policy checks as independent evidence.
- First demonstrate failures for an unlisted registrar, missing route, duplicated
  registration, changed order, lost guard and lost side effect. Generated policy
  snapshots alone are not sufficient.
- Start with `registerDomainRoutes(app, deps)` on the same guarded Express app.
  Keep `installAsyncRouteGuard` ahead of all registrations. A standalone Router
  would need its own guard and reviewed mount/runtime traversal; it is unnecessary
  for the first extraction.

**Done when:** deliberate omissions fail and the unchanged application still
passes inventory, runtime policy, async-error, contract and relevant HTTP tests.

### S2 — Prove the method with stock management

**Owner:** Codex. **Dependency:** S1.

- Extract only the four stock routes currently at `server/routes.ts:4682` onward.
- Inject a narrow typed stock port, the existing ownership/auth helpers and
  shared instances. Do not create fresh rate buckets or duplicate auth rules.
- Keep the original registration location and order, strict IDs, validation,
  tenant-scoped reads/writes and exact success/error responses.
- Run existing stock HTTP/storage, policy and strict-parameter checks plus the
  owned stock PostgreSQL verifier. Compare before/after behaviour.
- Write the short extraction recipe and rollback before selecting the next area.

**Done when:** every stock route has the same reviewed behaviour, its policy and
effects remain visible, and the domain no longer lives inline in routes.ts.

### S3 — Extract the remaining ordinary business domains

**Owner:** Codex; integration owner serializes shared-file edits. **Dependency:** S2.

Recommended order, one cohesive slice at a time:

1. Property profiles and schedules, keeping invoice financial commands separate.
2. Trades clients and schedules, keeping quotes/invoice financial commands separate.
3. Merchant settings, team, tutorial state and notifications/preferences.
4. Admin reporting and document/upload delivery, preserving owner/member/admin,
   scanner, path ownership, redaction and outbound delivery controls.

Extract contiguous registration blocks at their existing positions. If a domain
is interleaved, use more than one small registrar initially; do not reorder all
routes by folder name. Preserve ambiguous/static/parameter path precedence.

Type each new boundary and preserve its wire/error mapping within the slice.
Services own business rules; route handlers keep HTTP concerns. Reuse existing
commands rather than create generic alternatives.

**Done when:** every moved block has a narrow dependency contract, preserved
source/runtime policy, existing HTTP/security and relevant owned SQL proofs, and
an independent review. No new cycles or hidden module-level side effects.

### S4 — Reduce storage.ts by domain without splitting transactions

**Owner:** Codex/integration reviewer. **Dependency:** the corresponding S2 or S3
boundary, not necessarily completion of every S3 domain.

- Define domain-specific ports from the existing IStorage contract. Preserve
  current imports/exports and IStorage as compatibility facades during migration.
- Extract the memory and PostgreSQL implementations together where behaviour is
  shared. Preserve explicitly unsupported memory behaviours; do not pretend
  MemStorage supplies production persistence or every SQL feature.
- Move whole transaction-owning commands: state change, locks, idempotency record,
  event/history and outbox remain on the same database transaction/connection.
- For cross-domain commands, pass a typed transaction-scoped dependency or retain
  the command centrally until its boundary is proven. Do not replace it with
  independent CRUD calls or nested transactions.
- Inject the existing database/encryption dependencies. Keep provider I/O outside
  financial database transactions and preserve the existing durable send process.

**Done when:** each extracted domain has actual memory/SQL parity where supported,
unchanged tenant/constraint/locking/replay behaviour, fault rollback and race
proofs, compatible exports, and no new migration.

### S5 — Extract authentication and money flows last

**Owner:** Codex; Claude owns R4. **Dependency:** S1 and the proven extraction
recipe; use S4 ports where ready. Refund work additionally requires accepted R4.

Separate sensitive slices for auth/session/OAuth, retail/cash, property/trades
invoice checkout, subscriptions, public returns/receipts, provider notifications,
and finally integrated refunds. Do not move all of them in one patch.

- Keep existing durable checkout, billing/card, inbox/outbox, reconciliation and
  delivery services. Preserve intent/expected values before send, stable X-ID,
  unknown-result hold/reconcile and one committed financial/delivery outcome.
- Keep the cash command's UUID, exact cents, actor, tenant and atomic effects.
- Preserve session-cookie precedence, CSRF, timing floors, revocation, OAuth
  browser binding/return hosts and shared throttles.
- Keep feature refusal/tombstone routes, their no-effect behaviour, locked Tap to
  Pay and disabled ecommerce capability. Do not expose a capability while moving it.
- Keep the exact bounded provider parsers and method handling. Authenticated
  route refactoring must not change notification ACK/durable receipt semantics.
- Cover duplicate/concurrent callbacks, lost replies, crashes/restarts, stale
  leases, transaction failure and retries through the actual moved services.

**Done when:** relevant existing HTTP, SQL, provider-fake/no-effect, concurrency and
recovery suites pass on the new source. Refund evidence includes Claude's accepted
integration. Actual provider UAT is still a separate release gate.

### S6 — Simplify frontend features and remaining cross-cutting contracts

**Owner:** frontend engineer/reviewer. **Dependency:** S0; ordinary presentation
work can run independently after file ownership is allocated. Payment-screen
extraction waits for the relevant characterised backend boundary.

- Pilot one non-payment Settings section. Extract its controller hook, typed
  input/output data and presentational view without redesigning it.
- Then split large property/trades/retail screens by existing sub-screen and
  controller boundaries. Keep device-specific presentation separate where needed.
- Preserve the existing queryClient cookie/CSRF/idempotency transport, query keys,
  invalidations, loading/error/retry states, tutorial identifiers, focus handling,
  motion preferences, money calculations and D10 feed-under-dock.
- Preserve direct lazy desktop imports and chunk recovery. Do not add eager page
  barrels that make phones download the desktop application.
- Replace remaining unsafe `any` at boundaries with existing schema-derived
  types or unknown-plus-validation. Document the existing application/public API
  distinction and version/deprecation policy; do not rename every /api URL.
- Mixed JSX/TypeScript is not itself a defect. Convert an isolated module only
  where its typed boundary needs it; avoid repository-wide extension churn.
- Consolidate internal error mapping while preserving current response shapes,
  status codes and safe disclosure. Breaking contracts require separate design.

**Done when:** component/transport/route-contract checks and affected four-context
browser/tutorial/chunk checks pass; no visual redesign, hidden feature enablement
or golden refresh; complete generated web/native parity is recorded when affected.

### S7 — Demonstrate the missing integrated and scale evidence

**Owner:** test/backend engineer with operations/provider/device reviewers.
**Dependency:** map gaps at S0; add baselines early; final combined run follows S3–S6.

- Map critical journeys to existing checks and explicit fixture boundaries.
- Add an owned disposable SQL-backed browser journey, beginning with login and
  invoice creation, then payment confirmation/receipt with an injected provider.
  Keep real Windcave UAT separate; local tests must never issue real charges.
- Add bounded synthetic load for representative reads, creation commands,
  reconciliation/outbox and cron contention. Agree workload and latency/error/lock
  targets from actual expected use, not invented transactions-per-second numbers.
- Extend existing crash/network/database fault tests only where the map shows a
  gap. Measure domain coverage if useful; test totals are not coverage percentages.
- Execute all CI stages with actual nonzero counts and the final SHA/lock. Keep
  full audit/history failures visible; separate their release blocking status from
  acceptance of an otherwise verified structural patch.
- Obtain actual hosted CI/branch-protection evidence; activate existing logging,
  probes and alert delivery with named operators and a tested recovery procedure.
- Finish actual-target backup/restore/decryptability/locks, provider UAT, devices,
  native builds, professional legal/accounting/provider and final release checks.
  Backups and recovery are prerelease requirements, not optional work after launch.

**Done when:** the final candidate has linked evidence for its tests and all
applicable release gates. Passing structural checks alone does not close R8.

## Parallel R8 cleanup track

Start these alongside S0/S1 on disjoint files. Do not let broad lint cleanup race
the owner extracting routes.ts or storage.ts.

| ID | Work | Owner / closing evidence |
| --- | --- | --- |
| H1 | Add accurate root README; correct LINTING.md and stale navigation. | Engineering; documented commands match package scripts; no PCI/production-ready claims. |
| H2 | Burn the 558 reviewed lint findings in small domain/rule groups. | Engineering; zero new errors; remove only actually resolved baseline rows; preserve initialization, hooks and business wording. |
| H3 | Classify remaining probes, scaffolds, images/fonts, archives and configs before exact removal/relocation. | Engineering + design/privacy/licensing owners; actual consumers and approved retention/storage. Keep needed design/evidence/guidance and generated snapshots. |
| H4 | Resolve the single unpatched development advisory affecting 39 packages. | Engineering/security; verified upstream fix or safe consumer removal with fresh consumer/install/build proof; no fictional fixed version or waiver. Production audit zero does not clear full audit. |
| H5 | Review 121 historical candidate occurrences across 55 review triples. | Service owners/security; sanitized replacement/revocation or exact false-positive evidence and repeated scans. Not 121 confirmed live credentials. |
| H6 | Confirm email provider; obtain actual delivery/retry evidence; remove only proven unused alternatives. | Owner + engineering; Resend remains the recommendation, not an assumed decision. |
| H7 | Verify real proxy topology, hosted checks and operations activation. | Maintainer/operations; approved hops plus spoof/IPv6 evidence, actual alerts and recovery. Preserve current warnings and minimal public probes. |

## Rules for every code slice

1. Name exact scope, files, owner, dependency and rollback unit. One integration
   owner edits shared composition/storage facades and generated policy files.
2. Perform the master-plan ten-heading preflight and independent reread. Write
   meaningful failing characterization/security tests before a behaviour fix.
3. Make the smallest coherent move. Keep contract/security/transaction changes
   separate from file movement unless the combined change is explicitly reviewed.
4. Run relevant existing types, lint, route/security/HTTP tests immediately; run
   owned PostgreSQL proof for persistence changes and affected browser checks for
   client changes. Do not wait until the end to discover a lost guard or race.
5. Keep original useful tests and adapt where they locate the implementation;
   retain mutation/completeness checks. Do not delete assertions, increase
   deadlines, refresh goldens or weaken rules merely to make the move pass.
6. Review the diff independently, record new source/lock/result evidence and
   rollback, then commit explicit paths. Revert a failed slice before stacking more.
7. Run the complete relevant matrix at integration milestones and final freeze.
   No fresh pass is inferred from the old 6,772-test record after source changes.

## Completion and next action

Structure is improved when routes.ts is an understandable ordered composition,
storage.ts delegates through typed domain boundaries, large screens have coherent
controllers/views, and security/transaction behaviour remains visible and tested.
Use responsibility, dependency clarity and reviewability as measures; generated
schema/policy/data files need not satisfy an arbitrary file-length ceiling.

The first implementation package is **S1: module-aware route safety checks**,
followed by **S2: the four-route stock pilot**. H1 can be completed in parallel.
Claude continues R4 on its own scope. Estimate later batches after the pilot's
actual dependency and verification cost; the report's four-week launch and
certification timelines are not a reliable schedule.
