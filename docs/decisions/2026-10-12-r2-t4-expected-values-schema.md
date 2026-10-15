# ADR — expected provider values on `payment_attempts` (R2-T4)

Date: 2026-10-12 UTC. Proposed by: the R2 session. Status: **proposed** (repository
only; not applied to any shared database). Plan v2.2 §9.4, §10.1, §10.6.

## Context

The shared verifier (R2-T5) must compare a provider reply with values the attempt
fixed **before** the provider session was created. `payment_attempts` stores only the
session ID, X-ID, return-state hash and outcome (preflight RF-8). The provider
transaction ID is stored on transactions and split shares, not on the attempt.

## Decision

Forward migration `0034_payment_attempt_expected_values.sql`, additive only:

| Column | Type | Rule |
|---|---|---|
| `expected_amount_cents` | `bigint` | `>= 0` |
| `expected_currency` | `text` | `^[A-Z]{3}$` |
| `expected_merchant_reference` | `text` | non-empty |
| `provider_environment` | `text` | `uat` or `production` |
| `provider_transaction_id` | `text` | partial unique index where not null |
| `last_reconciliation_code` | `text` | written by R2-T5 |
| `last_reconciled_at` | `timestamp` | written by R2-T5 |

- The four expected columns are all set or all null (one CHECK). All are nullable:
  attempts claimed before the migration have none, and a validated NOT NULL or a
  NOT VALID CHECK would fail their next update (finalization) mid-flight.
- **Write order, enforced in the service and both storage implementations:** a new
  step records the expected values on a claimed attempt that has no session yet
  (idempotent if equal, conflict if different); attaching a session requires them;
  once a session is attached they can no longer be changed. Finalization stores the
  provider transaction ID.
- Immutability is enforced in code and tests, not by a database trigger: the schema
  has no triggers today and the fingerprint/parity tooling does not cover them.

## Alternatives considered

1. Set the values in the claim insert: rejected; a reused claim would need value
   comparison inside the claim's lock order, and the claim does not know the amount.
2. NOT NULL with a backfill: rejected; old attempts have no trustworthy expected
   values to backfill.
3. A trigger for immutability: deferred; reconsider if a second writer appears.

## Consequences

- The retail session route records the expected values before calling Windcave; a
  conflicting earlier record stops the request with 409 and no provider call.
- The new unique index is built on a column that is entirely null at migration
  time, so no duplicate preflight can fail; its build still takes a SHARE lock on
  `payment_attempts`. Size and lock time must be measured on a restored clone before
  production (§10.6.2, owner).

## Rollback

Code revert. The migration is additive; leaving the columns in place after a code
revert is safe (nothing requires them). A down migration is not provided, consistent
with the runner's forward-only ledger.
