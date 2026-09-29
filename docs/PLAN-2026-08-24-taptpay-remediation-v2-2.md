# TaptPay remediation execution plan v2.2

Status: proposed replacement for the Qwen 3.8 v2.1 plan
Prepared: 2026-08-24
Repository baseline reviewed: `feat/tablet-desktop-app` at `9a51bd8`
Deployment model: Replit application and Neon PostgreSQL
Data assumption: every production row, upload, backup, credential, and log is live unless an owner proves otherwise

> **Release status: blocked.** Do not enable real payment initiation, refunds, Tap to Pay, ecommerce API access, or production subscription charging merely because this plan exists. Each capability remains disabled until its own exit gate and the final go-live gate are signed off.

## 1. Purpose and authority

This document supersedes the implementation sequence in TaptPay Remediation Plan v2.1. It keeps the sound parts of that plan—sandbox first, historical Stripe columns retained, Windcave query verification, backup/restore proof, fail-closed controls, and staged encryption—but corrects its stale assumptions and fills the release-blocking gaps found in the current repository.

This is an execution plan, not permission to mutate production. A coding agent may change repository code, tests, migrations, and documentation on the remediation branch. It may run local and isolated test commands. It must not rotate production secrets, alter Replit Secrets, create or delete Neon branches, apply production migrations, rewrite Git history, delete retained financial data, contact customers, call live Windcave, or deploy without the named human approval in this plan.

### 1.1 Required reading order for every implementer

Read these files completely before editing:

1. `CLAUDE.md`
2. `AGENTS.md`
3. This plan
4. `docs/PLAN-2026-07-24-tablet-desktop-app.md`
5. `docs/HANDOFF-2026-07-28-tablet-desktop-app.md`
6. `docs/HANDOFF-2026-07-20-onboarding-billing-tutorial.md`
7. `docs/PLAN-2026-08-06-payment-links-no-board.md`
8. `docs/PLAN-2026-08-07-subscription-pricing.md`
9. `docs/PLAN-2026-08-10-finish-review-and-fix.md`
10. `docs/REVIEW-2026-08-15-full-app-review.md`
11. `docs/VERIFY-2026-08-07-tablet-desktop-final-qa.md`
12. `replit.md`
13. `DEPLOYMENT.md`

If an older plan conflicts with this plan, use this plan for remediation order and use the tablet/desktop plan for device and visual behavior. Never reinterpret an old mock or simulator requirement as permission to expose fake money movement.

### 1.2 Repository hygiene

- Preserve unrelated dirty work. At review time, `.claude-home/**`, `.claude/settings.local.json`, and `docs/PLAN-2026-08-23-taptpay-remediation-v2-1-handoff.md` were not part of this task.
- Never run `git add -A` or `git add .`.
- Stage explicit paths only, and always exclude `.claude-home/**` and `.claude/settings.local.json`.
- Never edit an already-applied migration. Add a forward migration.
- Never delete historical financial rows to make a test pass.
- Never refresh a screenshot baseline, allowlist, or expected error merely to make a verifier green. Product approval is required for visual baseline changes.
- Never put secret values, bank data, raw payment tokens, processor session IDs, return state, notification bodies, or customer PII into evidence files or commit messages.

### 1.3 Definition of “done” for a work item

A checkbox is complete only when all of the following are true:

1. The implementation exists; a TODO, stub, simulator, or documentation promise is not implementation.
2. A failing test was demonstrated or the pre-change defect was otherwise captured.
3. Positive, negative, retry, and no-side-effect tests pass as applicable.
4. The relevant database migration was rehearsed on an isolated restored snapshot if it changes schema or data.
5. Logs and API responses expose no sensitive values.
6. Phone, tablet, and desktop regression checks pass when client code changed.
7. The phase evidence record names the commit, commands, results, remaining risks, rollback point, and human approvals.

Create evidence under `docs/evidence/remediation-v2-2/<phase>/`. Commit sanitized text reports and small approved screenshots only. Do not commit database dumps, provider payloads, user invoices, trace archives containing tokens, or raw production exports.

### 1.4 Governance, feature freeze, and engineering principles

- **Feature freeze:** no new vertical, payment method, native capability, redesign, or growth feature enters this branch. Only incident containment, correctness/security fixes, required compatibility work, tests, operations, and truthful documentation are allowed. Scope expansion needs a recorded product/security decision.
- **Decision log:** create `docs/decisions/` and add one immutable dated ADR per D1–D13 change, provider/funds-flow decision, schema choice, retention choice, device-class choice, or exception. Each ADR records context, alternatives, decision, owner, date, consequences, rollback, and linked evidence. Never rewrite an accepted ADR to hide history; supersede it.
- **Review before implementation:** a reviewer performs the template in §21 against the proposed phase, then a second reviewer/pass confirms that every blocking finding is resolved. No remediation implementation begins until the final recommendation is **Approve**. A separately declared production incident may authorize immediate external containment, but it does not silently approve code or broaden scope.
- **Boring over clever:** prefer small typed services, explicit states, database constraints, and observable retries over metaprogramming or implicit fallbacks.
- **Fail fast and fail closed:** invalid target, configuration, state, identity, provider response, or migration stops the operation before side effects.
- **Never trust the client:** authenticate, authorize, validate, and derive tenant/money/provider identity on the server.
- **Money is traceable:** every initiation, state transition, provider identity, refund, reconciliation, and manual correction has an immutable local record and one accountable actor.
- **Reversible changes:** use expansion/compatibility/migration/contract releases, bounded locks, backups, and tested rollback. “Reversible” never means restoring a known vulnerability or reverting encrypted rows to plaintext writes.

## 2. Review of Qwen v2.1

### 2.1 Verdict

Do not approve or implement v2.1 unchanged. It is directionally useful, but it is not safe enough for a lower-capability implementation model. It starts too late, assumes stale migration state, treats missing credentials as a configuration problem while the code treats them as permission to approve fake payments, omits an exploitable cross-tenant delete, misses production demo seeding, and specifies unsafe encryption rollback.

### 2.2 Keep, rewrite, or remove

| v2.1 item | Verdict | v2.2 correction |
|---|---|---|
| Treat production data as live | Keep | Extend this to uploads, logs, Git history, local dumps, and backups. |
| Keep historical Stripe columns | Keep | Stripe runtime and packages are already absent. Verify absence and correct docs; do not repeat removal or drop columns. |
| Replit + Neon | Keep | Add explicit target identity, side-effect-free builds, managed restore proof, and multi-instance job locking. |
| Platform Windcave credentials | Conditional | This matches current code, but is UAT-only until Windcave, legal, and accounting confirm merchant-of-record, settlement, refunds, and chargebacks. |
| Crypto kill switch | Keep as false-only invariant | Product-facing crypto code is already absent. Parse `FEATURE_CRYPTO` as false-only, reject true, and add an absence guard without resurrecting routes. |
| Sandbox beta first | Keep | Use synthetic merchants and `PAYMENT_MODE=uat`; never infer UAT or simulation from missing credentials. |
| Branch from tablet/desktop | Keep | Record the exact accepted base and preserve unrelated work. Emergency containment may ship before full visual re-signoff. |
| Encrypt and keep bank data | Conditional | Use a key-ID AES-GCM expand/migrate/contract rollout. Retention still requires a legal/product decision; no new bank collection. |
| Apply pending “Step 0” migrations | Remove | Current dev status was `19 applied, 0 pending, 0 drifted, 0 orphaned`. Run read-only status per named target; never blindly apply an old checklist. |
| Add raw-body webhook handling | Remove unless proven | Windcave REST FPRN is query-session based. Persist receipt, query the provider, and match expected fields. Do not invent signature handling. |
| Generic webhook event dedupe | Rewrite | A durable inbox is useful only when finalization is atomic and callback/FPRN share one service. Multiple notifications are normal. |
| Encryption rollback to plaintext writes | Reject | Once encrypted writes begin, rollback only to a dual-read-compatible build. Never resume plaintext writes or deploy a pre-dual-read build. |
| One public payment status list | Reject | Retail, attempts, splits, refunds, subscriptions, property, and trades each need their own typed transition graph. |
| Add a financial ledger during remediation | Defer conditionally | First obtain the funds-flow decision. If TaptPay is responsible for merchant settlement, an append-only double-entry ledger becomes a production gate and a separate reviewed design. |
| Add background reminders/jobs | Remove duplicate scope | Jobs already exist. Harden scheduler delivery, locking, persistence, observability, and retries instead. |
| Frontend/native cleanup | Rewrite | Fix hook crashes and false-empty states; hard-disable stub Tap to Pay; preserve completed device shell/tutorial/chunk work. |

### 2.3 Blocking facts v2.1 missed

The following are verified in the current code and are release blockers:

- Tracked `.replit` contains operational secret material; a prior review demonstrated that the committed JWT secret could forge an accepted admin token.
- `POST /api/merchants/:id/clear-transactions` authenticates but does not verify the target merchant before deleting financial records.
- Fresh production startup can seed `demo@tapt.co.nz` with the known password `demo123`.
- Public and authenticated routes can mark payments or refunds successful through simulation when Windcave credentials are absent; some callbacks honor public `?sim=1`.
- Property/trades split callbacks can fall into simulation because the provider session is deliberately not persisted.
- Platform Windcave requests do not carry a submerchant routing identity, and the repository has no working merchant-settlement write path.
- The active subscription entitlement gate can block migration-granted active merchants because it requires `lastBillingDate` as well as `currentPeriodEnd`; the earlier production snapshot exercise found 8/8 rows affected.
- A test suite reports green while intentionally asserting the React “Rendered fewer hooks” crash.
- Seventy-one route sites use permissive `parseInt(req.params...)`, accepting values such as `1abc`.
- Google OAuth lacks state/nonce/PKCE and redirects the application bearer JWT in a URL query string.
- Admin API-key/ecommerce routes return mock values while PostgreSQL storage methods are placeholders.
- The tracked Swift Tap-to-Pay source is outside the iOS app target, contains no Windcave SDK integration, and resolves a fake approved `STUB_TOKEN`; the iOS package has no Windcave SDK dependency or proven entitlement.
- `.replit` runs migration as part of the deployment build, so building is not side-effect-free.
- Development startup can dump both development and production databases into local gzip files. This must not continue.
- No `/healthz` or `/readyz` exists. Cron exclusion and last-run state are process-local despite autoscaling.

## 3. Verified baseline and controls to preserve

The implementation must extend these controls, not replace them:

- Neon WebSocket Drizzle is already the only runtime database dialect.
- The migration runner already validates filename order, checksums, drift, orphaned migrations, guarded baselines, and uses a process-wide advisory lock plus per-migration transaction.
- Production startup already performs a read-only migration gate and fails closed on drift; runtime schema push is opt-in.
- Migration `0011` and current services already provide hashed retail payment bearer tokens, durable `payment_attempts`, a single live attempt per retail transaction/share, session/X-ID binding, return-state hashing/expiry, row locking, leases, compare-and-set finalization, and atomic transaction/split/counter updates.
- Refund balance reservation already serializes concurrent balance claims. Preserve the invariant while replacing the unsafe provider workflow around it.
- Subscription billing already has a stable provider idempotency key, DB claim lease, unique history key, and separates transport failure from provider decline.
- Positive allowlist DTOs already protect merchants, team members, subscriptions, and transactions. Extend them to refunds and remaining raw paths.
- Bank collection is absent from signup and the bank-account update endpoint returns `410`.
- Tablet/desktop shell routing, the centered desktop frame, tutorial registry/adaptation, lazy chunk retry, global chunk boundary, and existing job implementations are largely built.
- `pg` is already a production dependency. Stripe runtime packages and crypto-payment product code are already absent.

Baseline checks observed on 2026-08-24:

- Branch `feat/tablet-desktop-app`, commit `9a51bd8`, tracking origin.
- `npm run db:migrate:status`: 19 applied, 0 pending, 0 drifted, 0 orphaned for the inspected development target.
- `npm run check`: passed.
- `npm test -- --runInBand`: 70 suites and 765 tests passed, but emitted React `act(...)` warnings and included a test whose expected result is a real hook-order crash. Treat this as characterization, not release approval.
- No checked-in GitHub CI workflow and no `lint` package script exist.
- The last formal tablet/desktop QA predates substantial later UI changes and cannot approve current HEAD.

## 4. Locked defaults and mandatory decisions

| ID | State | Decision | Consequence |
|---|---|---|---|
| D1 | Locked | Treat production data as live. | No destructive cleanup without backup, approval, retention analysis, and an audit trail. |
| D2 | Locked | Retain historical Stripe columns. | No Stripe column/table drops in this remediation. |
| D3 | Locked | Replit + Neon remain the platform. | Design readiness, scheduler, migrations, and locks for multiple app instances. |
| D4 | **Provisional product/legal** | Platform-owned Windcave env credentials are the current technical model. | UAT only until provider/legal/accounting sign off on funds flow. Dormant merchant keys do not enable payments. |
| D5 | Locked | Crypto is OFF through a fail-closed `FEATURE_CRYPTO` invariant. | The flag defaults false and any true value is rejected; CI also asserts no product route/module/schema resurrection beyond historical migration text or Node `crypto`. |
| D6 | Locked | Synthetic beta merchants use Windcave UAT first. | No live cards or real settlement during engineering verification. |
| D7 | Locked | Remediation begins from the accepted active tablet/desktop branch. | Record exact SHA and dirty paths; do not merge unrelated mobile work mid-phase. |
| D8 | **Provisional product/legal** | Encrypt and retain four legacy bank fields for the interim. | No new collection; legal owner must later decide retention/deletion. Use staged AES-GCM with key IDs. |
| D9 | Required before release 0 | Choose subscription entitlement semantics for migration-granted merchants. | Recommended: a live explicit entitlement period grants access and records truthful provenance; do not invent a billing date. |
| D10 | Required before UI baseline | Decide whether a fine-pointer `1440×650` viewport is a phone or desktop. | Current shortest-side algorithm classifies it as mobile; do not silently change device gating. |
| D11 | Locked safe default | Only merchant owners and explicitly authorized admins may initiate refunds. | Members may view only if the role matrix grants it; they cannot initiate by default. |
| D12 | Required before real money | Confirm merchant-of-record, capture destination, merchant settlement, chargeback, and refund ownership with Windcave and professional advisers. | If TaptPay owes merchants settlement, design and audit a double-entry ledger before production. |
| D13 | Locked | Tap to Pay is off. | It remains hidden/disabled until a real SDK, entitlement, build, server attempt, and device UAT exist. |

