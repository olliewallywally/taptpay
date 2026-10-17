# TaptPay

TaptPay is a React/TypeScript merchant application with an Express API, Drizzle
and PostgreSQL, and an iOS shell. Replit and Neon remain the deployment model.
Production payment readiness is still blocked by the documented release gates.
A Git push is not a deployment or approval to process live payments.

## Current work — start here, Claude

The owner authorised the reviewed structure repair plan on October 17, 2026.

- [Structure repair plan: S0–S7 and parallel R8 cleanup](docs/architecture/structure-repair-2026-10-17/PLAN.md)
- [Execution ledger and current task ownership](docs/architecture/structure-repair-2026-10-17/EXECUTION.md)
- [Qwen findings checked against current code](docs/architecture/structure-repair-2026-10-17/QWEN-FINDINGS-REGISTER.md)
- [Independent planning review](docs/architecture/structure-repair-2026-10-17/PLAN-REVIEW.md)
- [Completed S2 stock pilot and verification](docs/HANDOFF-2026-10-17-structure-s2.md)
- [Route extraction recipe and rollback](docs/architecture/structure-repair-2026-10-17/EXTRACTION-RECIPE.md)

**Codex has completed S2: the four-route stock pilot. Claude retains R4.**
Stock routes now have their own module with typed dependencies. All 196 route
facts and registration order remain unchanged; stock storage and customer
behaviour are preserved. S3 is next, beginning with a concrete preflight for
property profiles and schedules. Coordinate before editing shared routes/storage/
policy files. Keep existing customer flows, cookie/CSRF/tenant controls, durable
payment semantics and owner decisions.

Read [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md) and the ledger before changing
code. The September29 snapshot described by Qwen is older than the current code;
its example fixes are not an instruction to rebuild already fixed controls.

## Repository map

| Path | Purpose |
| --- | --- |
| client/src | Merchant UI, existing feature modules and device-specific shells. |
| server | HTTP app, routes, business commands, durable payment/job services and storage. |
| shared | Browser-safe schemas, money and API contracts. |
| migrations | Frozen/reviewed PostgreSQL migration history. |
| scripts | Isolated verification and operator tools. |
| ios | Native shell and matching web snapshot workflow. |
| docs | Authoritative plans, decisions, operations and dated evidence. |

## Development

Use Node22.23.3 from [.nvmrc](.nvmrc) and npm10.9.9. Preserve the committed lockfile
and any running owner's dependencies. A full install supplies build/test/native
and operator tools:

```bash
npm ci
npm run dev
```

Review [Replit/runtime notes](replit.md) and [.env.example](.env.example) for
configuration keys. Store actual secrets in the appropriate private environment
settings. Development uses the supported nonpersistent memory mode with payments
disabled and simulated email when configured for that workflow. Property/trades
SQL behaviour requires the separate owned PostgreSQL checks. Do not connect a
shared or production database merely to make a local verification pass.

Build is explicit Vite plus esbuild; an already-built runtime can use a
production-only dependency install. Neither build nor startup is permission to
seed or migrate a database. Database changes follow the [migration release
procedure](docs/operations/migration-release.md).

## Verification

```bash
npm run check
npm run verify:lint
npm run test:server -- --runInBand
npm run test:client -- --runInBand
npm run verify:ci -- --stage=static
```

Use the [isolated CI runbook](docs/operations/r8-ci-verification.md) for full
unit/build/PostgreSQL/browser/secret/audit stages and prerequisites. The PostgreSQL
runner requires an explicitly guarded disposable service; it has no application
DATABASE_URL fallback. Browser checks require Chromium and matching built assets.
Private raw logs, traces and credentials do not belong in Git or public CI artifacts.

Lint currently enforces zero new errors against a reviewed baseline; full lint is
not clean. Follow [the scoped lint workflow](LINTING.md), not repository-wide
formatting or automatic fixes. Prior test counts are dated evidence, not a fresh
pass after future changes.

## Security and release status

Read [SECURITY.md](SECURITY.md), [DEPLOYMENT.md](DEPLOYMENT.md),
[the current R8 handoff](docs/HANDOFF-2026-10-17-r8-closeout.md) and
[the outstanding closeout checklist](docs/operations/r8-closeout-checklist.md).
The full dependency/history gates remain open despite a clean production-only
audit and current-tree scan in the dated evidence. Provider UAT, restored backup,
real-device/native, operations and professional sign-offs remain required.

Native Tap to Pay and ecommerce/WooCommerce are unavailable. D13 remains locked
off. Keep initiation flags and payment mode at their approved settings; a refactor
must not enable a capability. A provider's certification does not establish
TaptPay's PCI/SAQ status. The owner handles any separately approved Replit deployment.
