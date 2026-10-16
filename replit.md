# TaptPay repository and Replit notes

## Current status

This React/TypeScript/Vite and Express/Drizzle application is under the remediation
plan in docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md. Read CLAUDE.md and the
latest handoff before work. The preferred communication style is simple everyday
language. The user handles deployment on Replit; a Git push is not deployment.

## Runtime and data

Use the repository's `.nvmrc` Node22 pin and the committed npm lockfile. A default
development instance uses supported MemStorage with payments disabled and
simulated email; it does not persist across restarts and is not production SQL
readiness. Property/trades database behavior needs the separate owned PostgreSQL
verification workflow. Reuse the intended existing app server and preserve its
process/dependencies. Do not expose local loopback preview links.

The server validates configuration, uses cookie sessions and CSRF, checks route
policies/tenant ownership and serves public checkout/provider routes according to
their own contracts. R3 durable identities/inbox/reconciliation and R6 durable jobs
provide repository controls; actual provider/operations evidence remains required.
R5 encryption/vault rollout must be verified on the actual target, including
restore/decryptability and approved retention. No automatic production seeding,
schema push, migration in build or demo login is part of deployment.

## Payments and release

Hosted checkout needs provider UAT and compliance scope review. Native Tap to Pay,
attended POS and the ecommerce/WooCommerce API are unavailable. Keep initiation
flags off and PAYMENT_MODE=disabled until their separately reviewed enablement.
SSE messages report state; they do not prove settlement, accounting correctness
or provider verification by themselves. Do not promise wallet support, instant
settlement, PCI/SAQ approval or monitoring/failover without the required evidence.

Use DEPLOYMENT.md and docs/operations/r8-ci-verification.md for current commands.
CI has no production secrets and uses fresh random test databases plus an owned
HTTPS synthetic browser app. Actual /readyz, backups/restores, provider UAT,
Safari/VoiceOver/native builds, owner acceptance and professional/settlement
sign-off remain go-live gates. R4 belongs to Claude.