No coding model may resolve a “required” product/legal/provider decision by guessing. It may build fail-closed scaffolding and tests while the feature remains disabled.

## 5. Runtime configuration contract

Implement one immutable, typed configuration object loaded before routes, Windcave modules, seeding, cron, or provider clients. Suggested location: `server/config.ts` or `server/env.ts`. Tests must construct it from an explicit object; production code reads `process.env` only in this module.

### 5.1 Required core variables

| Variable | Allowed values / rule | Failure behavior |
|---|---|---|
| `APP_ENV` | `development`, `test`, `staging`, `production`; do not infer solely from `NODE_ENV` | Invalid/missing in production: startup failure. |
| `PUBLIC_ORIGIN` | One canonical HTTPS origin in staging/production; no path, query, fragment, credentials, or wildcard | Startup failure for OAuth, reset, invite, payment, or notification-capable deployments. |
| `DATABASE_TARGET` | `local`, `ci`, `staging`, `production` | Must agree with the approved target and migration command; mismatch stops work. |
| `DATABASE_URL` | Nonempty; never logged | Startup/readiness failure when database-backed app mode is required. |
| `JWT_SECRET` | Strong, newly rotated, independently generated | Startup failure in staging/production. |
| `PAYMENT_RETURN_STATE_SECRET` | Independent of `JWT_SECRET` | Payment initiation disabled if absent; never fall back to JWT after remediation. |
| `CRON_SECRET` | Strong secret when any scheduled money/message job is enabled | Readiness failure for enabled scheduled jobs. |
| `SEED_DEMO_DATA` | Strict `true`/`false`; default false | `true` is fatal in staging/production. |

Never coerce arbitrary strings with JavaScript truthiness. Parse booleans strictly and unit-test `undefined`, empty, `0`, `false`, `FALSE`, `true`, `TRUE`, and junk.

### 5.2 Payment mode

Add `PAYMENT_MODE=disabled|simulation|uat|production`.

| App environment | Default | Permitted explicit modes |
|---|---|---|
| test | disabled | disabled, simulation with isolated fake transport/database |
| development | disabled | disabled, simulation, uat with explicit credentials |
| staging | disabled | disabled, uat |
| production | disabled | disabled, production only |

Rules:

1. Missing credentials never select simulation.
2. `simulation` in production or staging is a startup error.
3. `uat` in production is a startup error.
4. `production` requires `FEATURE_LIVE_WINDCAVE=true`; that switch defaults false.
5. UAT requires exact approved UAT endpoint and a complete username/API-key pair.
6. Production requires exact approved production endpoint and a complete username/API-key pair.
7. A partial credential pair is an error, not “not configured.”
8. Provider configuration is captured after validation, not as unchecked module-level strings during import.
9. Reconciliation/finalization for already-created legitimate attempts is controlled separately and remains available when new initiation is disabled.

### 5.3 Capability flags

Use flags to stop new side effects, not to hide broken implementation:

- `FEATURE_NEW_RETAIL_PAYMENTS`
- `FEATURE_INVOICE_PAYMENTS`
- `FEATURE_SPLIT_CONFIGURATION`
- `FEATURE_REFUND_INITIATION`
- `FEATURE_SUBSCRIPTION_CHARGING`
- `FEATURE_TAP_TO_PAY`
- `FEATURE_ECOMMERCE_API`
- `FEATURE_PROVIDER_RECONCILIATION`

Defaults are false in new staging and production environments. `FEATURE_PROVIDER_RECONCILIATION` is the exception: once real sessions exist it must remain true during initiation kill-switches unless an incident commander explicitly stops it.

For checklist and deployment compatibility, also parse these legacy/public names centrally:

- `FEATURE_REFUNDS` maps to `FEATURE_REFUND_INITIATION`;
- `FEATURE_SPLIT_PAYMENTS` maps to `FEATURE_SPLIT_CONFIGURATION`;
- `FEATURE_WOOCOMMERCE` remains false and maps to the real `FEATURE_ECOMMERCE_API` quarantine boundary;
- `FEATURE_CRYPTO` is a false-only invariant switch: absent/false is accepted and true is a startup error in every environment;
- existing `ENABLE_PER_PAYMENT_LINKS` maps deliberately to the new-retail initiation boundary.

Keep aliases for one compatibility release, fail startup on conflicting values, document the canonical names, and then remove only through a reviewed environment migration. These flags must not recreate absent crypto/Stripe code or turn mock ecommerce code into an enabled product.

### 5.4 Stable response semantics

- `401`: authentication is missing, invalid, expired, or disabled.
- `400`: authenticated request has malformed path/query/body input.
- `403`: authenticated principal lacks role or tenant permission.
- Tenant-safe `404`: valid identifier exists outside the caller’s visible scope when disclosure would enumerate data.
- Public `404`: removed or nonexistent public capability.
- `409`: idempotency/state conflict or operation already in progress.
- `410`: deliberate compatibility tombstone, such as retired transaction clearing or bank-data update.
- `422`: well-formed request violates a domain rule, where existing contracts permit it.
- `503` with stable error code: implemented capability is temporarily disabled or required provider mode is unavailable.
- `502`: confirmed upstream failure where retry/reconciliation semantics are known.
- `202`: durable operation accepted but provider outcome is pending/unknown.

Every flag-off route test must assert the status/code and **zero** business-row mutation, provider transport call, success SSE, push, notification outbox, usage increment, or refund/settlement change.

## 6. Release map

Do not put all phases into one unreviewable deployment.

| Release | Purpose | Schema? | Can initiate real money? |
|---|---|---:|---:|
| R0 | Incident containment and fail-closed hotfix | No | No |
| R1 | Reproducible tests, route policy, auth/input correctness, UI crash fixes | Prefer no | No |
| R2 | Provider parser, URL validation, exact outcome verification, observability | Additive only if needed | UAT only after gate |
| R3 | Durable notification and invoice-attempt infrastructure | Additive | UAT only |
| R4 | Refund redesign and reconciliation | Additive | Refunds remain off until gate |
| R5 | Encryption expand/write/backfill/contract sequence | Additive, multiple deploys | Unrelated initiations may remain UAT-only |
| R6 | Subscription entitlement, cron, and stored-card UAT proof | Possibly additive | UAT only |
| R7 | Native/UI truthfulness and full device regression | No/isolated native | Tap to Pay off unless separately approved |
| R8 | Documentation, compliance, settlement decision, production rehearsal | No destructive schema | Production only after final approval |

Each release must be backward compatible with the immediately previous code and schema state. A flag may disable new initiation while older in-flight operations continue through the shared reconciliation service.

## 7. R0 — emergency containment

**Objective:** stop known credential, tenant-isolation, demo-account, fake-approval, and data-copy hazards without waiting for broader refactoring.

### 7.1 Human incident actions

Owner: security/production operator. Coding agents prepare the checklist and code but do not execute these external actions.

1. Declare the tracked-secret event and record incident owner, time window, repository visibility, deployed revisions, and people/systems with access.
2. Temporarily disable new payment/refund initiation at the edge or take a maintenance window if current routes cannot yet be safely gated.
3. Inventory in-flight provider sessions, payment attempts, refunds, and subscription charges without logging their secrets.
4. Rotate `JWT_SECRET`; accept intentional session invalidation. Do not retain the burned JWT key as a grace verifier.
5. Rotate admin credentials/password hash and verify the old login fails.
6. Rotate the VAPID keypair; document that existing push subscriptions must re-subscribe and make the client recover cleanly.
7. Classify every other value committed in `.replit`; rotate any actual provider/API secret. Identifiers that are not secret still move to deployment configuration.
8. Review access/audit logs for forged admin use, unusual login, cross-merchant access, transaction clearing, simulator calls, refund creation, and API-key route access.
9. Run a redacting secret scan on the current tree and Git history. Record only rule ID, file, commit, and remediation status—not the matched value.
10. Decide whether Git history rewriting is warranted. Rotation is mandatory regardless; coordinated history rewriting is a separate destructive operation.
11. Inspect the two tracked `uploads/invoices/*.png` files and all other tracked uploads with the privacy owner. If any is live customer data, move the authoritative object to approved storage, remove it in a forward commit, and include the path in history/retention review.
12. Inventory local `db-backups/*.sql.gz`. They are ignored but may contain production data. Move or securely delete them only with explicit approval and a retention record.

Rotation order note: payment initiation should already be disabled. New code must use a fresh independent `PAYMENT_RETURN_STATE_SECRET`. Old browser returns that can no longer validate must show a safe processing state and be reconciled from the provider; never keep a compromised JWT key merely to preserve return links.

### 7.2 Secret-free repository configuration

Targets: `.replit`, `.gitignore`, a key-name-only environment template, `server/config.ts`, deployment docs, CI secret scan.

1. Keep only non-secret run/deployment structure in tracked `.replit`, or use an approved `.replit.example` workflow if the deployment owner confirms Replit does not require the tracked file.
2. Remove all credential values from tracked files. Use Replit Secrets for deployments and ignored local env files for development.
3. Add ignore rules for local env files, `.replit.local` if used, database dumps, runtime uploads, trace archives, and provider fixtures containing live data. Keep sanitized test fixtures tracked.
4. Add a CI and pre-release secret scan with redacted output and an explicit reviewed allowlist for false positives.
5. Add an incident runbook covering JWT rotation, admin rotation, VAPID re-subscription, Windcave credential rotation, and post-rotation tests.

Acceptance:

- A current-tree scan reports no unapproved secrets.
- Old JWT/admin/provider credentials are rejected in the approved environment.
- A newly authenticated session works with the new key.
- Push gracefully prompts/re-subscribes after VAPID rotation.
- No secret value appears in Git diff, test output, CI artifacts, or evidence.

### 7.3 Stop automatic production database dumps

Targets: `server/index.ts`, `scripts/db-backup.sh`, `.gitignore`, deployment/runbooks.

1. Remove the development-startup behavior that dumps both development and production databases.
2. Never allow a development process to read a production backup URL merely because an environment variable is present.
3. Replace it with an explicit operator-only backup command that requires a named target, interactive/typed confirmation outside CI, encrypted destination, and no checked-in artifact.
4. Production backup for this remediation must use a managed Neon snapshot plus an approved encrypted logical backup if required.

Tests/source guards:

- Starting development/test/production never invokes a backup command.
- Build never connects to a database.
- No production database URL variable is referenced by normal development startup.

### 7.4 Tombstone cross-tenant transaction clearing

Targets: `server/routes.ts`, `server/storage.ts`, route tests.

1. Add a red runtime HTTP test proving merchant A can currently target merchant B.
2. Replace the behavior with authentication, strict positive ID parsing, and a compatibility tombstone. It must never delete rows.
3. Response contract:
   - unauthenticated: `401`;
   - authenticated malformed ID: `400`;
   - member or other merchant: `403`/tenant-safe `404` per the final policy matrix;
   - authenticated owner targeting own merchant: `410 TRANSACTION_CLEARING_RETIRED`.
4. Assert zero calls to `clearTransactions`, transaction updates, provider, SSE, push, or outbox.
5. After call-site proof, remove `clearTransactions` from the storage interface and both memory/PostgreSQL implementations. Remove the route entirely after the compatibility window.

Do not replace this with an owner-authorized hard delete. Financial corrections use typed state transitions and append-only events.

### 7.5 Production-proof demo seeding

Targets: `server/index.ts`, `server/seed.ts`, config tests, startup tests.

1. Default `SEED_DEMO_DATA=false`.
2. Call seeding only when the flag is exactly true and `APP_ENV` is development or test.
3. Put a second independent environment assertion inside `seedDatabase()` so direct invocation refuses staging/production.
4. If explicit local seeding fails, surface the failure; do not swallow it.
5. Production operator runs a reviewed read-only lookup for the known demo identity. If present, preserve linked financial history but disable the user/merchant transactionally after backup and approval; do not blindly delete it.

Tests:

- Production with flag absent, false, or true never seeds; true is a startup error.
- Development without explicit true does not seed.
- Development/test with true seeds idempotently once.
- A fresh production-like isolated database remains empty.
- Known demo credentials cannot authenticate in production mode.

### 7.6 Remove or hard-disable fake success surfaces

The route disposition is mandatory; do not merely add a flag around code whose only implementation is fake.

| Surface | Current hazard | R0 disposition |
|---|---|---|
| `POST /api/windcave/sim-submit` | Public unconditional authorized response | Remove from production router; public `404`. Simulation fixture lives only in isolated tests. |
| `POST /api/payments/apple-pay/process` | Public arbitrary transaction completion when credentials absent | Remove/tombstone; no success fallback. |
| `POST /api/payments/google-pay/process` | Same | Remove/tombstone; no success fallback. |
| `POST /api/nfc-sessions/:sessionId/complete` | Public fake completion | Remove from production router; retire `/nfc` simulator consumer. |
| `POST /api/merchants/:merchantId/nfc-pay` | Fake completion and incomplete real branch | Disable with `FEATURE_TAP_TO_PAY=false`; no DB mutation. |
| `POST /api/transactions/tap-to-pay` | Simulates attended approval | Disable before body/domain work; no simulator outside isolated tests. |
| Legacy retail callback `?sim=1` | Public flag forces simulated query | Ignore/reject `sim`; only persisted provider attempt/session can reconcile. |
| Property/trades callback `?sim=1` | Public flag and missing stored split session lead to approval | Disable new initiation; reject simulation; preserve only safe reconciliation of valid persisted sessions. |
| Refund initiation | Missing credentials/provider ID becomes completed simulated refund | `FEATURE_REFUND_INITIATION=false`; return `503 REFUNDS_DISABLED` before reservation. |
| Admin API-key and `/api/v1` surface | Mock keys, hardcoded merchant, placeholder storage | `FEATURE_ECOMMERCE_API=false`; remove mock success data; public surface `404`. |

