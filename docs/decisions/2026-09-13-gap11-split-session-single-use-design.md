# Gap 11 — single-use consumption for provider sessions on the legacy retail payment flow

Date: 2026-09-13 UTC.
Status: **Proposal for R3. Not decided, not implemented.** No source, schema or
migration was changed by this record. It exists so the deliberately-unfixed
finding of 2026-09-11 becomes a reviewable design rather than a tracker line.

Sources: the original finding
([R1-T7-windcave-session-binding-2026-09-11](../evidence/remediation-v2-2/r1/R1-T7-windcave-session-binding-2026-09-11.md)),
gap 11 of the
[continuation ledger](../evidence/remediation-v2-2/CONTINUATION-2026-09-07.md),
and §§1.4, 9, 10.1–10.6 of
[PLAN-2026-08-24-taptpay-remediation-v2-2](../PLAN-2026-08-24-taptpay-remediation-v2-2.md).

All line references below were re-read against `HEAD` (`d8dd8c95`) on
branch `remediation/r1-continuation-20260907`. The working tree carries
unrelated uncommitted work from another agent in `server/routes.ts` (a single
hunk at ~line 8067) and `shared/schema.ts`; it does not shift any line cited
here, but line numbers in this memo describe **committed** source.

---

## 1. What the defect actually is

A provider session, once it has legitimately funded one finalisation, is never
marked as spent. Every code path that finalises a legacy numeric retail
transaction re-derives "which split to credit" by asking for the *next pending*
split, so presenting the same already-spent session again credits the *next*
one.

The binding check fixed on 2026-09-11 is not the issue and is not weakened
here: the session is genuinely bound to the right transaction. What is absent
is **single-use consumption**.

### 1.1 The code, verified

| Thing | Location |
| --- | --- |
| `finaliseHostedPayment` | `server/routes.ts:2823–2895` |
| — split branch (`getNextPendingSplit` → mark completed → increment counter) | `server/routes.ts:2839–2864` |
| — the session-state reset that enables the replay | `server/routes.ts:2862` |
| — non-split branch (`updateTransactionStatus` → increment counter) | `server/routes.ts:2865–2889` |
| Caller 1: `POST /api/transactions/:id/hosted-fields-complete` | `server/routes.ts:2912`, finalise call at `2941` |
| Caller 2: `POST /api/transactions/:id/googlepay-complete` | `server/routes.ts:2950`, finalise call at `3014` |
| The (correct, unconditional) binding guards | `server/routes.ts:2930`, `2973` |
| Session binding happens only here | `server/routes.ts:2799` (`updateTransactionWindcaveSession`) |
| `getNextPendingSplit` | `server/storage.ts:5662` (Postgres), `2015` (MemStorage) |
| `updateSplitPaymentStatus` | `server/storage.ts:5613` (Postgres), `1977` (MemStorage) |
| `incrementTransactionCount` | `server/storage.ts:5879` (Postgres), `2810` (MemStorage) |
| `split_payments` table | `shared/schema.ts:216–238` |
| Split/session columns on `transactions` | `shared/schema.ts:170–173`, `187–189` |

Two properties of the storage layer matter for every design below:

- `updateSplitPaymentStatus` has **no compare-and-set**: it writes
  `status = 'completed'` unconditionally for whatever row id it is given
  (`server/storage.ts:5617–5625`). It then recomputes `completedSplits` and the
  parent transaction's status from a fresh read (`5627–5653`) — a read-then-write
  across two statements, not one atomic claim.
- `incrementTransactionCount` is also a read-then-write outside a transaction
  (`server/storage.ts:5879–5920`): it reads the subscription row, then writes
  `currentCount + 1`. Concurrent calls can *lose* increments as easily as replays
  can add them.

### 1.2 Split variant — exact replay sequence

Preconditions: an `isSplit` transaction with `totalSplits = N ≥ 2`, split rows
1..N all `pending`, Windcave configured.

1. `POST /api/transactions/:id/pay` selects split 1 (`routes.ts:2733`), creates a
   provider session, and binds it: `windcaveSessionId = S`,
   `windcaveSessionState = 'pending'` (`routes.ts:2799`).
