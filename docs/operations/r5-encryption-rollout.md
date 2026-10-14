# R5 staged encryption operations

Current repository slice: T1 cipher, compatible reader, configuration and
read-only preflight. It adds no migration and changes no persistent bank writes.
Never infer live-target encryption or phase exit from this tooling's existence.

Repository validation: `npm run check`, `npm run check:r5`, the three R5 server
test files and `npm run test:r5:cli`; these checks are also wired into the existing
static CI job. Owned PostgreSQL proof is `node --import tsx
scripts/verify-r5-reader-postgres.ts` with the separately named synthetic target
and existing test-database marker. Do not use that verifier on a shared database.

## Configure the E1 reader

Set `DATA_ENCRYPTION_STAGE=read-compatible`, `DATA_ENCRYPTION_ACTIVE_KEY_ID` and
`DATA_ENCRYPTION_KEYRING` in the application's secure secret configuration.
The keyring is a JSON array of objects with exactly `id` and `key`: unique IDs
of 1–64 ASCII letters/digits/underscore/hyphen; unique 32-byte key material encoded
as canonical unpadded base64url. Generate independent keys in an authorized secret
management process, not from JWT/payment/provider credentials. Never put key
values in commands, tickets, chat, logs, repository files or evidence.

Default `legacy` intentionally preserves the current deployment. It generates no
key and refuses encrypted reads. Partial/invalid key configuration fails startup
in both audit and enforce modes. T1 accepts no write/contract stage. The AES-GCM
building block exists for tests and later reviewed writers, not a running backfill.

No current UI/API bank collection path is reintroduced. Existing owner/admin/public
merchant DTOs discard these legacy fields in either format. The privileged
preflight is the first consumer of the compatible field decoder; T2 must inventory
every actual storage writer before encrypting any persistent value.

## Run the named-target, read-only preflight

Only an authorized operator selects the real target. For repository validation,
use an owned synthetic copy. Configure `R5_PREFLIGHT_DATABASE_URL` securely and
the E1 keyring above; do not rely on ambient `DATABASE_URL`, PG variables or
`.pgpass`. The URI must name its user; remote targets require verified TLS.

```sh
node --import tsx scripts/r5-encryption-preflight.ts \
  --expected-host=TARGET_HOST \
  --expected-port=TARGET_PORT \
  --expected-database=TARGET_DATABASE \
  --batch-size=25
```

The command validates URI identity before connecting, then server database identity
before data reads. Every page uses one repeatable-read, read-only snapshot with
bounded statement/lock timeouts. Default page size is 25, maximum 100. Values larger
than the maximum envelope are flagged in SQL instead of fetched; plaintext and
decrypted values have a 1 MiB UTF-8 bound. Oversize data never counts as null or
successfully encrypted. Do not raise bounds to make a failed preflight green.

Output includes merchant count, each bank column's null/plaintext/active-key/old-key/
unknown-key/malformed/authentication-failure/unsupported-version/invalid-value
counts, and separate SQL aggregate credential counts. It never outputs bank or
credential values, merchant IDs, ciphertext, key IDs or keys. Encrypted counts
require successful authentication with the exact original row/column AAD.

Exit 0: completed read-only count with no invalid bank data.
Exit 2: counts completed, unsafe bank-data bucket exists; **do not backfill**.
Exit 1: invalid target/configuration or incomplete/failed read; no partial report.
Fixed stderr intentionally omits raw database/URI/crypto exceptions. Always inspect
the exit status. `safeToBackfill` does not authorize a backfill or imply zero
plaintext; legal/retention, writer deployment and reviewed mutation tooling remain
prerequisites. The unused credential disposition is a separate owner decision.

## Remaining implementation and rollout order

1. **T2 / E2:** audit all internal create/update/bank-write paths, introduce
   encrypted writes with row IDs available before ciphertext is written, protect
   concurrent updates, and retain E1-compatible reads. No new collection path.
2. **T3 / E3:** count-only dry run followed by reviewed bounded transactions,
   durable checkpoints, safe locking/claims and compare-and-set. Unknown keys,
   malformed/auth-failed data must stop mutation. Re-run/restart/rotation must
   neither overwrite concurrent edits nor double-encrypt values.
3. **T4 / E4:** zero-plaintext verification on the approved target, sampled
   in-memory comparison, old/new-key rotation and restore/decrypt drill. Preserve
   every key needed by retained backups. Disable plaintext compatibility only in
   a later release after approved rollback and retention windows close.
4. **Owner exit:** record D8 retention/deletion decision/date, unused merchant
   credential disposition/count, backup controls/key availability and real-target
   dry-run/backfill/restore evidence. Encryption alone is not retention compliance.

R4 does not block T1 code/tests. R4 integration must retain the canonical R3
migrations through 0047 before future R5 migration numbering and combined rollout.
Do not edit applied migrations or deploy a pre-compatible reader after encrypted
writes begin. Current T1 rollback is R3 `3c98dfe9` only while no later stage has
written ciphertext. After E2/E3, keep E1-compatible readers and fix forward;
never restore plaintext writes.
