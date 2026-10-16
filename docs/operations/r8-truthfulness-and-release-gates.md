# R8 claims and release gates

These are current engineering dispositions, not compliance attestations or
deployment approval. Oliver is the product/release owner; named professional,
payments, native, database and operations approvers must still be recorded for
the actual target. A role with no appointed person is an open gate.

| Claim | Evidence | Accountable owner | Status |
|---|---|---|---|
| PCI scope/SAQ or bank-level security | Actual HPP/Hosted Fields/native data-flow assessment; no professional attestation in this repository | Oliver must appoint compliance assessor | Unverified; do not claim approval |
| Apple/Google/native wallet support | R7 removed placeholders; provider-specific hosted capabilities need real UAT | Payments/native approvers to be named | Native support unavailable; hosted wallet availability unverified |
| Tap to Pay/contactless phone acceptance | R7 locked capability and refused routes; no approved SDK/device acceptance | Native/provider approvers to be named | Not implemented; D13 remains false |
| Encryption at rest | R5 staged encryption/vault code and synthetic evidence, deferred target closeout | Security/database approvers to be named | Partial; real target backfill/restore/decryptability/retention outstanding |
| Monitoring/failover | R6 /healthz,/readyz, durable coordination and redacted logs | Operations approver to be named | Partial; external alerts, response and recovery unverified |
| API keys/WooCommerce integration | Admin unavailable screen, null key lookup, refused key creation/revocation, contained plugin | Oliver, API/payments reviewers | Unsupported; FEATURE_ECOMMERCE_API=false |
| Real-time settlement/accounting | No written merchant-of-record/acquirer/settlement/accounting approval in this evidence | Oliver must appoint provider/legal/accounting approvers | Blocked; SSE/payment events are not a ledger or settlement proof |
| Production ready | Exact release SHA/lock/target, full CI, restored-clone rehearsal and all external sign-offs | Oliver and appointed release operator | Blocked |

## Audited technical sources

SECURITY.md and DEPLOYMENT.md now state the evidence/approval limits rather than
claiming blanket production readiness, localStorage bearer authentication, demo
credentials, automatic seeding or universal endpoint protection. The legacy
scripts/deploy.js exits unsuccessfully with the reviewed runbook reference and
does not deploy, open a database or certify credentials.

APPLE_PAY_GOOGLE_PAY_COMPLIANCE.md no longer asserts native wallet/brand/PCI
approval. ios-README.md describes the existing Swift Package Manager project,
coherent asset sync and actual native acceptance requirements; serving web content
does not prove native/App Store compatibility. replit.md preserves the owner's
deployment role and replaces obsolete authentication/payment/settlement claims.

Both docs/taptpay-product-brief.md and its design-upload duplicate are explicitly
historical proposals. Their price comparisons, industry descriptions and future
features are not promises of current availability, fees or settlement. Product/
provider approval is required before using this material as customer marketing.

WooCommerce README, installation notes, readme.txt, changelog and plugin metadata
state unsupported. The retained gateway identity preserves historical options
and order metadata; no remote API, stock/cart, order-completion or settings write
is reachable from its entry points. PHP checks use WordPress/WooCommerce stubs,
not a real installed shop. A future gateway needs separately approved API-key
design, tenant scope, signed outbox/webhooks, SSRF defenses, durable idempotency,
provider verification and actual shop UAT. OpenAPI/full ecommerce remain deferred.

## Published legal wording: approval inventory, unchanged

client/src/pages/legal.tsx has not been casually rewritten. Review these actual
published promises before a release; the engineering changes do not validate them:

| Source | Promise needing review | Approval/evidence required |
|---|---|---|
| legal.tsx:32 | Funds settle to nominated bank accounts on a merchant-agreement schedule | Provider, merchant-of-record and accounting/funds-flow confirmation |
| legal.tsx:49,77 | Merchant responsibilities, hold periods, chargebacks and pending settlement on termination | Product/legal/acquirer review |
| legal.tsx:56 | Service availability and maintenance notice undertaking | Product/legal and actual operations capability |
| legal.tsx:120,129,146 | Masked card/settlement records, processing/settling funds and bank-data sharing | Verified data-flow, privacy notices and provider agreements |
| legal.tsx:159 | At-rest encryption, regular assessments/monitoring, PCI compliance | Security/platform/operations evidence and compliance professional approval |
| legal.tsx:178 | Deletion subject to retention requirements | Approved retention, encryption-vault deletion and legal obligations |

Oliver must appoint the legal/compliance reviewers and approve published wording.
No engineering status file can waive PCI, AML/KYB, sanctions, privacy, retention,
chargeback, merchant-of-record or settlement obligations. No production enablement
or real multi-merchant funds flow is authorized by D4 or this R8 patch.

## Real-target rehearsal remains open

Name the release SHA/lock, exact target and operator; record snapshot identifiers
privately; restore into isolated scratch without external jobs/messages/provider
credentials; verify representative counts/constraints/tenant isolation and
decryptability; measure RPO/RTO, rollback and forward-migration locks/durations.
Run fault tests on that clone before separately approved expansion/code deployment
with payment mode disabled and new initiation flags false. UAT and production
enablement require their own reviewers and merchant-impact/maintenance plan.
