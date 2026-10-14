# R5 repository implementation and staged rollout handoff

Date: 2026-10-14 UTC. Branch: `remediation/r5-encryption-20261014`.
Base: `5329bf778e6bd47b8cc4fe71e67b8e6a58ff978f` (T1); final implementation commit is
the commit containing this handoff and the frozen source manifest below. Claude
owns R4; no main merge or deployment occurred. Owner deploys separately on Replit.

## Scope completed

T2 encrypted storage writers, T3 count-only/resumable backfill, T4 rotation/restore/
contract tooling are implemented. Scope includes all four legacy bank fields,
active stored-card credential and recoverable rent/job/quote tokens. Unused merchant
Windcave API key has explicit delete/temporary-encrypt operator choices, default
unselected. Synthetic choices are not owner decisions. Historical Stripe IDs remain
outside scope; retail stores only its existing lookup hash, no raw token column.

AES-GCM binds actual row/schema/table/column. ID-first merchant creation/password
and owner writes are one transaction. Named card/link codecs preserve original
capability hashes, reminders, creation replay and billing digests. General subscription
reads remain opaque, preventing key errors from blocking unrelated entitlement;
purchase/upgrade/cron reads explicitly decode. Pending provider GET recovery needs
no card decryption. Empty/oversized stored-card values stop writes/backfill.

Workflow batches use control/run locks, SKIP LOCKED, xmin CAS, durable cursors and
repeated sweeps. Data/checkpoint/count-only audit commit together. Final verification
authenticates the entire scope; skipped lower rows cannot be treated as complete.
Mutations require explicit action/execute/target confirmation; no startup job.
Default application and database policies remain legacy until staged activation.

Implementation, safety guards, exact source hashes and sanitized results:

- [Final review](evidence/remediation-v2-2/r5/R5-FINAL-REVIEW-2026-10-14.md).
- [Verification receipt](evidence/remediation-v2-2/r5/R5-T2-T4-VERIFICATION-2026-10-14.json).
- [Source manifest](evidence/remediation-v2-2/r5/R5-T2-T4-source-sha256-2026-10-14.txt).
- [Operator rollout](operations/r5-encryption-rollout.md).
- [Bank preflight/review](evidence/remediation-v2-2/r5/R5-T2-T4-PREFLIGHT-2026-10-14.md).
- [Active credential review](evidence/remediation-v2-2/r5/R5-ACTIVE-SECRETS-REVIEW-2026-10-14.md).
- [Restore constraint review](evidence/remediation-v2-2/r5/R5-RESTORE-CONSTRAINT-REVIEW-2026-10-14.md).

## Migrations and immutable bytes

All three were applied **only to owned local R5 synthetic scratch/restored targets**
and their newly created proof/restore clones; never a shared or live target:

| Migration | SHA-256 |
|---|---|
| 0048a_data_encryption_workflows.sql | 8319ec9760ae5d91c1b7339e988e6772f3f6925aebe2065ebfbf71407ce837ce |
| 0048b_active_secret_vault.sql | 998e38c5606ea606fdc01712adcace451781668ad652e77e6a06c3dda99ddd37 |
| 0048c_invoice_email_constraint_canonical.sql | 6898e300826d17195f2934c2ece780f0093636d40fdff7dc3b9fae34dbeec462 |

0048a creates bank policy/checkpoints/audit. 0048b adds independent active scope
policy/run cursors and guards. 0048c preserves R3's exact nullable email rule while
flattening the BETWEEN-derived expression so strict pg_dump/restore catalog text
converges. Applied SQL is frozen; fixes use a new forward file.

Canonical fresh/populated/restore fingerprint through 0048c:
`sha256:52146f2b73d10f75a1d3d612b8234499716ef485914466d71394b6c7c9c5cf66`.
56 tables, 22 sequences, 808 columns, 368 constraints, 98 FKs, 184 indexes, 40
triggers and 14 routines. Existing CI now references this complete fingerprint.
Baseline for 0048c proves exact canonical constraint text, refusing the old named
constraint. Fresh and populated migrations preserve the original 3,000 links.

## Commands and completed evidence

- Full server: **221 suites /5,151 tests passed**, zero failures/skips/todos.
- Latest affected-source reread/rerun: **10 suites /221 tests passed**; not added to
  the full count. The broad run began before the final migration/proof/doc review;
  latest codec/scanner/operator/migration sources were separately rerun afterward.
- Two real PostgreSQL proofs: **21 checks each /42 total**, one explicit temporary
  credential encryption, one explicit deletion; both on new synthetic clones.
- Original plaintext link capabilities on all **1,000 rent +1,000 job +1,000 quote**
  rows compare in memory after backfill and after current/older encrypted restore.
- Standalone CLI 4, PostgreSQL target-safety 8 and fingerprint 28 tests pass;
  actual named-target operator dry-run/refusal is also exercised in PostgreSQL.
- `npm run check`, `npm run check:r5`, `npm run build`, diff whitespace check pass.
  Existing build size/browser-data warnings remain; no client source or checked-in
  app bundle changed. No client/device suite rerun or remote CI execution claimed.

Earlier red results are retained privately: omitted migration inventory/parity
requirements, missing run credential policy default, restore constraint mismatch,
CI document format and empty card writer edge. Fixes preserve genuine assertions;
no test/constraint was disabled to make the candidate pass. Historical T1 hashes
are unchanged evidence of T1, not hashes of current modified files.

## Environment and preserved data

Reuse existing onboarding setup; no dependency or environment configuration edits
needed. Local PostgreSQL 17 runs on port 55440 using the existing start helper and
explicit test marker. Scripts allow only independently named owned synthetic
sources. Workflow proof creates new `r5_proof_*` copies and encrypted snapshots;
source policies stay legacy/unselected and original financial counts stay unchanged.
Keys were held only in verifier process memory; private dumps cannot be decrypted
after that process exits without those ephemeral keys. Re-run the verifier for a
new proof; do not ask the owner for real keys or commit private artifacts.

Owner app PID 4196 is preserved. Do not stop/restart it. Use login:false shells;
exclude logs/, .claude-home/**, .claude/settings.local.json, private dumps/keys/env
and fixtures from Git. Stage explicit paths only, never git add -A / git add .

## Remaining official phase exit / owner actions

Repository implementation is ready for review and staged integration. **R5 is not
officially closed on a live target**. Remaining external work:

1. Record unused merchant credential disposition: delete, or temporary encryption
   with named approved deletion date and review reference (currently unselected).
2. Record D8 bank retention/deletion date, backup windows/access/retention, key
   availability and approved rollback/contract window. Encryption is not retention.
3. Select the real target securely, review count-only preflight, deploy complete
   readers/writers, explicitly activate both scopes, run/verify backfills and a real
   authorized restore/decrypt drill. Do not assume test counts apply to production.
4. Integrate Claude's R4 migrations against canonical R3 through 0047 before shared
   release. Its historical independent 0039 is not to be merged over R3's 0039;
   all applied names/checksums must be retained/aligned by a reviewed forward plan.
5. Complete R3 Windcave UAT and production-sized migration rehearsal before combined
   release. Synthetic fake ports prove mechanics, not provider approval.

Contract order: active scope, then bank; switch application plaintext readers off
only after both policies are contracted and approved windows have closed. Retain
old keys until every relevant backup expires or is re-encrypted and verified.
The next planned phase is R6; it is not started by this handoff.
