# R1-T6 — strict numeric path/query parsing — batch 1 of 7 — 2026-09-06

Branch: `remediation/r1-foundation`. This is one batch of seven; see "Still
open" — do not read this as T6 complete.

## What was built

- `server/strict-params.ts` — `parsePositiveIntParam` (rejects everything
  `parseInt` silently accepted: `0`, negatives, `+1`, decimals, exponent
  notation, whitespace, `"1abc"`-style suffixes, empty/missing, unsafe
  integers — matches `/^[1-9][0-9]*$/` then verifies `Number.isSafeInteger`),
  `parsePositiveIntQuery` (additionally rejects arrays/objects — Express's
  shape for a repeated or bracketed query key), and `isValidUuid` for the
  UUID-keyed tables (property/trades use `uuid` primary keys, not `serial` —
  confirmed by grepping `shared/schema.ts`; batches 3 and 5 will need this,
  batch 1 did not).
- `server/__tests__/strict-params.test.ts` — 28 unit tests covering every
  rejection class named in the plan.

## Regenerated count on this SHA (evidence, not a timeless constant)

77 `parseInt(req.params.*)`/`parseInt(req.query.*)` sites before this batch
(review-snapshot planning estimate was 71+7=78 — expected drift, not an
error). All 77 are path params; the codebase has none of these on
`req.query` today, so `parsePositiveIntQuery` is built and unit-tested but
not yet exercised by a live route — the plan's own batch table lists query
parsing as a family property, not a separate batch.

## Batch 1 — `/api/merchants` family (plan estimate: 39 routes)

Migrated all 39 sites across 33 registrations (`/api/merchants/*`, all
`serial`-keyed, no UUIDs in this family). Every site matched the exact
pattern `const NAME = parseInt(req.params.FIELD);` on its own line — no
inline usages, no destructuring — so a small verified-line codemod did the
mechanical replacement (each line's exact content checked before touching
it; aborts loudly on any mismatch rather than silently skipping). Replaced
with:

```ts
const NAME = parsePositiveIntParam(req.params.FIELD);
if (NAME === null) return res.status(400).json({ message: "Invalid id" });
```

77 → 38 remaining after this batch.

### Verification

- `server/__tests__/strict-params-merchants-batch.test.ts` — through the
  real app (R1-T1 harness), `GET /api/merchants/<garbage>/profile` for
  `abc`, `1abc`, `1.5`, `-1`, `0`, `+1`, `1e3`, `" 1"`, and a 22-digit
  unsafe-integer overflow all now return 400; a real id still returns 200;
  a garbage id never reaches the ownership check as a false 403 (confirms
  400 fires before any tenant comparison, matching P2.2's 400-vs-403
  distinction).
- `npm run check`: pass.
- `npx jest --selectProjects server --runInBand`: 35 suites / 465 tests pass
  (was 33/427 before this task — 28 parser unit tests + 10 batch-1 runtime
  tests).
- `npx jest --selectProjects client`: 52 suites / 486 tests pass (unchanged).
- `npm run build`: pass.
- `server/route-policy.ts` and its table regenerated (route set unchanged —
  this batch only rewrote handler bodies, not registrations — so R1-T2's
  completeness gate needed no changes and still passes).

## Still open for R1-T6

**38 of 77 sites remain, across six more batches** (family, plan's planning
weight): `/api/transactions` + `/api/payments` + `/api/checkout` + `/api/pay`
(36), `/api/trades` (31, UUID-heavy — needs `isValidUuid` alongside the
integer parser), `/api/admin` (28), `/api/property` (21, also UUID-heavy),
`/api/push` + `/api/auth` + `/api/team` + `/api/billing` (32), remainder —
subscription/windcave/tutorial/v1/internal/webhooks (20). These weights are
the review-snapshot's planning estimate, not this SHA's actual count per
family — each batch still needs its own extraction pass, the same way batch
1 did, since the numbers drift as the branch moves.

The source guard forbidding new `parseInt(req.params`/`parseInt(req.query`
usage (a `route-policy-inventory.test.ts`-style completeness gate) is **not
yet added** — the plan's own check frames that as a batch-6/7 completion
gate ("at completion: ... source guards active"), not something to land
half-migrated and red for the remaining six batches. Adding it now would
mean committing a permanently-failing test until every batch lands.

T4/T5/T8/T10 remain blocked on R1-H1 owner acceptance. T7 (tenant-scoped
storage) and the remaining T6 batches are independent of each other and can
proceed in either order.
