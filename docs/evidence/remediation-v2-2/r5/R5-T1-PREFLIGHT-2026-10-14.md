# R5-T1 — cipher, compatible reader and count-only preflight

Owner instruction: start R5 while Claude continues R4. Base: `3c98dfe928bfc620d159935635c46735e2753041`.
Branch: `remediation/r5-encryption-20261014`. Authority: plan v2.2 §12 and §21.1.

## Bounded implementation

T1 implements a server-only AES-256-GCM/keyring service, strict authenticated
reader for the four legacy bank columns, application configuration validation,
and a standalone named-target, read-only preflight. It neither adds schema nor
changes current writes. T2 owns encrypted write integration; T3 owns a checkpointed
backfill; T4 owns verification, rotation/restore and eventual contract releases.

The four columns are `bank_name`, `bank_branch`, `account_holder_name` and
`bank_account_number`, all on `public.merchants`. Existing merchant DTOs omit
these columns. No UI/API collection path may be added. The retired bank endpoint
must still refuse with zero writes. Historical Stripe IDs are outside scope.

Use exactly 32-byte keys, random 12-byte IV, 16-byte tag and canonical unpadded
base64url. AAD binds version, schema, table, positive merchant ID and column using
an unambiguous JSON tuple. All `enc:` inputs are reserved: malformed, unsupported,
unknown-key or authentication failures are errors, never plaintext fallbacks.
Null and empty strings are distinct. Values are bounded to 1 MiB UTF-8; unpaired
surrogates cannot silently change on encryption.

Configuration: `DATA_ENCRYPTION_STAGE=legacy|read-compatible` (default legacy),
`DATA_ENCRYPTION_ACTIVE_KEY_ID`, `DATA_ENCRYPTION_KEYRING` (JSON array of unique
`{id,key}` entries with canonical base64url keys). Read-compatible requires an
active key and readable keyring. Partial/invalid configuration fails even in
audit mode; no random, JWT-derived, payment-secret-derived or built-in key.
Keys reside in private service fields; JSON/inspect metadata cannot expose them.
T1 intentionally does not offer a write/contract rollout stage.

Preflight requires `R5_PREFLIGHT_DATABASE_URL`, expected host, port and database;
it must never fall back to ambient `DATABASE_URL`/PG connection defaults. Check
the URI before connecting and the database identity inside a repeatable-read,
read-only transaction. Scan bounded keyset pages, classify/decrypt in memory,
return counts only and always roll back. Report all corrupt/unknown buckets and
refuse backfill suitability on any such count. The CLI has no write switch.
Credential preflight uses SQL counts only: no Windcave credential is projected.
Final resource-bound reread: default page 25, maximum 100; SQL flags rather than
fetches text exceeding the maximum encoded envelope. The envelope bound allows
base64 expansion, so a valid 1 MiB plaintext's ciphertext still authenticates.

## Dependencies and exclusions

R4 remote observed read-only: `8b7c300eb852990bc22c869323b7f30cecd697d1`
(refund claim/send-intent/settle slice). R4 is not complete. Its additive refund
migration currently uses 0039 on that separate branch; canonical R3 already
extends through 0047. Do not merge or renumber applied files in T1. No migration
number is needed here, so T1 can proceed independently. Future R5 schema work
must use the integrated canonical history after R4 coordination.

No real bank value/key is inspected here; PostgreSQL tests use owned synthetic
data only. No shared migration, backfill, real payment/refund/provider/email/push,
Replit secret edit, deployment or main merge is authorized by this slice.

The owner is being asked whether any unused historical merchant API keys should
be deleted or temporarily encrypted. T1 only counts them, so that decision does
not block T1. D8 bank retention/deletion date, backup retention/key availability
and production preflight remain external rollout gates. Production is not counted.

## Validation and rollback contract

Demonstrate the missing-service/config defect before implementation. Verify per
column/row AAD, IV/tag/ciphertext tamper, all envelope parser boundaries, key
rotation readers, Unicode/null/empty/size bounds, redacted errors/metrics/config,
target mismatch before connect/read, batch boundaries, rollback on failures and
mixed valid/corrupt rows. Run existing configuration, DTO, retired-bank and
credential-count regressions plus typecheck/build and actual owned PostgreSQL.

Because T1 writes no ciphertext, its repository rollback point is the base commit.
After T2 writes ciphertext, rollback must retain a compatible keyring/reader;
never return to plaintext writes. No T1 success may be called official R5 exit.
