# Operator-only encrypted database backup

This command implements R0-T6's manual backup boundary. It is never an app,
build, scheduler or CI task. Managed snapshots and restore rehearsals remain
separate R0-T6A/R8 requirements; this tool does not replace them.

## Preconditions

The database owner approves one named target, its exact host (including an
explicit port if present) and database name, a destination outside the repository,
an encryption recipient and the retention policy. Use a private operator terminal
on a trusted workstation with Node 22, a compatible `pg_dump`, and GnuPG installed.
The installed binaries, destination filesystem and operator account must be trusted.

Provision the recipient's trusted public key in the operator's GnuPG keyring.
Supply its full fingerprint, not an email address or short key ID. The private key
must be recoverable by the approved restore owner. Do not generate or display
replacement credentials in an agent session or recorded terminal.

Load `BACKUP_DATABASE_URL` through the approved secret-management channel.
The command deliberately never falls back to `DATABASE_URL` or
`NEON_DATABASE_URL`. Never paste a URL or password into an example command,
shell history or evidence. Optional `GNUPGHOME` selects the operator keyring.
Remote targets require `sslmode=verify-full` in the connection URI and a trusted
libpq certificate configuration. A `local` target must use a loopback hostname.
Only `sslmode` and bounded `connect_timeout` URI query options are accepted;
libpq target overrides such as `host`, `dbname` and `service` are rejected.

## Command shape

Replace the non-secret placeholders with the approved values:

```text
bash scripts/db-backup.sh --target staging --expected-host HOST --expected-database DATABASE --recipient FULL_PUBLIC_KEY_FINGERPRINT --output /approved/private/destination/unique-backup.sql.gpg
```

Targets are `local`, `ci`, `staging` and `production`. `ci` names a database;
execution inside CI is still prohibited. Both stdin and stdout must be terminals,
the `CI` variable must be absent, and the operator must type exactly
`BACKUP <target>`. The source URI must match the declared host and database before
the prompt appears. There is no `--yes` bypass. Missing/mismatched inputs fail
before a database subprocess or output file is created.

The parent directory must already exist outside the checkout, including after
symlink resolution. The destination must be a new absolute `.sql.gpg` path.
Exclusive creation refuses existing files and symlinks; permissions are `0600`.
The dump stream goes directly to GnuPG and only its encrypted output goes to disk.
The connection URI is supplied in the dump child's environment, never argv, and
is not inherited by the encryption child. Child stderr is suppressed and failures
emit a fixed error code. A failed process, empty output, cancellation or the
30-minute execution timeout fails the command and removes only its newly-created
partial output. Existing backups are never pruned or overwritten.

An abrupt machine shutdown or uncatchable kill may leave a partial encrypted file.
A file's existence is not proof of a successful backup. Do not mark it accepted
without command success and restore/decrypt verification. Do not resume a partial
file; choose a new destination and have the owner disposition the partial artifact.

## Acceptance and recovery

Record target label, operator, timestamp and success/failure status only in public
evidence. Keep artifact identifiers and sensitive infrastructure metadata in the
approved private inventory. A success message proves both local tools exited
successfully; it does not prove completeness, decryptability, restore time or schema
convergence. The owner must approve an isolated restore/decrypt rehearsal and
record RPO/RTO, schema/constraint fingerprints and count-only validation under
R0-T6A/R8 before using the backup as release evidence.

Failures return only `BACKUP_*` codes. Check the approved inputs, executable
availability, public-key trust and destination permissions privately; never enable
raw connection or subprocess logging in CI/evidence. Rollback disables the command
or fixes it forward. It must never reinstate automatic dual-target dumps or pruning.

`npm run test:backup:safety` uses synthetic subprocesses only. It does not contact
PostgreSQL, invoke a real encryption key, inspect retained backups or prove a real
restore. Those operational checks remain open until separately performed.
