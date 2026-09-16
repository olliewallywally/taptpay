# R1-T2 — gap 12 Option C: fail closed on concurrent-stoneless-sale ambiguity

Date: 2026-09-15. Branch: `remediation/r1-continuation-20260907`. HEAD at
start and end: `ab15647a` (git-tracked). This task's source changes
(`server/storage.ts`, `server/sse-broker.ts`, `server/routes.ts`,
`client/src/pages/customer-payment.tsx`, and the two new test files
`server/__tests__/r1-t2-gap12-option-c-fail-closed-ambiguity.test.ts` and
`client/src/pages/__tests__/customer-payment-flow.test.tsx`) remain
**uncommitted** in the working tree, as required — no commit was made by
this pass and none was asked for.

This is a redo. A prior pass through this exact task had its plan
unanimously blocked by a two-reviewer panel: both independently found the
same core architectural flaw (mandatory fix #1 below), plus one reviewer
found a genuinely new residual leak (mandatory fix #3 below). This pass's
plan was reviewed and approved by that same two-reviewer panel before any
code was written; Oliver separately approved the one collateral-behavior
item that needed his sign-off (see "OWNER SIGN-OFF" below). This document
records what the approved plan actually produced.

## Docs read first

- `docs/decisions/2026-09-13-gap12-anonymous-sse-addressing-options.md` —
  the decision memo. "Option C — Keep merchant-wide, but fail closed on
  ambiguity and narrow the payload" (this task implements the
  fail-closed-on-ambiguity half only, **not** the payload-narrowing half,
  which is explicitly out of scope — see "What was deliberately not done"
  below). §3.3 "The concurrency case is a correctness defect, not only a
  leak" is the defect this task closes.
- `docs/decisions/2026-09-13-gap12-owner-input-and-linkmode-finding.md` —
  §6 item 3 (land the fail-closed change first, schema-free, needs no
  product decision).
- `docs/evidence/remediation-v2-2/r1/R1-T7-gap11-c0-preflight-c1-index-2026-09-14.md`
  — read as the format/rigor model for this file only; its content (gap 11
  duplicate-session indexes) is unrelated to gap 12.
- The task brief's embedded plan-review JSON (two independent reviewer
  passes, both "Approve", zero blocking issues) — read in full before
  writing a line of code; its concrete design (the audience-filtered
  `broadcast()` option, `dispatchLegacyNoBoard`, the additive storage
  method) is what this document reports as built.

## Scope, stated up front

**In scope, and done:** the unauthenticated "legacy-no-board" resolution
path only — `GET /api/merchants/:id/active-transaction`'s no-stoneId
branch, and the SSE broadcast gate for `legacy-no-board` subscribers.

**Explicitly out of scope, and untouched:** the authenticated-merchant
scope, the board/stone scope, the token-addressed flow (all three already
correctly scoped — confirmed unchanged by every test in this pass); payload
narrowing (dropping `itemName`, already found to be a real product
regression in a prior session); Option A/B (retiring/replacing the standing
address); gap 11; the trust-proxy/rate-limit configuration; the four staff
terminal files (`merchant-terminal.tsx`, `merchant-terminal-mobile.tsx`,
`merchant-terminal-mobile-v2.tsx`, `demo-terminal.tsx`) and
`client/src/desktop/pages/retail-terminal.tsx` — a separate, disjoint task
was actively migrating these in parallel during this very pass (its
in-progress edits and scratch test files were visible in the shared working
tree throughout; none were read for more than confirming they were
untouched, and none were touched).

---

## OWNER SIGN-OFF

Oliver was told, in these exact terms: fixing the route properly (both REST
and SSE) means that during a genuine ambiguity window the three staff
terminal screens (which poll the same no-stoneId REST branch) will show "no
active transaction" instead of a possibly-wrong guessed one, until it
resolves. He answered: proceed. This sign-off covers exactly that collateral
behaviour change and nothing else. The response shape agreed as part of that
sign-off — keep the REST poll's ambiguous-case JSON body `null` (byte-
identical to today's "no transaction" response for any caller that doesn't
look for it) and signal ambiguity only via a new response header,
`X-Legacy-No-Board-Ambiguous`, read only by the modified
`customer-payment.tsx` — is what was built (see Route change 1 below).

