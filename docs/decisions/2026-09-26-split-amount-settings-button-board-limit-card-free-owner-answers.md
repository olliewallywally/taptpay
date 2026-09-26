# Owner answers — split-bill amounts, the settings button, the board limit, the card-free account (2026-09-26)

Date: 2026-09-26 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `cee1276a`).
Asked in one question set during the C10 route review; answers are the options he chose,
verbatim.

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "On a board's split bill, each customer can type their own amount, and the server then counts that share as fully paid. So every share of a $100 bill can be paid with 1 cent and the bill shows "fully paid" (I reproduced this in the test setup). What should happen?" | **"Exact share only (Recommended)"** — "Each person pays exactly their share, as payment links already do. The server refuses any other amount and the split page drops the amount box. Small change." |
| 2 | "The "Customer Payment Page" button in settings (and its tutorial step) now opens the "this address is retired" notice, because the business-wide page is gone. What should it do?" | **"Open the boards (Recommended)"** — "It opens the boards page, where each printed QR's customer page lives. Its tutorial step is reworded to match." |
| 3 | "Businesses can have at most 10 boards at a time (TAPT_STONE_LIMIT), but you said they can make as many as they want. Change the limit?" | **"Keep 10"** — "Leave it as it is." |
| 4 | "Your one-off request to let oliverharryleonard@gmail.com use every feature without a card on file was blocked by the safety check, because it needs a change to the development database. How do you want to handle it?" | **"You do it; I approve"** — "I make one change in the development database only: a paid-up period on that account's subscription, no code exemption. I run it only when you approve the permission prompt." |

## Background

- 1: found by the route review, batch 2b (`cee1276a`; the finding on `POST /api/transactions/:id/pay`
  in `server/route-review.ts`). The per-payment link route already refuses an amount that is not
  what is owed; the numbered (board) route let the customer name any positive amount up to what
  was left, and the share it paid was then counted as fully paid.
- 2: the button and its tutorial step were exempt from change by the owner's earlier instruction
  (`docs/PLAN-2026-08-30-settings-apple-redesign.md` §2, "byte-for-byte"); this answer changes
  that for this button only. Asked first in the no-board rework report (2026-09-25) and not
  answered then ([2026-09-25-share-dropdown-and-fixes-owner-answers](2026-09-25-share-dropdown-and-fixes-owner-answers.md)).
- 3: `TAPT_STONE_LIMIT` (`server/storage.ts`) stays 10. Raised because the 2026-09-25 answer said
  "they can make as much as they want".
- 4: the owner's request of 2026-09-25 ("can you also remove the need for a card on file for
  oliverharryleonard@gmail.com account so i can test all the features without having to have a
  card. jsut for this account one off"). The auto-mode safety check denied reaching the
  development database on 2026-09-25; this answer authorizes the one change, run only on his
  approval of the permission prompt.

## What this authorizes

- 1 and 2: code and tests on this branch (tests first). No migration, deploy or push.
- 3: nothing to change.
- 4: one data change in the development database (`workspace` target, host `helium`) only, to
  that account's subscription; read-only checks before and after; production untouched; no code
  exemption.

## Outcome of answer 4 (same day)

- Read-only lookup, run outside the sandbox (the sandbox cannot resolve the development database's
  host), allowed: login 4 (owner, active) → business 22 (active, café) → subscription 1: plan
  `team`, status `active`, `current_period_start` 2026-08-07 06:45:10, `current_period_end` empty,
  `next_billing_date` 2026-05-03 04:21:57 (already past, so a renewal run would count it due and,
  with no card, record a failure), `last_billing_date` empty, 0 failures, no card, no pending plan,
  not cancelling. Paid access is refused because `last_billing_date` and `current_period_end` are
  empty (`server/billing-card.ts`, `subscriptionHasPaidAccess`).
- Planned write: one guarded update of that row only (matched on id, business, plan, status, no
  card and the two empty fields; aborts unless exactly one row changes): a one-year paid-up period
  from now (`current_period_start`, `current_period_end`, `next_billing_date`, `last_billing_date`),
  failures 0; plan and card fields untouched.
- **Denied** by the auto-mode safety check ("judged this action dangerous"). Nothing was written.
  Not retried by any other route. The owner decides how to proceed: allow the command, or run the
  change himself.

## Outcome of answers 1–3 (same day)

- 1: **`442bfadf`**. `POST /api/transactions/:id/pay` charges what is owed (the next share, or the
  whole price); an amount sent must equal it to the cent, or 400 before any provider session. The
  board's split page offers no amount box and shows and sends that share (whole cents rounded
  down, the remainder on the last). The route review's custom-amount finding is closed; the
  split-share finding keeps what remains (one session settling twice: gap 11, R3/C20).
- 2: **`717b7384`**. Phone and desktop "Customer Payment Page" open `/board-builder`; the tutorial
  step reads "Open your payment boards". Both screens already had a "Payment Board Builder" row to
  the same page. Related, found on the way: **`a419f948`**. A board sale's "Cancel payment" and
  the payment result's "Try Again" no longer lead to the retired `/pay/<business>`.
- 3: nothing changed; `TAPT_STONE_LIMIT` stays 10.

The session that made these crashed (container restart 03:08 UTC) during its type-check, before
committing. It was resumed from its transcript. Everything was re-verified before the three commits:
`tsc` clean, server 94/1,706, client 96/799, mutations 14/14.
