# R8 closeout evidence and operator checklist

Prepared October 17, 2026 for `remediation/r8-ci-20261016`, from base
`87ee93e83b9ce0a1e231d61518e4ecbcd2cbe75e`. R8 remains open. This packet records
the remaining work; it does not approve deployment, migration, payment initiation
or phase exit. The reviewed local patch is frozen by the
[source manifest](../evidence/remediation-v2-2/r8/R8-CLOSEOUT-SOURCE-MANIFEST-2026-10-17.json)
and [final verification](../evidence/remediation-v2-2/r8/R8-CLOSEOUT-VERIFICATION-2026-10-17.json),
with lockfile SHA256 `d8f43cb1aa9dc93e7956d420e45e32ac9b41f69d1181fbf4f223ef586db01c5e`.
Confirm the containing commit and pushed SHA against that manifest before resuming.
Claude retains R4; the owner deploys through Replit.

The authority is remediation plan [§15 and §22.5](../PLAN-2026-08-24-taptpay-remediation-v2-2.md),
[DEPLOYMENT.md](../../DEPLOYMENT.md) and the
[claims/release-gates matrix](r8-truthfulness-and-release-gates.md).
Appoint the actual reviewers for each role below and record their dated decisions.
A role without an appointed reviewer is still open.

## Repository work and decisions still open

