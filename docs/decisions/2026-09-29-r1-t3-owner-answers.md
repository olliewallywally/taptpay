# Owner answers — R1-T3's three open questions (2026-09-29)

Date: 2026-09-29 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `416676cf`, R1-T3
code-complete: `docs/evidence/remediation-v2-2/r1/WORKING-2026-09-27-r1-t3.md`, "Where R1-T3 stands
(2026-09-29)"). Asked in the session's summary; the answer, verbatim: **"keep 400, 2. leave it. 3. block
it."**

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "The password-reset, email-confirmation and invite pages answer a bad link with code 400. The plan's rules say 401. Nobody would see the difference. Keep 400, or switch to 401?" | **"keep 400"** |
| 2 | "The platform admin can currently use four business routes that move money: taking a sale, a cash sale, Tap to Pay and cancelling a sale. No admin screen uses them. Block the admin there, or leave it?" | **"leave it"** |
| 3 | "A board you've removed still shows its open sale and still lets a customer pay it, even though that board's other pages already say 'not found'. Block it too, or keep it so a sale left open can still be paid?" | **"block it"** |

## Background

- 1: `POST /api/auth/reset-password`, `POST /api/auth/confirm-email` and `POST /api/team/accept-invite`
  take their one-time token in the body and answer an unknown or expired one 400 ("Invalid or expired
  …"). P2.2 calls an invalid credential 401. All three pages (`reset-password.tsx`, `confirm-email.tsx`,
  `accept-invite.tsx`) show the server's message for any failure.
- 2: `checkMerchantOwnership` lets the validated platform admin act on any business. On `POST
  /api/transactions`, `POST /api/transactions/cash-sale`, `POST /api/transactions/tap-to-pay` and `POST
  /api/transactions/:id/cancel` that means it can take, record or cancel a business's sales; no admin
  screen does (the reviews' finding `ADMIN_MONEY`).
- 3: a board's customer page (`customer-payment.tsx`, `BoardPayment`) polls `GET
  /api/merchants/:id/active-transaction?stoneId=…` every 3 seconds and, when a sale is waiting, takes the
  customer to pay it. That read checked only that the board is the business's, so a removed (inactive)
  board still showed its open sale; the same board's live stream and brand answer 404 for a removed board.

## What this authorizes

- 1: no code change. The matrix keeps recording 400 for these three pages (`UNKNOWN_LINK_ANSWER`); the
  notes and the inventory table say it is the owner's decision.
- 2: no code change. The finding becomes "kept by the owner's decision", as the teammates' board rights
  were on 2026-09-27; R1-T3's tests already pin the admin being served there (batch (g)).
- 3: code and tests on this branch, tests first: the open-sale read answers a removed board 404 "Payment
  board not found", as for a missing board, and the matrix records it. No deploy. What a customer then
  sees on a removed board's page: the page's waiting screen ("Waiting for Payment"), as for a board with
  no sale; it never shows the sale or takes them to pay it. Not changed: a removed board's QR image
  (`GET /api/merchants/:id/stone/:stoneId/qr`) is still drawn; it only encodes the board page's address.

## Outcome

To be filled in when built.
