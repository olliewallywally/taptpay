# R5 staged encryption operations

Repository implementation covers four legacy bank fields, the active subscription
stored-card credential and recoverable rent/job/quote link tokens. The unused
merchant Windcave API key has a separate owner choice. Default deployment remains
`legacy`; migrations do not activate policies, backfill data or start jobs.
Repository readiness does not establish live-target encryption or legal retention.

## Keys and compatible readers (E1)

Configure `DATA_ENCRYPTION_STAGE=read-compatible`, `DATA_ENCRYPTION_ACTIVE_KEY_ID`
and `DATA_ENCRYPTION_KEYRING` through secure runtime configuration. The keyring is a
JSON array with exactly `id` and `key`: unique IDs (1–64 ASCII letters/digits/_/-),
independent unique 32-byte keys as canonical unpadded base64url. Keep every key
needed by current rows **and retained backups**. Never derive keys from JWT/provider
secrets or put values in shell arguments, chat, tracked files, logs or dumps.

All nonlegacy stages require valid keys; audit mode cannot bypass this. Nulls stay
null; malformed/unknown envelopes, unknown keys and authentication failures never
become plaintext. AES-GCM AAD binds schema, table, actual row ID and column; UUIDs
use PostgreSQL's canonical casing. Merchant DTOs continue omitting legacy bank data.
No bank collection UI/API is reintroduced. Historical Stripe identifiers are not
credentials and stay outside this scope.

Minimum rollback reader after active-field encryption is this complete R5 codec
release with the full keyring; T1 `5329bf77` only covers bank readers. Keep encrypted
writers while accepting new card/link writes, or pause scoped writes. Database
policy guards refuse stale plaintext writers. Never downgrade those guards, return
to pre-compatible code, rewrite applied SQL or restore plaintext writes.

## Count-only inspection

For the bank-only E1 tool, configure `R5_PREFLIGHT_DATABASE_URL` securely and run:

```sh
node --import tsx scripts/r5-encryption-preflight.ts \
  --expected-host=TARGET_HOST --expected-port=TARGET_PORT \
  --expected-database=TARGET_DATABASE --batch-size=25
```

For all R5 operators configure **R5_WORKFLOW_DATABASE_URL** securely. It is
independent of ambient DATABASE_URL/Neon/PG variables/.pgpass. The URI names its
user; remote connections require verified TLS. Host/port/database must match the
explicit flags, and server database identity is checked before reads/mutations.

```sh
node --import tsx scripts/r5-encryption-workflow.ts \
  --expected-host=TARGET_HOST --expected-port=TARGET_PORT \
  --expected-database=TARGET_DATABASE --scope=bank
node --import tsx scripts/r5-encryption-workflow.ts \
  --expected-host=TARGET_HOST --expected-port=TARGET_PORT \
  --expected-database=TARGET_DATABASE --scope=active
```

Scope defaults to bank; active covers merchant_subscriptions.windcave_card_id and
invoices_rent_requests/job_invoices/quotes.token. Inspect is repeatable-read READ
ONLY, bounded in SQL and memory. Default pages 25, maximum 100. Reports contain
bucket counts and lookup-hash anomalies; they contain no row IDs, values, tokens,
ciphertexts or key IDs/material. Missing plaintext link hashes can be filled;
wrong hashes or encrypted links missing hashes stop mutation. Existing hashes
always remain hashes of original capabilities, never envelopes.

Every action is a dry run unless `--execute=true` and exact
`--confirm-database=TARGET_DATABASE` are supplied. Inspection is exit 0 if safe,
2 if unsafe, 1 if incomplete/invalid. `safeToBackfill` is technical classification,
not owner authorization or proof of zero plaintext.

## Encrypted writers and policy activation (E2)

Apply canonical migrations 0048a–c only after combined R4 ordering is reviewed.
Deploy complete compatible readers to every instance, then switch application
writers to `DATA_ENCRYPTION_STAGE=encrypted-write`. Before policy activation,
review counts, key availability, restored compatibility and rollback procedure.

Use `--action=activate-writes --execute=true
--confirm-database=TARGET_DATABASE` first with `--scope=bank`, then `--scope=active`.
Every mutation requires encrypted writer configuration. Activation authenticates
existing rows while holding the policy fence; waiting legacy writes observe the
advanced policy and fail, while unchanged secret/unrelated profile updates proceed.
A shared writer fingerprint means key changes verify both installed scopes.

