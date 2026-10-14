# ADR — atomic refund claim (R4-T3)

Date: 2026-10-14 UTC. Proposed by: the R2/R4 session. Status: **proposed, revision 3**
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
- [pass 2](../evidence/remediation-v2-2/r4/R4-T3-review-pass-2-2026-10-14.md) confirmed B-1 and
  refused revision 2 on N-1 (a key cleared on a refusal that says nothing about it);
- this revision answered every finding;
- [pass 3](../evidence/remediation-v2-2/r4/R4-T3-review-pass-3-2026-10-14.md) **approved
  revision 3** for repository implementation only, with conditions C-1 to C-6. They are
  written in **§11 below**, which binds the implementation.

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
- **Cleared only on an answer about this key** (N-1). The claim marks every refusal that
  proves no operation exists for the key with `keyConsumed: false`. The client clears the key
  only on:
  - 200 refunded;
  - 422 `REFUND_NOT_MADE` (its operation failed);
  - a refusal carrying `keyConsumed: false`: not found, 409 `REFUND_NOT_REFUNDABLE`,
    409 `REFUND_EXCEEDS_REMAINING`, 409 `REFUND_IN_PROGRESS`.
- **Kept on everything else:**
  - every refusal made before the claim (400 validation and `REFUND_METHOD_UNAVAILABLE`,
    401, 403 including `CSRF_REJECTED`/`CROSS_SITE_REJECTED`, 503), since they never looked
    at the key;
  - 409 `IDEMPOTENCY_KEY_REUSED`: an operation exists for the key, so the client shows its
    state;
  - any 5xx, 202, a network error, or a body without an app code.

  The client stores the payload with the key and keeps the dialog pinned to it while the key
  is unresolved.
- **One live refund per sale (server-side, owner default).** A claim on a sale that already
  has a live operation under another key is refused: 409 `REFUND_IN_PROGRESS`,
  `keyConsumed: false`. So even a client that loses its key cannot start a second refund
  while the first may have moved money. This limits concurrent partial refunds on one sale,
  as the legacy route effectively did ("another refund is already in progress"). It is an
  owner question, recorded below.
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
3. **Lock the sale `FOR UPDATE`**, scoped by business. None → `not-found`. Each step below is
   its own statement, issued after its lock is granted, so it reads a fresh snapshot under
   READ COMMITTED. Nothing is folded into the locking statement.
   - **The refund advisory lock is taken only here, first,** and never by a path already
     holding a sale or refund row lock. This is binding on R4-T4. Its namespace is a
     dedicated first key, as the cash command (`CASH`) and the TAPT locks use.
