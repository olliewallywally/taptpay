# ADR — refund operations on `refunds` (R4-T2)

Date: 2026-10-14 UTC. Proposed by: the R2/R4 session. Status: **proposed, revision 3**
(repository only; not applied to any shared database). Plan v2.2 §11.2–§11.4.

Reviews:
- [pass 3](../evidence/remediation-v2-2/r4/R4-review-pass-3-2026-10-14.md) approved
  revision 1;
- [pass 4](../evidence/remediation-v2-2/r4/R4-review-pass-4-2026-10-14.md), an independent
  reread, refused it with five blockers;
- [pass 5](../evidence/remediation-v2-2/r4/R4-review-pass-5-2026-10-14.md) confirmed pass 4's
  fixes and refused revision 2 on two new blockers (a split sale's capture, a null method);
- this revision answers them, and goes to pass 6.

This is the ADR that R4 review pass 1 listed under "Missing Steps": the refund state graph and
how reservations are represented.

## Context

`refunds` today has a serial ID, a decimal amount, a free-text status, `windcave_refund_id`,
fee columns and a free-text `initiated_by` (preflight RD-10). Refund initiation is behind
`FEATURE_REFUND_INITIATION`, which has never been on.

- **R4-T3** needs one database transaction that checks the balance, reserves and inserts the
  operation (§11.3).
- **R4-T4** needs a durable, stable provider identity and a state graph a worker can
  reconcile (§11.4).

## Decision

Forward migration `0039_refund_operations.sql`, additive. No legacy column is dropped,
renamed or retyped. Nothing about a legacy row changes, except that it gets an operation ID.

### Columns

| Column | Type | Rule |
|---|---|---|
| `operation_id` | `uuid` | `NOT NULL DEFAULT gen_random_uuid()`, unique. Legacy rows get one too (the public ID for R4-T5's DTOs). |
| `state` | `text` | `requested`, `submitted`, `unknown`, `succeeded`, `failed`, `cancelled`. **Null marks a legacy row.** |
| `idempotency_key` | `uuid` | unique per business (`merchant_id, idempotency_key`) |
| `request_fingerprint` | `text` | SHA-256 hex |
| `processor_x_id` | `text` | `^[A-Za-z0-9_-]{1,64}$`, unique: the X-ID, created before the call. The 64 is R4-T1's client bound, not a confirmed provider limit. |
| `merchant_reference` | `text` | 1–64 characters (the stable reference R4-T1 sends) |
| `original_provider_transaction_id` | `text` | `^[A-Za-z0-9_-]{1,64}$`: the capture being refunded, which must belong to the sale (see the trigger) |
| `original_share_index` | `integer` | `>= 0`; 0 is an unsplit sale, as in `payment_attempts` |
| `provider_environment` | `text` | `uat` or `production` |
| `amount_cents` | `bigint` | `> 0` |
| `currency` | `text` | `^[A-Z]{3}$` |
| `provider_refund_transaction_id` | `text` | `^[A-Za-z0-9_-]{1,64}$`, unique, never the original capture, written once |
| `lease_owner`, `lease_expires_at` | `uuid`, `timestamptz` | set together |
| `attempt_count` | `integer` | `NOT NULL DEFAULT 0`, `>= 0`, never decreases |
| `next_reconciliation_at` | `timestamptz` | when a worker should next look |
| `last_error_code` | `text` | `^[a-z][a-z0-9_:]{0,63}$` (R2's sanitized code shape) |
| `initiated_by_user_id` | `integer` | the principal. Checked at insert: a user of the operation's business. **No foreign key:** an audit record outlives the user's deletion (business deletion, a future admin path). |
| `reason_code` | `text` | `^[a-z][a-z0-9_]{0,31}$`; the value list is R4-T5's |
| `reason_text` | `text` | 1–500 characters |
| `requested_at`, `submitted_at`, `finished_at`, `updated_at` | `timestamptz` | no defaults |

- **Time zones.** New timestamps are `timestamptz` and are only compared with each other.
  Nothing compares them with the legacy `timestamp` columns, so no rule depends on the
  session time zone (the 0037 lesson).
- **No defaults in Drizzle.** The Drizzle declaration gives no new column a default except
  `operation_id` and `attempt_count`. A default would break the legacy-shape check for every
  legacy insert.

### Shape of a row (one CHECK per rule)

- **Legacy row (`state` null):** every new column except `operation_id` is null, and
  `attempt_count` is 0.
- **Every operation row:**
  - set: `transaction_id`, `merchant_id`, the key, fingerprint, cents, currency, user,
    `requested_at` and `updated_at`;
  - `refund_amount * 100 = amount_cents`, an exact numeric comparison;
  - `refund_method` is set and is one of the three methods (a null method would otherwise pass
    every check by SQL's three-valued logic);
  - empty: the legacy columns the new ones replace (`windcave_refund_id`, `refund_reason`,
    `completed_at`).
- **Legacy status follows the state,** so a reader not yet moved to R4-T5's DTOs tells the
  truth:
  - `requested` → `pending`;
  - `submitted` and `unknown` → `processing`;
  - `succeeded` → `completed`;
  - `failed` and `cancelled` → `failed`.
- **Provider refund (`original_payment_method`):** the X-ID, reference, original capture,
  share and environment are set.
- **Record-only refund (`bank_transfer`, `manual`):**
  - none of the provider fields is set;
  - it is never submitted, leased or reconciled;
  - it exists only as `succeeded` (recorded).

  Nothing on it can say Windcave moved money (§11.1).
- **By state:**
  - **Terminal** (`succeeded`, `failed`, `cancelled`): `finished_at` set, no lease, no next
    reconciliation. Otherwise `finished_at` is null.
  - **`submitted_at`:** set on `submitted`, `unknown` and provider `succeeded`/`failed`;
    absent on `requested` and `cancelled`.
  - **`next_reconciliation_at`:** required on `requested` and `submitted`. An `unknown` row
    with none is **parked for review**: it keeps its reservation and is never released
    without confirmation. R4-T4/T5 must surface parked rows to a reviewer.
  - **A `submitted` row always has a lease** (see the lease rule below).
  - **The provider refund ID** may appear from `submitted` on, so a pending reply's ID is
    kept for polling. It is absent on `requested` and `cancelled`, and required on a
    provider `succeeded`.
- **Timestamps** never precede `requested_at`.

### State graph (enforced by a trigger)

```text
requested ──► submitted ──► succeeded
    │             │    └──► failed
    │             └──► unknown ──► succeeded
    │                     │  └──► failed
    └──► cancelled        └──► unknown (re-checked, or parked)
```

**`requested` means never sent.** The writer commits the move to `submitted` (with
`submitted_at`) in its own transaction **before any provider call**: that commit is the send
intent. So:

- a crash before it leaves a `requested` operation that is safe to cancel;
- a crash after it leaves a `submitted` operation, which only reconciliation may finish.

`cancelled` is reachable only from `requested`.

**The lease rule (binding on R4-T3/T4).**
- The writer commits `submitted` with a lease that covers the call, its timeout and its polls.
- A refused or zero-row move to `submitted` means **do not send**.
- A worker never finishes a `submitted` row under a live lease. It takes one over only after
  the lease expires.
- A provider 404 for the X-ID is never read as "not processed" unless Windcave confirms that
  meaning (open question). Otherwise a worker could release a refund the sender is about to
  make, and the merchant could refund twice.

**One refund ID from pending to final.** The ID a pending (202) reply gives is the one kept,
and it is written once. R4-T1/T4 must treat a final reply naming a different ID as a mismatch,
which parks the operation. It must never write the new ID.

What the trigger enforces:

- **Insert:**
  - A provider operation starts `requested`, with no attempts, no submission and no refund ID.
  - A record-only operation starts `succeeded`.
  - Nothing can insert a provider success.
  - **Tenant, user and capture check.** The sale must belong to the operation's business,
    and is held with KEY SHARE until the insert commits. The initiating user must belong to
    the business. A provider operation's capture must be one of:
    - an **unsplit** sale's own provider transaction (share 0; a split sale's own column
      holds its last share's capture);
    - its share's (`split_payments`, by share index);
    - the provider transaction recorded on an **approved** payment attempt of the sale for
      that share, in the operation's environment.

    This replaces a foreign key (see the alternatives).
- **A legacy row never becomes an operation, and an operation never becomes legacy.** A
  legacy row's operation ID (its public ID) never changes.
- **An operation is never deleted.** A live one is a reservation; a finished one is in the
  totals. Legacy rows can still be deleted.
- **Identity never changes:**
  - the operation ID, business, sale, key and fingerprint;
  - the X-ID, reference, original capture, share and environment;
  - cents, currency, legacy amount and method;
  - user, reason code, `requested_at` and `created_at`.

  `reason_text` may only be cleared, on any row (a privacy redaction).
- **Only the arrows above,** plus staying in `requested`, `submitted` or `unknown` (lease and
  schedule updates).
  - `submitted_at` and the provider refund ID are written once.
  - `attempt_count` never decreases.
- **A terminal row is frozen,** except `customer_notified`, `updated_at` and clearing
  `reason_text`. The fee columns are set in the same update that finishes the operation.

The trigger raises `23514` with fixed text and no identifiers, as 0038 does. A refused
transition names only the stored, already-checked state, never the writer's value.

### The balance (§11.3)

For each capture:

```text
remaining = captured cents of that capture
          − cents already refunded (confirmed), from transactions.total_refunded
          − the sum of amount_cents over the sale's requested, submitted and unknown operations
```

- **Live operations are the reservation.** An operation that is `requested`, `submitted` or
  `unknown` holds its amount, so reserving and creating are one insert, under the sale's row
  lock. "Reserved but no operation" cannot exist.
- **Captured cents.** For an unsplit sale (share 0), the sale's price in cents. For a share,
  that share's amount. Split refunds stay disabled until the owner decides otherwise
  (preflight §4 question 2), so R4 refunds only share 0.
- **Confirmed amounts change the totals, in the same transaction and under the sale's lock:**
  - a provider operation becoming `succeeded` (R4-T4);
  - a record-only operation being inserted (R4-T5).

  Each updates `total_refunded`, `refundable_amount` and the sale's status. A record-only
  refund therefore lowers what can still be refunded by card. The owner may revise this
  (question below).
- **Legacy reservations.** R4-T3 retires or fences the legacy reserve and release path
  **entirely**, not only for operations. `reserveRefundAmountForMerchant` checks
  `price − total_refunded` and cannot see live operations. They write the totals before the provider
  is asked (RD-5). Legacy amounts already in `total_refunded` count as confirmed. That is
  conservative: it lowers the balance and never raises it. The runbook's preflight counts
  legacy `pending`/`processing` rows, which can never be reconciled.

### Indexes

- `refunds_operation_id_uq`
- `refunds_merchant_idempotency_key_uq` (`merchant_id, idempotency_key`) where the key is set
- `refunds_processor_x_id_uq` where set
- `refunds_provider_refund_transaction_id_uq` where set
- `refunds_live_transaction_idx` (`transaction_id`) where `state` is `requested`, `submitted`
  or `unknown`: the balance sum
- `refunds_reconciliation_due_idx` (`next_reconciliation_at`) where `state` is `requested`,
  `submitted` or `unknown`: the worker, including stranded requests

## Alternatives considered

1. **A new `refund_operations` table.** Rejected: §11.2 says to extend `refunds`, and the
   read routes and their tenant scoping already read it.
2. **A separate reservation table, or reserved cents on the sale.** Rejected. It has to be
   kept in step with the operation, which is the RD-4 problem again.
3. **A composite foreign key `(transaction_id, merchant_id)` → `transactions`** (revision 1).
   Rejected (pass 4 B-5):
   - it refuses the legacy rows and the ownership-move races the R1-T7 S2a verifier
     exercises;
   - it takes SHARE ROW EXCLUSIVE on `transactions` for the migration.

   The trigger checks tenant and capture at insert. A later move of a sale is R1's
   territory, and R4-T3 rechecks ownership under the sale's lock.
4. **A trigger that maintains `total_refunded`.** Considered (pass 4). Rejected for T2: the
   sale's status rules (refunded, partially refunded, a sale cancelled and then paid under
   OI-1) live in code, and putting half of them in a trigger splits them. Instead, R4-T4's
   PostgreSQL verifier asserts the invariant after every path:
   `total_refunded` equals the legacy confirmed amount plus the succeeded operations.
5. **Reusing `windcave_refund_id` and making it unique.** Rejected: legacy values are
   unverified, and the index could fail the migration.
6. **`processor_x_id` as `uuid`.** Rejected: R4-T1's client accepts any 1–64-character X-ID.
7. **A foreign key on `initiated_by_user_id`.** Rejected: removing a team member deletes the
   user row (`removeTeamMember`), and a frozen audit row must not block that or be rewritten.

## Consequences

- **The table rewrite.** `operation_id`'s volatile default rewrites `refunds` under ACCESS
  EXCLUSIVE. No other table is locked. Measure the row count and the lock time on a restored
  clone before production (§10.6, owner). Apply with the app stopped, as 0036/0037 were.
- **MemStorage** refunds carry the new fields. Legacy writers keep working: they never set
  `state`, and no new column has a default they could trip on. R4-T3 adds one pure
  transition function, used by both stores and tested against both, so MemStorage cannot
  accept what PostgreSQL refuses.
- **R4-T4 needs another migration** for exactly-once audit and notification: an outbox
  channel for refunds and a unique event per operation. T2 does not claim them.
- **The refund flag stays off until R4-T5's DTOs ship,** not only until R4-T3. The read
  routes return raw `refunds` rows, members included. Once operation rows exist, that would
  expose the X-ID, the original capture, the fingerprint, the lease, the reason and the
  user.
- **If an audit event copies `reason_text`,** clearing the reason must cover that copy.
- **Owner questions** (none blocks T2):
  - split refunds;
  - the admin path;
  - the record-only methods;
  - whether a manual or bank refund lowers the card balance (default: yes);
  - whether invoice refund-due cases and system-initiated refunds are in R4 (default: no;
    they would need `transaction_id` or the user to be optional);
  - whether clearing a finished refund's reason is acceptable (default: yes);
  - a split sale cancelled and then paid late (OI-1) can hold a captured share while it stays
    `cancelled`. With split refunds disabled, R4 gives it no refund path.
- **Windcave questions:**
  - Can a refund be queried by X-ID?
  - Does a 404 mean "not processed"?
  - Do refund and session X-IDs share a namespace?
  - Are a 202 reply's `id`/`self` the same transaction the final reply names?

## Rollback

Code revert, **only while the refund flag is off and no operation is live.** Once R4-T3 has
created live operations, the legacy route cannot see their reservations
(`reserveRefundAmountForMerchant` checks `price − total_refunded`), so a revert could refund
more than was captured.

The migration is additive. For legacy writers, two things change: the legacy-shape check, and
the refusal to turn a legacy row into an operation. Neither touches anything a legacy writer
sets. The runner is forward-only, so there is no down migration.
