# R0-T6A migration budget preflight

Base: `ec2072795fa3adc48b508e227884b3837685a3aa`. No branch integration.

Independent reviewer: subagent `migration_preflight`. Recommendation: **Approve
the bounded runner budget hardening and synthetic tests only**. Not approval of
database access, migration execution, schema changes or full R0 completion.

## Verification of prior fixes

The runner rejects drift, orphaned and out-of-order history and verifies baseline
effects. Startup is read-only. These protections remain intact.

## Blocking issues and high-risk concerns

No blocker for local budget implementation. Full T6A is blocked by missing target
identity/release controls, destructive/nontransactional review and exact-candidate
empty/restored convergence plus N/N+1 compatibility evidence. The existing schema
verifier ends at 0016 and rewrites early SQL, so it is not canonical proof.

## Missing steps and required ordering

Capture failing fake-client tests first. Validate positive bounded budgets before
queries; bound advisory acquisition, session work and transaction-local statements;
restore session settings on exit and surface lock-release failures. Roll back if
transaction timeout setup fails, before migration SQL or ledger writes.

## Unsafe assumptions and open questions

Do not apply or baseline an ambient DATABASE_URL. No named restored target has
been approved for this candidate. Do not use a regex-only destructive SQL guard
or edit historical migrations. Actual lock timings remain a database-owner
rehearsal requirement. No product/provider decision is needed for this code slice.

## Compliance, tests and rollback

Use fake clients only. No database, environment values, rows or provider actions.
Tests cover invalid budgets with zero queries, acquisition failure with no work,
successful/failed work cleanup and configuration failure with rollback/no ledger
write. No schema rollback is needed because nothing will be applied.

Independent reread by primary agent: agrees with the scope and remaining gates.
Use PostgreSQL statement_timeout for advisory acquisition and transaction-local
lock_timeout/statement_timeout for migration statements; preserve and restore the
caller's settings. Dedicated CLI connection gets bounded connect/query options.
Defaults are conservative implementation budgets, not production-sized rehearsal
acceptance. Approved to implement this slice with those limits recorded.
