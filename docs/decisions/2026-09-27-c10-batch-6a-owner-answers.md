# Owner answers — the C10 route review's batch 6a questions (2026-09-27)

Date: 2026-09-27 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `64d2b17f`,
with batch 6a's work uncommitted). Asked during batch 6a of the C10 route review (the business's
settings, boards and stock); the answers are the options he chose, verbatim.

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "Three business-settings addresses aren't used by any screen: \"processing rates\" and \"bank account\" (both already just answer \"no longer used\"), and \"business type\", which switches the whole business between retail and property. That last one also lets a teammate make the switch (I checked: it works for them). Retire all three?" | **"Retire all three (Recommended)"** — "Nothing on any screen changes. A business's type can no longer be switched through this back door." |
| 2 | "On the phone terminal, teammates can create, rename and delete payment boards, just like the owner. Deleting a board makes its printed QR stop working. Who should be allowed to delete a board?" | **"Anyone on the team"** — "No change: every login can create, rename and delete boards." |

The recommendation for 2 was "Only the owner deletes"; the other option offered was "Only the owner
manages boards".

## Background

- 1: `PUT /api/merchants/:id/rates` and `PUT /api/merchants/:id/bank-account` answer 410 to every
  caller; `PUT /api/merchants/:merchantId/sector` sets the business's sector (retail or property
  management) under `checkMerchantOwnership`, so any login of the business, and the platform admin,
  could switch it (probed: 200 for a teammate). No screen calls any of the three.
- 2: the board routes (`/api/merchants/:id/tapt-stones…`) admit any login of the business
  (`checkMerchantOwnership`), and the live phone terminal (`merchant-terminal-mobile-v2.tsx`) offers
  create, rename and delete to every login.

## What this authorizes

- 1: code and tests on this branch, tests first: the three routes removed, their reviews with them,
  and the route policy regenerated. No deploy or push.
- 2: nothing to change; the board reviews record that teammates manage boards by the owner's choice.

## Outcome (same day, local commits, not pushed)

- 1, **`96620657`**: the three routes removed (200 remain), their pending entries with them; an older
  test of the business-type route replaced by the removal test. Tests first (red 6 of 7; the details
  route beside them a green guard).
- 2: nothing changed; the board reviews (**`e6530ab6`**) record that teammates manage boards by the
  owner's choice.