---

## Mandatory fix #1 — decouple dispatch

**The blocking issue both prior reviewers independently found.** The
shared broadcast funnel (`broadcastToStone` → `sseBroker.broadcast`, the
single choke point all 19 call sites in `server/routes.ts` go through, none
of which await it) must dispatch to `"merchant"` and `"board"` audience
subscribers synchronously and immediately, exactly as before this change —
zero added latency, zero reordering exposure. Only the fan-out to
`"legacy-no-board"` subscribers may be gated behind an async check.

**Built as:**

`server/sse-broker.ts`'s `broadcast()` (line 115) gained a 4th, optional
parameter:

```ts
broadcast(
  merchantId: number,
  stoneId: number | null | undefined,
  data: Record<string, any>,
  options?: { audiences?: ReadonlyArray<SseAudience["kind"]> },
)
```

Inside the existing loop, one extra skip line was added before the existing
`isTarget` check (`if (options?.audiences && !options.audiences.includes(subscriber.audience.kind)) continue;`).
No other line of `broadcast()` changed. Every call site that omits `options`
— every one of the 19 production call sites before this task, and every
existing test's direct `.broadcast()` call — is byte-identical to before.

`server/routes.ts`'s `broadcastToStone` (line 276) is now:

```ts
function broadcastToStone(merchantId: number, stoneId: number | null | undefined, data: any) {
  const canonicalStoneId = stoneId ?? null;
  sseBroker.broadcast(merchantId, canonicalStoneId, data, { audiences: ["merchant", "board"] });
  dispatchLegacyNoBoard(merchantId, canonicalStoneId, data);
}
```

`broadcastToStone` itself is still a plain, synchronous, non-`async`
function. The synchronous `sseBroker.broadcast(...)` call for
`["merchant", "board"]` is the **first statement** and runs to completion —
using the exact same `isTarget`/`projectEvent` code path as before this
change — before `dispatchLegacyNoBoard` (line 310) is even entered. None of
the 19 call sites needed to change; all are still fire-and-forget on
`broadcastToStone`'s return, exactly as before.

`dispatchLegacyNoBoard` never blocks or reorders the line above it: it is
called synchronously, but everything inside it that can take real time
(the storage call) is wrapped in `void promise.then(...).catch(...)` —
`dispatchLegacyNoBoard` itself returns immediately, and `broadcastToStone`
returns immediately after it.

**Verified, not just argued:** the new test
`mandatory fix #1 — merchant/board delivery stays synchronous while a
legacy-no-board ambiguity check is in flight` (in the new gap-12 test file)
mocks `storage.getLegacyNoBoardActiveTransactionOrAmbiguous` with a
manually-controlled, never-resolving-until-told promise, subscribes real
`"merchant"`, `"board"` and `"legacy-no-board"` connections to the same
merchant via the real `sseBroker` singleton, and fires two real HTTP
requests through the actual route (`PATCH /api/transactions/:id/split-
enabled`, which calls `broadcastToStone`) — one stoneless (which starts the
now-blocked async leg), one board-scoped, for the **same merchant**, while
the first call's async leg is still unresolved:

- After the first (stoneless) call: the merchant connection already has its
  frame; the ambiguity-check mock has been called once but not resolved;
  the legacy-no-board connection has nothing yet.