Client targets include `client/src/App.tsx`, `client/src/pages/nfc-payment.tsx`, terminal pages, `client/src/components/native-payment-buttons.tsx`, `client/src/components/digital-wallet-buttons.tsx`, and the tutorial registry. Hide removed controls or show a truthful unavailable state without changing surrounding phone/tablet/desktop layout.

Required R0 money-route tests:

- Disabled route returns the specified code.
- No transaction/refund/split/invoice/subscription row changes.
- No provider transport/fetch.
- No success SSE, push, event, usage increment, or notification outbox.
- Missing/partial credentials never select simulation.
- `APP_ENV=production` plus `PAYMENT_MODE=simulation|uat` refuses startup.
- `?sim=1`, mixed case, repeated query keys, encoded values, and body `sim` cannot change outcome.
- Retried and concurrent disabled requests remain side-effect free.

### 7.7 Remove misleading merchant Windcave credential writes

Targets: `shared/schema.ts` comments/types, `server/routes.ts`, `server/http-contracts.ts`, mobile settings state/handlers, admin settings, tests.

1. Remove `windcaveApiKey` from owner/member request schemas and client forms/handlers.
2. Remove or redefine `windcaveApiConfigured`; it must not infer runtime readiness from an unused merchant column.
3. Keep `windcaveMerchantId` admin-only metadata only if the provider/operations owner documents a real use. It must not affect payment readiness until implemented.
4. Run a count-only production preflight for null/non-null merchant keys; never print values.
5. Decide in the encryption phase whether retained historical merchant keys are encrypted or securely deleted.

### 7.8 R0 exit and rollback

Exit only when:

- Secret rotation and exposure review are recorded by the incident owner.
- Fake approval routes are unreachable in a production-mode test.
- Transaction clearing cannot delete anything.
- Production seeding is impossible.
- Automatic production dumps are removed from startup.
- Existing legitimate provider reconciliation is either preserved or explicitly covered by the maintenance/in-flight runbook.
- `npm run check`, server/client tests, production build, and the focused device smoke matrix pass.

R0 rollback is a code rollback only if it does not restore any fake-payment, seed, destructive, or compromised-secret behavior. Never roll back secrets. Keep payment initiation disabled while correcting a bad R0 deployment.

## 8. R1 — reproducible baseline, HTTP security harness, auth and UI correctness

**Objective:** create tests that prove runtime behavior, establish the accepted visual base, and fix high-confidence correctness issues before deeper payment changes.

### 8.1 Freeze and characterize the exact branch

Record:

```text
git branch --show-current
git rev-parse HEAD
git status --short
node --version
npm --version
npm run db:migrate:status   # named non-production target only
```

Then run:

```text
npm ci
npm run check
npm test -- --runInBand
npm run build
git diff --check
```

Record all warnings. A suite that expects a defect, an `act(...)` warning, a page error tolerated by a baseline, or an open handle is not a clean pass.

### 8.2 Build a no-live-system HTTP test harness

Refactor route registration just enough to construct an Express app without listening, Vite, migrations, seeding, cron startup, backups, or real provider clients. Inject or mock storage, Windcave transport, clock, push, SSE, outbound HTTP, and configuration.

Create principals for:

- merchant A owner;
- merchant A member;
- merchant B owner;
- disabled user;
- validated admin;
- public payment bearer;
- provider notification;
- cron caller;
- future ecommerce API key (disabled by default).

For every sensitive route family, test missing/invalid/expired auth, disabled user, each role, correct tenant, other tenant, malformed/nonexistent ID, flag off, provider failure, duplicate request, concurrent request, and response DTO. Static route-inventory tests remain useful but cannot substitute for runtime HTTP tests.

### 8.3 Checked-in route policy inventory

Create a machine-readable inventory, for example `server/route-policy.ts` plus a generated/tested table in documentation. Each route records:

- method and path;
- principal type;
- roles;
- tenant source and ownership rule;
- strict path/query/body schemas;
- capability/payment-mode gate;
- billing/entitlement gate;
- idempotency scope;
- storage methods called;
- external side effects;
- success DTO;
- error disclosure policy.

Add a test that compares registered routes with the inventory and fails when a route is added without policy. Inventory all approximately 220 registrations; do not try to rewrite them all in one commit.

### 8.4 Strict numeric parameter parsing

Add one helper/middleware that accepts only `/^[1-9][0-9]*$/`, converts with `Number`, and verifies `Number.isSafeInteger`. Use a separate UUID parser for UUID paths.

Reject with `400`:

- `0`, negatives, plus signs;
- decimals and exponent notation;
- whitespace;
- suffixes such as `1abc`;
- arrays/repeated query values;
- overflow and unsafe integers;
- missing/empty values.

Migrate route families in small batches: account/merchant, retail transactions/splits/refunds, boards/stock, property, trades, admin. After each batch, run its runtime tenant tests. Add a source guard that forbids new `parseInt(req.params` usage. Do not blind-replace UUID paths or intentionally free-form values.

Protected middleware order is:

1. authenticate;
2. strict parameter parse;
3. capability/payment-mode check;
4. role and tenant authorization;
5. strict body/file validation;
6. billing/entitlement check;
7. atomic idempotency/state claim;
8. provider call;
9. atomic finalization;
10. allowlisted DTO and event publication.

Move multipart parsing after authorization and size/type prechecks. The logo route must not accept/write a file before merchant ownership is known.

### 8.5 Tenant-scoped storage and role matrix

Prefer storage methods that require tenant scope, such as `getTransactionForMerchant(transactionId, merchantId)`, over global reads followed by route-level comparison. Implement them for transactions, refunds, boards, stock, property clients/invoices, trades clients/quotes/invoices, settings, uploads, and exports.

Record and test an explicit owner/member/admin/public/provider/cron/API-key matrix. Safe defaults:

- Refund initiation: owner and explicitly allowed admin only.
- Theme, daily goal, logo, payout/configuration: owner only unless product explicitly grants members.
- Password change: move to `/api/account/password`, or prove the path merchant equals the authenticated account; never ignore a path ID.
- Admin access requires the existing validated admin principal, not a user-controlled role claim alone.
- Public checkout tokens authorize one payment resource only and never grant merchant API access.

### 8.6 OAuth, canonical origins, proxy trust, and shared throttling

1. Require `PUBLIC_ORIGIN`; stop constructing security-sensitive URLs from untrusted Host/forwarded headers.
2. Configure the exact trusted proxy depth/network for Replit. Test spoofed `X-Forwarded-For`, host, and protocol.
3. Google OAuth must use one-time state, nonce, and PKCE; validate issuer/audience/nonce.
4. Exchange the callback for a short-lived one-time application code in an HttpOnly/SameSite flow. Never put a bearer JWT in query parameters, browser history, analytics, or logs.
5. Move login/reset throttling from process memory to a shared database/approved distributed store before multi-instance production.
6. Apply canonical origin rules to password reset, invitations, checkout links, invoice links, and provider callbacks.

Tests include replayed OAuth callback, wrong/missing state, wrong nonce/audience/issuer, PKCE mismatch, open redirect, spoofed host/proxy, token absence from URL/logs, and two-instance rate-limit sharing.

### 8.7 Fix React hook-order failures

Audit early returns before later hooks in:

- `client/src/pages/settings.tsx`
- `client/src/pages/exports.tsx`
- `client/src/pages/merchant-terminal.tsx`
- `client/src/pages/merchant-terminal-mobile.tsx`
- `client/src/pages/transactions.tsx`
- `client/src/pages/stock-management.tsx`
- `client/src/pages/payment-stack.tsx`

Move authentication/loading guards above the page through route wrappers, or invoke hooks unconditionally and guard their effects. Do not disable the hook lint rule.

Convert `client/src/__tests__/zz-review-hooks-repro.test.tsx` from “expects crash” to “does not throw.” Test loading→authenticated, loading→unauthenticated, error→retry, merchant change, and unmount. Fail tests on unexpected React console errors and repair `act(...)` warnings.

### 8.8 Truthful frontend states

Essential query failure must never render as `$0`, an empty array, “no sales,” “no saved card,” or an enabled money CTA. Add in-frame `role="alert"`, retry, and disabled actions for failures in:

- desktop property analytics/terminal;
- desktop retail analytics/stock/terminal;
- desktop trades analytics/terminal;
- desktop settings.

Optional-source failures show “partial data” or “unavailable,” not a fabricated numeric zero. Mutations stay disabled while pending, preserve user input on failure, and prevent double submit. Make billing `402` errors state the required billing action without conflicting duplicate banners.

### 8.9 Establish an honest device/tutorial baseline

Product owner first accepts an exact commit. “Mobile unchanged” then means unchanged from that accepted commit, not from an obsolete July screenshot.

Required matrix:

| Context | Viewport/capability | Expected shell |
|---|---|---|
| Phone | 390×844, coarse/touch | Current mobile UI only |
| Tablet | 1194×834, coarse/touch | Shared tablet/desktop UI, full bleed |
| Desktop | 1440×900, fine pointer | Centered 1180×880 rounded 13-inch frame |

Also test public/auth/onboarding routes outside the merchant frame, iPhone orientations chosen by product, and the D10 short-height desktop decision.

Acceptance is zero page errors, console errors, required-request failures, clipped critical text, missed tap centers, or terminal layouts with zero visible rows. Existing baseline allowances are characterization only and must reach zero for release. Golden image updates require product approval.

Add a real tutorial browser matrix at all three device contexts. Complete and restart each tutorial; verify visible target/fallback, resize and route-transition geometry, persistent progress/generation, and no disabled Tap/NFC step.

### 8.10 R1 exit

- Runtime route harness and policy inventory cover every registered sensitive route.
- Cross-tenant tests use at least two merchants and prove no side effects.
- No permissive numeric param parsing remains in migrated families; CI prevents new instances.
- OAuth no longer exposes JWTs in URLs and passes state/nonce/PKCE tests.
- Known hook crash is fixed rather than asserted.
- Essential frontend failures are truthful and non-actionable.
- Exact phone/tablet/desktop/tutorial evidence is approved.

## 9. R2 — provider boundary and exact Windcave verification

**Objective:** make provider configuration and responses typed, environment-pinned, sanitized, and independently testable before enabling UAT initiation.

