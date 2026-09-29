# R0-T5 continuation — Apple Pay validate auth gap, dead fake-success code deleted

Date: 2026-09-11. Branch: `remediation/r1-continuation-20260907`.
Base: `707cdb44` (client containment, first device smoke, R1-T3 and R1-T6).

## What this continues

A status audit of the full integration plan against the current tree flagged
two residual R0-T5 gaps not covered by any existing evidence file or test:

1. `POST /api/payments/apple-pay/validate` (routes.ts:6180) had no
   `authenticateToken` middleware, unlike its siblings
   `/api/payments/apple-pay/process` and `/api/payments/google-pay/process`.
   In practice the route already 404'd for everyone (`digitalWalletProcessingEnabled`
   is hardcoded `() => false`), so there was no live exploit — but the plan's
   middleware order (authenticate before capability check) was not followed,
   and it was untested.
2. All three wallet routes still carried their pre-containment fake-success
   bodies (`/* istanbul ignore next */`'d rather than deleted) — synthetic
   Apple Pay merchant sessions, synthetic Apple/Google Pay "completed"
   payment results, and (for the process routes) a live side effect on that
   dead path: `storage.incrementTransactionCount(transaction.merchantId)`,
   i.e. a fabricated card payment would have incremented a merchant's
   subscription billing count had the code ever been reachable. Plan rule 5
   ("deleting is the fix, not flagging") requires removing this, not just
   marking it ignored for coverage.

## Failing test first

Extended the existing containment test (`server/__tests__/r0-containment.test.ts`,
"wallet processing routes reject unauthenticated requests") to also assert
`/api/payments/apple-pay/validate` requires `authenticateToken` in its
registration. Run before any fix: 1 failed / 8 skipped (Jest short-circuits
the remaining tests in the file after a failure in this runner config) —
confirmed the gap was real, not a documentation error.

## Fix

`server/routes.ts` — all three handlers collapsed to their disabled-response
tombstone only, with the dead legacy branches removed entirely (not
flagged/ignored):

- `POST /api/payments/apple-pay/validate` — added `authenticateToken`;
  body is now only `404 { code: "NOT_FOUND" }`.
- `POST /api/payments/apple-pay/process` — unchanged auth/flag gate; body is
  now only `503 { code: "DIGITAL_WALLET_DISABLED" }`.
- `POST /api/payments/google-pay/process` — same as above.
- Removed the now-unreferenced `const digitalWalletProcessingEnabled = () => false;`
  declaration along with the dead branches that were its only callers.

No route, status code, or auth behaviour changed for the two `/process`
routes from a caller's point of view — same 401/503 outcomes as before. The
only externally observable change is `/validate` now returning 401 instead
of 404 for an unauthenticated caller, and 404 (unchanged) for an
authenticated one. No product, UI, schema, or migration change.

## Verification

- `server/__tests__/r0-containment.test.ts`: 9/9 pass (was 8/9 with the new
  assertion added, confirmed failing first as above).
- `npm run check` (tsc): passes, no errors.
- Full server regression (`npx jest --selectProjects server --runInBand`):
  **51 suites, 970 tests pass**, no regressions.
- `grep -n "digitalWalletProcessingEnabled" server/routes.ts`: zero hits —
  confirms no dead reference remains.

## Explicitly not touched, and why

`client/public/app/assets/*.js` still contains stale build output naming
`windcaveApiKey` (e.g. `settings-*.js`, `schema-*.js`). This directory is a
manually-published deployment snapshot, not the output of `npm run build`
(which writes to `dist/public`) — per `CLAUDE.md`, `replit.md`, and
`docs/decisions/2026-09-09-adopt-orphan-crypto-transactions.md` (which
already flagged the same directory's stale crypto-schema references and
deliberately left them as "shipped asset naming a removed feature," not
source). Regenerating and republishing that snapshot is documented
repeatedly as a distinct, high-ceremony, owner-reviewed action (stage the
full hash-rollover add/delete pair as one unit; confirm the directory is
still meant to be a checked-in deployment artifact at all) — not something
to fold into this fix. Left for Oliver to decide; tracked in the current
status ledger rather than actioned here. The string in question is a
property name, not a live credential value — no secret is exposed by
leaving it.

## Still open (unchanged by this continuation)

Everything the prior 2026-09-11 R0-T5 evidence files already listed as
open — device/browser smoke, historical `windcaveApiKey` count-only
disposition, R0 exit gate — plus the `client/public/app` snapshot question
above. No migration, secret rotation, production operation, capability
enablement, or push in this batch.