- After the second (board-scoped) call, **with the first call's check still
  pending**: the merchant connection has a second frame and the board
  connection has its frame — both delivered immediately. The
  ambiguity-check mock is still only called once (board-scoped data is
  never eligible for the legacy-no-board check at all — see fix #2). The
  legacy-no-board connection still has nothing.
- Only after the test explicitly releases the first call's gate does the
  legacy-no-board connection receive its (non-ambiguous, single-candidate)
  delivery — and the merchant/board frame counts are unchanged by that.

This is a direct, falsifiable proof that a same-merchant legacy-no-board
check in flight neither delays nor reorders merchant/board delivery, for
both the call that started the check and a later, independent call.

## Mandatory fix #2 — audience-scoped short-circuit

**The problem:** a cheap short-circuit keyed on `sseBroker.subscriberCount`
would be audience-agnostic — a merchant with their own authenticated
dashboard open (audience `"merchant"`) but zero anonymous customers
connected would still trigger a DB round-trip on every stoneless broadcast.

**Built as:** `server/sse-broker.ts` gained
`legacyNoBoardSubscriberCount(merchantId)` (line 201), which iterates only
`kind === "legacy-no-board"` subscribers, distinct from the existing
audience-agnostic `subscriberCount()`. `dispatchLegacyNoBoard` in
`server/routes.ts` (line 310) checks this **and** a cheap eligibility guard
before ever calling storage:

```ts
function dispatchLegacyNoBoard(merchantId: number, stoneId: number | null, data: any) {
  if (!isLegacyNoBoardEligible(stoneId, data)) return;
  if (sseBroker.legacyNoBoardSubscriberCount(merchantId) === 0) return;
  void storage.getLegacyNoBoardActiveTransactionOrAmbiguous(merchantId)
    .then((result) => { /* ambiguous -> marker frame; else -> deliver as before */ })
    .catch((error) => { console.error("legacy-no-board ambiguity check failed:", error); });
}
```

`isLegacyNoBoardEligible` (`server/sse-broker.ts` line 82) is exported and
built on the existing private `isTarget`, so board-scoped or per-payment
(token-addressed) data is excluded by the exact same rule as before this
change, with zero duplicated logic.

**Verified:** the new test `a stoneless broadcast triggers zero ambiguity DB
checks when the merchant has zero legacy-no-board subscribers, even with a
merchant-audience subscriber connected` subscribes only a `"merchant"`-
audience connection, spies on
`storage.getLegacyNoBoardActiveTransactionOrAmbiguous`, fires a real
stoneless broadcast through the route, and asserts the spy is **never
called** while the merchant connection still receives its frame. A second
test asserts `legacyNoBoardSubscriberCount` counts only
`"legacy-no-board"` subscribers (1) against `subscriberCount`'s
audience-agnostic total (3) for the same merchant.

## Mandatory fix #4 — the superseded path is marked, not silently left

**Chosen approach:** additive-new-method (the task's own "recommended for
safety/minimal review surface" option). `getActiveTransactionByMerchant`'s
existing `legacy-no-board` branch, and `storage.test.ts`'s "prefers the
newest active transaction and then a recent completion" pinning test (lines
95–116, unmodified, re-run and still green — see verification below), are
left **fully intact**.

Confirmed via `grep -n '"legacy-no-board"' server/routes.ts`: the **only**
production call site that used to pass `{ kind: "legacy-no-board" }` was
the no-stoneId branch of `GET /api/merchants/:id/active-transaction`, which
this task's Route change 1 (below) replaced with the new method. So, after
this change, `getActiveTransactionByMerchant`'s `legacy-no-board` branch is
reachable only from its own direct unit test (`storage.test.ts`) — exactly
the "silent landmine" mandate #4 warns about — and it is now marked at
every place a future engineer might land on it:

- `server/storage.ts` lines 22–28 — a comment on the `"legacy-no-board"`
  member of the `ActiveTransactionScope` union.
- `server/storage.ts` line 569 — an extended doc comment on the
  `IStorage.getActiveTransactionByMerchant` declaration, naming the new
  method, the exact failure mode (routes to the newest of 2+ concurrent
  candidates → customer A onto customer B's checkout), and pointing at the
  decision memo and this evidence doc.
- `server/storage.ts` line 1696 (`MemStorage`) and line 4787
  (`DatabaseStorage`) — a one-line pointer comment directly on the
  `"legacy-no-board"` case/branch in both backends, referring back to the
  interface doc.

## The new storage method

`server/storage.ts` line 32:

```ts
export type LegacyNoBoardActiveTransactionResult =
  | { kind: "none" }
  | { kind: "ambiguous" }
  | { kind: "found"; transaction: Transaction };
```

`getLegacyNoBoardActiveTransactionOrAmbiguous(merchantId)` (interface
declaration line 603; `MemStorage` line 1715; `DatabaseStorage` line 4836)
is used by **both** the REST route and the SSE broadcast gate, so the
definition of "ambiguous" cannot drift between them. Same two-step
"prefer pending/processing, else a completion within the last 3 minutes"
shape as the existing method, but at each step: 0 candidates → `none`,
exactly 1 → `found`, 2+ → `ambiguous`. `DatabaseStorage` fetches `.limit(2)`
at each step (not `.limit(1)`) against the identical
`and(isNull(taptStoneId), isNull(paymentTokenHash))` condition and ordering
the existing method already used.

**Verified against both backends**, not just MemStorage: the new test
file's `storage: getLegacyNoBoardActiveTransactionOrAmbiguous
(DatabaseStorage query shape)` block builds a fake `db` (the same
capture-the-condition-and-assert-the-SQL pattern `storage.test.ts` already
uses for `DatabaseStorage`) and asserts, independent of `MemStorage`'s
behaviour: `.limit(2)` (not `1`) at each step; the `where` SQL text contains
`"transactions"."tapt_stone_id" is null`,
`"transactions"."payment_token_hash" is null`, and
`"transactions"."status" in ($2, $3)` for the pending step, and
`"transactions"."status" = $2` / `"transactions"."created_at" >=` for the
completed-fallback step; that the completed-bucket query is **never issued**
once the pending step already finds 2+ or exactly 1 row (asserted via
call-count, not just return value).

## Route change 1 — `GET /api/merchants/:id/active-transaction`

`server/routes.ts` lines 2122–2147. Only the no-stoneId branch changed; the
board branch (`else` clause) still calls the unmodified
`getActiveTransactionByMerchant(merchantId, { kind: "board", stoneId })`,
completely untouched:

```ts
let transaction: Awaited<ReturnType<typeof storage.getActiveTransactionByMerchant>>;
if (stoneId === undefined) {
  const result = await storage.getLegacyNoBoardActiveTransactionOrAmbiguous(merchantId);
  if (result.kind === "ambiguous") {
    res.set("X-Legacy-No-Board-Ambiguous", "true");
    return res.json(null);
  }
  transaction = result.kind === "found" ? result.transaction : undefined;
} else {
  transaction = await storage.getActiveTransactionByMerchant(merchantId, { kind: "board", stoneId });
}
```

Everything below (the merchant/stone re-checks, URL generation,
`publicTransactionDto` projection) is unchanged.

**Verified:** four new REST tests cover 2 concurrent (ambiguous, `null` body
+ header), exactly 1 (normal, no header), 0 (byte-identical `null`, no
header — proving the ambiguous and no-transaction cases are indistinguishable
to a caller that doesn't read the header, per the owner-approved response
shape), and the board branch resolving normally while the *same merchant*
has 2 concurrent ambiguous no-board sales open (proving the board branch is
completely unaffected).

## Route change 2 — `GET /api/merchants/:id/events`

**No changes to the handler itself.** Its three-way audience-resolution
branch (`merchant` / `board` / `legacy-no-board`, lines 5421–5462) is
unrelated to ambiguity resolution — the route only opens a subscription,
it never resolves "the" transaction. All gating happens at
broadcast/delivery time in `broadcastToStone`/`dispatchLegacyNoBoard`,
which is what backs every future delivery over this route's open streams.

`server/sse-broker.ts` also gained `broadcastLegacyNoBoardAmbiguous(merchantId)`
(line 141), which writes a frame to every `"legacy-no-board"` subscriber
carrying **no transaction data of either candidate** — `{type:
"legacy_no_board_ambiguous", addressingMode: "legacy-no-board"}` only, no
`id`, `price`, `itemName`, or `status` field for either candidate.

**Verified:** the new SSE test opens a real raw-socket subscription (same
`collectRaw` pattern as `r1-t2-gap12-events-ratelimit.test.ts`), creates two
concurrent pending stoneless transactions, triggers a real broadcast via the
authenticated split-enabled route, and asserts the delivered frame's `type`
is `legacy_no_board_ambiguous`, has no `transaction` or `transactionId`
property, and that the raw bytes contain no numeric `"id":` field and not
the fixture's item-name string. A second SSE test proves the **baseline**
unaffected case: exactly 1 pending transaction still delivers the real
`transaction_updated` frame with the real transaction's data, and no
ambiguous frame.

## Client change — `customer-payment.tsx`

Four additive changes, in file order (`client/src/pages/customer-payment.tsx`):

1. New `ambiguous` state (line 50).
2. The active-transaction `queryFn` (line 71) reads the new response header
   — `!stoneNumber && response.headers.get("X-Legacy-No-Board-Ambiguous") === "true"`
   — and calls `setAmbiguous(...)` before returning the (always-consistent)
   JSON body. A board-scoped customer (`stoneNumber` set) can never be
   marked ambiguous by this path, matching the server's board branch being
   untouched.
3. The SSE effect (line 121) subscribes to the new `legacy_no_board_ambiguous`
   message type — `if (stoneNumber) return; setAmbiguous(true);` — with a
   matching `unsubscribe` in the cleanup, and the existing
   `handleTransactionUpdate` now calls `setAmbiguous(false)` once its
   existing addressing/scope guards pass, so a normal resolved event clears
   ambiguity.
4. The redirect effect (line 148) gains `if (ambiguous) return;` as its
   first check and `ambiguous` in its dependency array, and a new render
   branch (line 199), a copy of the existing "Waiting for Payment" visual
   shell with different copy ("We can't tell which sale is yours" / "Please
   ask a staff member for help"), inserted after the `if (!id)` early return
   and before the loading/waiting branch, so it takes precedence whenever
   `ambiguous` is true. No existing branch's condition changed shape.

**Verified:** five new tests in
`client/src/pages/__tests__/customer-payment-flow.test.tsx` cover: the REST
header showing the ask-staff state and never calling `setLocation`; the
unambiguous REST case still redirecting exactly as before; an SSE
`legacy_no_board_ambiguous` message (batched into the same React commit as
a `transaction_updated` message, to exercise the redirect-effect guard
directly rather than relying on incidental scheduling) showing the ask-staff
state and never redirecting; a later normal `transaction_updated` event
correctly clearing ambiguity and redirecting; and a board-scoped customer
never entering the ambiguous state even when defensively probed with an
ambiguous SSE message.

---

## Failing-test-first, as executed in this pass

Both new test files were written before any source change, then verified
red against the pre-fix code, then green after. This was re-confirmed
explicitly in this pass (not just claimed) by stashing the four source
files (`server/storage.ts`, `server/sse-broker.ts`, `server/routes.ts` via
one stash; `client/src/pages/customer-payment.tsx` via a second, separate
stash — keeping both new test files and the other source edits in place
each time) and re-running:

- Server: with the three server source files reverted,
  `npx jest --selectProjects server r1-t2-gap12-option-c-fail-closed-ambiguity.test.ts`
  → **12 of 17 new tests failed** (`TypeError:
  dbStorage.getLegacyNoBoardActiveTransactionOrAmbiguous is not a
  function`, `Property getLegacyNoBoardActiveTransactionOrAmbiguous does
  not exist`, the REST ambiguous-header assertion receiving the old
  silently-picked transaction instead of `null`, the SSE ambiguous-frame
  assertion receiving `undefined`, etc.) — the 5 that passed unmodified are
  exactly the ones asserting **unchanged** baseline behaviour (exactly-1,
  zero, and board-branch REST cases; the baseline SSE case; the mandate #4
  pinning test, which exercises the pre-existing method directly). Restored
  via `git stash pop`.
- Client: with `customer-payment.tsx` reverted,
  `npx jest --selectProjects client --testPathPatterns="customer-payment-flow"`
  → **3 of 5 new tests failed** (the ambiguous-header, blocked-redirect, and
  ambiguity-clears-then-redirects tests all failed as expected — no
  ambiguous state existed to enter); the 2 that passed are the baseline
  "still redirects" and "board never ambiguous" cases. Restored via
  `git stash pop`.

After each restore, `npm run check` was re-run clean and the relevant suite
re-run green, confirming the stash/pop round-trip did not corrupt anything.

## Verification, as executed in this pass

- **`npm run check` (tsc):** clean, zero errors, confirmed repeatedly across
  the pass (including immediately before writing this document).
- **`npm run test:server --runInBand`:** baseline before this task's changes
  was 55 suites / 1046 tests (independently re-confirmed at the start of
  this pass). After: **56 suites / 1063 tests, all passing** — the baseline
  55/1046 unchanged, plus this task's one new file
  (`r1-t2-gap12-option-c-fail-closed-ambiguity.test.ts`, 17 tests, all
  passing).
- **`npx jest --selectProjects client`:** baseline before this task's
  changes was 53 suites / 492 tests (independently re-confirmed at the
  start of this pass). This pass ran the full client suite repeatedly over
  its duration, alongside a separate, disjoint terminal-migration task that
  was actively editing `merchant-terminal*.tsx` and its test files in the
  same shared working tree throughout (its own scratch test files and
  in-progress edits were visible via `git status` at multiple points,
  moving between different terminal files as that other task progressed —
  none of it read for more than confirming it was untouched by this task,
  none of it edited). Two intermediate full-suite runs during this window
  transiently showed one of those *other* files failing (first
  `merchant-terminal-mobile.test.tsx`, later
  `merchant-terminal-mobile-v2.test.tsx`, each time 55–56 suites passing /
  1 failing, 501–506 tests passing / 5 failing) — never a file this task
  touched, and neither ever imports `customer-payment.tsx`. Re-running with
  every `merchant-terminal*` file excluded
  (`--testPathPatterns="^(?!.*merchant-terminal).*$"`) during that same
  window gave **54 suites / 497 tests, all passing** — exactly baseline
  (53/492) plus this task's one new file (`customer-payment-flow.test.tsx`,
  5 tests) — isolating that this task's own change set introduced zero
  client regressions regardless of the other task's in-flight state. The
  final full-suite run in this pass, immediately before writing this
  document, shows **57 suites / 511 tests, all passing** — the other task's
  file had since reached a green state on its own; this task's contribution
  within that total is unchanged (baseline 53/492 + this task's 1 file / 5
  tests + the other task's now-3 terminal test files it introduced during
  this window, none of which this task authored or edited).
- **Merchant/board delivery timing and ordering — explicitly verified, not
  just asserted unaffected:** see mandatory fix #1's "Verified, not just
  argued" paragraph above. The same-merchant, check-still-pending scenario
  is the exact shape of thing the prior (blocked) pass got wrong; this
  pass's test directly exercises that shape against the real `sseBroker`
  singleton and the real HTTP route, not a simulation.
- **Manual trace: the 2-concurrent-stoneless-sale scenario, end to end.**
  Exercised via the new REST and SSE tests themselves against the real
  `MemStorage`-backed harness (not simulated): two concurrent pending
  stoneless transactions on one merchant → REST returns `null` + the
  ambiguous header; a live SSE subscriber receives the ambiguous marker
  frame with no transaction data. Both paths agree, using the same
  `getLegacyNoBoardActiveTransactionOrAmbiguous` call.
- **Manual trace: the sale-B-completes-while-sale-A-pending scenario, end
  to end** — to confirm mandatory fix #3's documentation below is accurate,
  not to fix it. A one-off script (not committed — written as a temporary
  Jest test, run once, deleted; the task explicitly asks to trace/exercise
  this, not to encode it as an automated regression requirement) did the
  following against the real HTTP harness and real `MemStorage`:
  - Created merchant M, sale A (pending, `itemName="Sale A..."`,
    `price="11.11"`) and sale B (pending, `itemName="Sale B..."`,
    `price="22.22"`), both stoneless.
  - Confirmed `getLegacyNoBoardActiveTransactionOrAmbiguous(M)` →
    `{"kind":"ambiguous"}` while both are pending.
  - Opened a raw anonymous `legacy-no-board` SSE subscription.
  - Completed B via the real `POST /api/transactions/:id/hosted-fields-
    complete` route (Windcave mocked approved, matching
    `r1-t7-windcave-session-binding.test.ts`'s convention) — this is the
    same `finaliseHostedPayment` → `broadcastToStone` path every real
    completion in this codebase goes through.
  - **Captured raw frame delivered to the anonymous subscriber:**
    ```
    data: {"type":"transaction_updated","transaction":{"id":2,"merchantId":1,
    "taptStoneId":null,"itemName":"Sale B (a different customers basket)",
    "price":"22.22","status":"completed","paymentMethod":"card", ...},
    "addressingMode":"legacy-no-board"}
    ```
  - Confirmed `getLegacyNoBoardActiveTransactionOrAmbiguous(M)` immediately
    **after** →
    `{"kind":"found","transaction":{...,"id":1,"itemName":"Sale A...",...,
    "status":"pending",...}}` — the pending bucket had already dropped to
    {A} alone at the instant of the check.
  - This confirms mandatory fix #3's mechanism byte-for-byte as designed:
    B's own completion broadcast was judged **non-ambiguous** (because only
    A remained pending at check time) and delivered **B's real completed
    data** — not an ambiguous marker, not A's data, not the newly-resolved
    "found" transaction's data — to every anonymous subscriber, because
    `dispatchLegacyNoBoard`'s non-ambiguous branch re-delivers the
    **original, closed-over broadcast payload** (`data`, i.e. B's own
    update), gated only by a same-instant re-check of bucket size, never a
    substitution of the resolved single transaction.

---

## What this closes, and — stated explicitly — what it does not

**This closes the payment-correctness defect described in the decision
memo's §3.3**, for the unauthenticated legacy-no-board scope only: a
merchant with two (or more) concurrent pending/processing stoneless sales
open no longer causes every anonymous customer to silently converge on the
newest one. Both `GET /api/merchants/:id/active-transaction` (no-stoneId
branch) and the SSE broadcast path now report ambiguous — no data from
either candidate leaks in that case — instead of one customer being able to
be routed onto another customer's checkout and pay their amount.

**This does not close the core gap 12 confidentiality issue** the decision
memo also names: a caller who knows or guesses a numeric merchant id and is
the *only* anonymous subscriber (or arrives when only one sale is open)
still receives that merchant's live sale feed — the stream itself remains
unauthenticated. That is Option A/B territory, explicitly out of scope here
per the task brief and the memo's own recommended sequencing (§7: "C first
... A as the end state").

**This does NOT close the residual leak found and confirmed real by
mandatory fix #3, by design — the task explicitly instructs not to attempt
this.** Stated with the exact mechanism, not a softened paraphrase (see the
manual trace above for the captured evidence): the ambiguity check is keyed
on the count of currently pending/processing (or, if that bucket is empty,
completed-within-3-minutes) stoneless rows **at the moment each broadcast's
async check resolves**. If sale B (one of a concurrent pair with sale A)
transitions to `"completed"` while sale A is still pending, B's own
completion broadcast triggers its own `dispatchLegacyNoBoard` call; by the
time that call's ambiguity check resolves, the pending bucket has already
dropped back to `{A}` (size 1), so the check reports `"found"` (not
`"ambiguous"`), and `dispatchLegacyNoBoard`'s non-ambiguous branch delivers
the **original, already-captured broadcast payload** — B's real completed
`transaction_updated` frame, containing B's real `id`, `itemName`, `price`
and `status: "completed"` — to **every** legacy-no-board subscriber,
including customer A's still-open page. `customer-payment.tsx`'s SSE
handler (`handleTransactionUpdate`) treats any incoming stoneless
`"completed"` transaction as its own success and redirects to that
transaction's receipt, so customer A's page redirects to **customer B's**
receipt. This sits inside the exact two-concurrent-stoneless-sales scenario
this task fixes, is a real, demonstrated (not merely theoretical) behaviour
of the code as shipped by this task, and is **not** closed by this task's
design. Closing it needs per-transaction addressing (Option A/B) — the task
brief explicitly names this as out of scope, and this document is the
required record that it was found, traced, and deliberately left open, so
it is not lost or rediscovered as a surprise later.

## Remaining risk / open items

- **The confidentiality half of gap 12 remains open** (see above) — this
  task was never scoped to close it.
- **Mandatory fix #3's residual leak remains open by design** (see above).
  It requires Option A/B (per-transaction addressing) to close; nothing in
  this task's "fetch 2, fail if 2" design can close it without also
  substituting the delivered payload for the freshly-resolved single
  transaction on every non-ambiguous delivery, which the task brief does
  not ask for and which would be a larger, separate change to
  `dispatchLegacyNoBoard`'s contract.
- **A minor, disclosed-not-fixed ordering consequence:** delivery ordering
  *within* the legacy-no-board audience itself, across multiple
  concurrently in-flight ambiguity checks for the same merchant, is not
  strictly guaranteed by this design (each `dispatchLegacyNoBoard` call's
  async leg is independent, so DB latency variance between two overlapping
  checks could in principle resolve out of the calls' original order). The
  task's mandate only requires merchant/board ordering to be preserved,
  which it is; this is a minor, undirected consequence of gating only the
  already-more-tolerant legacy-no-board leg, surfaced here rather than
  discovered later.
- **The completed-transaction 3-minute fallback window is unchanged** for
  the legacy-no-board scope (still consulted only when the pending bucket
  is empty, with the same ambiguity rule) — this task did not touch or
  narrow that window, per the "payload narrowing ... out of scope"
  instruction (the memo's Option C also floats dropping this fallback for
  anonymous callers entirely; this task does not do that).
- **The three-plus staff terminal files' collateral behaviour change**
  (owner-approved, see above) has not been separately re-verified against
  those files' actual runtime behaviour in this pass, since this task was
  explicitly forbidden from reading or editing them for anything beyond
  confirming they were untouched; the owner sign-off was obtained on the
  described behaviour, not on a fresh read of that code.

## What was done, and what was deliberately not done

**Done:** mandatory fixes #1, #2 and #4 implemented exactly as the approved
plan specified and independently re-verified in this pass (not merely
re-asserted) via the tests and manual traces above; mandatory fix #3 traced
end-to-end against real code and real HTTP behaviour and documented with
its exact mechanism and captured evidence, deliberately left unfixed; the
new storage method, the two route changes, the sse-broker additions, and
the four client changes, all built additively with zero modification to
any already-correctly-scoped path (authenticated-merchant, board/stone,
token-addressed); two new failing-test-first test files (22 new tests
total, all independently confirmed red against the pre-fix code and green
after); a clean `tsc`; the full server and client suites re-run with the
baseline counts preserved exactly and this task's new tests strictly on
top; a manual, evidence-capturing trace of both the ambiguous-resolution
scenario and the residual-leak scenario.

**Deliberately not done:** payload narrowing (out of scope, named
explicitly by the task); Option A/B; anything in gap 11; any change to the
trust-proxy/rate-limit configuration; any edit to the events route handler
itself (unnecessary — all gating lives at broadcast time); any edit to any
staff terminal file or the desktop retail terminal; any attempt to close
mandatory fix #3's residual leak; any commit of the working tree (not asked
for — every modified and new file listed at the top of this document
remains uncommitted, exactly as handed to this pass, alongside the separate
terminal-migration task's own uncommitted, unrelated work that this task
found in the same tree throughout and left completely alone).
