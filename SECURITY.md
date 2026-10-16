# TaptPay security status

Production readiness is blocked pending the remediation release gates. This file
is an engineering status statement, not an independent security audit, PCI
attestation or approval to process live payments.

The authoritative program is [the remediation plan](docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md).
See [the current claims and approval matrix](docs/operations/r8-truthfulness-and-release-gates.md)
and the newest repository handoff for exact tested commits and remaining work.

Current controls include cookie sessions with server-side identity, CSRF checks
for authenticated changes, route policies and tenant-scoped storage. Public
checkout and provider notification routes intentionally have different access
contracts. Neither an ORM nor authentication alone proves every endpoint safe.

R3 provides durable payment identities, notification intake and reconciliation.
R5 provides staged encryption and secret-vault workflows; actual target backfill,
restore/decryptability and retention decisions remain release gates. R6 provides
health/readiness, durable job coordination and structured log redaction. External
alerting, operator response and recovery evidence must be verified separately.

Native Tap to Pay is unavailable and locked off. Hosted payment integration needs
provider UAT and professional scope assessment; using a payment provider does not
establish TaptPay's PCI/SAQ status. Ecommerce API/WooCommerce is unsupported.

Dependency reports and secret scans are required gates. High/critical advisories
and unresolved credentials cannot be cleared merely by documenting them. Never
use historical demo credentials as production accounts or automatically seed a
production database.

Report suspected vulnerabilities privately to the repository owner. Do not post
credentials, customer data, raw payment payloads or unredacted logs in an issue.
