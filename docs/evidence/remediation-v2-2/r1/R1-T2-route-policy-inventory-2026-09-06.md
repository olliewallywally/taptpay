# R1-T2 — checked-in route policy inventory — 2026-09-06

Branch: `remediation/r1-foundation`.

## What was built

- `server/route-inventory.ts` — AST-based extractor (TypeScript compiler API,
  not regex) for every `app.<method>(...)` / `app.all(...)` / `app.use(...)`
  call in a source file. AST, not regex, deliberately: the plan's own
  2026-08-29 correction register records that an earlier regex-based count
  missed the five `app.all(...)` registrations — walking the parsed AST
  closes that exact class of miss regardless of formatting/nesting.
- `scripts/generate-route-policy.ts` — regenerates `server/route-policy.ts`
  and the documentation table below from the current `server/routes.ts`,
  tagged with the exact git SHA and date it was generated from. Run it with
  `npx tsx scripts/generate-route-policy.ts` whenever routes change.
- `server/route-policy.ts` — generated policy map, one entry per
  `"METHOD path"` registration.
- `docs/evidence/remediation-v2-2/r1/R1-T2-route-inventory-table.md` —
  generated human-readable table (218 rows).
- `server/__tests__/route-policy-inventory.test.ts` — the completeness gate:
  (1) runtime-registered route stack (walked off `app._router.stack` after
  the R1-T1 harness builds the real app) matches the fresh source-AST
  extraction exactly; (2) every source registration has a `route-policy.ts`
  entry; (3) no stale policy entries for routes that no longer exist; (4) no
  duplicate method+path registrations; (5) zero mounted sub-routers today,
  and the extractor already knows how to flag one if a future refactor adds
  one (`app.use("/path", someIdentifier)` shape).

## Regenerated counts on this SHA (evidence, not a timeless constant)

218 total registrations: 91 GET, 88 POST, 22 PUT, 3 PATCH, 9 DELETE, 5 ALL.
The R0-T0 baseline recorded 220 (91/90/22/3/9/5) on an earlier point in this
branch's history — the 2-registration drift is expected; the plan is explicit
that this must be regenerated on the current SHA, never assumed from an older
count. Zero `app.use` calls with a path argument in `server/routes.ts` (no
mounted sub-routers exist today — matches the single flat `registerRoutes`
function this codebase actually has). Zero duplicate method+path pairs.

The five `app.all` registrations, confirmed present in the inventory:
`/api/pay/notification/:state`, `/api/windcave/notification`,
`/api/billing/card/notification`, `/api/windcave/rent-notification`,
`/api/windcave/trades-notification` — all Windcave/payment provider
callbacks, consistent with the plan's framing that these need explicit
unauthenticated-principal policies (authenticity/replay/rate controls), not
an exemption from the inventory.

## Scope: what the policy entries do and do not assert

Per entry, `route-policy.ts` currently records `method`, `path`, a
best-effort `principal` heuristic (`merchant-user` / `cron` / `api-key` /
`unclassified`), and the literal `markers` (known gate-function names —
`authenticateToken`, `checkMerchantOwnership`, `authorizeCronRequest`, etc.)
found in that handler's source slice.

**121 of 218 routes classified** (`merchant-user`/`cron`/`api-key`); **97
unclassified**. Unclassified is not the same as public — it means no known
gate marker was found near the handler. Spot-checked one
(`GET /api/merchants/:id`, routes.ts:1146): genuinely unauthenticated by
design (public branding DTO for the customer payment page via
`publicMerchantBrandDto`), not a miss. The rest of the 97 were not
individually read for this task — the plan's own T2 text says not to rewrite
every handler's semantics in one commit, and the *authoritative* role/tenant
read is explicitly R1-T3's job, which this inventory is what T3 now runs
against. `capabilityGate`, `entitlementGate`, `idempotencyScope`,
`storageMethods`, `successDto` and `errorDisclosure` are intentionally not
populated — the plan decomposes that depth into T3 (roles), T6 (parsing),
and T7 (tenant-scoped storage), each enriching the routes it actually touches
rather than this file guessing ahead of a real read.

## Verification

- Completeness gate proven both ways: added a throwaway
  `GET /api/__t2-completeness-probe` inside `registerRoutes`, confirmed the
  "every source-registered route has a route-policy.ts entry" test failed
  and named exactly that route; reverted (`diff` against a pre-edit backup
  confirmed a byte-identical revert); reran green.
- `npm run check`: pass.
- `npx jest --selectProjects server --runInBand`: 32 suites / 419 tests pass
  (was 31/414 after R1-T1 — the 5 new inventory tests account for the
  difference), ~7s, clean exit.

## Still open for R1

T3 (role/tenant matrix — the authoritative read this inventory feeds), T4/T5
(blocked on R1-H1 owner acceptance), T6, T7, T8/T9/T10 (T8/T10 also blocked
on R1-H1).