The owner must record unused merchant credential disposition. Bank activation can
remain unselected while the decision is pending; contract cannot retain unselected
non-null credentials. Once approved, provide either:

- `--credential-policy=delete --credential-review-reference=SHA256_OF_OWNER_RECORD`;
- `--credential-policy=encrypt --credential-review-reference=SHA256_OF_OWNER_RECORD
  --credential-delete-after=APPROVED_FUTURE_YYYY-MM-DD`.

These flags accompany bank activate-writes/contract. References are 64 lowercase
hex digits; encrypt needs an explicit future valid date. Delete scans only SQL
presence booleans, never credential values. Temporary encryption cannot create or
resurrect an unused credential; expired review blocks further credential writes.
The script does not manufacture a retention decision. Pending owner choice stays
unselected on real targets; synthetic tests of both choices are not approval.

## Backfill, checkpoint and rotation (E3)

Use an operator-generated UUID per scope/key epoch and intent:

```sh
node --import tsx scripts/r5-encryption-workflow.ts \
  --expected-host=TARGET_HOST --expected-port=TARGET_PORT \
  --expected-database=TARGET_DATABASE --scope=active \
  --action=backfill --run-id=RUN_UUID --batch-size=25 --max-batches=100 \
  --execute=true --confirm-database=TARGET_DATABASE
```

Repeat for bank. Same UUID resumes the exact scope, database, mode, writer and
bank credential decision; mismatch refuses. Batches lock the run and rows with
SKIP LOCKED, authenticate values, update using xmin row-version CAS, then atomically
commit checkpoint and count/duration-only audit. Old plaintext is never sent back
as a CAS bind parameter. Locked lower rows remain eligible after cursor sweeps;
completion requires a full authenticated recount. A batch/data/audit failure rolls
all of them back. A verified rerun does not rewrite ciphertext.

Exit 3 means bounded work remains; resume the same UUID. Exit 0 for a mutation run
means its full scope is verified, not merely that the last page was empty. Fixed
exit-1 diagnostics omit raw URI/database/crypto exceptions; investigate securely.
Separate reader/writer pools avoid verification connection starvation.

Rotation: add new key to every reader, switch it active on writers, activate the
new fingerprint and use **new run UUIDs** with `--action=rotate` for both scopes.
Retain old keys. Both scopes must show zero old-key rows; this does not permit
removing keys still needed by backups. Stored billing/card digests and invoice
lookup hashes remain based on original values across rotation. Pending provider
GET recovery needs no card decryption; a new purchase does.

## Verify and later contract (E4)

Recount zero plaintext, verify original values in authorized process memory,
restore an encrypted snapshot and an older-key backup, and record target results.
Only after approved backup/rollback windows close, use contract-configured operator
with `--action=contract --review-reference=SHA256_OF_REVIEW` and explicit execute/
confirmation: **active scope first, bank second**. Both must be clean. Switch app
plaintext readers off only when both policies are contracted. Database policy and
review guards prohibit downgrades; a failed contract attempt leaves policy intact.

Record D8 bank retention/deletion date, unused credential disposition, backup access,
encryption/retention, RPO/RTO, key availability and crypto-erasure consequences.
Existing plaintext snapshots do not become encrypted when live rows are backfilled.
Official R5 exit still requires these decisions and actual approved live-target
zero-plaintext/backfill/restore evidence. Owner performs deployment separately.

## Owned synthetic verification

Use existing local PostgreSQL setup/start instructions; preserve the owner app.
`rehearse-r5-encryption-postgres.ts` accepts only the named loopback R5 scratch and
restored fixtures plus the existing test marker. It applies actual SQL via the
migration runner. `verify-r5-workflow-postgres.ts` clones one of these into newly
named owned proof databases, exercises both credential choices on separate copies,
and restores private encrypted dumps. No provider/email/push transport is called.
Keys exist in that process only; dumps remain outside tracked files with mode 0600.
Recreate proof via the verifier rather than expecting its ephemeral keys to survive.

Run `npm run check`, `npm run check:r5`, relevant R5/migration/server regressions,
`npm run test:r5:cli`, PostgreSQL safety tests and build. Use explicit
R5_TEST_DATABASE_URL and TAPTPAY_TEST_DATABASE marker for each owned proof. Never
point synthetic verifiers at shared/live databases. Fingerprint CI records complete
fresh/populated/restore convergence through 0048c; applied earlier SQL stays frozen.
