# R0-T6 — operator backup completion preflight

Base: `ec2072795fa3adc48b508e227884b3837685a3aa`.
Continuation: `remediation/r1-continuation-20260907`; no merge/cherry-pick.
Scope: replace the remaining unsafe manual backup command, its isolated tests,
and operator documentation. No application, schema, provider or UI change.

## Verification of Prior Fixes

The startup dump launcher is removed and the deployment build is compilation
only. The existing R0-T6 handoff explicitly leaves manual backup hardening open.
Reading `scripts/db-backup.sh` confirms it still selects both ambient database
URLs, writes unencrypted gzip files and prunes retained backups automatically.

## Blocking Issues

None for local implementation and synthetic tests of this bounded R0 task.
Execution against an actual database requires separate named operator approval;
this review grants no such approval. R0 as a phase is still incomplete.

## High-Risk Concerns

Wrong target, credentials in argv/stderr, plaintext output, overwriting a backup,
deleting retained files, and a failed encryption process mistaken for success.

## Missing Steps

Implement explicit target/expected-host/expected-database selection, a dedicated
`BACKUP_DATABASE_URL` input with no ambient fallback, interactive confirmation
outside CI, encryption directly from the dump stream, exclusive encrypted output
outside the checkout, private file permissions and bounded process termination.
Document restore/decrypt rehearsal as a separate owner-controlled operation.

## Unsafe Assumptions

Do not assume configured URLs are safe targets, gzip is encryption, an output
file means both processes succeeded, or old files are disposable. Tests use
synthetic executables and an explicit minimal environment, never a real database.

## Required Ordering Changes

Return to the unfinished R0 requirement before additional R1 implementation.
Capture a failing no-argument/CI test against the original command first, with
all database variables absent and all output confined to a temporary directory.
Then replace the command and run adversarial and failure-path tests.

## Open Product / Provider / Legal Questions

The owner chooses actual database targets, encryption recipient, retention,
encrypted destination and restore approval. No current backup is inspected or
disposed of by this work. R0-H2 has a separate dated owner disposition.

## Compliance and Data-Handling Notes

No secret values or row data in evidence, argv, logs or checked-in artifacts.
No change to migrations, payment flags, retained dumps or production systems.

## Test and Rollback Adequacy

Prove refusal before any subprocess for CI/noninteractive/missing inputs, wrong
target identity and in-repository output. Prove exclusive output, encrypted-only
streaming, isolated child environments, failure cleanup and preservation of
existing files. Synthetic tests do not establish real restore/decryption proof.
Rollback disables the operator command; it must not restore ambient dual dumps
or automatic pruning.

## Final Recommendation (Approve / Do not approve)

Approve the stated local R0-T6 implementation scope against the exact base above.
This is an agent review, not human operational approval or R0 exit approval.

Separately recorded reread: checked the proposed scope against R0-T6, P2 data
safety, P8.3 stop conditions and the retained R0-H5 evidence. The dedicated URL,
exact identity check, operator-only confirmation, no-prune rule and no-live-test
boundary address the listed interactions. No source control or provider action
is included. Operational restore/encryption acceptance stays explicitly open.