2. The payer pays. `POST .../hosted-fields-complete` with `sessionId = S` passes
   the binding guard (`2930`), queries the provider, and calls
   `finaliseHostedPayment` (`2941`).
3. `finaliseHostedPayment` sets session state `approved` (`2833`), takes
   `getNextPendingSplit` → **split 1**, marks it `completed`, increments the
   merchant counter (`2841–2846`), broadcasts/pushes (`2854–2860`), then **resets
   `windcaveSessionState` back to `'pending'`** (`2862`) so the next split can
   start a new session. `windcaveSessionId` is still `S`.
4. The same request is submitted again with the same `sessionId = S`. The binding
   guard passes — `S` *is* the transaction's bound session. Nothing records that
   `S` was already spent. `getNextPendingSplit` now returns **split 2**, which is
   marked `completed` with the same provider transaction id, and the counter
   increments again.
5. Repeat to step 4 until `getNextPendingSplit` returns nothing. One real payment
   marks up to `N` splits paid; the transaction flips to `completed`
   (`server/storage.ts:5639`) with `N-1` shares never funded.

The schema caps `totalSplits` at 10 (`shared/schema.ts:394`), so the ceiling is
nine free shares per replayed session.

### 1.3 Non-split variant, and an honest correction to the ledger wording

Replaying `S` against an already-`completed` non-split transaction re-enters the
`else` branch (`2865`): `updateTransactionStatus(id, 'completed')` is written
again (harmless), `incrementTransactionCount` runs again (`2870`), and a
duplicate `payment_received` push plus SSE broadcast is emitted (`2872–2878`) —
once per replay, unbounded.

