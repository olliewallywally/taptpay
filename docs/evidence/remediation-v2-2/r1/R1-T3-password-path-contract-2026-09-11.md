# R1-T3 — the password-change path contract, corrected

Date: 2026-09-11. Branch: `remediation/r1-continuation-20260907`.

## What the plan requires

R1-T3's safe defaults include, verbatim: "Password change: move to
`/api/account/password`, or prove the path merchant equals the authenticated
account. **Never ignore a path ID.**"

The tracker's gap 5 records that the 2026-09-06 handoff did the opposite and
justified it: the route parsed `:id` and then never used it, on the reasoning
that only the caller's own login changes so the path id cannot do harm.

## Which of the two options, and why

**Enforce `path == account`. The route does not move.**

The decision rests on what the only caller actually sends.
`client/src/desktop/DesktopSettingsPage.tsx` builds the URL from
`getCurrentMerchantId()` (`client/src/lib/auth.ts`), which reads `merchantId`
out of the caller's own JWT. That value is by construction identical to
`req.user.merchantId` for owners and members alike, so enforcing equality is a
purely server-side tightening with a provably empty client blast radius.

Moving to `/api/account/password` buys nothing extra for security — both options
satisfy "never ignore a path ID" — while costing a client edit, a `410`
tombstone, a route-policy regeneration and a new registration in the inventory.

## Status code: 403, not a tenant-safe 404

P2.2 assigns `403` to "authenticated principal lacks role or tenant permission"
and reserves `404` for cases "where disclosure would enumerate". Nothing is
enumerable here: a merchant id is already public — the merchant's own payment
URL is `/pay/:merchantId` — so the refusal tells an attacker nothing they did
not already have. Every comparable ownership failure in `routes.ts` returns
`403`; there is no tenant-safe-404 precedent in the file.

## Superseded test, quoted before replacement

`server/__tests__/route-policy-role-defaults.test.ts` previously asserted the
contract the plan names as wrong. Verbatim:

```
describe("R1-T3 safe-default: password change never trusts the path merchant id", ...)
  it("changes the caller's own password regardless of the :id in the URL, and never the account the id actually names", ...)
      // ownerA calls the change-password route with ownerB's merchant id in the
      // path — the path id must never be trusted for who gets changed.
      expect(response.status).toBe(200);
```

The observation was accurate — only the caller's own login changed. What was
wrong was accepting a cross-tenant path id at all.

## Red run, then fix

With the corrected expectation in place and `routes.ts` untouched:

```
✕ refuses a cross-tenant path id and changes nobody's password
    Expected: 403
    Received: 200
Tests: 1 failed, 10 passed, 11 total
```

The fix adds the repo's existing tenant-equality convention immediately after
the strict id parse, before body validation:

```ts
if (!checkMerchantOwnership(req, merchantId)) {
  return res.status(403).json({ message: "Access denied" });
}
```

Nothing below it changed: the handler still reads and writes only
`req.user.userId`'s row, so a teammate still changes their own password. The
path id is now a precondition rather than a selector.

## Coverage now in place

| Case | Expectation |
|---|---|
| cross-tenant path id | `403`, and **both** accounts still authenticate with their original password while the attempted new password works for neither |
| owner, own path id | `200`, password genuinely rotated |
| member, own merchant's path id | `200`, the member's login rotated and the owner's untouched |
| malformed path id (`1abc`) | `400` "Invalid id", still ahead of everything else |

## Inventory regenerated

`npx tsx scripts/generate-route-policy.ts` re-derived `server/route-policy.ts`,
which now records the route's markers as
`["authenticateToken","checkMerchantOwnership"]` rather than
`["authenticateToken"]`. No test forces that regeneration, which is exactly why
it is easy to skip and leave the policy asserting something untrue.

## Verification

`npm run check` passes. Focused suite 11/11. Full server regression 51 suites /
970 tests. Client 52 suites / 487 tests.

## What this does NOT close

R1-T3 as a whole stays **PARTIAL**. This corrects one named safe default. The
full principal/tenant matrix, the 97 unclassified registrations R1-T2 still
reports, and the client route-guard tests for `/terminal`, `/stack`,
`/smart-terminal`, `/property/*`, `/trades/*` and `/admin/*` across
unauthenticated / member / owner / other-tenant / admin contexts all remain
open.
