# R1-T6 final batch — bounded query values, and the source guard

Date: 2026-09-11. Branch: `remediation/r1-continuation-20260907`.

This closes R1-T6's completion check: "zero `parseInt(req.params` or
`parseInt(req.query` in production route code, source guards active, and every
generated execution-baseline site migrated or explicitly typed by a reviewed
schema."

## The exemption this reverses

Batches 1–7 migrated every identifier. They deliberately left five bounded
tuning values alone and recorded that decision in
`R1-T6-team-batch-and-final-sweep-2026-09-06.md`. The tracker's gap 6 reverses
it: "Keep optional defaults only for absent inputs and preserve intended
size/day bounds using a reviewed typed schema; reject repeated/array/object/
garbage inputs. Do not add an allowlist that silently weakens the requirement."

## The literal grep undercounted

The handoff said five sites. A literal `parseInt(req.query` grep does say five,
but four more sites of the same defect class were hiding behind different
spellings, and three more sat in a middleware file:

| Site | Spelling that hid it | What was wrong |
|---|---|---|
| `routes.ts` `/api/merchants/:id/qr` | `parseInt(req.query.size as string)` | garbage silently became the default |
| `routes.ts` `/api/merchants/:id/stone/:stoneId/qr` | same | same |
| `routes.ts` `/api/pay/t/:token/qr` | same | same |
| `routes.ts` `/api/transactions/:id/receipt-qr` | same | same |
| `routes.ts` `/api/merchants/:id/revenue-over-time` | `parseInt(req.query.days as string)` | same |
| `routes.ts` `/api/pay/t/:token/receipt-qr` | **`Number(req.query.size)`** | a sixth QR size site the grep never saw |
| `routes.ts` active-transaction `stoneId` | **`/^\d+$/`** | accepted `0`, then queried `getTaptStone(0)` |
| `routes.ts` billing history | **`Number.parseInt(String(req.query.limit ?? ""))`** | garbage silently became 50 |
| `routes.ts` tenant events | **`parseInt(String(req.query.limit ?? "50"))`** | **`?limit=abc` produced `NaN`, and `Math.min(NaN, 200)` is `NaN`, which reached `storage.getTransactionEventsByTenant`** |
| `middleware/merchant-validation.ts` ×3 | `parseInt(req.params.*)` | production server code, currently imported by nothing |

The `NaN`-reaches-storage one was a live defect, not a style point.

## Fix

`strictBoundedIntegerQueryParam(raw, { fallback, min?, max })` in
`server/http-params.ts`, built on the existing
`strictPositiveIntegerQueryParam` rather than a new regex. Absent → the
fallback. Present and valid → clamped exactly as before. Present and invalid →
`null`, which every call site answers with `400` and the param's own noun
("Invalid size", "Invalid days", "Invalid limit"), per the message convention
the earlier batches established. Arrays and objects are rejected by the scalar
parser underneath, so a repeated or bracketed key cannot be coerced to its
first entry.

`middleware/merchant-validation.ts` moved to `strictPositiveIntegerParam`. It is
imported by nothing today, but the guard below has no allowlist, so it had to be
correct rather than excused. Its unreachability is noted, not relied on.

### A deliberate deviation, recorded rather than buried

The team-batch precedent parses identifiers **before** the ownership check.
These bounded values are read **after** the route's 404/ownership checks, and
were left there. Moving them earlier would let an unauthenticated caller
distinguish "bad size" from "no such transaction" and enumerate rows. The
ordering rule exists to stop a malformed input reaching authorisation logic; it
is not a reason to leak existence.

## Source guard

`server/__tests__/http-params-source-guard.test.ts`, structured after the
repo's existing `config-source-guard.test.ts` (same recursive walk, which
descends into `server/middleware/` and skips only `__tests__`).

It has **no allowlist**, deliberately — gap 6 forbids one. It rejects six
spellings, each of which was a real site before this batch:
`parseInt(req.params`, `parseInt(req.query`, `Number(req.params`,
`Number(req.query`, `parseInt(String(req.params`, `parseInt(String(req.query`.
A second test feeds it one sample of each shape, because a guard that cannot
fail proves nothing.

## Two superseded tests, corrected rather than deleted

Both previously asserted the exemption this batch reverses. Their original
assertions, quoted verbatim:

- `http-params-nfc-tapt-stone-batch.test.ts` —
  `it("a negative size does not crash the handler — the qrcode library silently ignores a non-positive width")`
  asserting `expect(response.status).toBe(200)` for `?size=-100`.
- `http-params-transactions-refunds-batch.test.ts` —
  `it("size=-100 (reviewed, left unchanged: see evidence doc) still renders a valid PNG rather than crashing")`
  asserting `expect(response.status).toBe(200)` and an `image/png` content type.

Both now assert `400` / "Invalid size". The behaviour they described was real;
it is the requirement that changed.

## Verification

- New `http-params-bounded-query-batch.test.ts`: 17 tests — every garbage shape
  (`abc`, empty, `0`, `-1`, `1.5`, `1e3`, leading/trailing space, `01`, `+7`,
  unsafe integer), repeated keys, bracketed keys, absent-applies-default,
  and that previously-valid values still clamp to the same numbers.
- One test asserts `getRevenueOverTime` receives `365`, not `NaN`.
- Source guard: 2 tests pass, no allowlist.
- `npm run check`: passes.
- Full server regression: **51 suites, 970 tests pass.**
- Client regression: **52 suites, 487 tests pass.**

## Still open in R1-T6

Nothing in this task's own check. The wider R1-T2 route-policy inventory that
R1-T6 depends on still reports **97 of 218 registrations unclassified** — that
is R1-T2's gap, unchanged by this batch.
