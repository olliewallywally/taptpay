# ADR — atomic refund claim (R4-T3)

Date: 2026-10-14 UTC. Proposed by: the R2/R4 session. Status: **proposed, revision 2**
(repository only). Plan v2.2 §11.1, §11.3, and the parts of §11.4 the route itself needs.

It builds on [R4-T2's schema](2026-10-14-r4-t2-refund-operation-schema.md) (migration 0039)
and follows R4-T2's binding rules:
- the lock order;
- send intent before any call;
- the lease;
- one refund ID;
- retiring the legacy reserve path entirely;
- checking the completed status under the lock;
- the environment from configuration.

Reviews:
- [pass 1](../evidence/remediation-v2-2/r4/R4-T3-review-pass-1-2026-10-14.md) refused
  revision 1 with two blockers;
- this revision answers every finding, and goes to pass 2.

**`FEATURE_REFUND_INITIATION` stays off** in every environment until R4-T4's worker exists:
- configuration refuses it at startup outside tests (§9);
- it then waits for R4-T5's DTOs (R4-T2 ADR).

## Scope

R4-T3 replaces the refund route's legacy steps with durable operations for one synchronous
attempt:

1. **Claim** (one transaction).
2. **Send intent** (its own transaction, before any network call).
3. **One call** to Windcave, with no polling.
4. **Settle** (one transaction).

**Not in R4-T3:**
- **R4-T4:** the worker that polls and reconciles `submitted`/`unknown`, and exactly-once
  notification (its own migration).
- **R4-T5:** record-only refunds, and the reason-code list.

## 1. The request and the client's key

`POST /api/transactions/:transactionId/refunds`, signed-in owner only (unchanged). Gates in
this order:
1. authentication;
2. the flag (503, no side effects);
3. owner;
4. body validation;
5. `isWindcaveConfigured()` (503 `REFUND_PROVIDER_UNAVAILABLE`, before any claim: in
   simulation or disabled mode no operation is ever created).

**The body adds `idempotencyKey`, a UUID, required.**

- **Where the key lives:** `client/src/lib/refund-command-key.ts`, modelled on
  `cash-command-key.ts`. It is stored in sessionStorage, in one slot per business and sale.
  The key is made when the merchant confirms a refund. It survives the dialog closing and a
  page reload.
- **Kept across retries:** the same key is sent again while the refund's outcome is not
  final.
- **Cleared only on a final answer** (§8):
  - 200 refunded;
  - 422 `REFUND_NOT_MADE`;
  - an app-coded refusal made before any operation existed: 400, 403, 404, 409
    `IDEMPOTENCY_KEY_REUSED`, 409 `REFUND_EXCEEDS_REMAINING`, 409 `REFUND_NOT_REFUNDABLE`.
- **Kept on everything else:** a network error, any 5xx (a gateway's own 502 or 504
  included), 202, or a body without an app code.
- **Callers:** `transactions.tsx`, `retail-analytics.tsx` and the phone terminal all adopt
  it. A 202 is never shown as success.

**Other fields:**
- `refundAmount` (exact cents);
- `refundReason` (stored as `reason_text`, 1–500 characters);
- `refundMethod`: only `original_payment_method` in R4-T3. The others get 400
  `REFUND_METHOD_UNAVAILABLE`.
- `reason_code` stays null until R4-T5.

**Fingerprint:** SHA-256 hex of canonical JSON of the business, sale, share (0), cents,
currency and method.
- **Not the reason text.** A reworded retry is the same refund, and the fingerprint then
  cannot be used to confirm a short reason by guessing.
- **On a replay,** the first reason is kept.

## 2. Claim — one transaction

`claimRefundOperationForMerchant({ merchantId, userId, transactionId, idempotencyKey, fingerprint, amountCents, reasonText })`.

1. **Timeouts:** `SET LOCAL lock_timeout '5s'` and `statement_timeout '15s'`. Then
   `pg_advisory_xact_lock` on (business, key), which serialises one key as the cash command
   does (`recordCashSaleForMerchant`). No 23505 re-read is needed.
2. **Same key for this business?**
   - Same fingerprint → `reused` with the operation (any state).
   - Different → `conflict` (409 `IDEMPOTENCY_KEY_REUSED`).
   - A key used on another sale has a different fingerprint, so it is refused.
3. **Lock the sale `FOR UPDATE`**, scoped by business (sale first). None → `not-found`.
4. **Refundable,** otherwise `not-refundable` with a fixed code:
   - the status is `completed` or `partially_refunded`;
   - the sale is not split;
   - its capture matches `^[A-Za-z0-9_-]{1,64}$` (0039's shape). Otherwise
     `capture_invalid`.
5. **Remaining** = price cents − cents of `coalesce(total_refunded, 0)` − the sum of
   `amount_cents` over this sale's `requested`, `submitted` and `unknown` operations. If the
   request exceeds it → `insufficient` (409 `REFUND_EXCEEDS_REMAINING`, with the remaining
   cents).
6. **Insert,** with the database clock (`now()`) for every timestamp:

   | Column | Value |
   |---|---|
   | `state` / `status` | `requested` / `pending` |
   | `operation_id` | the default |
   | `idempotency_key`, `request_fingerprint` | as above |
   | `processor_x_id` | 32 random hex characters |
   | `merchant_reference` | `TAPTR_` + the operation ID without hyphens (38 characters) |
   | `original_provider_transaction_id`, `original_share_index` | the sale's capture, 0 |
   | `provider_environment` | `currentProviderEnvironment()` |
   | `amount_cents`, `refund_amount`, `currency` | the cents, cents ÷ 100 exactly, `NZD` |
   | `initiated_by_user_id` | the signed-in user (403 if absent) |
   | `reason_text` | the reason |
   | `refund_method` | `original_payment_method` |
   | `lease_owner`, `lease_expires_at` | this request, now() + the lease (§4) |
   | `next_reconciliation_at` | the lease's end |
   | `attempt_count` | 0 |
   | `requested_at`, `updated_at` | now() |
   | `refund_reason`, `windcave_refund_id`, `completed_at` | null |

7. **One audit event** (`transaction_events`, `Refund_Requested`, linked to the sale): the
   operation ID, the cents and the user. No reason text, no provider identifier.

## 3. Send intent — its own transaction

`markRefundSubmittedForMerchant(operationId, merchantId, leaseOwner)`:
1. Lock the sale, then the operation.
2. Act only if the state is `requested` and `lease_owner` is this request:
   - `submitted`, `processing`;
   - `submitted_at = now()`;
   - `attempt_count + 1`;
   - `lease_expires_at` and `next_reconciliation_at` = now() + the lease.
3. Anything else → **do not send**, and answer the stored state.

**A reused `requested` operation:**
- **Lease expired:** the request takes it over (a new `lease_owner`, in the same locked
  transaction), then submits.
- **Live lease** (another request is in it): 202 "being checked", and nothing is sent.

## 4. The call, and the lease

- **One call:** `createWindcaveRefund` with the operation's X-ID, capture, amount and
  reference, and **no polling** (`refundPollLimit: 0`; R4-T1's client already takes it).
- **A 202 returns at once with its refund ID.** That ID is saved in the settle (`unknown`,
  write-once), so a crash can no longer lose the only handle. Polling becomes the R4-T4
  worker's job.
- **The lease** = the client's request timeout (15 s) + 30 s margin = 45 s. It is derived
  from the same configuration, and a test holds that the lease is at least the worst case.
- **Expiry is decided by the database clock** (`lease_expires_at < now()`), never an app
  clock.

## 5. Settle — one transaction

`settleRefundOperationForMerchant(operationId, merchantId, leaseOwner, outcome)`: lock the sale,
then the operation. It acts only while the state is `submitted` and `lease_owner` is this
request. Ownership is what counts, not lease expiry: a real outcome is never thrown away,
because a takeover always rewrites the owner. Timestamps are `now()`.

**Before any write, the provider's refund ID is validated:**
- it matches `^[A-Za-z0-9_-]{1,64}$`;
- it is not the original capture;
- it is not already used: a 23505 inside a savepoint is caught.

A failure settles as `unknown`, **parked**, with `provider_refund_id_invalid`. Money may have
moved, so it is never failed and never released.

| R4-T1 outcome | Writes | Totals | Reply |
|---|---|---|---|
| `refunded` | `succeeded`, `completed`, `finished_at`, the refund ID; lease and next time cleared; fees stay 0.00 | `total_refunded` = coalesce + cents; `refundable_amount` = price − that; the status **recomputed from the totals**: `refunded` when nothing remains, else `partially_refunded`, never from the old status | 200 |
| `declined`, `rejected`, `invalid_request`, `disabled` | `failed`, `failed`, `finished_at`; a declined refund ID kept if valid; lease and next time cleared | none | 422 `REFUND_NOT_MADE`, "The refund was not made." |
| `pending` | `unknown`, `processing`, the refund ID if valid; lease cleared; `next_reconciliation_at` = now() + 5 min | none | 202 `REFUND_BEING_CHECKED`, "The refund is being checked. Do not try again." |
| `unknown`, `malformed` | `unknown`, `processing`; lease cleared; next = now() + 5 min | none | 202, the same |
| `mismatch` | `unknown`, `processing`, **parked** (next null), `last_error_code = provider_mismatch:<field>` | none | 202, the same |

- **One audit event per transition:** `Refund_Succeeded`, `Refund_Failed` or
  `Refund_Unknown`, with codes only.
- **The broadcast and push on success** stay best-effort after commit. Exactly-once
  notification is R4-T4's.
- **A settle that finds the operation not `submitted`, or another owner,** changes nothing.
  It answers the stored state.
- **A failure inside settle** (any error) is answered as 202 "being checked", never 5xx, and
  the client keeps its key. The operation stays `submitted` for R4-T4.

## 6. Retiring the legacy path (B-1)

- **The route no longer calls** `reserveRefundAmountForMerchant`,
  `releaseRefundAmountForMerchant`, `createRefundForMerchant` or
  `updateRefundStatusForMerchant`. The generated route facts hold that.
- **Fenced in both stores:**
  - reserve and release refuse any sale that has **any** operation row (`state` set, any
    state);
  - update-status refuses any row whose `state` is set.

  So a confirmed operation refund can never be erased from the totals. R1's evidence verifier
  uses these methods only on sales without operations, so it is unaffected.
- **R1's and the existing refund tests** are rewritten with their intent kept:
  - `r0-t5-capability-gates` (the route-source assertion);
  - `c10-batch-6b-sales`;
  - `r4-t1-refund-route`;
  - `tenant-refund-write-http`;
  - `http-params-transactions-refunds-batch`.

## 7. MemStorage

- **Lock:** the three methods run under `withMemLock` per sale. This corrects revision 1,
  which wrongly said "synchronous between awaits".
- **Rules:** they use one pure module, `server/refund-operation-rules.ts`. It holds the
  graph, the shape of each state (mirroring 0039's CHECKs) and the column set for each
  transition.
- **Audit:** refund events are stored, as for cash.
- **Parity:** the same cases run against MemStorage (HTTP) and PostgreSQL (verifier).

## 8. Replies and logs

- **Allowlisted body.** The reply carries `operationId`, `state`, `amountCents`, the sale's
  allowlisted DTO and a fixed message. No raw rows; `ownerRefundDto` style.
- **Fixed messages,** with no provider text or identifiers.
- **Logs:** the route logs the error class (SQLSTATE or code) only, never the error object.
  A CHECK violation's "Failing row" would carry the reason, X-ID and capture.

## 9. Configuration guard

- **Startup:** `FEATURE_REFUND_INITIATION=true` is refused outside `APP_ENV=test` with
  `REFUND_INITIATION_REQUIRES_RECONCILIATION`. R4-T4 removes the guard once its worker runs.
- **Before any rollback:** a count of live operations (`state IN ('requested','submitted','unknown')`)
  must be 0.

## 10. Accepted limits

- **R4-T1's `refunded` checks type, amount, currency, reference and account,** but not
  which capture it refunded: the reply's field naming the original transaction is
  unconfirmed (UAT, R4-T1). This is recorded for UAT.
- **A late legacy completion callback can rewrite the sale's capture or status.** The balance
  still holds, operations pin their own capture, and settle recomputes the status from the
  totals.

## Tests (failing first)

**HTTP (MemStorage):**
- **Gates:**
  - the flag off has zero side effects;
  - member and other-tenant denial;
  - simulation mode creates no claim;
  - a malformed capture is refused.
- **Idempotency:**
  - the same key and payload replays: one operation, one call;
  - a reworded reason is the same refund;
  - a different amount → 409;
  - the same key on another sale → 409.
- **Balance:**
  - two concurrent partials at and over the remaining amount;
  - one-cent and rounding edges;
  - a split sale is refused.
- **Outcomes and replies:**
  - each outcome's writes and reply, per the table in §5;
  - an invalid, capture-equal or duplicate refund ID is parked;
  - a timeout before the send leaves `requested`, and the retry sends once;
  - a timeout after acceptance leaves `unknown`, and the retry does not send;
  - a reused `requested` under a live lease sends nothing;
  - a settle error is answered 202.
- **The legacy fence:** reserve, release and update-status are refused after a finished
  operation.
- **Audit:** exactly one audit event per transition.

**PostgreSQL verifier:**
- **Concurrency:**
  - concurrent claims on two connections;
  - the same key concurrently (advisory lock);
  - the lock order.
- **Crash and time:**
  - a crash at each boundary;
  - settle after the lease expired (the owner still settles);
  - takeover;
  - a backward app clock has no effect (database time).
- **Shapes:** every transition's columns accepted by 0039.
- **Invariants:**
  - `total_refunded` equals legacy confirmed plus succeeded operations;
  - the legacy fence;
  - the lease covers the worst case.

**Client:**
- the key is made once per confirmed refund, kept on 5xx, 202 and network errors, and cleared
  only on a final answer;
- a 202 is not success.

## Open questions

- **Owner (defaults used):**
  - split refunds disabled;
  - owner-only;
  - record-only methods in R4-T5;
  - what the merchant sees for an operation left `requested`, `submitted` or `unknown` until
    R4-T4 (with the flag off, none exist).
- **Windcave:**
  - query by X-ID, and what a 404 means;
  - whether the 202's ID is the final one;
  - the X-ID namespace;
  - the visibility of `merchantReference`;
  - `transaction2Id`.
