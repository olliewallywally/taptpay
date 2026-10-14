# ADR — refund operations on `refunds` (R4-T2)

Date: 2026-10-14 UTC. Proposed by: the R2/R4 session. Status: **proposed** (repository only;
not applied to any shared database). Plan v2.2 §11.2–§11.4. Review:
[R4 pass 3](../evidence/remediation-v2-2/r4/R4-review-pass-3-2026-10-14.md). This is the ADR
that R4 review pass 1 listed under "Missing Steps": the refund state graph and how
reservations are represented.

## Context

`refunds` today has a serial ID, a decimal amount, a free-text status, `windcave_refund_id`,
fee columns and a free-text `initiated_by` (preflight RD-10). Refund initiation is behind
`FEATURE_REFUND_INITIATION`, which has never been on. R4-T3 needs one database transaction
that checks the balance, reserves and inserts the operation (§11.3). R4-T4 needs a durable,
stable provider identity and a state graph a worker can reconcile (§11.4).

## Decision

Forward migration `0039_refund_operations.sql`, additive. No legacy column is dropped,
renamed or retyped.

### Columns

| Column | Type | Rule |
|---|---|---|
| `operation_id` | `uuid` | `NOT NULL DEFAULT gen_random_uuid()`, unique. Legacy rows get one (the public ID for R4-T5's DTOs). |
| `state` | `text` | `requested`, `submitted`, `unknown`, `succeeded`, `failed`, `cancelled`. **Null marks a legacy row.** |
| `idempotency_key` | `uuid` | unique per business (`merchant_id, idempotency_key`) |
| `request_fingerprint` | `text` | SHA-256 hex |
| `processor_x_id` | `text` | `^[A-Za-z0-9_-]{1,64}$`, unique (the X-ID, created before the call) |
| `merchant_reference` | `text` | 1–64 characters (the stable reference R4-T1 sends) |
| `original_provider_transaction_id` | `text` | `^[A-Za-z0-9_-]{1,64}$` (the capture being refunded) |
| `original_share_index` | `integer` | `>= 0`; 0 is an unsplit sale, as in `payment_attempts` |
| `provider_environment` | `text` | `uat` or `production` |
| `amount_cents` | `bigint` | `> 0` |
| `currency` | `text` | `^[A-Z]{3}$` |
| `provider_refund_transaction_id` | `text` | `^[A-Za-z0-9_-]{1,64}$`, unique, never the original capture |
| `lease_owner`, `lease_expires_at` | `uuid`, `timestamptz` | set together |
| `attempt_count` | `integer` | `NOT NULL DEFAULT 0`, `>= 0`, never decreases |
| `next_reconciliation_at` | `timestamptz` | |
| `last_error_code` | `text` | `^[a-z][a-z0-9_:]{0,63}$` (R2's sanitized code shape) |
| `initiated_by_user_id` | `integer` | references `users(id)` |
| `reason_code` | `text` | `^[a-z][a-z0-9_]{0,31}$`; the value list is R4-T5's |
| `reason_text` | `text` | 1–500 characters |
| `requested_at`, `submitted_at`, `finished_at`, `updated_at` | `timestamptz` | |

New timestamps are `timestamptz` and are only compared with each other, so no check depends
on the session time zone (the 0037 lesson).

### Shape of an operation row (one CHECK per rule)

- **Legacy row (`state` null):** every new column is null, `attempt_count` is 0.
- **Every operation row:** `transaction_id`, `merchant_id`, the key, fingerprint, cents,
  currency, user, `requested_at` and `updated_at` are set; `refund_amount` equals
  `amount_cents / 100`; `refund_method` is one of the three methods; the legacy columns the
  new ones replace (`windcave_refund_id`, `refund_reason`, `completed_at`) are null.
- **Legacy status follows the state,** so a reader not yet moved to R4-T5's DTOs tells the
  truth: `requested` → `pending`; `submitted` and `unknown` → `processing`;
  `succeeded` → `completed`; `failed` and `cancelled` → `failed`.
- **Provider refund (`original_payment_method`):** the X-ID, reference, original capture,
  share and environment are set.
- **Record-only refund (`bank_transfer`, `manual`):** none of the provider fields is set, and
  it is never submitted, leased or reconciled: it can be only `succeeded` (recorded) or
  `cancelled`. Nothing on it can say Windcave moved money (§11.1).
- **By state:**
  - terminal (`succeeded`, `failed`, `cancelled`): `finished_at` set, no lease, no next
    reconciliation;
  - otherwise `finished_at` is null;
  - `submitted`, `unknown` and provider `succeeded`/`failed` have `submitted_at`;
    `requested` and `cancelled` do not (a cancelled operation was never sent);
  - `submitted` and `unknown` have `next_reconciliation_at` (the worker's due time);
  - a provider `succeeded` has its refund transaction; `requested`, `submitted`, `unknown`
    and `cancelled` have none; `failed` may carry one (a declined refund can be numbered).
- Timestamps never precede `requested_at`.

### State graph (enforced by a trigger)

```text
requested ──► submitted ──► succeeded
    │             │    └──► failed
    │             └──► unknown ──► succeeded
    │                     │  └──► failed
    └──► cancelled        └──► unknown (re-checked)
```

- **Insert:** a provider operation starts `requested`, with no attempts and no submission.
  A record-only operation starts `succeeded`. Nothing can insert a provider success.
- **A legacy row never becomes an operation, and an operation never becomes legacy.**
- **Identity never changes:** the operation ID, business, sale, key, fingerprint, X-ID,
  reference, original capture, share, environment, cents, currency, legacy amount, method,
  user, reason, `requested_at` and `created_at`.
- **Only the arrows above,** plus staying in `requested`, `submitted` or `unknown` (lease and
  schedule updates). `submitted_at` and the refund transaction are written once.
  `attempt_count` never decreases.
- **A terminal row is frozen,** except `customer_notified`.

The trigger raises `23514`, as 0038 does.

### Reservations are derived, not stored (§11.3)

The **live operation is the reservation:**

```text
remaining = captured cents
          − confirmed refunded cents (transactions.total_refunded)
          − the sum of amount_cents over the sale's requested, submitted and unknown operations
```

R4-T3 computes it under the sale's row lock, in the same statement sequence that inserts the
operation. So reserving and creating are one transaction by construction. R4-T4 updates
`total_refunded`, `refundable_amount` and the sale's status only when an operation becomes
`succeeded`, in the same transaction. R4-T3 must therefore stop calling
`reserveRefundAmountForMerchant`, which writes the totals before the provider is asked
(RD-5). A partial index on the sale's live operations keeps the sum cheap.

### Tenant integrity

A composite foreign key `(transaction_id, merchant_id)` → `transactions(id, merchant_id)`
(the key 0036 added). A legacy row whose business does not match its sale would fail it.
The migration counts such rows first and aborts with the count only, no values and no
remediation (0035's pattern). A row with either column null passes (MATCH SIMPLE), and
operation rows require both.

### Indexes

- `refunds_operation_id_uq`
- `refunds_merchant_idempotency_key_uq` (`merchant_id, idempotency_key`) where the key is set
- `refunds_processor_x_id_uq` where set
- `refunds_provider_refund_transaction_id_uq` where set
- `refunds_live_transaction_idx` (`transaction_id`) where `state` is `requested`, `submitted`
  or `unknown`
- `refunds_reconciliation_due_idx` (`next_reconciliation_at`) where `state` is `submitted` or
  `unknown`

## Alternatives considered

1. **A new `refund_operations` table.** Rejected: §11.2 says to extend `refunds`, and the
   read routes and their tenant scoping already read it.
2. **A separate reservation table, or reserved cents on the sale.** Rejected. It has to be
   kept in step with the operation, which is the RD-4 problem again. Deriving it from live
   states makes "reserved but no operation" impossible.
3. **Reusing `windcave_refund_id` and making it unique.** Rejected: legacy values are
   unverified, and a unique index over them could fail the migration. The new column is
   empty, and the legacy one is null on operation rows.
4. **`processor_x_id` as `uuid`.** Rejected: R4-T1's client accepts any 1–64-character
   X-ID, and the route generates hex. The check matches the client's own bound.
5. **Encoding split-refund policy in the schema.** Rejected: the share is recorded, but
   whether shares can be refunded is R4-T3's decision. The owner's default is disabled
   (preflight §4 question 2).

## Consequences

- Adding `operation_id` with a volatile default rewrites `refunds` under an ACCESS
  EXCLUSIVE lock. The table is expected to be small (the flag has never been on). Its row
  count and the lock time must be measured on a restored clone before production (§10.6,
  owner).
- MemStorage refunds carry the new fields. Legacy writers keep working: none of them
  writes `state`.
- The owner questions (split refunds, admin path, record-only methods) do not block T2. The
  schema allows each answer, and R4-T3 and R4-T5 enforce it.

## Rollback

Code revert. The migration is additive. Leaving the columns, checks, trigger and indexes in
place after a revert is safe for legacy writers: they never set `state`, and every new rule
applies only to operation rows, except two that cover every row:

- the composite foreign key, which the preflight proves legacy data already satisfies;
- the trigger's refusal to turn a legacy row into an operation.

The runner is forward-only, so there is no down migration.
