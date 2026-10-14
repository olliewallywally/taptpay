# R5 remaining repository scope — reviewed implementation contract

Base `5329bf778e6bd47b8cc4fe71e67b8e6a58ff978f`, branch
`remediation/r5-encryption-20261014`. Owner instructed Codex to take on R5.
Claude owns R4; observed tip remains `8b7c300e`. This scope prepares/tests repository
code and owned synthetic databases only, with no shared/live deployment or backfill.

## T2 — encrypted writes

Add `encrypted-write` and `contract` reader stages; both require a valid keyring.
The four legacy bank columns remain the scope. A shared property/column mapper
seals only named supplied values; reject `enc:` as write input (no accidental
double encryption), invalid types and identity changes. Generic merchant create,
password create, general updates and retired internal bank-update methods in both
stores must use it. Obtain IDs before encryption; database creates insert without
bank values and fill ciphertext in the same transaction. No UI/API collection.
General credentials remain rejected, including stray bank-method properties.

Business merchant reads/DTOs retain their current opaque storage/allowlist behavior;
the privileged compatible decoder is the only consumer of legacy bank values.
Never make a merchant's login depend on decrypting data the product no longer uses.

## T3 — policy, durable checkpoint and safe operator mutations

Candidate additive migration: `0048a_data_encryption_workflows.sql`. The `a` suffix
reserves a distinct R5 file alongside the anticipated canonical R4 0048; no applied
R3 file is edited. R4 release integration must confirm ordering before shared use.

Use a singleton monotonic policy (`legacy -> encrypted-write -> contract`),
checkpointed runs and per-batch count-only audit rows. Policy stages cannot
downgrade or be removed, and a database trigger rejects changed/new plaintext bank
values after writer activation. Unchanged legacy bank columns do not block other
merchant edits. Ciphertext-bearing merchant IDs cannot move. The SQL guard checks
shape only; actual authenticity is always the Node reader's responsibility.

Each batch locks its run and a bounded merchant page (`FOR UPDATE SKIP LOCKED`),
authenticates all field values before updates, encrypts plaintext (or old-key
values for rotation), uses CAS and commits data/checkpoint/batch audit together.
On errors roll back the entire batch. A skipped earlier locked row is not lost:
exhaustion starts another sweep, and only a fresh authenticated zero-eligible count
allows marking the run verified. Bound an invocation's batch count; unfinished
work exits pending and resumes with the same run UUID. No timer/auto-backfill.

Runs bind database, mode and a nonsecret one-way key-label identity; do not store
keys, ciphertext, plaintext, IV/tag or raw key IDs in workflow records. Wrong
keyring/material still fails authenticity before mutation. Compatible key rotation
keeps old readable keys; active ciphertext must be byte-identical on reruns.

Operator CLI is read-only by default. Mutation requires named host/port/database,
an explicit execute switch and exact database confirmation; credentials come only
from a dedicated operator URI, with the existing no-ambient/verified-TLS contract.
Contract additionally requires a recorded retention/rollback/backup review reference
and zero plaintext/authentication errors. The CLI does not itself approve policy.
Unused merchant Windcave credentials stay count-only pending the owner's choice;
support preparing explicit reviewed disposition, never silently choose deletion.

Credential preparation reread: implement both owner options behind an explicit
stored decision/reference, and require a future deletion date for temporary
encryption. The default is **unselected**, not a retention decision. Only approved
encrypt scope may project credential values for in-memory authentication; deletion
uses nulling without projecting them. No real choice/mutation is inferred or run.
AES AAD includes the distinct credential column; general application writes still
discard incoming merchant credentials. Runs bind the selected policy/review/date.

## T4 — verification, rotation and restore

Failing-first memory/config tests; meaningful no-side-effect/operator tests;
actual PostgreSQL proof of atomic creates, wrong AAD, concurrency, waiting/skipped
rows, lost completion/restart, CAS, batch-audit failure rollback, malformed/unknown
data, irreversible policy, legacy reader rollback and zero-plaintext contract.
Create fresh/restored owned schema with the real migration runner; verify matching
fingerprints/checksums. Restore an encrypted synthetic snapshot and decrypt with
the original keyring; wrong/missing old keys must fail. Keep fixture keys and dumps
private, print counts only, preserve all restored financial rows.

Relevant full/scoped regressions, both type checks and build; record exact results
and separate implementation reread before commit/push. R5 repository completion
does not close live-target/backup/retention/provider/combined-release gates.