4. **Refundable,** otherwise `not-refundable` with a fixed code:
   - the status is `completed` or `partially_refunded`;
   - the sale is not split;
   - its capture matches `^[A-Za-z0-9_-]{1,64}$` (0039's shape). Otherwise
     `capture_invalid`.
5. **Live already?** If another operation on this sale is `requested`, `submitted` or
   `unknown` → `in-progress` (409 `REFUND_IN_PROGRESS`).
6. **Remaining** = price cents − cents of `coalesce(total_refunded, 0)` − the sum of
   `amount_cents` over this sale's `requested`, `submitted` and `unknown` operations. If the
   request exceeds it → `insufficient` (409 `REFUND_EXCEEDS_REMAINING`, with the remaining
   cents).
7. **Insert,** with the database clock (`now()`) for every timestamp:

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

8. **One audit event** (`transaction_events`, `Refund_Requested`, linked to the sale): the
   operation ID, the cents and the user. No reason text, no provider identifier.

## 3. Send intent — its own transaction

`markRefundSubmittedForMerchant(operationId, merchantId, leaseOwner)`:
1. Lock the sale, then the operation.
2. Act only if the state is `requested` and either `lease_owner` is this request or
   `lease_expires_at < now()`. The second case is a **takeover**: it happens here, under the
   sale lock and then the operation lock, never in the claim's reuse branch. That branch
   runs before the sale lock and must not write the operation. In one update:
   - `lease_owner` = this request;
   - `submitted`, `processing`;
   - `submitted_at = now()`;
   - `attempt_count + 1`;
   - `lease_expires_at` and `next_reconciliation_at` = now() + the lease;
   - `updated_at = now()`.
3. Anything else → **do not send**, and answer the stored state. A reused `requested` under
   another request's live lease answers 409 `REFUND_IN_PROGRESS`, "A refund for this sale is
   already in progress". It does not say "being checked": nothing was sent.

## 4. The call, and the lease

- **One call:** a dedicated no-poll refund client, `createWindcaveRefundOnce`, in
  `server/windcave.ts`. It is built like `singleAttemptSessionClient`, with
  `refundPollLimit: 0`; the existing wrapper's default client polls three times. It sends the
  operation's X-ID, capture, amount and reference. Refunds are never re-sent:
  `createRefund` does not use `retryLimit`.
- **A 202 with no ID** (only a `self` link) settles as `unknown` with no refund ID. Only a
  query by X-ID can resolve it (R4-T4; Windcave question).
- **A 202 returns at once with its refund ID.** That ID is saved in the settle (`unknown`,
  write-once), so a crash can no longer lose the only handle. Polling becomes the R4-T4
  worker's job.
- **The lease** = the client's request timeout + 30 s margin, today 15 s + 30 s = 45 s. The
  timeout constant is exported from `windcave-client.ts`, so the lease is derived from it,
  and a test holds that the lease covers the no-poll worst case.
- **Expiry is decided by the database clock** (`lease_expires_at < now()`), never an app
  clock.

## 5. Settle — one transaction

`settleRefundOperationForMerchant(operationId, merchantId, leaseOwner, outcome)`: lock the sale,
then the operation. It acts only while the state is `submitted` and `lease_owner` is this
request. Ownership is what counts, not lease expiry: a real outcome is never thrown away,
because a takeover always rewrites the owner. Timestamps are `now()`.

**The refund ID rules (one place, `server/refund-operation-rules.ts`):**
- **Valid** means it matches `^[A-Za-z0-9_-]{1,64}$`, is not the original capture, and is not
  already used. A 23505 is caught inside a savepoint.
- **`refunded`:** an ID is required. A missing or invalid one settles as `unknown`,
  **parked**, `provider_refund_id_invalid`. Money moved, so it is never failed.
- **`pending`:**
  - an absent ID → `unknown` without one, scheduled (not parked);
  - a malformed ID → `unknown` without it, scheduled;
  - one equal to the capture, or a duplicate → `unknown`, **parked**,
    `provider_refund_id_invalid`.
- **`declined`:** the provider said no money moved.
  - absent or malformed → `failed` without an ID;
  - equal to the capture, or a duplicate → `unknown`, **parked**,
    `provider_refund_id_invalid`. A decline naming a known transaction is too odd to release
    on.

**Order inside the transaction:**
1. validate;
2. lock the sale, then the operation;
3. update the operation inside a savepoint (on 23505, roll back to the savepoint and park);
4. update the totals only after the operation update succeeded;
5. write the event;
6. commit;
7. then broadcast and push.

Every settle also sets `updated_at = now()`.

| R4-T1 outcome | Writes | Totals | Reply |
|---|---|---|---|
| `refunded` | `succeeded`, `completed`, `finished_at`, the refund ID; lease and next time cleared; fees stay 0.00 | `total_refunded` = coalesce + cents; `refundable_amount` = price − that; the status **recomputed from the totals**: `refunded` when nothing remains, else `partially_refunded`, never from the old status | 200 |
| `declined`, `rejected`, `invalid_request`, `disabled` | `failed`, `failed`, `finished_at`; the ID per the rules above; lease and next time cleared | none | 422 `REFUND_NOT_MADE`, "The refund was not made." |
| `pending` | `unknown`, `processing`, the ID per the rules above; lease cleared; `next_reconciliation_at` = now() + 5 min | none | 202 `REFUND_BEING_CHECKED`, "The refund is being checked. Do not try again." |
| `unknown`, `malformed` | `unknown`, `processing`; lease cleared; next = now() + 5 min | none | 202, the same |
| `mismatch` | `unknown`, `processing`, **parked** (next null), `last_error_code = provider_mismatch:<field>` | none | 202, the same |

- **One audit event per transition:** `Refund_Succeeded`, `Refund_Failed` or
  `Refund_Unknown`, with codes only.
- **The broadcast and push on success** stay best-effort after commit. Exactly-once
  notification is R4-T4's.
- **A settle that finds the operation not `submitted`, or another owner,** changes nothing.
  It answers the stored state. In R4-T3 nothing takes a `submitted` row over. From R4-T4 a
  worker may, after its lease expires; the worker's poll must then recover the outcome.
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
- **How the fence is built in PostgreSQL:** reserve and release become a transaction that
  locks the sale FOR UPDATE, checks for operations in a separate statement, then updates.
  They are no longer one UPDATE with NOT EXISTS: its recheck after a lock wait would not see
  a claim that had just committed.
- **R1's and the existing refund tests** are rewritten with their intent kept:
  - `r0-t5-capability-gates` (the route-source assertion);
  - `c10-batch-6b-sales`;
  - `r4-t1-refund-route`;
  - `tenant-refund-write-http`;
  - `http-params-transactions-refunds-batch`;
  - `route-matrix-served-business` (its legacy body and `windcaveRefundId`);
  - `route-matrix-records`;
  - `route-matrix-roles`;
  - `route-policy-role-defaults`;
  - `r0-t5-disabled-route-side-effects`;
  - `tenant-storage-inventory`;
  - the regenerated route facts.

## 7. MemStorage

- **Locks:** the claim takes a `withMemLock` on (business, key) and then one on the sale,
  matching PostgreSQL's order. Submit and settle take the sale lock. This corrects revision
  1, which wrongly said "synchronous between awaits".
- **Rules:** one pure module, `server/refund-operation-rules.ts`. It mirrors 0039's CHECKs
  **and** its trigger:
  - the graph and each state's shape;
  - insert-time ownership of the business, user and capture;
  - uniqueness of the key per business, the X-ID and the refund ID;
  - write-once fields and identity immutability;
  - the column set for each transition.
- **Audit:** refund events are stored, as for cash.
- **Parity:** the same cases run against MemStorage (HTTP) and PostgreSQL (verifier).

## 8. Replies and logs

- **Allowlisted body.** The reply carries `operationId`, `state`, `amountCents`, the sale's
  allowlisted DTO and a fixed message. No raw rows; `ownerRefundDto` style.
- **Fixed messages,** with no provider text or identifiers.
- **Clients** read the app code and show fixed copy for each. Two do not today:
  - `apiRequest` puts the raw status and body into the error message, and both desktop
    callers show it;
  - the phone terminal counts any 2xx, 202 included, as success.

  A replayed key answers with **the earlier refund's** result, and the copy says so.
- **SSE:** `ownerRefundDto` shows `completedAt` and `refundReason` as null for operation rows,
  because 0039 keeps those legacy columns empty. R4-T5 adds operation fields to the DTO;
  until then this is documented.
- **Logs:** the route logs the error class (SQLSTATE or code) only, never the error object.
  A CHECK violation's "Failing row" would carry the reason, X-ID and capture.

## 9. Configuration guard

- **Startup:** `FEATURE_REFUND_INITIATION=true` is refused outside `APP_ENV=test` with
  `REFUND_INITIATION_REQUIRES_RECONCILIATION`. R4-T4 removes the guard once its worker runs.
- **Before any rollback:** a count of live operations (`state IN ('requested','submitted','unknown')`)
  must be 0.
- **Consequence:** no refund reaches the provider in any environment, UAT included, before
  R4-T4. The UAT items in §10 wait for R4-T4/T5. The guard lives in `loadConfig`.

## 10. Accepted limits

- **R4-T1's `refunded` checks type, amount, currency, reference and account,** but not
  which capture it refunded: the reply's field naming the original transaction is
  unconfirmed (UAT, R4-T1). This is recorded for UAT.
- **A late legacy completion callback can rewrite the sale's capture or status.** The balance
  still holds, operations pin their own capture, and settle recomputes the status from the
  totals.

## 11. Conditions of approval (pass 3), binding

- **C-1. Reply from the committed state.** The reply, broadcast and push are derived from
  the state the transaction committed, never from the provider's outcome:
  - `succeeded` → 200, with the push;
  - `failed` → 422 `REFUND_NOT_MADE`;
  - `unknown`, parked or scheduled → 202 `REFUND_BEING_CHECKED`;
  - anything a settle did not change → the stored state's reply.

  So a `declined` or `refunded` reply that the ID rules park always answers 202. A replay
  causes no side effects: no event, broadcast or push (§11.4.8).
- **C-2. A distinct code for this key's own operation in flight.** A reused `requested`
  under another request's live lease answers 202 `REFUND_BEING_SENT`, with **no
  `keyConsumed`**. The client keeps the key. `REFUND_IN_PROGRESS` with `keyConsumed: false`
  is only ever another key's live operation.
- **C-3. The operation UUID is generated before the insert** (`randomUUID()` in the app), so
  `operation_id` and `merchant_reference` are set in the same statement. 0039 requires the
  reference at insert and never lets it change.
- **C-4. An error never sends and never fails.**
  - Any error, or an unconfirmed commit, in `markRefundSubmittedForMerchant` means do not
    send.
  - An exception thrown by the provider call is settled as `unknown`, scheduled, or left
    `submitted` if settle itself fails. It is never `failed`.
  - The send intent checks the operation's `provider_environment` against
    `currentProviderEnvironment()` and refuses to send on a mismatch (pass 3 H-5).
- **C-5. Tests and affected files.** Every test in pass 3's list is added (below). The
  affected files are extended with:
  - `server/route-review.ts` (the refund route's review entry);
  - the route-policy-review, api-route-contract and route-matrix tests;
  - `tenant-refund-writes.test.ts`;
  - `r2-t6-provider-log-guard.test.ts` (the no-poll client).
- **C-6. R4-T4 exit criteria.** R4-T4 does not close until each of these has a defined,
  tested exit:
  - a stranded `requested` operation whose lease expired: the worker cancels it, because
    it was never sent;
  - a parked `unknown`: a reviewer action with its own transition and audit;
  - an `unknown` without a refund ID: a query by X-ID if Windcave supports one. If not, an
    owner decision on how the sale is released.

  Until then, one live refund per sale can block a sale's refunds; the flag is off.

**Also adopted from pass 3:**
- **Owner-only means `role === 'owner'`.** `isAccountOwner` also admits `merchant` and
  `admin`; plan §11.1 needs a separate audited policy for an admin path.
- **Audit:**
  - the send intent and a takeover each append an event (`Refund_Submitted`, with a takeover
    flag);
  - the reply's sale DTO is loaded scoped to the business.
- **Client escape from a pinned dialog.** After showing the sale's refunds, the merchant can
  discard the stored refund: the same path as `cash-command-key.ts`. A conflict that names a
  terminal operation clears the key.
- **The dialog shows** the sale's refunded total and any live refund (pass 3 H-4).
- **MemStorage:**
  - the fenced reserve and release take the same sale lock;
  - the lock maps are named;
  - no helper inside the claim retakes the sale lock (`withMemLock` is not re-entrant);
  - keys are lowercased, as cash does.
- **Timeouts:** submit and settle set `SET LOCAL` timeouts too, and the lease test includes
  them.
- **Every keyed operation writer takes the advisory lock,** R4-T5's record-only inserts
  included.
- **Rollback precondition:** no operation rows of any state, and the flag off. A rollback
  removes the fences.

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

**Pass 3 additions:**
- the startup guard refuses the flag in development, staging and production;
- the key is kept on 400, 401, 403 `CSRF_REJECTED`/`CROSS_SITE_REJECTED`, 409 `KEY_REUSED`
  and 429;
- `keyConsumed: false` appears on exactly the four claim refusals;
- a same-key replay is answered before the in-progress check;
- `REFUND_BEING_SENT`;
- the reply and state for each ID-rule row;
- the no-poll client never polls (no GET);
- a null capture (a cash sale) is refused;
- a direct storage test of the remaining-balance sum (the route's in-progress check refuses
  first);
- the concurrent at-remaining test expects `REFUND_IN_PROGRESS`.

**Client:**
- the key is made once per confirmed refund, kept on 5xx, 202 and network errors, and cleared
  only on a final answer;
- a 202 is not success.

## Open questions

- **Owner (defaults used):**
  - one live refund per sale: a second is refused while the first is unresolved (default
    yes);
  - cash sales have no capture, so they get 409 `REFUND_NOT_REFUNDABLE` until R4-T5's
    record-only refunds;
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
  - `transaction2Id`;
  - whether a 408, 423 or 425 can follow a refund that was processed. R4-T1 maps them to
    `rejected`, so T3 settles them as `failed` and releases the reservation.
