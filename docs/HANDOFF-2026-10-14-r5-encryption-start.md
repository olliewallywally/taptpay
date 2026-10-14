# R5 started — T1 reader foundation

Phase: R5 (plan v2.2 §12). **T1 repository work complete; R5 remains open.**
Branch: `remediation/r5-encryption-20261014`. Base/rollback before persistent
encrypted writes: `3c98dfe928bfc620d159935635c46735e2753041`. Candidate: the commit
containing this handoff and the frozen T1 evidence.

Owner requested R5 while Claude owns R4. R4 need not finish before T1 code/tests;
T1 has no schema, refund, provider or bank-write changes. R4 was observed at
`8b7c300eb852990bc22c869323b7f30cecd697d1` (claim/send/settle part 1), not merged.
Its migration numbering must be aligned with canonical R3 through 0047 before
combined release or subsequent migration work. R3 repository work is pushed;
Windcave UAT and production-sized migration rehearsal still gate its phase exit.

## Completed slice

- Server-only AES-256-GCM, independently configured 32-byte keys, random 12-byte
  IVs, 16-byte tags, canonical versioned envelope and row/column/schema/table AAD.
- Compatible null/plaintext/encrypted readers; strict malformed, unknown-version,
  unknown-key and authentication refusals. No downgrade to plaintext. Unicode,
  BOM, empty strings and byte bounds are preserved or explicitly refused.
- Active/readable keyring validation, protected key buffers, fixed errors and
  bounded failure metrics. Configuration cannot silently degrade in audit mode
  and does not derive/generated-fallback any encryption key. Default legacy is
  unchanged; no persistent writer stage can be activated in T1.
- Standalone target-pinned preflight, one repeatable-read/read-only snapshot,
  bounded keyset pages and SQL guards against fetching oversized text. Authenticates
  bank ciphertext in memory, outputs counts only, and always rolls back.
- Credential preflight projects SQL aggregates only; no merchant Windcave value
  is read. URI host/port/database and actual database identity are checked before
  the scan. No ambient database/password/.pgpass fallback; remote TLS is verified.
- Synthetic fixture keys are isolated from ambient credentials. Owner/admin/public
  DTOs and the retired bank endpoint retain their existing containment behavior.
  Corrected the schema comment that incorrectly called the unused credential encrypted.

## Verification

Failing-first configuration regression: **8/8 failed before implementation**.
Final scoped server run: **9 suites / 303 tests passed**, no skips. Includes
57 cipher/parser/keyring tests, 25 preflight tests, 8 new config tests and existing
config/source/credential/DTO/retired-bank/callback regressions.
CLI safety: **4 passed**; existing credential-counter/fingerprint safety: **34 passed**.
Actual owned PostgreSQL: **13 checks passed**, including real CLI success and
unsafe-data exit 2, read-only write refusal, key rotation/restart, tampered/wrong-AAD
ciphertext, unchanged data, typed Drizzle merchant DTOs and encoded size bounds.
Application typecheck/build and separate strict CLI/verifier typecheck pass.
No full-server/client run is claimed for T1; client source is unchanged.

The owned `r5_reader_20261014` on loopback port 55440 was cloned from the preserved
synthetic R3 restore. The source database was unchanged and the existing
application process was preserved. Verifier
inserts/mutates only its fresh synthetic merchant IDs and removes those IDs in
cleanup. No migration was created/applied, no plaintext bank/credential/key is
printed or included in evidence. This is not production preflight or a retained
backup/key-removal drill. Live target, retained backups and actual keys remain untested.

Exact commands, source hashes and raw-result hashes:
[T1 verification](evidence/remediation-v2-2/r5/R5-T1-VERIFICATION-2026-10-14.json).
[Review and separate reread](evidence/remediation-v2-2/r5/R5-T1-REVIEW-2026-10-14.md).
[Operator rollout instructions](operations/r5-encryption-rollout.md).

## Next task — R5-T2 / E2 encrypted writers

Review before implementation; inventory both memory/database create/update/bank
methods and any direct merchant SQL, preserve public collection tombstones, and
add an encrypted-write rollout stage after the reader deployment. Obtain the
merchant ID before encrypting, commit initial row/ciphertext atomically, protect
concurrent edits and refuse accidental double encryption. Never return to
plaintext writes once E2 starts. Keep R4 migration work separate.

T3 follows with durable-checkpoint/CAS/locking/restart-safe backfill; T4 follows
with zero-plaintext, rotation and restore/decrypt proof and a later contract
release. The owner is being asked whether unused merchant credentials should be
deleted or temporarily encrypted; no decision has been assumed. D8 bank retention
and deletion date, backup controls/key retention, real-target counts and rollout
approval remain external exit gates. Do not start R6 or call R5 complete.

No production configuration, payment/refund flag, live provider/email/push call,
customer contact, shared database mutation, deployment or main merge occurred.
Stage explicit reviewed files only; exclude logs/private fixtures/dumps, env files,
`.claude-home/**` and `.claude/settings.local.json`.