| Item | Current disposition | Action and acceptance evidence | Responsible role |
| --- | --- | --- | --- |
| Full dependency security gate | Production-only audit has zero findings of every severity. The full graph still has 39 high affected packages, all propagated from the one unpatched `braces` advisory `GHSA-vfj7-8cjw-p6xm`; latest published `braces` is 3.0.3. Production filtering does not clear the full gate. | Retain the blocked high/critical gate. Recheck authoritative upstream metadata; review and prove an actual fix or safe removal of affected consumers when available. No invented fixed version, broad override, renamed vulnerable package or implicit waiver. Record full and production audit scope, counts, advisory IDs and exact lock hash on the final candidate. | Engineering and security reviewer; owner for any proposed security tradeoff |
| Historical secret candidates | The available-ref scan has 2,327 findings, 2,206 dispositioned and 121 unresolved occurrence rows across 55 distinct rule/file/commit triples. These are candidates, not 121 confirmed live credentials. | Review the [metadata-only owner worklist](../evidence/remediation-v2-2/r8/R8-HISTORY-OWNER-WORKLIST-2026-10-17.json) privately. Supply sanitized revocation/rotation and old-credential rejection evidence, or exact false-positive evidence. Review every match covered by each triple before adding a disposition. Rerun the pinned tree and all-available-ref history scans; retain scan/ref scope and unresolved counts. The earlier September disposition does not clear newly identified October candidates. No rewrite or force push is authorized. | Owner-appointed incident/security reviewer, with owners of the affected services |
| Single email provider | Recommend Resend: durable payment notifications already use its adapter. The owner's selection and actual delivery evidence are pending. Existing alternatives remain until those prerequisites are met. | Record provider choice; inventory every route, job, configuration input and template. Obtain sanitized successful delivery and applicable stable-key deduplication/retry evidence. Then remove only the proven-unused alternatives through a separately reviewed dependency group, preserving the provider-independent interface and test fake. Run fresh install, consumer, full regression and production-install proof. A mocked SDK request is not delivery proof. | Product/release owner and email/operations reviewer; engineering implements the selected path |
| Lint baseline burn | The reviewed baseline shrinks from 698 rows to 558 with no additions. The actual pre-edit error count was 680, so 122 actual errors were fixed; 140 retired baseline rows is a different measure. Full lint remains nonzero. | Continue small reviewed cleanup groups under zero-new-errors enforcement. Preserve side effects, hook rules, accessibility checks and legal wording. Retire only resolved baseline rows. Enable full `npm run lint -- --max-warnings=0` as a release gate when the baseline reaches zero; do not disable rules to obtain that result. This remains locally addressable engineering work. | Engineering reviewer |
| Assets, archives and handoff provenance | [Classification](../evidence/remediation-v2-2/r8/R8-ARTIFACT-CLASSIFICATION-2026-10-17.json) covers metadata for 13 ZIP archives and 534,540,473 bytes under `attached_assets`; categories overlap. Content, PII, licensing and provenance are not cleared. No design assets were deleted. | Appoint content/provenance reviewers; identify active design/build/handoff consumers and approved retention/storage. Review font/image/design licensing and customer-data risk privately. Directory metadata identifies seven leading-slash entry names in `components_1762726500202.zip` and one in `styles_1762726500201.zip`; review their destination handling before later controlled extraction. These filename records are not evidence of malicious contents. Remove or relocate only exact reviewed paths after approved storage and handoff are available. | Product/design and security/privacy reviewers; legal/licensing reviewer where required |
| Reviewed local patch freeze | Complete within the [final verification's](../evidence/remediation-v2-2/r8/R8-CLOSEOUT-VERIFICATION-2026-10-17.json) stated scope: 6,772 tests, 328 existing browser cells plus four map proofs, 13 static and 25 full PostgreSQL stages, five build stages and 198-file native parity. [The manifest](../evidence/remediation-v2-2/r8/R8-CLOSEOUT-SOURCE-MANIFEST-2026-10-17.json) binds 64 source/config/test files, the deleted obsolete probe and all 198 web files; its SHA256 is `4728470c8c15aa2aa73161ac95d3f98331c6ce47693b89f2deb788bb999b1201`. | Retain the [final review](../evidence/remediation-v2-2/r8/R8-CLOSEOUT-FINAL-REVIEW-2026-10-17.md) and [independent review](../evidence/remediation-v2-2/r8/R8-INDEPENDENT-CLOSEOUT-REVIEW-2026-10-17.md). Match the containing commit and remote SHA to the manifest; review and rerun affected checks after further source edits. Full audit/history, further lint burn and the other R8/release gates remain open. Do not refresh goldens or relax assertions to pass. | Engineering reviewer |
| Hosted CI and branch protection | A checked-in workflow or local pass does not establish a GitHub run or an enforced branch rule. | Record successful remote runs for the exact pushed SHA and required contexts. Record the repository's actual required-status/branch-protection configuration through an authorized maintainer. A red audit/history job remains red until its underlying gate is resolved. | Repository maintainer/release operator |

The only retired loose probe is `.verify1.mjs`; its original is recoverable from
the base commit above. Its removal does not authorize deletion of archives,
uploads, historical HTML, AI project guidance or generated application snapshots.
Use the [secret disposition procedure](secret-scan-dispositions.md) and
[rotation runbook](secret-rotation.md); keep credential values, raw historical
files and provider/database payloads out of evidence and chat. The pending owner
questions about email choice/delivery and historical evidence remain the requests
for those inputs; this checklist does not create duplicate requests.

## Reproduce the owned PostgreSQL check

These paths belong to this cloud workspace. They restart only the isolated R8
PostgreSQL 17 service prepared by onboarding. Do not substitute a shared, restored,
development or production application database. Use Node from `.nvmrc` and a full
frozen install in an owned candidate; preserve any owner's running process and
its dependency tree.

```bash
set -euo pipefail
cd /workspace/taptpay
source /workspace/.onboarding/r8-environment.sh
bash /workspace/.onboarding/taptpay-r8-start-postgres.sh
source /workspace/.onboarding/r8-postgres/test-env.sh
npm run verify:ci -- --stage=postgres
```

Do not enable shell tracing or print the sourced variables. The private test-env
file supplies `R8_CI_ADMIN_URL` for the owned loopback administrator database and
`TAPTPAY_TEST_DATABASE=1`; it does not select an application `DATABASE_URL`.
`npm run test:server:postgres` delegates to the same guarded `verify:postgres`
entry. Do not invoke the internal historical `.mjs` harness directly.

The runner owns its random test databases, checks transport/marker/application
identity collisions, replays the frozen migration chain and verifies the pinned
canonical schema through `0049b`. It drops only databases it successfully created.
The public-schema storage adapter is allowed only for an explicit CI-owned random
database after canonical-schema and empty-application checks. Source-specific
R3/R5/R6 verifiers retain their original target guards and remain separate
rehearsals; this runner does not authorize retargeting them.

Record the actual current-run stage names, exit codes and case counts from the
sanitized reports. A partially completed expanded run is not an all-verifiers pass.
See [R8 isolated verification](r8-ci-verification.md) for prerequisites, bounded
owned-process cleanup and report limits. Empty synthetic replay does not supply
the real restored-data, lock-duration or provider evidence below.

## Real-target, provider and human acceptance

These gates require an approved target, actual provider/device facilities or
professional judgment. Local synthetic checks support their preparation; they
cannot replace the listed evidence.

| Gate | Required action and evidence | Responsible role / existing procedure |
| --- | --- | --- |
| Canonical R4 integration | Obtain Claude's reviewed final source/migration artifacts. Reconcile with canonical R3/R5/R6 history, preserving every frozen/applied name and checksum; use reviewed forward fixes for genuine conflicts. Rerun combined schema, refund, payment, encryption and recovery proofs before freezing a release candidate. | Claude owns R4; engineering/database reviewers accept combined integration. [R5 deferred closeout](r5-deferred-closeout.md). |
| Backup, restore and migration rehearsal | Name the exact target/operator/SHA/lock; verify read-only migration status and fingerprint. Create a managed encrypted snapshot and restore into isolated scratch with external jobs, messages and provider credentials absent. Verify representative counts, constraints/indexes/FK actions, tenant isolation and decryptability; compare schema sections and ACLs. Measure RPO/RTO, rollback and forward-migration lock/statement durations on production-sized data. Run combined CI/fault checks against that clone. Keep snapshot/connection identifiers private. | Database/security reviewers and approved production operator. [Migration release](migration-release.md), [encrypted backup](encrypted-backup.md), [restore ACL](restore-acl.md), plan §15.7. |
| R5 encryption and retention | Decide unused merchant-credential disposition and deletion date; approve bank-data/backup retention and key availability. Review real-target dry runs, activate only through an approved rollout, verify backfills/zero plaintext and restore/decrypt with the retained keyring. Record the contract/rollback window. | Owner, security/database reviewers. [Deferred closeout](r5-deferred-closeout.md), [encryption rollout](r5-encryption-rollout.md). |
| Windcave and durable delivery UAT | Use a matching owner-approved UAT build. Capture sanitized purchase and invoice/split approvals/declines, duplicate notifications, lost returns, setup, stored-card charge, ambiguous acceptance, timeout/retry and reconciliation evidence. Confirm session/X-ID lifecycle and retention, provider account/reference/amount/currency/type agreement and one financial/delivery outcome. Do not issue another charge to resolve an uncertain first charge. | Owner/provider UAT tester and payments reviewer. [R3 UAT checklist](r3-uat-checklist.md). |
| Safari and assistive technology | Provide an owner-approved matching HTTPS development candidate for the owner's iPhone 12. Record exact source/index hash, iOS/Safari, tester, route/state and results for Safari/VoiceOver, 200% Page Zoom, keyboard, rotation and reduced motion. Obtain separate actual iPad and applicable desktop screen-reader evidence. | Device/accessibility tester and product reviewer. [Real-device procedure](r1-t10-real-device-acceptance.md); replace its historical branch/build reference with the frozen candidate. No public test URL is established by this packet. |
| Native and owner visual acceptance | On a Mac, build the real Xcode target from matching source/lock/native/web artifacts; record toolchain, signing/entitlements and physical-device results. Exercise real sign-in, push/file/share/NFC-link behaviors and HPP/3DS/wallet redirects/returns against the matching served web build. Complete owner visual/golden and independent review. Linux sync and Chromium do not provide these results. | Native/provider/device reviewers and product owner. [Native release procedure](r7-native-capability-release.md). D13 remains locked off. |
| Operations and entitlement rollout | Name alert recipients and an on-call/recovery owner; activate and test actual external probes, log routing/redaction, escalation and recovery. Verify platform termination grace, rolling restart, multi-instance cron ownership/freshness, uncertain-job holds and reconciliation backlog on the approved target. Review historical entitlement evidence/counts and perform D9 classification/activation only through its approved procedure. | Operations/database/security reviewers and release operator. [Health/readiness/shutdown](r6-health-readiness-shutdown.md), [cron runbook](r6-cron-runbook.md), [entitlement rollout](r6-entitlement-rollout.md). |
| Legal, compliance and accounting | Appoint professional reviewers and approve published legal/privacy/security wording, PCI/SAQ data-flow scope, AML/KYB/sanctions, retention, chargebacks and merchant-of-record obligations. Obtain written provider/legal/accounting answers for receiving accounts, submerchants, payouts, fees, reserves, disputes and authoritative reconciliation. If TaptPay must settle merchants, obtain a separate approved accounting/ledger design before go-live. | Appointed provider, legal/compliance and accounting reviewers; owner accepts product commitments. [Claims and published-legal inventory](r8-truthfulness-and-release-gates.md), plan §§15.4–15.6. |
| Final release authorization | Reconcile every gate above to the exact release manifest and record actual approvers, maintenance/merchant-impact plan, rollback owner and target. Separately approve migration/deployment/UAT enablement. Verify health, tenant isolation, jobs and device smoke on that target. Production payment enablement requires its own final approval. | Product/release owner and appointed production operator. [Deployment gates](../../DEPLOYMENT.md). |

Keep `PAYMENT_MODE=disabled` and all new initiation flags false during the
separately approved initial deployment/rehearsal, including
`FEATURE_ECOMMERCE_API=false` and locked `FEATURE_TAP_TO_PAY`. Existing owner
decisions, including the property feed-under-dock layout, remain in force.
This checklist changes no feature flag, payment mode or approval.

## Closure record

Use one record per gate; attach only sanitized evidence to the repository.
Private infrastructure, customer, provider and artifact identifiers stay in the
approved private evidence store.

| Gate ID | Candidate SHA / lock SHA256 | Target class | Actual reviewer / date UTC | Sanitized evidence reference | Result / unresolved action |
| --- | --- | --- | --- | --- | --- |
| Pending | Pending final freeze | Pending | Unassigned | Pending | Open |

A complete record identifies scope, command or procedure, actual run time,
nonzero case counts where applicable, pass/fail/unrun status and reviewer limits.
Cross-link its private evidence by approved reference without embedding secrets
or raw payloads. Record owner product/security decisions in dated
`docs/decisions/` files. Deferred work remains visible until accepted; writing a
checklist, committing code or pushing a branch does not close its gates.
