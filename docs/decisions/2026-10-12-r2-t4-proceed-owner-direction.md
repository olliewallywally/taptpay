# Owner direction — proceed to R2-T4

Date: 2026-10-12 UTC. Owner: Oliver.
Branch: `ccr-e07e3100-0wm8kr` at `f0578517` (R2-T1–T3 implemented and pushed).

## Context

R2's review passes approved T1–T3 and held T4–T6 for three owner questions
([preflight §4](../evidence/remediation-v2-2/r2/R2-preflight-2026-10-11.md)): legacy
numbered/invoice flows in R2, approval of the T4 migration, and invoice references.

## Direction

The owner replied, verbatim:

> Ok commitment, push and move to the next task

## How it is applied

- **T4 proceeds as repository work only**: the forward migration, schema, service and
  storage changes, tests, and a rehearsal on a disposable local PostgreSQL database.
  The plan already allows a coding agent to write migrations and run isolated tests
  (§1). **Applying the migration to any shared database (development or production)
  is not authorized by this direction** and remains the owner's step, after the
  restored-snapshot rehearsal (§1.3 item 4, §10.6).
- T4 touches only the retail token engine (`payment_attempts`), so the legacy-flow and
  invoice-reference questions are not needed for it.
- T5 wiring for legacy numbered sales and invoice checkout still waits on those two
  answers. T5 for the retail token flow does not.

## Rollback

Revert the T4 commits; nothing is applied anywhere by this direction.