Windcave’s REST FPRN guidance says a notification supplies a session/transaction identity, can be sent more than once, and should be confirmed by querying the provider. The query response includes the fields needed for reconciliation. Use the official [Windcave REST API/FPRN documentation](https://www.windcave.com/developer-e-commerce-api-rest). Hosted Fields links use a separate provider surface; validate them according to the official [Hosted Fields documentation](https://www.windcave.com/developer-ecommerce-hosted-fields).

### 9.1 Injectable transport

Refactor `server/windcave.ts` so it receives the validated config, clock, ID generator, and HTTP transport. Tests use sanitized official-shape fixtures and never depend on environment variables or live network.

Define distinct result categories:

- provider-confirmed approved;
- provider-confirmed declined/cancelled;
- pending/non-final;
- transport timeout/unknown;
- malformed/unparseable;
- integrity mismatch;
- configuration disabled.

Never convert timeout, malformed, missing field, multiple ambiguous transactions, or pending into “declined” or “approved.”

### 9.2 Exact origin and returned-link validation

Use `URL`, not regex substring matching.

Configured API origin rules:

- HTTPS only;
- exact host for selected mode;
- port 443/default only;
- no username/password;
- no query/fragment;
- exact approved API path prefix;
- UAT mode rejects production hosts and production rejects UAT hosts.

Returned links require a typed validator by link relation:

- API/query link;
- Hosted Payment Page link;
- Hosted Fields/AJAX link;
- 3-D Secure link if and when supported;
- callback link back to exact `PUBLIC_ORIGIN`.

Validate every link before returning it to a browser or following it with credentials/payment tokens. Reject unknown relations, redirects to unapproved hosts, protocol-relative URLs, encoded host tricks, userinfo, nonstandard ports, DNS-suffix lookalikes, and mode mismatch.

### 9.3 Normalize query-session results

Extend the provider query result to contain, after strict parsing:

- queried session ID and returned session ID;
- final/pending provider state;
- transaction count;
- transaction type (`purchase` for captures, `refund` for refunds);
- amount converted exactly to integer cents;
- uppercase ISO currency;
- merchant reference;
- authorization result;
- provider transaction ID;
- provider account/environment identity when supplied.

Reject floating-point money math. Convert canonical decimal strings to cents with a shared exact parser; reject more than two fraction digits, exponent notation, signs where not permitted, non-NZD currency for current flows, and overflow.

### 9.4 Persist expected values before provider session creation

Add forward migration fields to retail `payment_attempts` as needed:

- expected amount cents;
- expected currency;
- expected merchant reference;
- provider environment/account marker;
- provider transaction ID;
- sanitized last reconciliation code/timestamps.

Add database unique indexes for non-null processor session ID, processor X-ID, and provider transaction ID after duplicate preflight. The current service-level duplicate check is preserved but is not the final database guard.

The expected values are immutable after the provider session is attached. The merchant reference includes a stable non-secret attempt identifier and domain prefix; do not use `Date.now()` as business identity.

### 9.5 Shared integrity verifier

Implement a pure `verifyWindcaveOutcome(expected, observed)` that returns a typed verified outcome or typed rejection. Approval requires exact match of:

- persisted provider mode/account;
- session ID;
- one unambiguous final transaction;
- operation type;
- integer cents;
- currency;
- merchant reference;
- expected local attempt/aggregate;
- provider authorization state.

On mismatch:

- do not finalize money state;
- keep the operation reconcilable/blocked;
- record a sanitized security event and metric;
- return a processing/support state to the browser rather than exposing provider internals.

### 9.6 R2 test matrix and exit

Test approved, declined, cancelled, pending, missing transaction, multiple transactions, duplicate IDs, amount mismatch, currency mismatch, reference mismatch, session mismatch, type mismatch, wrong environment/account, malformed JSON, unexpected link, redirect, timeout before request, timeout after provider may have accepted, and replay.

R2 exits when:

- No provider URL or query result can bypass strict parsing/allowlisting.
- All enabled completion paths call the shared verifier.
- No raw provider body/session/token is logged.
- Sanitized UAT fixtures pass; no live call was needed.
- Existing retail durable-attempt tests remain green.


## 10. R3 — durable notifications, aggregate state machines, and payment convergence

**Objective:** make callback/FPRN processing crash-safe and idempotent, and give every retained payment domain the same guarantees already present in the retail token-attempt flow.

### 10.1 Do not duplicate the working retail attempt engine

Keep `payment_attempts`, `server/payment-attempt-service.ts`, its row-lock order, finite lease, live-attempt unique constraint, return-state hash, and atomic finalizer for retail token links. Extend it additively with expected provider fields from R2.

Do not force property/trades invoice IDs into the retail `transaction_id` foreign key and do not weaken that foreign key into an unvalidated polymorphic integer. Before the R3 migration, write a short schema ADR choosing one of these reviewed designs:

1. concrete `invoice_payment_attempts` with exactly one checked property-invoice or trades-invoice foreign key; or
2. separate property and trades attempt tables generated through one shared service contract.

The ADR must prove referential integrity, tenant scope, share identity, token migration, and a shared finalization API. A generic table with `aggregate_type + aggregate_id` and no database foreign key is rejected unless a reviewer accepts a documented enforcement mechanism.

Required attempt properties for each retained domain:

- immutable merchant and aggregate identity;
- immutable share index and exact cents;
- UUID client idempotency key plus request fingerprint;
- finite claim lease;
- one live attempt per aggregate/share;
- stable provider X-ID;
- unique provider session and transaction IDs;
- expected currency/reference/environment;
- hashed return state with expiry;
- typed state and outcome checks;
- created/updated/reconciliation timestamps;
- atomic claim, attach-session, claim-finalization, and finalize operations.

Property/trades public link tokens currently remain raw in storage. Migrate them with an expand/compatibility sequence: add hash columns, write hash for new tokens while returning raw once, backfill hashes from existing tokens, keep existing emailed links working through a temporary dual lookup, verify, then null/remove raw-token reads in a later reviewed contract release. Never log either form.

### 10.2 Durable provider notification inbox

Add an additive table and worker only after a restored-snapshot migration rehearsal. Suggested semantics:

- one logical row per provider + notification kind + provider session;
- persisted session identity and linked attempt/aggregate where known;
- first/last receipt time and arrival count;
- `pending`, `processing`, `retry`, `complete`, `dead_letter` status check;
- finite lease owner/expiry;
- attempt count and next-attempt time;
- sanitized last error code only;
- observed provider transaction ID after verified query;
- unique provider/session/kind index.

FPRN handler sequence:

1. Validate method, content type as documented, size, field types, and ID length/shape.
2. Do not authenticate the notification by trusting its body; treat it as a reconciliation hint.
3. Resolve no money outcome from the notification fields.
4. Upsert the durable inbox row and commit.
5. Return provider-appropriate `200` only after durable receipt. If the database write fails, return a retryable non-2xx; do not acknowledge and lose the event.
6. Never log the raw query/body or full session/transaction ID. Use request ID plus a one-way correlation digest or short non-sensitive suffix.

Worker sequence:

1. Claim due rows with `FOR UPDATE SKIP LOCKED` and a finite lease.
2. Query Windcave through the R2 transport.
3. Resolve the exact persisted attempt by unique session; never select “next pending share.”
4. Run `verifyWindcaveOutcome`.
5. If provider state is pending/transport unknown, schedule bounded exponential retry with jitter.
6. If integrity mismatch, mark dead-letter/security alert without money mutation.
7. If final verified outcome, call the one aggregate finalizer.
8. Mark inbox complete only after the finalizer commits. A crash before completion is safe to retry.
9. Terminal replays return the same outcome and do not re-increment usage, paid share count, GST, notification, push, or SSE.

Browser callback sequence:

- Validate hashed return state when present.
- Upsert/trigger the same reconciliation path; do not contain a second money finalizer.
- If not yet final, render a truthful processing page that polls/streams the local attempt.
- Invalid/expired return state cannot change money. FPRN/worker may still complete the legitimate persisted attempt.

### 10.3 Retire or migrate legacy flows

Create a call-site and traffic inventory before deleting routes. For each flow select exactly one disposition and record it in the route policy:

- **Retire:** no active caller or product requirement; route becomes `404`/compatibility tombstone, then is deleted.
- **Migrate:** caller is active; session creation and completion move to a durable attempt plus shared verifier/finalizer.
- **Reconciliation-only:** no new sessions, but valid existing provider identities remain queryable until their maximum lifetime and operational reconciliation complete.

Specific requirements:

- Legacy numeric retail pay must converge on the token attempt service or be retired. Never preserve a second callback state machine.
- Property/trades normal and split invoice checkout must bind a provider session to a particular invoice and share before redirect.
- Property/trades split finalization must never skip session equality or apply an approved session to any open share.
- The existing atomic completed-session array claim may remain as temporary defense in depth, but is not proof of amount/reference/share ownership.
- Apple Pay/Google Pay can be offered only through a provider-supported, verified session/attempt path. Delete standalone fake wallet processors.
- Tap to Pay stays off and is not a prerequisite for R3.

### 10.4 Aggregate-specific transition graphs

Create typed transition modules and tables in the plan/evidence for:

- retail transactions: at least `pending`, `processing`, `completed`, `failed`, `cancelled`, `partially_refunded`, `refunded`;
- retail split shares;
- payment attempts: retain current `claiming`, `ready`, `finalizing`, `approved`, `declined`, `cancelled`, `abandoned` unless an additive reconciliation state is reviewed;
- property invoice and property split share;
- trades quote/invoice and trades split share;
- refunds;
- subscription card and billing attempts.

Rules:

1. Public/domain statuses are not provider outcomes.
2. Each transition lists permitted source states, actor/service, side effects, idempotent replay result, and terminality.
3. Routes cannot call generic `updateTransactionStatus(id, string)` for normal operation.
4. Storage methods use compare-and-set conditions and return `claimed`, `terminal`, `conflict`, or `not-found`.
5. Transaction events/audit rows append in the same database transaction as state change.
6. Push/SSE/outbound messages are published from a durable outbox or after-commit action keyed uniquely to the event. A retry cannot duplicate success communication.
7. Add DB CHECK constraints only after a count-only dirty-status preflight and cleanup plan.

Do not introduce one global state enum or silently rename `completed/failed` to `approved/declined`.

### 10.5 Idempotency inventory

For every route that can create, capture, complete, cancel, split, refund, charge a subscription, or record cash, document:

- idempotency key source and how a client persists/reuses it;
- database uniqueness scope;
- request fingerprint fields;
- aggregate/share lock order;
- provider X-ID derivation;
- lease expiry and recovery owner;
- behavior after timeout before send, timeout after possible accept, process crash, duplicate callback, and concurrent requests;
- exact one-time financial and messaging side effects.

Cash/manual records are separate audited domain actions. They must never claim a provider authorization occurred.

### 10.6 Migration and lock rules for R2/R3

1. Run count-only preflights for duplicate session IDs, X-IDs, provider transaction IDs, invalid states, orphan references, null expected fields on live attempts, and concurrent open shares.
2. Capture estimated table/index size and lock duration on a production-sized restored clone.
3. Add `lock_timeout` and `statement_timeout` inside the migration execution context. Advisory-lock acquisition also gets an operator-visible timeout.
4. The current runner transaction-wraps every migration; `CREATE INDEX CONCURRENTLY` cannot be placed inside those files. Either:
   - add a narrowly constrained, reviewed nontransactional migration mode with checksum/ledger/retry rules; or
   - use normal index creation only after rehearsal proves a short safe lock and an approved maintenance window.
5. Never hide a wrong existing shape with `IF NOT EXISTS`. Fingerprint type, nullability, default, FK action, CHECK definition, and index predicate on both scratch-from-zero and restored-production schemas.
6. Apply expansion migrations from the exact release candidate through a separately approved deploy step. `npm run build` must never run migrations.

### 10.7 R3 fault-injection suite and exit

Required tests:

- duplicate FPRNs before, during, and after browser callback;
- two workers and two app instances competing for the same inbox/attempt;
- crash after inbox commit, after provider query, after finalizer claim, after DB finalization, and before message publication;
- pending→approved and pending→declined across multiple notifications;
- amount/currency/reference/session/share mismatches;
- lost browser return;
- expired/replayed return state;
- provider returns multiple transactions;
- property/trades split A cannot complete split B;
- finalization increments all financial counters and notifications exactly once;
- initiation flags off while reconciliation completes a pre-existing legitimate session.

R3 exits when every retained payment flow either uses a durable attempt and shared verifier/finalizer or is demonstrably unreachable/retired. No callback or notification contains independent read-then-write completion logic.

## 11. R4 — durable refunds

**Objective:** ensure a retry or ambiguous network failure can never refund twice, release money prematurely, or claim a simulated success.

`FEATURE_REFUND_INITIATION` remains false through this release. Refund list/detail endpoints may remain read-only after tenant/DTO fixes.

### 11.1 Product and permission contract

- Owner-only initiation is the default; an admin path requires explicit policy and audit reason.
- Split refunds remain disabled until each refunded amount maps to a specific captured share/provider transaction.
- `original_payment_method`, manual/cash, and bank transfer are distinct operations with distinct UI and audit language.
- A manual record cannot update fields that imply Windcave moved money.
- Amount uses integer cents, minimum one cent, and cannot exceed the locked remaining refundable balance.

### 11.2 Additive refund schema

Extend `refunds` with forward migrations; do not drop legacy columns during remediation. Required data:

- UUID public/operation ID;
- client idempotency key and request fingerprint with merchant-scoped uniqueness;
- stable provider X-ID created before the call and unique;
- original capture provider transaction ID and optional split/share identity;
- requested amount cents and currency;
- typed state: `requested`, `submitted`, `unknown`, `succeeded`, `failed`, `cancelled` (or an equally reviewed graph);
- provider refund transaction ID unique when non-null;
- claim lease, attempt count, next reconciliation time;
- sanitized last error code;
- initiated-by user/principal ID and reason code/text with length limits;
- created/submitted/completed/updated timestamps.

Store the client idempotency key as a non-secret UUID or digest according to the API contract. A repeated key with a different fingerprint is `409`; the same key returns the same operation.

### 11.3 Atomic local claim

One database transaction must:

1. lock the merchant-scoped transaction and relevant captured share;
2. verify owner permission and refundable state;
3. compute remaining amount in cents from confirmed successful refunds plus live reservations;
4. reserve the amount;
5. insert/reuse the refund operation with stable X-ID;
6. append an audit event;
7. commit before the provider call.

Do not reserve in one transaction and create the refund row in another. Do not update `total_refunded` or public transaction status to refunded until provider-confirmed success; represent reservations separately or derive them from live refund states.

### 11.4 Provider call and reconciliation

1. Submit the stable persisted X-ID every time.
2. A confirmed synchronous success still passes a strict refund response/query verifier before local success.
3. A confirmed decline/failure transitions to `failed` and releases the reservation atomically.
4. Timeout, connection reset, malformed response, unexpected 2xx, or provider pending transitions to `unknown`; retain the reservation.
5. A worker queries/reconciles `submitted/unknown` by stable provider identity.
6. Only confirmed “not processed”/decline releases the reservation.
7. Confirmed success atomically updates refund, refundable balance/total, transaction `partially_refunded|refunded`, event, and one outbound notification.
8. Repeated/concurrent reconciliation returns terminal result without duplicate side effects.

Never generate X-ID inside `createWindcaveRefund`, treat all 2xx as success, or include raw provider error bodies in merchant responses/logs.

### 11.5 Refund DTOs and tests

Create allowlisted list/detail DTOs. Do not return raw refund rows or internal provider IDs unless a reviewed owner contract requires a redacted reference.

Tests:

- two concurrent partial refunds at/over remaining balance;
- same idempotency key/same payload;
- same key/different payload;
- timeout before send and timeout after provider accepted;
- process crash at every boundary;
- provider pending then success/decline;
- duplicate provider refund ID;
- missing original provider capture ID;
- split share mapping and cross-share rejection;
- member/other-tenant denial;
- one-cent and rounding edges;
- disabled flag has zero reservation/row/provider/message side effects;
- manual refund language and state never imply provider success.

R4 exits only after the reconciliation worker and ambiguous-response tests pass. A successful happy-path UAT refund alone is insufficient.

## 12. R5 — secrets and legacy bank-data encryption

**Objective:** remove plaintext at rest without corrupting live rows, losing rollback readability, or pretending encryption solves retention.

### 12.1 Scope and classification

The interim D8 scope is all four legacy bank fields: bank name, branch, account holder name, and account number. No UI or API may resume collecting them.

Separately count merchant `windcaveApiKey` values. The product/legal/provider owner chooses:

- secure deletion because the field is unused; or
- temporary encryption under this system until an approved deletion date.

Do not silently retain plaintext because a schema comment says “encrypted.” Do not encrypt historical Stripe identifiers; they are not credentials.

### 12.2 Cipher and key contract

Use Node’s vetted crypto API with AES-256-GCM:

```text
enc:v1:<key-id>:<base64url(iv)>:<base64url(tag)>:<base64url(ciphertext)>
```

- exactly 32-byte keys;
- random 12-byte IV per value;
- 16-byte authentication tag;
- base64url without ambiguous padding rules;
- authenticated additional data binding schema/table, merchant row ID, and column name;
- explicit active key ID and keyring containing every readable key;
- no key material in database, repository, log, error, dump, or client bundle.

Strict parser behavior:

- `enc:v1` with malformed parts, unknown key ID, or failed authentication is an error and metric, never legacy plaintext;
- unknown `enc:vN` is an unsupported-version error;
- no prefix is legacy plaintext only while the compatibility reader is intentionally enabled;
- null remains null;
- errors expose row ID and field classification only to authorized operations logs, never the value.

### 12.3 Four-step deployment, not one backfill

**E1 — reader expansion**

- Deploy keyring/config validation and a reader that can handle plaintext plus valid encrypted values.
- Continue current writes temporarily.
- Exercise old-code/new-code compatibility on an isolated restored snapshot.
- Rollback may return only to an E1-compatible build after later steps begin.

**E2 — encrypted writer**

- Write only `enc:v1` for scoped fields.
- Because AAD includes row ID, insert the row first without sensitive values or use one transaction that obtains the ID and then writes ciphertext before commit.
- Reads remain dual format.
- Test concurrent updates and compare-and-set behavior.

**E3 — dry run and batched backfill**

- Dry run outputs counts only: null, plaintext, encrypted active key, encrypted old key, unknown key, malformed envelope, authentication failure.
- Stop on unknown/malformed/auth failure; do not overwrite it.
- Process bounded batches with a durable checkpoint and `FOR UPDATE SKIP LOCKED` or equivalent safe claim.
- Encrypt from the locked old value and update with compare-and-set (`WHERE id = ? AND column = old`) so a concurrent merchant/admin write is not lost.
- Commit per bounded batch; record row counts/duration, not values.
- The job is idempotent and safe to resume.

**E4 — verify and contract**

- Recount until zero plaintext remains.
- Sample-decrypt in an authorized isolated process and compare values in memory without printing them.
- Add an optional envelope-shape constraint only after clean verification.
- Disable plaintext reads in a later release after backup retention and rollback windows close.

Never roll back to plaintext writes. If E2/E3 has a problem, stop the writer/backfill and deploy the E1-compatible reader while fixing forward.

### 12.4 Rotation and backup handling

Rotation procedure:

1. Add the new key to readers.
2. Set it active for writes.
3. Re-encrypt old-key rows in batches with the same CAS protections.
4. Verify zero database rows need the old key.
5. Retain the old key until every retained backup containing its ciphertext expires or is re-encrypted according to policy.
6. Perform a restore-and-decrypt drill before removing a key.

Managed snapshot and logical backup controls must document encryption, access, retention, RPO/RTO, key availability, and the crypto-erasure consequence of deleting a key. Existing plaintext backups do not become safe because the live database was backfilled; dispose of them under the approved retention plan.

Audit events may record `encryption_write`, batch ID/count, `backfill_skip`, `backfill_failure`, and `key_rotation` without plaintext, ciphertext, IV, tag, key ID if operational policy treats it as sensitive, or full row content.

### 12.5 R5 tests and exit

Test round-trip per field/row AAD, wrong row/field AAD, tampered IV/tag/ciphertext, malformed envelope, unknown key, old/new key rotation, null/Unicode/max length, concurrent backfill/write, restart/checkpoint, idempotent rerun, partial batch failure, and restore with keyring.

Exit requires zero plaintext in the live target, a reviewed dry-run/backfill report, restore/decrypt proof, no new collection path, and a recorded retention decision/date. If D8 remains provisional, real go-live remains blocked even though technical encryption is complete.

## 13. R6 — subscription entitlement, scheduler, health, and observability

**Objective:** prevent false merchant lockout, prove stored-card charging in UAT, and make all background money/message work durable across autoscaled instances.

### 13.1 Resolve entitlement before deploying the branch

Current code requires both `lastBillingDate` and `currentPeriodEnd` for active access, while migration `0014` grants active periods without inventing a billing date. Do not “fix” this by falsifying a historical charge.

Recommended model:

- access is granted by a current, explicit entitlement period;
- entitlement records provenance such as `paid`, `migration_grant`, `complimentary`, `trial`, or `dunning_grace`;
- `lastBillingDate` means a real confirmed bill only;
- a migration-granted active period can authorize access until its real end;
- dunning grace and maximum attempts are separately typed product policy.

Implementation sequence:

1. Product signs D9 and the dunning policy.
2. Add provenance field/history if needed through a forward migration.
3. Produce a read-only production report: merchant count by state/provenance, paid/granted period validity, missing card token, due/overdue, and “would be blocked before/after.” No PII or token values.
4. Rehearse migration and gate logic on a restored snapshot.
5. Update `subscriptionHasPaidAccess` and every `requireBillingCard` consumer through a shared tested policy; do not patch routes individually.
6. Stop if any intended active merchant becomes unexpectedly blocked.

### 13.2 Stored-card UAT proof

Preserve existing stable charge key, DB claim lease, unique history, and transport-vs-decline distinction. Do not invent undocumented Windcave request fields.

With approved synthetic UAT data prove:

- PCI-appropriate hosted/tokenized card capture; PAN/CVC never persist or appear in logs;
- token survives a billing-period roll and restart;
- the same provider X-ID results in one charge;
- two workers/instances cannot double-charge;
- transport timeout becomes unknown/reconciling, not an immediate second charge;
- confirmed decline enters bounded dunning;
- access/grace changes exactly according to D9;
- replacement/removal and expired token behavior are truthful;
- no live card or production endpoint is used.

Real subscription charging remains disabled until this evidence and professional scope review are complete.

### 13.3 Durable cron orchestration

Existing property, trades, subscription, payout, reminder, and delivery jobs remain. Harden their orchestration:

1. Configure and document one external scheduler URL, authentication header, cadence, timeout, retry, and alert owner.
2. Replace process-local `cronRunning` with PostgreSQL advisory lock or durable lease; two Replit instances cannot both run the same cycle.
3. Persist a parent cron run and per-job start/end/status/count/duration/sanitized error.
4. Existing job-level idempotency remains required; the scheduler lease is not a substitute.
5. Resume abandoned leases safely after expiry.
6. Alert when no successful run occurs within two expected intervals, reconciliation backlog ages out, a due billing claim is stuck, or a dead-letter count rises.
7. An authenticated internal ops endpoint may expose sanitized freshness/counts; do not expose it publicly.

Test two concurrent triggers, crash/restart, stale lease takeover, repeated scheduler retry, one failing sub-job while others report correctly, missing/wrong secret, timing-safe comparison, and fresh/stale alerts.

### 13.4 Health and readiness

- `/healthz`: liveness only; once booted, no database/provider dependency. Return minimal status.
- `/readyz`: boot complete, database `SELECT 1`, cached migration/schema fingerprint valid, required config valid, and application not draining. Return `503` when not ready.
- Scheduler freshness belongs in authenticated operations status/alerts; include it in readiness only if the deployment owner explicitly wants traffic removed when critical jobs are stale.
- On graceful shutdown, set readiness false before closing the listener; stop new jobs/initiations, drain bounded HTTP, worker, and SSE work, release/expire leases safely.

Add health/readiness startup, DB-down, migration-drift, invalid-config, draining, and recovery tests.

### 13.5 Request IDs and structured redaction

Refactor `server/request-log.ts` and all direct provider/job/security logging:

1. Accept only a bounded safe inbound `X-Request-Id` format or generate a UUID.
2. Return it in `X-Request-Id` and attach it to request, provider, worker, audit, and job context.
3. Emit one-line structured JSON with level, event, request/job ID, route template, status, duration, and sanitized domain IDs.
4. Pass every structured detail through the central redactor.
5. Prohibit raw notification/query bodies, Authorization, cookies, payment bearer tokens/hashes, return state, bank fields, API keys, card token, OAuth code, full provider session/transaction IDs, and arbitrary upstream error objects.
6. Hash or truncate correlation identities under a documented policy; do not make logs a second credential store.

Tests supply sensitive material at multiple nesting levels, arrays, error causes, query strings, headers, and provider responses and prove it is absent from captured logs and 5xx responses.

### 13.6 R6 exit

- Production snapshot report proves intended merchants are not falsely blocked.
- Stored-card UAT charge/retry/decline evidence is approved.
- Two-instance cron tests prove one executor, durable history, and stale alerts.
- Health/readiness and graceful shutdown pass.
- Structured logs carry request IDs and redaction tests pass.

## 14. R7 — frontend/native truthfulness and full regression

**Objective:** expose only real capabilities while preserving the established phone/tablet/desktop application.

### 14.1 Preserve completed architecture

Do not rebuild:

- device gating and persistent desktop shell in `client/src/App.tsx`;
- centered scaled desktop frame and full-bleed tablet behavior;
- tutorial provider/registry, desktop targets/fallbacks, progress, and portal geometry;
- lazy-with-retry and global chunk boundary;
- terminal presentation boundaries and existing jobs.

Client changes in remediation should be narrow: remove false capability, make errors truthful, use shared route constants/controllers, and prevent duplicate actions.

### 14.2 Tap to Pay reality gate

Current state is not an integration:

- JavaScript registers/exposes `TaptPay`/`window.TaptPay`.
- `src/plugins/TapToPayPlugin.swift` is outside the iOS application target and contains a timed fake approval returning `STUB_TOKEN`.
- `ios/App/CapApp-SPM/Package.swift` has no Windcave/WCPaymentSDK package.
- No proven app target entitlement or real-device flow exists.
- Proxy availability is not proof of native capability.

Immediate R0/R7 behavior:

- `FEATURE_TAP_TO_PAY=false` server-side and capability response false.
- No production source may return `STUB_TOKEN` or simulate approval.
- Remove `window.TaptPay`; use a typed imported Capacitor plugin only after it exists.
- Hide Paywave/Tap controls and tutorial steps unless server feature, supported device/OS, native implementation, entitlement, SDK initialization, and UAT configuration all report ready.
- Retire the legacy `/nfc` simulator and placeholder wallet components.

Future enablement is a separate gated workstream:

1. Obtain the exact Windcave iOS SDK artifact/version, license, API contract, merchant configuration, and support agreement.
2. Obtain/verify Apple Tap to Pay entitlement and supported device/OS matrix.
3. Add the SDK through the approved package mechanism and commit reproducible dependency metadata.
4. Implement the plugin in the actual iOS app target; no commented pseudocode or guessed SDK calls.
5. Add one `useTapToPay` controller that owns capability, lifecycle, cancellation, background/foreground, single-flight submission, and typed errors.
6. Server creates the durable attempt and stable provider identity before the phone begins a tap.
7. Native output is never trusted as final approval; server query verification/finalization decides outcome.
8. Pass `npx cap sync ios`, reproducible `xcodebuild`, and real supported-device UAT including cancel, decline, timeout, background, offline, retry, and duplicate tap.

Until every item is approved, D13 remains locked off.

### 14.3 Capacitor boundary

Audit `capacitor.config.ts`, `Info.plist`, Xcode project, and generated assets as one unit:

- production `server.url` and navigation must be intentional;
- narrow `allowNavigation`; remove broad Replit legacy domains unless a documented flow needs exact hosts;
- Windcave navigation matches selected mode and approved HPP/3DS hosts;
- no arbitrary external navigation or credential-bearing redirect;
- orientation behavior is product-approved and tested;
- generated web assets are rebuilt/synced only from the approved source commit and staged as one coherent rollover.

### 14.4 Full acceptance matrix

After every client-affecting release and at final candidate:

- 390×844 phone mobile app only;
- 1194×834 coarse-pointer tablet shared UI full bleed;
- 1440×900 fine-pointer desktop centered rounded 1180×880 frame;
- D10 short-height decision case;
- retail, property, and trades home/terminal/analytics/settings;
- stock, transaction/refund read-only states, team/settings, exports;
- login/signup/onboarding unchanged on all devices;
- complete tutorial and restart on each device;
- public payment/receipt/result states for pending/approved/declined/cancelled/error;
- disabled capabilities absent or truthfully unavailable;
- no mock business data on merchant screens;
- no page/console errors, failed required requests, clipping, tap misses, duplicate mutation, or background overflow.

Browser scripts must launch/wait for a local isolated server, fail on page/console/request errors, and upload traces/screenshots only after sanitization. Visual diff thresholds and golden updates require product approval.

## 15. R8 — CI, dependency hygiene, truthfulness, and production rehearsal

### 15.1 CI in stages

Pin Node 22 with `engines` and a repository version file. Add `.github/workflows/verify.yml` (or the organization’s approved equivalent) with least-privilege permissions and no production secrets.

Required jobs:

1. `npm ci` with lockfile unchanged.
2. Typecheck.
3. Client and server unit/integration tests.
4. Production build, with a source/runtime assertion that build made no DB connection or migration.
5. PostgreSQL service job using a uniquely named test database and `TEST_DATABASE_URL`; run migration-from-zero and existing PostgreSQL storage verifiers. Safety script must reject non-test/dev/prod-looking URLs.
6. Start isolated app, wait for `/readyz`, run device/tutorial/chunk/terminal browser verifiers, then tear down.
7. Secret scan with redacted findings.
8. Dependency vulnerability report with explicit severity/triage policy; no blind major upgrades.
9. Upload sanitized failure artifacts only.

Add package scripts such as `verify:desktop`, `verify:tutorial`, `verify:chunk`, and `verify:ci` rather than relying on undocumented manual commands.

### 15.2 Repair lint before making it a hard gate

Current ESLint configuration inherits JavaScript base rules into TypeScript and has produced thousands of mostly configuration-driven errors. Sequence:

1. Correct file globs, ignores, TypeScript globals/parser, and base rule overrides.
2. Ensure `react-hooks/rules-of-hooks` is an error.
3. Classify existing findings; remove false positives without blanket disables.
4. First enforce zero new errors on changed files.
5. Burn down the reviewed baseline in scoped commits.
6. Make full `npm run lint -- --max-warnings=0` a release gate only when the baseline is zero.

Unexpected React console warnings and open handles remain test failures even before full lint is mandatory.

### 15.3 Dependency removal

Use source/import graph and runtime/build proof before targeted `npm uninstall`. Review lockfile diff and rerun `npm ci`, tests, and build after each group.

Likely dead auth/session candidates include `connect-pg-simple`, `express-session`, `memorystore`, `openid-client`, `passport`, `passport-google-oauth20`, `passport-local`, and matching types, but remove only after OAuth refactor/call-site proof. Do not remove both `framer-motion` and `motion`; both have imports. Do not delete the lockfile.

Stripe packages are already absent. Crypto-payment code is already absent. No remediation commit should manufacture work to remove them again.

### 15.4 Documentation and compliance truthfulness

Audit at least:

- `SECURITY.md`
- `APPLE_PAY_GOOGLE_PAY_COMPLIANCE.md`
- `DEPLOYMENT.md`
- `replit.md`
- `ios-README.md`
- `scripts/deploy.js`
- `docs/taptpay-product-brief.md` and duplicated design-upload copy
- WooCommerce `README.md`, `readme.txt`, and changelog
- customer-facing legal/privacy/security copy.

Remove or qualify claims of “production ready,” PCI/SAQ status, all-endpoints-protected, bank-level encryption, native wallet/Tap-to-Pay support, automatic monitoring/failover, working API keys, and automatic seeding unless current evidence proves them.

Use a truthfulness matrix:

| Claim | Evidence artifact | Named owner | Status |
|---|---|---|---|
| PCI scope/SAQ | Actual HPP/Hosted Fields/native data-flow assessment | Compliance professional | Unverified / verified |
| Apple/Google wallet support | Real provider implementation and UAT | Payments owner | Unsupported / UAT / verified |
| Tap to Pay | SDK, entitlement, build, device UAT | Native/provider owner | Not implemented / verified |
| Encryption at rest | R5 backfill/restore evidence and platform controls | Security owner | Partial / verified |
| Monitoring | Health, durable jobs, alerts, runbooks | Operations owner | Partial / verified |
| Production ready | Every final gate and approver | Release owner | Blocked / approved |

Do not edit legal promises as casual copy cleanup. Product/legal approves published wording. PCI scope, AML/KYB, sanctions, privacy retention, chargebacks, merchant-of-record, and settlement need professional review.

### 15.5 Ecommerce/WooCommerce disposition

The current admin API-key surface is mock and database methods are placeholders. Keep `FEATURE_ECOMMERCE_API=false`, remove hardcoded keys/merchant 1 behavior, and make the WooCommerce plugin state unsupported until a separately approved API design exists.

If later implemented, require:

- cryptographically random raw API key returned once;
- digest-only storage plus prefix/last-four metadata;
- merchant scope, typed permissions, expiry, revoke/rotation, and distributed rate limit;
- no hardcoded merchant;
- signed outbound webhook outbox with protected secret;
- URL canonicalization and SSRF protection;
- idempotency and durable payment attempts;
- end-to-end plugin UAT and truthful marketplace documentation.

OpenAPI and full ecommerce work remain explicitly deferred from this remediation.

### 15.6 Settlement/accounting gate

D4 does not authorize real multi-merchant processing. Obtain written provider/legal/accounting answers to:

- Who is merchant of record?
- Which Windcave account receives each capture?
- Is submerchant identity required in each request?
- How are merchants onboarded and funds paid out?
- Who owns processor fees, refunds, disputes, reserves, and chargebacks?
- What reconciliation reports/API are authoritative?
- Is TaptPay holding or transmitting client money?

If TaptPay must settle merchants, create a separate approved accounting design for an append-only balanced ledger, settlement batches, immutable source references, reversals, reconciliation, and audit exports. Existing `merchant_settlements`, historical `platform_fees`, or transaction events are not proof of a working ledger. This becomes a production go-live prerequisite, not an improvised R3 migration.

### 15.7 Production rehearsal

Owner: production operator with engineering, security, payments, and database reviewers.

1. Name the exact release SHA and dependency lock hash.
2. Verify current target identity and read-only migration status/fingerprint.
3. Create managed encrypted snapshot; record snapshot ID privately.
4. Restore to isolated scratch Neon project with no external jobs/messages/provider credentials.
5. Verify representative row counts, constraints, indexes, FK actions, status distributions, tenant isolation, and decryptability without printing data.
6. Record RPO/RTO and perform rollback timing.
7. Rehearse each forward migration with lock/statement timeouts and duration.
8. Run full CI plus fault tests against the restored clone.
9. Deploy expansion migration through the separately approved step; never through build.
10. Deploy code with all new initiation flags false and `PAYMENT_MODE=disabled`.
11. Verify health/readiness, login, tenant isolation, reconciliation backlog, cron lock/freshness, logs/redaction, and device smoke.
12. Enable UAT capabilities one at a time with synthetic merchants; observe metrics and roll back flag on any anomaly.
13. Production enablement occurs only after final approval and a merchant-impact/maintenance communication plan.

## 16. Test and evidence matrix

Every row needs automated evidence unless marked human/provider.

| Risk | Required proof |
|---|---|
| Committed secrets | Redacted tree/history scan, rotation record, old-key rejection |
| Cross-tenant access | Two-merchant dynamic HTTP tests for read/write/delete/export/upload/refund |
| Demo login | Production-mode startup/seed tests and read-only target check |
| Fake payments | Mode matrix and zero-side-effect tests for every retired/disabled route |
| Route inputs | Strict numeric/UUID/query/body tests; source guard against permissive parse |
| Provider SSRF/domain | URL parser adversarial matrix and redirect tests |
| Provider authenticity | Query-session exact field match fixtures and mismatch alerts |
| Duplicate payment | Same key, different key, concurrency, callbacks/FPRN, crash/restart |
| Split payment | Share binding, exact cents, no cross-share completion, one counter increment |
| Refund | Stable X-ID, unknown reconciliation, balance lock, no premature release |
| Subscription | Entitlement snapshot report, idempotent UAT charge, dunning policy |
| Encryption | Tamper/AAD/rotation/CAS/backfill/restore tests and zero plaintext count |
| Scheduler | Two-instance lease, persisted history, stale alert, retry/restart |
| Logs | Nested sensitive-value redaction and request ID propagation |
| Hooks/frontend | No hook crash/console warning; loading/error/empty truthfulness |
| Devices/tutorial | Approved phone/tablet/desktop visual and interaction matrix |
| Native | Build plus real supported-device UAT; otherwise feature remains off |
| Compliance | Named professional signoffs and corrected claims |

### 16.1 Required command gate for a release candidate

Use scripts added by this plan; do not assume names exist before their phase creates them.

```text
npm ci
npm run check
npm run lint                 # after lint baseline reaches zero
npm run test:client -- --runInBand
npm run test:server -- --runInBand
npm run test:server:postgres # isolated TEST_DATABASE_URL only
npm run build
npm run verify:chunk
npm run verify:desktop
npm run verify:mobile
npm run verify:terminal-dock
npm run verify:tutorial
git diff --check
```

The CI orchestrator must start and stop its own isolated server. Browser verifiers fail on any unexpected console/page/request error; they do not merely print it.

## 17. Suggested commit sequence

Keep commits reviewable and do not mix unrelated source churn. Exact numbering may change, but dependency order may not.

1. `security: add failing P0 route and startup tests`
2. `security: centralize fail-closed runtime configuration`
3. `security: retire transaction clearing and production demo seed`
4. `payments: quarantine simulation wallet NFC refund and mock API surfaces`
5. `security: scrub tracked configuration and add secret-scan guard`
6. `ops: remove automatic production dumps and side-effectful deploy build`
7. `test: add injectable HTTP app harness and route policy inventory`
8. `security: add strict ID parsing and tenant-scoped route batches`
9. `auth: harden OAuth origin proxy trust and shared throttling`
10. `fix: repair hook order and truthful frontend failure states`
11. `test: approve current device and tutorial baseline`
12. `payments: type Windcave transport URLs and query outcome verifier`
13. `db: add expected provider identity and durable notification expansion`
14. `payments: converge callbacks FPRN and invoice attempts`
15. `payments: enforce aggregate state machines and one finalizer`
16. `refunds: add durable idempotent refund and reconciliation workflow`
17. `crypto: deploy legacy-field compatibility reader`
18. `crypto: enable encrypted writes`
19. `ops: add dry-run and resumable encryption backfill`
20. `billing: implement approved entitlement provenance`
21. `ops: add durable cron leases health readiness and structured logs`
22. `native: remove stubs and gate Tap to Pay capability`
23. `ci: add full isolated verification pipeline`
24. `chore: remove proven-dead dependencies and mock remnants`
25. `docs: replace unsupported production and compliance claims`

Encryption E1/E2/backfill must not be squashed into a release that prevents compatibility rollback. Schema expansion and code deployment evidence should remain distinguishable.

## 18. Stop conditions

Stop the current phase immediately, leave money initiation disabled, preserve evidence, and escalate when any of these occurs:

- a secret appears in a diff, log, artifact, screenshot, or response;
- old rotated credentials still work unexpectedly;
- target database identity is uncertain;
- migration status has pending, drifted, orphaned, or unexpected applied entries;
- backup/restore or decrypt proof fails;
- a migration exceeds rehearsed lock/statement budget;
- merchant A can read, mutate, export, upload for, refund, or delete merchant B data;
- production-mode code can reach simulation, UAT, a stub token, or an unapproved provider host;
- amount, currency, reference, session, share, or provider environment mismatch can finalize;
- duplicate/concurrent/lost-response testing can double-charge, double-refund, double-count, or double-notify;
- an ambiguous refund releases its reservation;
- subscription policy would block an intended active merchant;
- scheduler lease permits two money-job executors or required jobs are stale without alert;
- plaintext backfill count increases unexpectedly, an envelope cannot decrypt, or an old-key backup cannot restore;
- a hook crash, page error, console error, false-empty business state, phone/tablet/desktop regression, or broken tutorial appears;
- real funds-model, PCI, native, privacy, or legal claims lack the named professional approval.

Do not mark a phase complete because time or context is running out. Record it as incomplete with the exact blocker.

## 19. Explicitly deferred work

Do not start these unless a required gate promotes them into scope:

- organization hierarchy and generalized RBAC beyond the explicit route matrix;
- merchant-model normalization;
- full public ecommerce API/OpenAPI and WooCommerce marketplace release;
- Tap to Pay implementation before SDK/entitlement contracts;
- crypto payments;
- deletion of historical Stripe schema;
- generalized load testing beyond targeted money-route, worker, and migration concurrency;
- a financial ledger unless D12 proves TaptPay owns settlement obligations;
- cosmetic redesign unrelated to truthful error/capability states;
- legal/compliance conclusions by a coding model.

## 20. Final go-live gate

Production money initiation can be considered only when all applicable boxes are checked and evidence points to the exact final SHA:

### Security and tenancy

- [ ] Incident closed; all burned credentials rotated; old credentials rejected.
- [ ] Current tree/history secret findings reviewed; no unapproved secret remains.
- [ ] Demo seeding impossible and known demo login disabled in production.
- [ ] Destructive transaction clearing removed/tombstoned with zero-delete tests.
- [ ] Every sensitive route is in the policy inventory and passes runtime role/tenant tests.
- [ ] OAuth, canonical origin, proxy trust, rate limiting, strict IDs, file authorization, DTOs, and redaction pass.

### Payments and refunds

- [ ] `PAYMENT_MODE`/feature matrix fails closed; production cannot simulate or call UAT.
- [ ] All fake wallet/NFC/Tap/refund/API-key success paths are removed.
- [ ] Every enabled purchase uses a durable attempt, stable X-ID, exact expected fields, shared provider verifier, and atomic finalizer.
- [ ] Callback/FPRN/retry/restart/concurrency tests prove one financial outcome and one message set.
- [ ] Refunds satisfy stable idempotency, unknown reconciliation, balance reservation, share mapping, and owner policy before their flag is enabled.
- [ ] D12 funds model is signed off; required settlement ledger/reconciliation exists if applicable.

### Data and database

- [ ] Named target migration status/fingerprint is clean.
- [ ] Managed snapshot and isolated restore/decrypt rehearsal pass within RPO/RTO.
- [ ] All migrations passed dirty-data preflight, timeout/lock rehearsal, from-zero and restored-schema comparison.
- [ ] No scoped bank/credential plaintext remains; backup retention and key rotation drill are approved.
- [ ] No production database dump is created by app/dev startup or committed.

### Billing and operations

- [ ] D9 entitlement/dunning policy is approved and production snapshot shows no unintended lockout.
- [ ] Stored-card capture/charge/retry/decline has approved Windcave UAT evidence.
- [ ] Cron scheduler, distributed lease, persisted history, reconciliation worker, backlog/freshness alerts, health/readiness, and graceful shutdown pass.
- [ ] Request IDs and structured redacted logs are present; runbooks name owners and escalation paths.

### Product, native, and compliance

- [ ] Final phone/tablet/desktop/auth/onboarding/tutorial matrix is product-approved with zero tolerated errors.
- [ ] Mobile appears only under the approved phone contract; tablet/desktop share the UI; desktop stays centered in its rounded 13-inch frame.
- [ ] Every visible merchant control is backed by a real enabled API or truthfully disabled/hidden; no mock business data.
- [ ] Tap to Pay remains off, or real SDK/entitlement/build/device-UAT evidence is approved.
- [ ] Security, deployment, product, iOS, wallet, and WooCommerce documentation matches reality.
- [ ] PCI, AML/KYB, sanctions, chargeback, privacy/retention, merchant-of-record, and settlement reviews are completed by qualified owners.
- [ ] Sandbox beta completed with synthetic merchants and fault injection before any production enablement.

Required approvers: engineering owner, security owner, database owner, operations owner, payments/provider owner, product owner, and the relevant legal/compliance/accounting professionals. “Tests pass” is not a substitute for their external decisions.

## 21. Reviewer and handoff process

### 21.1 Required reviewer pass

Before any phase is implemented, the reviewer reads the proposed diff/ADR/preflight and returns exactly:

```text
## Verification of Prior Fixes
## Blocking Issues
## High-Risk Concerns
## Missing Steps
## Unsafe Assumptions
## Required Ordering Changes
## Open Product / Provider / Legal Questions
## Compliance and Data-Handling Notes
## Test and Rollback Adequacy
## Final Recommendation (Approve / Do not approve)
```

An **Approve** must cite evidence for every previously blocking issue and state the exact commit/phase scope approved. A second pass by another reviewer—or a separately recorded independent reread—checks that the first review did not miss unsafe interactions. “Approve with unresolved blockers” is not approval. No implementation starts until the final recommendation is Approve; any new blocking evidence returns the phase to review.

### 21.2 Phase handoff template

```text
Phase / release:
Exact branch and commit:
Scope completed:
Files changed:
Migrations (names/checksums/target; or none):
Preflight queries and count-only results:
Commands run and results:
Negative/no-side-effect tests:
Provider/UAT activity (synthetic only, IDs redacted):
Device/browser evidence:
Security/privacy review:
External actions performed by whom:
Feature flags and payment mode after deploy:
In-flight operations/reconciliation status:
Known warnings or deferred items:
Rollback commit and rollback constraints:
Approvals:
Stop conditions checked:
Next phase prerequisites:
```

The next implementer must start from this handoff and verify the recorded state. They must not infer completion from a green test count, a migration filename, a schema comment, a UI control, or an old “production ready” document.

## 22. Master content checklist and phase crosswalk

This section is normative and confirms that every required master-plan topic is in scope. It maps the requested Phase −1 through Phase 11 checklist onto R0–R8. Where repository evidence makes the literal task stale or unsafe, the item remains explicit with one of these dispositions:

- **implement** — work remains;
- **verify/preserve** — the control already exists; prove it and do not rebuild it;
- **verified no-op** — the removal already happened; add an absence guard/documentation correction;
- **compatibility alias** — accept the requested flag name fail-closed while using a more precise internal boundary;
- **superseded for safety** — keep the goal but use the safer mechanism stated here.

### 22.1 Governance, D1–D8, and constraints

- [ ] Record D1–D8 in `docs/decisions/`, including D4 platform-owned Windcave credentials and D8 encrypt-and-keep bank data as **provisional product/legal decisions**.
- [ ] D1 assumes live merchants and real payments exist and treats every production row/artifact as live.
- [ ] D2 keeps historical Stripe schema columns until dead-proof and a separately reviewed migration; this remediation proposes no drop.
- [ ] D3 keeps Replit + Neon as the target for the remediation period.
- [ ] D4 permits platform-owned `WINDCAVE_USERNAME` / `WINDCAVE_API_KEY` technically for UAT; real processing also needs D12 funds-flow approval.
- [ ] D5 keeps crypto OFF. `FEATURE_CRYPTO` is a false-only kill switch/invariant; true is rejected and no crypto code is recreated.
- [ ] D6 runs synthetic beta merchants against sandbox/UAT first; real processing waits for every applicable gate.
- [ ] D7 cuts/records the remediation branch from the product-approved active tablet/desktop SHA.
- [ ] D8 encrypts and keeps legacy bank data provisionally, with no new collection and a later retention/deletion decision.
- [ ] Enforce the feature freeze: no new verticals or noncritical features.
- [ ] Use the ADR decision log for every locked choice, change, exception, open provider/legal choice, and superseding decision.
- [ ] Complete the §21 reviewer template and independent second pass before implementation; final recommendation must be Approve.
- [ ] Apply boring-over-clever, fail-fast/fail-closed, never-trust-the-client, money-is-traceable, and reversible-change principles from §1.4.

### 22.2 Requested Phase −1 — handoff and preflight

This maps to §1, §3, §8.1, and the preflight portion of R0.

- [ ] **Step 0 prerequisite — reconcile, do not blindly apply.** Read the pending-migration instructions in `docs/PLAN-2026-08-10-finish-review-and-fix.md`, name the target, and run read-only migration status/fingerprint. The 2026-08-24 inspected dev target reports 19 applied, 0 pending, 0 drifted, 0 orphaned, so Step 0 is currently satisfied without an apply. If a named dev target later shows a legitimate pending migration, stop, restore-test, rehearse, obtain migration approval, and apply only that reviewed forward migration. Any failure is a stop condition.
- [ ] Read `CLAUDE.md`, `AGENTS.md`, all listed handoffs/plans, `replit.md`, and `DEPLOYMENT.md`.
- [ ] Inventory active branch/SHA, dirty and in-flight work, worktrees, unmerged migrations, open PRs, deployment candidate, and owners. Do not infer open-PR state without checking the authorized remote.
- [ ] Inventory deployments: public/admin/payment/provider hosts; canonical domains; Replit build/run/release commands; autoscaling; env/secret sources; Neon projects/branches/roles; WebSocket adapter; scheduler; object storage; DNS/TLS; backup and rollback capability.
- [ ] Inventory and preserve existing auth middleware, JWT/admin validation, hashed retail bearer tokens, payment attempts/dedupe, DTO allowlists, redaction, migration runner, PostgreSQL verifiers, browser checks, rate limiting, and state claims.
- [ ] Classify live data, uploads, local/managed backups, logs, Git history, provider identifiers, bank fields, OAuth tokens, push subscriptions, and synthetic/test data.
- [ ] Record the coordination agreement: existing phone behavior, tablet full-bleed UI, centered desktop frame, auth/onboarding, tutorial adaptation, real API wiring, and no mock merchant data remain acceptance constraints.

### 22.3 Requested Phase 0 — safety nets before churn

This maps to R0 plus §15.7. Incident containment may occur before ordinary churn; no production mutation is delegated to a coding model.

- [ ] Create a managed Neon snapshot and, if required, an encrypted logical backup; restore into an isolated scratch project and verify schema, representative counts, tenant isolation, and decryptability. Record RPO/RTO and owner.
- [ ] After review approval, create `pre-remediation-<date>` tag, archive/checksum the deploy artifact in approved storage, and record exact rollback commands, flag rollback, schema compatibility, secret-rotation caveats, and responsible operator.
- [ ] Route-enforce `FEATURE_LIVE_WINDCAVE`, `FEATURE_REFUNDS`, `FEATURE_CRYPTO=false`, `FEATURE_WOOCOMMERCE=false`, `FEATURE_TAP_TO_PAY`, and `FEATURE_SPLIT_PAYMENTS`. §5 defines canonical mappings and adds per-domain flags so a broad switch cannot accidentally stop reconciliation.
- [ ] Defaults are off/fail-closed for staging and new deployments. A production enablement/change needs a business decision, merchant-impact/maintenance plan, rollback owner, and observation window.
- [ ] Run the current CI characterization without masking hook crashes, React warnings, page errors, tolerated visual defects, or pre-existing lint configuration failures.
- [ ] Add Zod configuration validation with `ENV_VALIDATION_MODE=audit|enforce`. First deploy may audit/warn for inventoried noncritical optional groups without values. Security-critical variables, invalid payment/environment combinations, partial credential pairs, and production seed/simulation are always enforced immediately. Move each feature group to enforce only after its inventory is complete; production money enablement requires all relevant groups enforced.
- [ ] Make deployment build side-effect-free: replace `npm run build && npm run db:migrate` with build only. Migrations run in a separately approved release step.
- [ ] Remove automatic production DB dumping from development startup.

### 22.4 Requested Phase 1 — non-destructive Stripe removal

Disposition: runtime/package removal is a verified no-op; inventory and documentation remain.

- [ ] Run case-insensitive searches across source, generated entry points, routes, webhooks, UI, env templates, deployment config, package/lock files, WooCommerce, and current docs.
- [ ] Require zero Stripe runtime imports/routes/UI/webhooks/env reads. If a reachable runtime path is found, remove it with focused tests.
- [ ] Uninstall a Stripe package only if lockfile/import/build proof shows it remains; at review time Stripe packages are already absent.
- [ ] Inventory every historical `stripe_*` column/table reference, annotate deprecated/historical, and preserve it. A future drop needs data count, code/history dead-proof, backup, forward migration, and approval.
- [ ] Remove stale Stripe and unsafe production-ready/compliance wording from `SECURITY.md`, `APPLE_PAY_GOOGLE_PAY_COMPLIANCE.md`, `DEPLOYMENT.md`, README/product/plugin/legal copy while preserving truthful historical migration notes.

### 22.5 Requested Phase 2 — dependency and repository hygiene

Audit early; perform removal churn in R8 after P0 behavior is protected.

- [ ] Capture `npm ls --all`, direct/transitive dependency graph, package-lock integrity, import graph, build bundle evidence, runtime dynamic imports, and native/build/test consumers.
- [ ] Treat every old v1 “typo/removal” list as examples to verify, never an uninstall list.
- [ ] For each proven-unused group run targeted `npm uninstall <exact packages>`, then `npm ci`, review `package.json` and lockfile diff, typecheck/test/build. Never delete or regenerate the lockfile casually.
- [ ] Verify compatible `react` and `react-dom` remain runtime dependencies. Move `@types/*`, compilers, test runners, linters, and build-only tooling to `devDependencies` only after production build/install proof.
- [ ] Select and retain one email delivery provider/adapter. Remove SendGrid/Resend/Nodemailer alternatives only after route/job/config/template and production delivery proof. Preserve a provider-independent interface and test fake.
- [ ] Make scripts explicit and portable: use `cross-env` where environment assignment must work on Windows, keep explicit Vite + esbuild production build, use a clear `tsx watch` development script, and prove Linux/Replit behavior does not regress.
- [ ] Add `.nvmrc`/Node engines, complete `.gitignore`, and a key-name-only `.env.example`; rename package `rest-express` to the approved TaptPay package name with lockfile review.
- [ ] Inventory `taptpay-ios.zip`, visual/demo archives, tracked `uploads/`, `attached_assets/`, screenshots, `.verify1.mjs`, stray HTML, generated bundles, local audit scripts, database dumps, and AI-tool folders. Classify reachability, design provenance, licensing, PII, and handoff need before removal. Move required artifacts to approved storage/docs, remove proven junk with explicit paths, and document/ignore `.claude-home/**`, local AI state, dumps, traces, and runtime uploads. Never wholesale-delete design sources or live uploads based only on a filename.

### 22.6 Requested Phase 3 — database correctness and migration safety

- [ ] Verify/preserve the Neon WebSocket Drizzle adapter; remove a conflicting SQLite import only if a new source audit finds one. Current audit found none.
- [ ] Harden the existing runner rather than replacing it: explicit target identity, advisory-lock timeout, `lock_timeout`, `statement_timeout`, structured/redacted logging, backup/rehearsal gate, destructive/drop approval, and no auto-apply from build/startup.
- [ ] Run count-only dirty-data preflights before every unique/CHECK/FK/not-null change and record reviewed cleanup decisions without row values.
- [ ] Rehearse on a production-sized restored clone and measure locks. Handle concurrent indexes only through an explicitly reviewed runner mode or approved short-lock window.
- [ ] Review constraints/indexes for provider notification identity, client/provider idempotency keys, normalized email uniqueness, FK integrity, tenant ownership, merchant/status/created-at queries, session/X-ID/provider-transaction lookup, refund reconciliation, and job claims. Add only query- and data-proven indexes.
- [ ] Plan `timestamptz`/UTC normalization as separate forward migrations: define ambiguous legacy timezone, convert on a restored clone, store UTC, display in merchant/user locale, and test DST boundaries. Do not mix this with money schema.
- [ ] Financial records have no hard-delete API. Use void/cancel/correction events and, for nonfinancial mutable records where deletion is allowed, reviewed `deleted_at` semantics.

### 22.7 Requested Phase 4 — Windcave notification integrity

- [ ] Remove any route-local `express.urlencoded()` / `express.json()` parser on Windcave notifications so one bounded application/provider parser owns the body. Do not add raw-body signature machinery unless Windcave proves a signed mode is active.
- [ ] Treat the notification as a hint: extract bounded `sessionId` / `transactionId`, durably record it, query Windcave with validated platform credentials, and match final status, exact cents, currency, platform provider account/environment, locally bound merchant/aggregate, merchant reference, session, type, and provider transaction.
- [ ] Reject/quarantine every missing, malformed, ambiguous, pending-as-final, or mismatched result. Log a sanitized failure/security event with request ID, never the raw body or full provider identity.
- [ ] Dedupe through the existing durable retail payment attempt plus the R3 provider-notification inbox. Its unique provider/session/kind key is the Windcave equivalent of requested `webhook_events(provider,event_id)`; do not invent an event ID the provider does not supply.
- [ ] Multiple, duplicate, delayed, and out-of-order FPRNs/callbacks are safe; only one atomic finalizer can create the terminal domain/event/message effects.

### 22.8 Requested Phase 5 — incident response, secrets, uploads, and encryption

- [ ] D4 uses platform-owned `WINDCAVE_USERNAME` / `WINDCAVE_API_KEY` as the short-term technical model and remains provisional for real funds.
- [ ] Support `MASTER_ENCRYPTION_KEY` only as an initial single-key/E1 compatibility input if needed; production design must expose an active key ID and readable keyring so rotation is possible. Validate a 32-byte key and never log it.
- [ ] The checklist shorthand `enc:v1:iv:tag:cipher` remains the versioned AES-256-GCM envelope concept. New writes use the safer rotation-capable `enc:v1:<key-id>:<base64url(iv)>:<base64url(tag)>:<base64url(ciphertext)>`.
- [ ] Deploy dual-read plaintext compatibility, then encrypt-on-write, then dry-run and idempotent CAS backfill. “Instant rollback via dual-read” means rolling back to an E1-compatible reader while stopping the writer/job; it never means resuming plaintext writes or deploying pre-E1 code after ciphertext exists.
- [ ] Detect/count plaintext and malformed/unknown/decrypt-failed envelopes without printing values. Decrypt only inside authorized server data/provider/operations services; never in browser DTOs, general logging, analytics, or templates that do not require it.
- [ ] Mask secrets and legacy bank fields in every API DTO; extend the central redactor to nested logs/errors/events.
- [ ] Audit sanitized backfill success/skip/failure counts and secret/key rotation events.
- [ ] Run gitleaks or approved equivalent on current tree/history; rotate and execute §7.1 incident steps for every real secret/PII exposure.
- [ ] Secure file uploads: authenticate and tenant-authorize before streaming; strict byte-size, count, extension-independent MIME/magic validation; randomized object keys; malware scanning/quarantine where appropriate; no executable serving; private object storage; short-lived signed download URLs after authorization; retention/deletion audit; no commits of runtime uploads.

### 22.9 Requested Phase 6 — authentication, authorization, and state machines

- [ ] Keep JWT bearer auth short-term. Schedule and ADR an evaluation of HttpOnly secure SameSite cookies + CSRF for web and OS secure storage for native; do not silently swap token transport during remediation.
- [ ] Remove `express-session`, `connect-pg-simple`, `memorystore`, and related packages only after route/import/runtime dead-proof.
- [ ] Standardize minimal JWT claims: subject/user ID, merchant ID where applicable, role/principal type, issued/expiry, token version/session ID, issuer/audience; no bank/provider secrets or mutable profile data. Use centralized `requireAuth`, `requireMerchant`, and `requireAdmin` middleware (or documented equivalent names) with server/database validation.
- [ ] Complete the route policy matrix for method, path, principal, role, tenant scope, parameter/body/file validation, feature/billing gate, idempotency, rate limit, DTO, and side effects.
- [ ] Dynamic two-merchant and admin integration tests prove Merchant A never sees or changes Merchant B.
- [ ] Production seed/demo login is disabled and audited.
- [ ] Password reset tokens are random, digest-only at rest, single-use, short-lived, tenant/account scoped, invalidated on success/password change, and responses do not enumerate accounts. Password change invalidates prior sessions/token version.
- [ ] Shared/distributed rate limits cover login, signup, reset, payment/session creation, public payment/result polling, admin, provider notification abuse, email/SMS/WhatsApp, upload, and API-key paths with proxy/IP correctness and account/tenant dimensions.
- [ ] Lock CORS to exact approved origins/methods/headers/credentials; provider server-to-server routes do not rely on browser CORS as authentication.
- [ ] Enforce aggregate-specific state machines. The requested current public subset `pending`, `completed`, `failed`, `refunded`, `partially_refunded` is preserved, but repository reality also requires `processing` and `cancelled`; no silent renaming to provider `approved/declined`.

### 22.10 Requested Phase 7 — payment engine hardening

- [ ] Preserve the existing hash-only retail public payment token model; audit entropy, digest comparison, expiry/rotation/single-resource scope and return-state use. Do not create a second retail token system. Property/trades raw link tokens follow the staged hash migration in §10.1.
- [ ] Enforce exact UAT/production Windcave hosts and returned-link relations in code, not only CSP.
- [ ] Test every disabled money route for its specified `404/503` (or role `403`) and zero DB/provider/SSE/push/outbox effects. The exact code follows §5.4 rather than interchangeable 403/404.
- [ ] Move route orchestration into focused `server/services/payments/` modules or an equivalently documented domain directory. Route handlers authenticate/validate/call services/map DTOs; they do not implement provider state machines.
- [ ] Use durable client idempotency, request fingerprints, stable provider X-IDs, leases, and database uniqueness for payments, refunds, subscriptions, and notification processing.
- [ ] Preserve/extend `transaction_events` for created, session-bound, processing, approved/completed, declined/failed, cancelled, refunded, webhook/FPRN, split, manual correction, and reconciliation events. Events are append-only and written with the state change.
- [ ] Reserve the schema names `financial_ledger_accounts` and `financial_ledger_entries` in the D12 accounting ADR. Ship domain events now. Implement the append-only balanced ledger only if funds-flow/accounting review makes it a gate; do not create decorative unused tables.
- [ ] Centralize integer-cents parsing/formatting/allocation; no binary float math for new financial logic. Define currency scale and overflow.
- [ ] Test NZ GST 15% inclusive and exclusive, cent rounding/allocation, line totals, quotes→invoices, split shares, partial/full refunds, and reporting/export totals against approved accounting examples.
- [ ] Split safeguards: min/max participant/share count, exact total allocation with deterministic remainder, immutable share binding, unique live attempt, caps, transactions/locks, abandonment/expiry, and idempotent completion.
- [ ] Refund safeguards follow R4: eligibility, owner role, confirmed captured gateway/share ID, remaining cap, stable idempotency/X-ID, unknown reconciliation, verified notification/query, and one terminal update.
- [ ] Windcave provider interface exposes typed `createSession`, `querySession/queryTransaction`, `createRefund`, `verifyOutcome`, and sanitized error categories through injected transport.
- [ ] Hosted payment retry rules: same client key reuses the live session; never create a second session while a provider-bound attempt is unknown; persist and validate return state; model 3DS required/redirect/complete/failed/expired fields in attempts/events before enabling that path.
- [ ] Build a settlement reconciliation report comparing local confirmed operations with authoritative gateway exports/API: counts, gross cents, processor fees, refunds, disputes where available, net, unmatched local, unmatched provider, and age. It does not claim merchant payout correctness until D12 is resolved.

### 22.11 Requested Phase 8 — frontend and native

- [ ] Add centralized typed route constants/builders in `shared/routes.ts` (or an ADR-approved split for server/client) and replace payment/auth/protected hardcoded strings in reviewed batches.
- [ ] Audit protection and device shell for `/terminal`, `/stack`, `/smart-terminal`, `/property/*`, `/trades/*`, and `/admin/*`; test unauthenticated, member, owner, other tenant, and admin cases.
- [ ] Preserve/extend the global React/chunk error boundary with a friendly retry/reload action, request ID where safe, and no stack/internal error details.
- [ ] Every data page distinguishes loading, error, true empty, partial/unknown, retrying, and success; money CTAs disable on essential uncertainty.
- [ ] One terminal payment UI/controller state machine owns idle, validating, claiming, redirect/native pending, processing, approved, declined, cancelled, error, and retry; one client action cannot double-submit.
- [ ] Capacitor work aligns `startTapToPay` in TypeScript, Swift, and `CAPPluginMethod`; removes `window.TaptPay`; uses `useTapToPay`; and detects web/iOS/unsupported OS-device/SDK/entitlement/offline/server-feature/provider-mode. Until real proof, capability is false.
- [ ] Re-run tablet/desktop/mobile/auth/onboarding/tutorial acceptance after every terminal-affecting batch.
- [ ] Accessibility pass covers names/labels, error association, focus order/trap/restore, keyboard operation, visible focus, semantic status/alerts, contrast, reduced motion, screen reader payment status, and approved tap-target geometry without blindly changing mobile layout.

### 22.12 Requested Phase 9 — operations, observability, staging, and delivery

- [ ] Add secret-free `/healthz` and `/readyz` per §13.4.
- [ ] Propagate validated/generated `X-Request-ID` (response header may use canonical `X-Request-Id`) through all request/job/provider logs.
- [ ] Emit structured logs through existing extended redaction.
- [ ] Record sanitized payment events/metrics for created, processing, approved/completed, declined/failed, cancelled/expired, refund states, FPRN mismatch/failure, duplicate ignored, reconciliation, and Tap-to-Pay capability/actions if ever enabled.
- [ ] Add a Sentry-class error tracker only after DPA/data-region/sampling/retention review and a before-send scrubber proves no secret, card, bank, token, raw provider body, or PII leakage. Keep it disabled until configured.
- [ ] Use durable background work/leases/outbox for expiry, provider retry, email/SMS/WhatsApp, reminders, PDFs, reports, subscription billing, payouts, and reconciliation. Reuse existing jobs; add missing durability rather than duplicating them.
- [ ] Staging has a separate Neon database/project/roles, UAT credentials, synthetic merchants/customers, separate push/email destinations, no production PII or copied live secrets, and external side effects captured/allowlisted.
- [ ] Runbooks cover backup/restore, Windcave outage, DB outage, secret leak, suspected breach, fraud spike, notification backlog/failure, refund unknown, subscription double-charge risk, admin compromise, scheduler stale, rollback, and customer/merchant communications.
- [ ] CI/branch protection requires PR review, typecheck, repaired lint, tests, build, isolated PostgreSQL/migration verification, secret scan, dependency triage, and migration-owner review.
- [ ] Use releases/tags/changelog with exact SHA, migrations, flags, known issues, artifact checksum, rollback, and evidence links.
- [ ] Provide a portability escape hatch: reviewed `Dockerfile`/container build, environment contract, health checks, migration release command, and deployment docs that can run away from Replit without pretending this remediation is a platform migration.

### 22.13 Requested Phase 10 — compliance and legal truthfulness

- [ ] Validate PCI scope against the actual enabled Windcave HPP, Hosted Fields/AJAX, wallet, subscription-token, and native data flows; documentation alone is not evidence.
- [ ] Correct every “production ready,” PCI/SAQ, native/wallet, encryption, monitoring, and endpoint-protection claim until its gate passes.
- [ ] Product/legal owns and approves Terms of Service, Privacy Policy, Merchant Agreement, Payer Terms, Refund Policy, and Acceptable Use Policy; link versions/effective dates and acceptance evidence.
- [ ] Define retention/deletion/legal-hold for merchants, users, financial records, provider identifiers, bank data, uploads, messages, logs, audit events, backups, and encryption keys.
- [ ] Record lawful consent and per-channel communication preferences/opt-out for email, SMS, WhatsApp, and push.
- [ ] Obtain NZ GST/tax/accounting review and provide exportable, immutable financial/event records with defined rounding and timezone.
- [ ] Obtain professional AML/KYB, sanctions, merchant onboarding, fraud, chargeback, refund, merchant-of-record, and settlement review before real onboarding/processing.
- [ ] Audit every admin action and impersonation/configuration/secret/merchant-status change with actor, target, reason, time, request ID, and before/after classification without sensitive values.
- [ ] Complete the bank-data handling and D8 retention review.

### 22.14 Requested Phase 11 — explicitly deferred after gates

- [ ] Merchant god-table normalization; organization/membership/role redesign; locations, terminals, and device management.
- [ ] Broader vertical isolation and long-term WooCommerce/trades/property product strategy beyond safety kill switches.
- [ ] Full OpenAPI contract, generated typed client, pagination strategy, and generalized reporting module.
- [ ] Broad load testing, disaster-recovery drills beyond release restore proof, fraud engine, payout tracking, synthetic monitoring, and independent penetration test.

These remain deferred unless a security, funds-flow, or go-live finding makes one a prerequisite. Promotion requires an ADR and reviewer approval.

### 22.15 Complete verification matrix

Unit tests include env parsing/mode matrix, exact money/cents, 15% GST, fee/refund eligibility, split allocation/caps, every aggregate state graph, encryption envelope/AAD/rotation, redaction, URL validation, request fingerprints, and capability detection.

Integration tests include registration, login/logout/session invalidation, OAuth, password reset, rate limit, CORS, owner/member/admin denial, two-merchant isolation, transaction/payment attempt creation, provider mismatch (the query-session equivalent of a bad-signature test), duplicate/out-of-order notification, refund unknown/reconciliation, split concurrency, scheduler leases, and migration/backfill safety.

E2E tests include landing, signup/login/onboarding, protected terminal, payment creation, hosted redirect/processing/result/receipt, refund read states, admin protection, tutorial, and current phone/tablet/desktop flows in isolated UAT/fakes.

Manual/UAT matrix includes approved success, decline, cancellation, expiry, duplicate/out-of-order FPRN, amount/currency/reference/session mismatch, partial/full refund, split completed/abandoned, network loss before/after send, app background/foreground, restart, unsupported/offline native device, provider outage, stale scheduler, and demo login denied in production mode.

### 22.16 Checklist stop conditions and final approval

In addition to §18, stop on Step 0 reconciliation/migration failure, restore failure, any destructive migration without approval, cross-merchant access, reproducible duplicate payment/refund, secret in log/API/artifact, production demo login, failed GST/refund math, device/tutorial acceptance break, or any unknown CI failure. Do not relabel an unexplained failure “flaky.”

Go live only when every applicable phase exit criterion and D1–D8 item is resolved, D4/D8/D9/D10/D12 decisions have named approvals, professional reviews are complete, sandbox beta passed, and the §21 final reviewer recommendation is Approve.
