# TaptPay release and deployment gates

A deployment is not approved by this checklist or by the presence of credentials.
The release owner must name the exact source SHA, dependency lock hash, target,
operator and approvers. R4 belongs to Claude; its integration and all deferred
R3/R5/R6/R7 release evidence remain required.

Use Node from `.nvmrc` with `npm ci`. CI uses disposable PostgreSQL17 and synthetic
browser data, with no production secrets. `npm run verify:ci` documents the local
gates; [the R8 CI runbook](docs/operations/r8-ci-verification.md) explains setup,
reports and limitations. High/critical vulnerabilities block release. The lint
baseline permits no new errors and is not a clean full-lint certification.

`npm run build` must perform no database connection, migration or seeding.
`npm run verify:build` enforces that boundary for this Node build. Never attach a
production database to CI or use `db:push` to repair drift. Expansion migrations
require their separately reviewed target-bound operator step and approved upload
ownership inventory; no migration is authorized by a web build or Git push.

Before a real deployment, complete remediation plan section15.7: verify target
identity and read-only migration/fingerprint status; take a managed encrypted
snapshot; restore it into isolated scratch with external jobs/messages/provider
credentials absent; verify counts, constraints, tenant isolation, decryptability,
RPO/RTO and rollback timing; rehearse forward migrations with bounded locks.
Synthetic empty databases do not establish backup/restore readiness for real data.

Deploy with PAYMENT_MODE=disabled and all new initiation flags false, including
FEATURE_ECOMMERCE_API and FEATURE_TAP_TO_PAY. Verify /healthz and /readyz, cookie
login/tenant isolation, reconciliation backlog, durable-cron status, redacted logs
and device smoke on the actual target. UAT capabilities are enabled individually
only through the reviewed provider/operator procedure. No demo account or seed is
a release prerequisite.

Provider UAT, actual Safari/VoiceOver/native device checks, owner visual acceptance,
PCI/privacy/AML/KYB review, merchant-of-record/settlement/accounting decisions,
external monitoring and final owner sign-off remain explicit go-live gates.
[The claims matrix](docs/operations/r8-truthfulness-and-release-gates.md) tracks
which evidence is still missing. The user deploys through Replit; this repository
work neither deploys nor enables payments.
