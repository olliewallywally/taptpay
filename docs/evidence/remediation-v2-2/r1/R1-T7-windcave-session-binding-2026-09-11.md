# R1-T7 continuation — foreign Windcave session bypass on the legacy transaction payment routes

Date: 2026-09-11. Branch: `remediation/r1-continuation-20260907`.

## What this closes

A 10-agent cross-tenant/IDOR audit of the remaining R1-T7 route surface
(`docs/evidence/remediation-v2-2/r1/R1-T7-uploaded-files-and-consolidation-2026-09-06.md`'s
"still open" list) found, and an independent adversarial re-check confirmed,
that `POST /api/transactions/:id/hosted-fields-complete` (routes.ts:2912) and
`POST /api/transactions/:id/googlepay-complete` (routes.ts:2947) each guarded
the client-supplied `sessionId` with:

```ts
if (transaction.windcaveSessionId && transaction.windcaveSessionId !== sessionId) {
  return res.status(403).json({ message: "Session ID mismatch" });
}
```

Every transaction is created with `windcaveSessionId: null`
(`server/storage.ts` `createTransaction`, both backends) and it is set only
by `POST /api/transactions/:id/pay` once that specific transaction starts a
real Windcave session. Because the guard above is only entered when
`windcaveSessionId` is already truthy, **any transaction that has not yet had
`/pay` called on it skips the check entirely** and accepts an arbitrary
client-supplied `sessionId`, which is then queried against Windcave with the
platform's single shared credential
(`queryWindcaveSession`, `server/windcave.ts:200`) and, if that session
happens to report `approved: true`, finalises the *target* transaction —
any merchant, any amount — via `finaliseHostedPayment`. The session need not
belong to the target at all; a previously-approved session obtained from
paying a different (even trivially small) transaction on the shared platform
account is sufficient, and no auth of any kind gates either route.

Both routes already do check `isWindcaveConfigured()` and 503 when Windcave
isn't configured, so this is currently inert wherever Windcave credentials
are absent (this workspace's posture throughout remediation) — but the
defect is real source, not a hypothetical, and would be live the moment a
real Windcave environment is configured.

## Failing test first

New file `server/__tests__/r1-t7-windcave-session-binding.test.ts`, built on
the R1-T1 HTTP harness (`server/__tests__/support/http-harness.ts`) with
`isWindcaveConfigured`/`queryWindcaveSession` spied per the existing
`r0-t5-callback-containment.test.ts` pattern. Two tests proved the exploit
before any fix: posting an arbitrary `sessionId` to a freshly-created
transaction (`windcaveSessionId` still `null`) against each route returned
`200`/`approved: true` and flipped the transaction to `completed`, with
`queryWindcaveSession` actually invoked — i.e., a foreign session that was
never issued for this transaction was accepted and acted on. Two further
tests proved the legitimate flow (a session genuinely bound via `/pay`,
matched by the same completion call) already worked correctly, so the fix
below could not be a case of "reject everything."

## Fix

`server/routes.ts` — both guards changed from conditional to unconditional:

```ts
if (!transaction.windcaveSessionId || transaction.windcaveSessionId !== sessionId) {
  return res.status(403).json({ message: "Session ID mismatch" });
}
```

A transaction with no session bound yet now rejects every `sessionId`
instead of accepting any of them. This mirrors the invariant the codebase's
own token-flow sibling (`prepareTokenCompletion`, routes.ts:1681) already
enforces unconditionally — the legacy integer-id routes had inverted it into
"only enforce once something happens to be bound already," which is what
made the null state exploitable. No new storage method, schema change, or
convention — a corrected inline check, consistent with the pattern already
used at this exact call site.

## Verification

- `server/__tests__/r1-t7-windcave-session-binding.test.ts`: 4/4 pass (2 were
  failing pre-fix, proven above).
- `npm run check` (tsc): passes.
- Full server regression (`npx jest --selectProjects server --runInBand`):
  **52 suites, 974 tests pass**, no regressions.

## Found but explicitly not fixed in this batch — flagged for the owner

While tracing this, a **second, distinct defect** was found in the same
shared `finaliseHostedPayment` helper (routes.ts:2823) that this fix does
**not** address, because closing it correctly needs the durable-payments
machinery the plan explicitly defers to **R3** ("crash-safe idempotent...
one finaliser, aggregate state machines"), not a same-session inline check:

**A session, once legitimately bound and used to complete one split of a
split transaction, can be replayed against the same route to complete the
*next* split for free — no new session, no new payment.** Concretely: for
an `isSplit` transaction, `finaliseHostedPayment` calls
`storage.getNextPendingSplit(transactionId)` and marks whichever split that
returns as `completed`, using whatever `windcaveTransactionId` the query
returned — but nothing marks the *session* itself as consumed.
`transaction.windcaveSessionId` is only ever changed by `/pay` (each new
split's `/pay` call overwrites it with a fresh session), so between one
split completing and the next `/pay` call, the just-used session is still
the transaction's bound session and still equality-matches. Resubmitting
the same `sessionId` to `hosted-fields-complete`/`googlepay-complete` again
therefore passes the (now-correct) binding check a second time, and
`finaliseHostedPayment` — which has no notion of "this session already paid
for split 1" — happily advances to split 2 using the same already-spent
approval. Repeated, this lets one real payment silently mark an entire
multi-way split bill as paid. The same helper's non-split branch has a
milder version of the same gap: replaying an already-completed
transaction's still-matching session re-runs
`storage.incrementTransactionCount`, inflating a merchant's billed
transaction count on every replay.

This is architecturally different from — and not fixed by — the null-bypass
closed above: the session here is genuine and correctly bound, the gap is
the *absence of single-use consumption* once a session has funded one
finalisation. The sibling checkout/invoice flow (`invoicesRentRequests` /
`jobInvoices`, `server/storage.ts` `atomicClaimSplitShare`/
`atomicClaimJobSplitShare`) already tracks exactly this via a
`splitPaidSessions` array and dedupes on it — the legacy `transactions` /
`splitPayments` tables have no equivalent column. Retrofitting that safely
means a schema decision (a new tracked-sessions column, migration, and
`IStorage` method on the transactions/splitPayments side) made deliberately,
not as a rushed addendum to an unrelated same-day fix — consistent with the
plan's own reasoning for leaving R2–R8 undecomposed ("inventing that detail
now would produce confident-sounding instructions that turn out wrong").
Recorded here in full (file:line, exact mechanism, reproduction) so it is
not lost, and carried into the status ledger as an open item for the owner
and for R3 scoping, rather than fixed speculatively in this batch.

## Still open

R1-T7's broader scope (tenant-scoped storage methods for boards/stock/
property/trades families, upload hardening, the remaining cross-tenant
sweep) continues under separate evidence. The split-payment-session-replay
finding above is open, unfixed, and owner-visible; no migration, secret
rotation, production operation, or capability enablement in this batch.
