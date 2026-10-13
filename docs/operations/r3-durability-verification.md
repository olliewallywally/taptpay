# R3 isolated database verification

These scripts never use an ambient application database. They require an explicit
`TEST_DATABASE_URL`, `TAPTPAY_TEST_DATABASE=1`, loopback, and the exact disposable
database names. They compare both ambient database identities before importing
application configuration. Keep credentials out of logs and commands.

The cloud setup draft preserves the existing application setup and adds verified
Debian PostgreSQL 17 binaries under `/workspace/.onboarding/r3-postgres`, plus
setup/start helpers. Package signature/checksum and HTTPS checks remain enabled.
The start helper initializes only its own synthetic cluster, listens on
`127.0.0.1:55440`, checks its data directory and `SELECT 1`, and preserves existing
synthetic databases. It generates a private mode-600 environment file; never
print it. Saving the draft does not publish or apply it to another task. Review
and save the environment settings, then publish to make this setup reusable.

From `/workspace/taptpay`, on the prepared cloud filesystem:

```bash
mkdir -p /tmp/taptpay-r3-postgres
bash /workspace/.onboarding/taptpay-r3-postgres-start.sh
source /workspace/.onboarding/r3-postgres/test-env.sh
node --import tsx scripts/rehearse-r3-migration-postgres.ts
node --import tsx scripts/verify-r3-durability-postgres.ts
```

Bootstrap requires an empty `r3_scratch`; an occupied database is refused. The
fault verifier can rerun on its own populated synthetic database, but deliberately
clears the synthetic inbox between cases. Never point it at an application or
shared operational database. Create a fresh owned disposable cluster for a fresh
rehearsal rather than bypass the safety guards.

## Restored rehearsal

Use the same private URL with its database path changed in a child process, without
printing it, to bootstrap `r3_snapshot` with `--before-expansion`. That creates the
real migration chain through 0033 and 1,000 property invoices, 1,000 trades invoices
and 1,000 quotes, with existing raw public links. Dump it with the retained
`pg_dump`, restore into empty `r3_restore`, then run the rehearsal with that
database URL and `--restored`. Use the helper's private Unix socket, port 55440 and
`taptpay_test` for dump/restore, supplying the retained library path to the tools.

The rehearsal records count-only preflights and table sizes, applies the real
0034 through the transaction/ledger runner, and writes schema fingerprints to
`/tmp/taptpay-r3-postgres`. Compare scratch and restored fingerprints byte for
byte. Do not describe these 3,000 synthetic records as production-sized evidence.
Actual production counts, table sizes, maintenance window and migration approval
remain release gates.

## Provider and activation limits

The verifier injects synthetic provider outcomes. It sends no provider request,
email, push or production message. No R3 worker timer, receipt registration or
provider adapter is enabled by construction/import. Invoice initiation defaults
off; reconciliation of a retained legitimate session is independent of that gate.
Actual R2 integration, caller/route convergence, receipt format validation, and
idempotent message receivers require their own reviewed checks.

Stop only the cluster you started when finished:

```bash
LD_LIBRARY_PATH=/workspace/.onboarding/r3-postgres/root/usr/lib/x86_64-linux-gnu \
  /workspace/.onboarding/r3-postgres/root/usr/lib/postgresql/17/bin/pg_ctl \
  -D /workspace/.onboarding/r3-postgres/data -m fast -w stop
```

Preserve any pre-existing app server. Process state does not survive publication;
the saved start instructions, rather than a running PID, establish restartability.
