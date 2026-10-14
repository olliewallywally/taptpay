# ADR — atomic refund claim (R4-T3)

Date: 2026-10-14 UTC. Proposed by: the R2/R4 session. Status: **proposed** (repository only).
Plan v2.2 §11.1, §11.3 and §11.4 (the parts the route itself needs). Builds on
[R4-T2's schema](2026-10-14-r4-t2-refund-operation-schema.md) and must follow its binding rules:
- the lock order;
- send intent before any call;
- the lease;
- one refund ID;
- retiring the legacy reserve path;
- checking the completed status under the lock;
- the environment from configuration.

Review: §21.1 pass, `docs/evidence/remediation-v2-2/r4/R4-T3-review-pass-1-2026-10-14.md`.

`FEATURE_REFUND_INITIATION` stays **off** throughout. It turns on only after R4-T5's DTOs
(R4-T2 ADR).

## Scope (proposed)

R4-T3 replaces the refund route's legacy steps with durable operations, end to end for one
synchronous attempt:

1. **Claim** (one transaction, §11.3) — `claimRefundOperationForMerchant`.
2. **Send intent** (its own transaction, before any network call) — `markRefundSubmittedForMerchant`.
3. **Call** Windcave with the persisted X-ID and reference (R4-T1's client).
4. **Settle** the synchronous outcome (one transaction) — `settleRefundOperationForMerchant`.

**Not in R4-T3:**
- **R4-T4:** the reconciliation worker for `submitted`/`unknown`, the outbox channel, and
  exactly-once notification. That needs its own migration.
- **R4-T5:** record-only refunds (bank transfer, manual) and the DTOs. Until then those
  methods are refused, while the flag is off anyway.

## 1. The request

`POST /api/transactions/:transactionId/refunds`, signed-in owner only (unchanged). The body
adds:

- **`idempotencyKey`:** a UUID, **required**. The client makes one per refund the merchant
  confirms, keeps it across retries of that refund, and clears it once a final answer
  arrives. This mirrors the cash command's key (`client/src/lib/cash-command-key.ts`).
  - Three screens call this route and each adopts it: `transactions.tsx`,
    `retail-analytics.tsx` and the phone terminal.
- **Unchanged:** `refundAmount` (a plain amount, converted to exact cents), `refundReason`
  (stored as `reason_text`, 1–500 characters) and `refundMethod`.
  - Only `original_payment_method` is accepted in R4-T3. The others get 400
    `REFUND_METHOD_UNAVAILABLE`.
- **`reason_code`** stays null until R4-T5 defines the list.

**Fingerprint:** SHA-256 hex of a canonical JSON of the business, sale, share (0), cents,
currency, method and reason text.

## 2. Claim — one transaction

`claimRefundOperationForMerchant({ merchantId, userId, transactionId, idempotencyKey, fingerprint, amountCents, reasonText, now })`.

1. **Lock** the sale `FOR UPDATE`, scoped by business (lock order: the sale first). None →
   `not-found`.
2. **Same key for this business?**
   - Same fingerprint → `reused`, with the existing operation (any state).
   - Different fingerprint → `conflict` (409 `IDEMPOTENCY_KEY_REUSED`).
3. **Refundable?**
   - The sale is `completed` or `partially_refunded`.
   - It is not split (split refunds stay disabled, the owner's default).
   - It has a capture (`windcave_transaction_id`).

   Otherwise → `not-refundable` with a fixed reason code.
4. **Remaining** = price cents − cents in `total_refunded` − the sum of `amount_cents` over
   this sale's `requested`, `submitted` and `unknown` operations. If the request exceeds it →
   `insufficient`, with the remaining cents (the merchant's own figure).
5. **Insert** the operation, `requested`:
   - a new operation ID;
   - X-ID: 32 random hex characters;
   - reference: `TAPTR_` + the first 26 hex characters of the operation ID;
   - the capture: the sale's `windcave_transaction_id`, share 0;
   - environment: from configuration (`currentProviderEnvironment()`);
   - a lease for this request;
   - `next_reconciliation_at` = now + the lease, so a stranded claim is found.
6. **Append one audit event** (`transaction_events`, `Refund_Requested`): the operation ID,
   the cents and the user. No provider identifier.
7. Commit. **No provider call has happened.**

A unique-key race (23505 on the business's key) is answered by re-reading, as `reused` or
`conflict`, never as an error. This is the cash command's pattern.

## 3. Send intent — its own transaction, before the call

`markRefundSubmittedForMerchant(operationId, merchantId, leaseOwner, now)`:

1. Lock the sale, then the operation.
2. `requested` → `submitted`, only if this request still holds the lease:
   - `submitted_at` = now;
   - `attempt_count` + 1;
   - the lease extended to cover the call, its timeout and its polls (R4-T1's bounds);
   - `next_reconciliation_at` = the lease's end.
3. **Anything else → do not send.**
   - A reused operation that is already `submitted`, `unknown` or terminal answers its
     current state and is never sent again.
   - A reused `requested` operation whose lease expired is taken over with a new lease, then
     sent.

## 4. Call

`createWindcaveRefund({ xId, originalTransactionId, amount, merchantReference })`, with the
operation's own values. They are never generated here.

## 5. Settle the synchronous outcome — one transaction

`settleRefundOperationForMerchant(operationId, merchantId, leaseOwner, outcome, now)`: lock the
sale, then the operation; act only if it is still `submitted` and this request holds the lease.

| R4-T1 outcome | New state | Totals | Reply |
|---|---|---|---|
| `refunded` | `succeeded`, with the refund ID | `total_refunded` + cents; `refundable_amount`; the sale becomes `partially_refunded` or `refunded` | 200 |
| `declined`, `rejected`, `invalid_request`, `disabled` | `failed` (the provider did not move money) | none: the reservation ends with the operation | 502 "The refund was not made." |
| `pending` (with an ID) | `unknown`, keeping the refund ID (write-once) | none | 202 "The refund is being checked. Do not try again." |
| `unknown`, `malformed`, `mismatch` | `unknown`; a mismatch is parked (no next time) | none | 202, the same message |

- **One audit event per transition:** `Refund_Succeeded`, `Refund_Failed` or
  `Refund_Unknown`, each with sanitized codes only.
- **The broadcast and push on success** stay best-effort after commit, as today. Exactly-once
  notification is R4-T4.
- **A settle that finds the operation no longer `submitted`** (a worker took over after the
  lease expired) changes nothing. It answers the stored state.

## 6. Retiring the legacy path

- **The route no longer calls** `reserveRefundAmountForMerchant`,
  `releaseRefundAmountForMerchant`, `createRefundForMerchant` or
  `updateRefundStatusForMerchant`. The generated route facts and a test hold that.
- **The storage methods stay, for R1's evidence verifier.** Each refuses to act on a sale
  that has a live operation, so no other caller can use them to bypass a reservation.

## 7. MemStorage

- **One pure function, `refundOperationTransition(from, to, method)`,** mirrors 0039's
  graph. MemStorage's three methods use it and the same claim rules. Tests run the same
  cases against MemStorage and, in a PostgreSQL verifier, against the database.
- **MemStorage has no row locks.** It mutates synchronously between awaits, as its cash
  command does.

## 8. Replies

- **Fixed messages.** No provider text or identifiers.
- **The response body stays the legacy shape** until R4-T5's DTOs, with the operation ID
  added. The flag is off.

## Tests (failing first)

- **HTTP:**
  - the disabled flag has zero side effects (no row, no event, no provider call);
  - member and other-tenant denial;
  - the same key and payload replays: one operation, one provider call;
  - the same key with a different payload → 409;
  - two concurrent partial refunds at and over the remaining amount;
  - one-cent and rounding edges;
  - a split sale and a missing capture are refused;
  - each R4-T1 outcome maps to its row in the table above;
  - a timeout before the send leaves `requested`, and a retry sends once;
  - a timeout after acceptance leaves `unknown`, and a retry does not send.
- **PostgreSQL verifier:**
  - concurrent claims on two connections;
  - the key race (23505 → reused or conflict);
  - the lock order;
  - a crash at each boundary (claim committed, submit committed, provider answered but
    settle not run);
  - a legacy reserve refused while an operation is live.
- **Client:** a key is made once per confirmed refund, reused on retry, and cleared on a final
  answer.

## Open questions

- **Owner:** the preflight §4 questions remain; the defaults are used here (split refunds
  disabled, owner-only, record-only methods deferred to R4-T5).
- **Windcave (from R4-T2):**
  - Does a 404 for an X-ID mean "not processed"?
  - Is a 202's ID the final one?

  R4-T3 sends one refund request and never queries by X-ID; that query, and what its 404
  means, is R4-T4's. A 4xx reply to the refund request itself is R4-T1's `rejected` (the
  provider refused this request; nothing was refunded). R4-T1's pass 2 approved that mapping,
  and it stands.