**Correction.** Gap 11 and the evidence file both describe this as *"inflating a
merchant's billed transaction count"*. That overstates it against current
source. `incrementTransactionCount` writes `currentMonthTransactions` and
`totalLifetimeTransactions` on `merchant_subscriptions`; those fields are
surfaced in a DTO (`server/http-contracts.ts:57–58`) but no billing, quota or
pricing path reads them — the code says so explicitly at
`server/storage.ts:5908–5909` ("Usage statistic only. There is no per-transaction
charge and no quota"). The defect therefore corrupts a **reported usage
statistic** and spams merchant notifications; it does not change an invoice. The
split variant, by contrast, corrupts money state proper.

### 1.4 Two further replay vectors the original finding did not name

These were found while verifying the above and are **new to this record**. They
are read from source, not reproduced at runtime (see §9).

**(a) A duplicate provider notification is sufficient — no attacker needed.**
`processWindcaveNotification` (`server/routes.ts:~3930–4045`) looks the
transaction up by session (`3943`) and guards on
`windcaveSessionState !== 'pending'` (`3950`). That guard is defeated by the
reset at `2862`: after a split completes through the browser route, the
transaction is back in `'pending'` with the spent session still bound. Its split
branch (`3989–4012`) is the same `getNextPendingSplit` → mark completed →
increment shape. Windcave documents that a notification may be delivered more
than once (plan §9 preamble), so an honest provider retry after a browser-side
split completion can advance the next split. This moves gap 11 from "replay
attack" to "ordinary provider retry", which raises its severity.

**(b) The browser callback needs only the numeric transaction id.**
`GET /api/windcave/callback` (`server/routes.ts:4050`) is unauthenticated. Its
early-exit on a settled outcome checks `windcaveSessionState` (`4090–4095`) —
again defeated by the reset. It then deliberately queries the **persisted**
session rather than any browser-supplied one (`4138–4145`, a correct R0-T5
hardening), and its split branch (`4173–4202`) repeats the same pattern. So after
one split is finalised through `hosted-fields-complete`, a request to
`/api/windcave/callback?transactionId=N` — carrying **no session id at all** —
advances the next split. Only a guessable small integer is required.

Consequence for any fix: consumption must be enforced at a layer all three
call sites share. Patching `finaliseHostedPayment` alone leaves (a) and (b) open.

### 1.5 What bounds the blast radius today

- No Windcave credentials are configured in this environment. Both completion
  routes return 503 (`2935`, `2981`), the callback redirects to a pending page
  (`4100`), and the notification handler returns early (`3957`). The defect is
  real source, inert here, live the moment a provider is configured.
- The ceiling per replayed session is `totalSplits - 1` unfunded shares; once all
  splits are complete `getNextPendingSplit` returns nothing and further replays
  only duplicate pushes and SSE frames.
- No money moves. This is a **recognition** defect: the merchant's own records,
  receipts and "split bill fully paid" notification assert payments that never
  happened.

---

## 2. Is `splitPaidSessions` the right precedent? — assessment

The finding points at the property/trades checkout as precedent. It is worth
mirroring in *spirit* and dangerous to mirror *literally*.

**What it is.** `splitPaidSessions text[]` on `invoices_rent_requests`
(`shared/schema.ts:1100`) and `job_invoices` (`shared/schema.ts:1319`), claimed by
`atomicClaimSplitShare` (`server/storage.ts:7431–7453`) and
`atomicClaimJobSplitShare` (`7648–7664`), called from `finalizeRentInvoice`
(`server/routes.ts:7050`) and `finalizeTradeInvoice` (`7125`).

**How it works.** One statement:

```
UPDATE <invoice>
   SET split_paid_count = split_paid_count + 1,
       split_paid_sessions = array_append(coalesce(split_paid_sessions, '{}'), $session),
       updated_at = now()
 WHERE id = $invoice
   AND NOT ($session = ANY(coalesce(split_paid_sessions, '{}')))
   AND split_paid_count < split_count
   AND status NOT IN ('paid','paid_external','voided')
RETURNING *
```

A null return means "already counted, or full, or settled". Because the claim is
a single UPDATE against a single row, Postgres's row lock serialises concurrent
payers and each winner gets a distinct slot number back.

**Where it is genuinely good.** No read-then-write. Correct under simultaneous
duplicate replays. The share number is assigned by the database, not computed by
the caller. It is strictly better than retail's `getNextPendingSplit`, which is
a plain `SELECT ... LIMIT 1` with no lock (`server/storage.ts:5662–5681`).

**Weaknesses that must not be propagated.**

1. **The dedupe is a predicate, not a constraint.** Nothing in the schema
   prevents another code path from appending a session directly, or from marking
   a share paid without consulting the array. Plan §1.4 asks for database
   constraints over implicit conventions.
2. **It silently degrades to no dedupe.** Both callers pass
   `sessionId ?? crypto.randomUUID()` (`routes.ts:7049`, `7125`). When the session
   is unknown the key is fresh every call, so the guard never matches and every
   invocation claims a share. A defence that disappears exactly when identity is
   missing is not a defence.
3. **It proves only "not counted before".** It does not prove the session belongs
   to this invoice, was approved, or was for the right amount, currency or
   reference. The plan says this itself, in §10.3: *"The existing atomic
   completed-session array claim may remain as temporary defense in depth, but is
   not proof of amount/reference/share ownership."*
4. **It records no per-share identity.** The invoice keeps one
   `windcaveTransactionId`, overwritten by each payer (`routes.ts:7056`, `7130`),
   so you cannot say which provider transaction funded which share. Retail is
   actually *richer* here: `split_payments` already has a per-row
   `windcave_transaction_id` (`shared/schema.ts:223`).
5. **It is unexercisable in this repo's main test harness.** MemStorage stubs
   both claim methods to `return null` unconditionally
   (`server/storage.ts:2905`, `2936`), and every HTTP-harness test runs on
   MemStorage (`server/__tests__/support/http-harness.ts:41`). The precedent's
   concurrency behaviour is, as far as I can see, covered by no test at all.
6. **The atomicity does not transfer.** The precedent is safe because the claim
   and the credit are the *same statement on the same row*. Retail's split state
   lives in a different table (`split_payments`) from any column you would add to
   `transactions`, so a copied design would claim in one statement and credit in
   another. A crash between them consumes the session without crediting the
   payment — and, having consumed it, leaves no way to credit it later. The
   literal mirror is *less* safe in retail than it is in property.

**Verdict.** Keep it where it is as defence in depth, as §10.3 permits. Do not
adopt it as the primary model for retail, because retail already has a better,
reviewed engine (§3, option C).

---

## 3. Candidate designs

### Option 0 — schema-free interim: stop resetting, clear the spent binding

Change `finaliseHostedPayment` so that after a split is credited it does not
reset `windcaveSessionState` to `'pending'` (`routes.ts:2862`) but instead clears
`windcaveSessionId` (a new storage method; the existing
`updateTransactionWindcaveSession` cannot write null). The binding guard at
`2930`/`2973` then rejects the replay, the notification lookup at `3943` finds
nothing, and the callback's `sessionToQuery` at `4140` is null.

- **Schema:** none. **Effort:** hours.
- **Concurrency:** *not safe.* Two simultaneous replays can both read the binding
  before either clears it. It narrows the window; it does not close it.
- **Idempotent replay:** worse. A legitimate retry after a transport timeout now
  gets a 403 rather than the original outcome — it cannot distinguish "already
  paid" from "wrong session".
- **Traceability:** contradicts §1.4 *"Money is traceable: every … provider
  identity has an immutable local record."* Deleting the identity to signal
  "spent" destroys the audit link.
- **Use:** only if the owner wants exposure reduced before R3 can run, and only
  with the above stated in the evidence record. It is a mitigation, not a fix.

### Option A — mirror the precedent: a consumed-sessions array on `transactions`

Add `windcave_consumed_sessions text[]` to `transactions` and a
`atomicClaimRetailSplitShare(transactionId, sessionId)` storage method shaped
like `atomicClaimSplitShare`.

- **Schema impact:** additive, one nullable column.
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS …` (the house shape — 0011
  uses exactly this for `transactions.payment_token_hash`), plus fingerprinting
  per §10.6 rule 5. No backfill.
- **Concurrency:** the claim itself is atomic on the `transactions` row, but the
  *credit* (`split_payments` update, counter increment, push) is separate — see
  §2 weakness 6. To be safe it must run inside one `db.transaction()` with the
  lock order already documented for this codebase (transaction → attempt →
  splits, `server/storage.ts:4480–4483`) — at which point it is no longer the
  precedent, it is a bespoke second finaliser.
- **Idempotent replay:** **cannot satisfy the requirement.** An array records
  *that* a session was consumed, not *what it produced*. On replay the route must
  return the same outcome and the same receipt; for a split it cannot tell which
  split this session funded without also storing the mapping. Storing the mapping
  means a key/value record, not an array — i.e. option B.
- **R2 interaction:** none. `verifyWindcaveOutcome` would be bolted on separately;
  the array proves nothing about amount, reference or environment.
- **Backward compatibility:** clean — an empty array means "never consumed", so
  in-flight sessions keep working. Caveat: a session already spent before deploy
  is not retroactively consumed and still buys one more replay.
- **Effort:** small (1 column, 1 migration, 1 method × 2 backends, ~4 tests).
- **Verdict:** rejected as primary. It creates the second money-state machine
  §10.1 forbids, cannot express idempotent replay, and inherits the MemStorage
  parity trap.

### Option B — a consumption ledger with a real uniqueness constraint

Additive table, e.g. `provider_session_consumptions`: provider, session id,
transaction id, split payment id (nullable), outcome, provider transaction id,
created_at, with `UNIQUE (provider, session_id)`. Finalisation does
`INSERT … ON CONFLICT DO NOTHING RETURNING *` inside the **same** database
transaction as the split credit and the counter increment; no row returned means
already consumed, and the existing row is read back to return the identical
outcome. Pair it with a partial unique index on
`split_payments (windcave_transaction_id) WHERE windcave_transaction_id IS NOT NULL`
so the same provider transaction cannot fund two shares even if the ledger is
bypassed, and with a compare-and-set on split status so `updateSplitPaymentStatus`
stops writing `completed` unconditionally.

- **Schema impact:** additive — one table, one partial unique index on an
  existing column. Requires a count-only duplicate preflight on
  `split_payments.windcave_transaction_id` before the index (§10.6 rule 1).
- **Concurrency:** correct. The unique index, not a predicate, is the guard; of
  two simultaneous replays exactly one insert wins and the loser reads the
  winner's row. No lock-ordering reasoning needed for the consumption itself.
- **Idempotent replay:** correct, and this is its main advantage over A — the
  ledger row carries the outcome and the funded split, so a retry returns the
  same redirect/receipt without re-crediting.
- **R2 interaction:** composes well. `verifyWindcaveOutcome` runs before the
  insert; the ledger is a natural home for the observed provider transaction id
  and reconciliation timestamps.
- **Backward compatibility:** additive and empty on deploy; same "one free replay
  of a pre-deploy spent session" caveat as A.
- **Effort:** medium-small.
- **Verdict:** correct in isolation, but it is a **new table holding payment
  state whose job overlaps the inbox §10.2 already specifies** (one row per
  provider + kind + session, with a unique index). Building it standalone risks
  exactly the duplication §10.1 exists to prevent. Its *components* — the partial
  unique index and the compare-and-set — are individually worth having under any
  option.

### Option C — converge this flow onto the existing `payment_attempts` engine

The plan's stated preference (§10.1 "do not duplicate the working retail attempt
engine"; §10.3 "legacy numeric retail pay must converge on the token attempt
service or be retired"). The engine already exists — `payment_attempts`
(`shared/schema.ts:263–322`, `migrations/0011_payment_links_and_board_numbers.sql:48`),
`server/payment-attempt-service.ts`, repository at
`server/storage.ts:4228–4696` — and the token routes already use it end to end
(`server/routes.ts:1681` `prepareTokenCompletion`, `1716` `persistTokenOutcome`,
`1774`/`1826` the two completion routes).

Under C, `/api/transactions/:id/pay` claims an attempt with an immutable
`shareIndex` and attaches the session; the completion routes resolve the attempt
by `(transactionId, shareIndex, idempotencyKey)`, check
`attempt.processorSessionId === sessionId`, claim finalisation, and call
`finalizePaymentAttemptRecord`. `finaliseHostedPayment`, the
`getNextPendingSplit`-based advancement, and the bare `incrementTransactionCount`
calls disappear from this path — including from the callback (`4173`) and
notification (`3989`) handlers.

- **Schema impact:** additive, and small. The engine is already deployed. What is
  missing for consumption is a **partial unique index on
  `payment_attempts (processor_session_id) WHERE processor_session_id IS NOT NULL`**
  — verified absent today (`shared/schema.ts:280–289` declares only the
  transaction index, the transaction/share/key unique, the live-share partial
  unique, and the return-state-hash unique). That index *is* single-use
  consumption at the database level, and **R2 §9.4 already requires it
  independently** ("Add database unique indexes for non-null processor session ID,
  processor X-ID, and provider transaction ID after duplicate preflight"). Gap 11
  is closed as a by-product of work the plan already mandates.
- **Concurrency:** already solved and already proven. Documented lock order
  transaction → attempt → splits (`server/storage.ts:4480–4483`), finite lease
  with a CHECK constraint (`shared/schema.ts:298–301`), one-live-attempt-per-share
  partial unique index (`284–286`), and a compare-and-set finaliser that throws
  if the state moved under it (`server/storage.ts:4670–4687`). The usage counter
  is incremented *inside the same transaction* (`4626–4667`), unlike the loose
  `incrementTransactionCount` this flow uses today.
- **Idempotent replay:** already implemented and is exactly the required
  semantic. `claimFinalization` returns `terminal` and the route replies with the
  stored outcome (`routes.ts:1705`, `1792`); `finalizePaymentAttemptRecord`
  returns `reused` with `counterIncremented: false` (`server/storage.ts:4545–4557`).
  Same outcome, no re-credit, no duplicate counter.
- **Split ordering:** structurally fixed. The attempt carries an immutable
  `shareIndex`, so no code path selects "the next pending split" — which is
  literally §10.2's worker rule 3 and §10.3's "split finalization must never …
  apply an approved session to any open share".
- **R2 interaction:** best of the four. §9.4's expected-value columns are
  specified *on `payment_attempts`*; only under C does this flow have somewhere
  to put them, and only then can `verifyWindcaveOutcome` be applied to it.
- **Backward compatibility:** the hard part. Sessions created by the legacy
  `/pay` before the change have no attempt row, so their completion would fail.
  Either (i) drain — stop issuing legacy sessions, let outstanding ones expire,
  then remove the old path (I could not establish the provider's session lifetime;
  see §9), or (ii) a time-boxed reconciliation-only bridge that accepts a legacy
  session with no attempt exactly once, guarded by option B's ledger. The client
  must also send `idempotencyKey`/`shareIndex` on the legacy routes — the helpers
  already exist and are already used for the token flow
  (`client/src/lib/payment-addressing.ts:88–104`, `226–273`).
- **Live callers:** the legacy numeric flow is **not dead**. `/checkout/:transactionId`
  and `/split/:transactionId` are mounted (`client/src/App.tsx:972–975`) and route
  through `checkoutCompletionEndpoint({kind:"retail-legacy"})`
  (`client/src/lib/payment-addressing.ts:97–98`). So §10.3's disposition for it is
  "Migrate", not "Retire" — unless the owner decides to retire the numeric URLs
  in favour of token links (§8).
- **Effort:** largest of the four. Touches `/pay`, both completion routes, the
  callback and notification handlers, and the legacy branch of two client pages.

### Option D — consumption as a property of the R3 notification inbox

Let §10.2's durable inbox own it: one row per provider + notification kind +
provider session with a unique index, claimed `FOR UPDATE SKIP LOCKED` under a
finite lease, with a single aggregate finaliser called from the worker.

- **Schema impact:** the inbox table, which R3 specifies anyway.
- **Concurrency:** strongest for provider-initiated traffic, and it is the only
  option that directly addresses vector §1.4(a).
- **Idempotent replay:** §10.2 rule 9 states the requirement explicitly
  ("Terminal replays return the same outcome and do not re-increment usage, paid
  share count, GST, notification, push, or SSE").
- **Behaviour change:** §10.2's browser-callback sequence forbids a second money
  finaliser in the browser path and requires a truthful processing page that
  polls. The legacy numeric checkout currently answers `{approved: true}`
  synchronously (`routes.ts:2942`), so D implies a product-visible UX change for
  that flow.
- **Critical limitation:** D on its own does **not** close gap 11. The inbox
  constrains the notification path; the two completion routes and the browser
  callback would keep their own read-then-write finalisers unless C is also done.
  In practice D presupposes C.
- **Effort:** largest overall; correctly sequenced *after* C.

---

## 4. Recommendation

**Target option C, staged, with the two DB-enforced pieces from B landing first
as independent defence in depth. Reject A as the primary model. Treat D as the
following step, not a substitute.**

Reasoning against the plan's own constraints:

1. §10.1 is explicit that R3 must extend the retail attempt engine rather than
   duplicate it. A and B both build a second mechanism for "has this session been
   spent" beside one that already answers the question correctly.
2. §10.3 states the rule this defect breaks, almost verbatim: split finalisation
   "must never skip session equality or apply an approved session to any open
   share." Only C removes *"any open share"* from the design — the attempt's
   immutable `shareIndex` makes the wrong share unaddressable. A and B make the
   wrong share merely harder to reach.
3. §9.4 already requires a unique index on the non-null processor session id. C
   therefore closes gap 11 with an index R2 was going to add regardless, instead
   of with a bespoke column.
4. §1.4 prefers database constraints and explicit states over conventions. C
   gives a typed state machine and a compare-and-set finaliser; A gives an array
   and a convention.
5. The verification vehicle already exists. `scripts/verify-server-postgres-storage.mjs`
   already runs concurrent-claim and concurrent-finalisation proofs against real
   Postgres for `payment_attempts` (overlapping claims, competing finalisations,
   counter-increment-once). A and B would need that harness extended from zero;
   C mostly reuses it.

**Suggested sequence** (each step independently shippable and reviewable):

- **C0.** Count-only preflight: duplicate non-null `processor_session_id` in
  `payment_attempts`; duplicate non-null `windcave_transaction_id` in
  `split_payments`; `split_payments` rows `completed` with a null provider
  transaction id; transactions whose `completedSplits` disagrees with their
  completed split rows. Numbers only, no remediation.
- **C1.** Add the partial unique index on `payment_attempts(processor_session_id)`
  (R2 §9.4) and on `split_payments(windcave_transaction_id)`. Additive, no
  behaviour change, immediate defence in depth.
- **C2.** Give `updateSplitPaymentStatus` a compare-and-set contract returning
  `claimed | terminal | conflict | not-found` per §10.4 rule 4, and make the
  counter increment share its transaction.
- **C3.** Migrate `/pay` + both completion routes to the attempt engine; delete
  `finaliseHostedPayment`'s split advancement.
- **C4.** Make the callback and notification handlers reconcile the persisted
  attempt by session instead of finalising (§10.2), removing vectors §1.4(a) and
  §1.4(b).
- **C5.** Then, and only then, the inbox (option D).

Option 0 remains available if the owner wants the window narrowed before C can
start — with its three defects recorded, not glossed.

---

## 5. Test matrix any implementation must pass

Failing-test-first, per §1.3 rule 2. **Harness note:** the HTTP harness is
MemStorage-backed (`server/__tests__/support/http-harness.ts:41`), which cannot
exercise a unique index, a row lock, or `ON CONFLICT`. Every concurrency and
constraint assertion below must run against real Postgres — the existing vehicle
is `scripts/verify-server-postgres-storage.mjs`. Route-level semantics can stay
in the HTTP harness, but **both backends must be asserted**, or the fix will pass
in tests and fail in production (this is precisely the trap that leaves
`atomicClaimSplitShare` untested today).

| # | Case | Must assert |
| --- | --- | --- |
| 1 | Replay the same session against `hosted-fields-complete` after split 1 completes | Split 2 stays `pending`; `completedSplits` unchanged; counter unchanged; response is the *same* outcome as call 1 (not a new approval, not a bare 403 that hides the prior success) |
| 2 | Same, `googlepay-complete` | As #1, including no second provider submit |
| 3 | Two simultaneous replays of one session (Postgres) | Exactly one credit total across both; the loser returns the winner's outcome; no deadlock; no lost counter update |
| 4 | Legitimate retry after a transport timeout (client resends, provider did accept) | Exactly one credit; identical outcome/receipt on both responses; counter +1 total |
| 5 | Legitimate *next* split with a genuinely new session | Split 2 credited, in index order; `completedSplits` = 2 |
| 6 | Split completion ordering under concurrent distinct payers | Each payer credits a distinct share; no share credited twice; no share skipped |
| 7 | Non-split replay (usage-statistic variant) | `currentMonthTransactions` / `totalLifetimeTransactions` increment exactly once across N replays |
| 8 | Duplicate provider notification after a browser-side split completion (§1.4a) | Next split not advanced; no duplicate push/SSE |
| 9 | `GET /api/windcave/callback?transactionId=N` with no session id, after a split completed (§1.4b) | Next split not advanced; neutral redirect |
| 10 | Cross-tenant: merchant B's session presented against merchant A's transaction | 403/404, no provider query, no state change — the R1-T7 fix's four existing assertions must stay green (`server/__tests__/r1-t7-windcave-session-binding.test.ts`) |
| 11 | Wrong-share attempt: session bound to share 1 presented for share 2 | Rejected, not silently re-pointed |
| 12 | Provider unconfigured | No state mutation on any of the four call sites (extends the existing no-side-effect matrix) |
| 13 | Crash between consumption and credit (fault injection, §10.7) | Either both or neither; a retry completes the payment; the session is never consumed-without-credit |
| 14 | Push/SSE exactly once per real finalisation across all replays in #1–#9 | §10.4 rule 6 |

Coverage today: **none of rows 1–14 exist.** Nothing in `server/__tests__`
exercises `finaliseHostedPayment`'s split branch, `getNextPendingSplit`, or the
`splitPaidSessions` dedupe; the only tests touching these routes are the four
binding tests above and a route-shape assertion
(`server/__tests__/token-route-inventory.test.ts:19–20`).

---

## 6. Migration-rehearsal and ADR requirements the plan imposes

Before any schema change here:

- **§10.1** — a short schema ADR is required *before* the R3 migration, choosing
  a reviewed attempt-table design. This memo is a proposal, not that ADR; if C is
  adopted the ADR must still be written and must prove referential integrity,
  tenant scope, share identity, token migration and a shared finalization API.
- **§10.6 rule 1** — count-only preflights (see C0) before any index or
  constraint.
- **§10.6 rule 2** — estimated table/index size and lock duration measured on a
  production-sized restored clone.
- **§10.6 rule 3** — `lock_timeout` and `statement_timeout` set inside the
  migration execution context.
- **§10.6 rule 4** — the runner transaction-wraps every migration, so
  `CREATE INDEX CONCURRENTLY` cannot be used in these files. Either a reviewed
  nontransactional mode is added, or plain `CREATE INDEX` is used only after
  rehearsal proves a short safe lock in an approved window.
- **§10.6 rule 5** — no hiding a wrong existing shape behind `IF NOT EXISTS`;
  fingerprint type, nullability, default, FK action, CHECK definition and index
  predicate on both a scratch-from-zero and a restored-production schema
  (`scripts/schema-fingerprint.mjs`).
- **§1.3 rule 4** — the migration must be rehearsed on an isolated restored
  snapshot. Note the standing constraint recorded in
  [2026-09-10-owner-directions-and-live-migration](2026-09-10-owner-directions-and-live-migration.md):
  production apply is still pending after the sandbox classifier refused it, and
  the restore ACL repair has never been exercised against a real restore.

---

## 7. Engineering choices vs owner/product decisions

**Pure engineering — no owner input needed:**

- Which mechanism enforces single use (index, ledger, attempt row).
- The lock order and transaction boundaries.
- Compare-and-set contracts on `updateSplitPaymentStatus` and the counter.
- Whether the counter increment moves inside the finalisation transaction.
- The test matrix and which harness proves which row.

**Owner / product decisions:**

1. **Retire or migrate the legacy numeric retail flow (§10.3).** `/checkout/:id`
   and `/split/:id` are live client routes. Retiring them in favour of token links
   makes gap 11 disappear with the flow; migrating them is more work but preserves
   existing QR codes, printed links and Tapt Stone behaviour. This single choice
   changes the size of C by a large factor.
2. **Interim mitigation or wait for R3?** Whether to take Option 0's partial,
   non-concurrency-safe narrowing now, accepting that it degrades legitimate
   retries and deletes an audit link, or to leave gap 11 open and inert until R3
   executes.
3. **Behaviour of a legitimate retry after a completed split.** Should the second
   call return the original receipt (idempotent success) or an explicit
   "already paid" state? This is customer-visible and a product call; the
   engineering options support either.
4. **Reconciliation of pre-deploy spent sessions.** Whether to accept the one
   remaining free replay per already-spent session, drain them, or write a
   time-boxed bridge.
5. **Should the usage counters be corrected retroactively** if any inflation is
   found in production data, or only stopped going forward? They do not drive
   billing (§1.3), so this is a reporting-integrity decision, not a financial one.
6. **Severity re-rating.** Given §1.4(a), gap 11 is reachable by an ordinary
   provider retry, not only by a deliberate replay. The owner may want the ledger
   entry and any disclosure posture updated accordingly.

---

## 8. Uncertainty — what this record does not establish

- **Nothing here was executed.** No test was run, no migration applied, no
  runtime reproduction performed, per the constraints of this task. Every claim
  is read from committed source at `d8dd8c95` and should be confirmed by a
  failing test before any fix is written (§1.3 rule 2).
- **§1.4(a) and §1.4(b) are source readings, not reproductions.** They follow
  from the reset at `routes.ts:2862` defeating the state guards at `3950` and
  `4090`, and from the callback querying the persisted session at `4140`. Both
  should be proven with a red test before being treated as established.
- **Provider session lifetime is unknown to me.** The drain strategy in C's
  backward-compatibility discussion depends on it; it must be read from the
  Windcave documentation, not assumed.
- **Production data is unexamined.** Whether any split has actually been credited
  twice, or any counter inflated, is unknown — this environment has no Windcave
  credentials and the defect is inert here. C0's preflight is the way to find out.
- **`verifyWindcaveOutcome` does not exist yet.** It appears only in the plan; no
  implementation is in the tree, so all R2-interaction statements above are about
  the specified behaviour in §9.5, not observed code. Today's
  `queryWindcaveSession` (`server/windcave.ts:200`) returns only
  `{success, approved, windcaveTransactionId}` from `transactions[0]` — no amount,
  currency, merchant reference, transaction count or environment marker — so no
  option above can perform amount/reference verification until R2 lands.
- **MemStorage/Postgres divergence is broader than this gap.** The two backends
  implement the split and claim paths differently; I checked the methods named
  here and did not audit the rest.
