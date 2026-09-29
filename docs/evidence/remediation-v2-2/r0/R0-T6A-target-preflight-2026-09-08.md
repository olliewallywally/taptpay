# R0-T6A target boundary preflight

Base: `ec2072795fa3adc48b508e227884b3837685a3aa`, with reviewed budget changes.
Scope: pure CLI/URI validation, an injectable connection/identity boundary, tests
and operator documentation. No actual database or schema operation.

Independent reviewer `migration_preflight` approved the narrow scope after
identifying the following conditions. Primary-agent reread confirms they apply.

## Prior controls and ordering

Preserve budgets, read-only startup, existing history/baseline checks and cleanup.
Validate CLI and URL before constructing/importing pg. Then connect and compare
database/login identity before invoking any ledger/status/apply/baseline work.

## Required controls

- Explicit target classification, expected host/effective port and database.
- Duplicate/unknown options and conflicting modes fail without echoed input.
- Explicit URL user/password, single database path component, strict encoding,
  bounded port and connection timeout; reject fragments and socket hosts.
- Reject connection query overrides and duplicates. Only approved TLS/timeout
  controls pass; construct explicit pg connection fields to avoid ambient fallback.
- Local classification accepts only explicit loopback hosts. Remote connections
  require authenticated TLS. The legacy nonloopback workspace hostname is not
  silently relabeled to bypass this restriction.
- Server database/user mismatch does no ledger work and closes the connection.
- Error output contains fixed codes, never URI, arguments, credentials or row values.

## Open gates and compatibility

No product decision blocks this restricted code slice. The recorded nonloopback
development database needs a separately reviewed target policy before this CLI
can use it as local. Existing commands now need explicit identity arguments;
legacy CI/release commands without them must fail before connecting. Selecting
production is not an approval record. Actual execution still needs a named target,
owner authorization and the separate release/restore/destructive-SQL gates.

## Verification and rollback

Capture parser/CLI-boundary failures first. Pure URI tests plus injected fake
connections cover normalization, overrides, mismatch, no-side-effects and redaction.
Real TLS/restore tests remain outstanding. Revert this code-only slice if needed;
no database was changed. Never restore unsafe deployment behavior as a workaround.

Recommendation: **Approve local implementation and synthetic validation only**.
