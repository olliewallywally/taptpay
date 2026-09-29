# Owner answers — the C10 route review's batch 3 questions (2026-09-26)

Date: 2026-09-26 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `e06baca0`).
Asked in one question set after batch 3c of the C10 route review; the answers are the options he
chose, verbatim. The questions gather batches 3a (invoice checkout and quote links), 3b (sign-in
entry points) and 3c (public pages, configuration and boards).

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "Split invoices: when a rent or trades invoice is split between several people, the system doesn't remember which card payment belongs to which share. Any approved payment on TaptPay's shared payment account (even $1 spent somewhere else) could mark a share as paid. How should I close this?" | **"Record each share's payment (Recommended)"** — "A small database change: each share remembers its own payment session, and only that session can pay it. Best if invoices need to reopen before the big payments rebuild (R3)." |
| 2 | "Send to Print has never worked: every send is too big and gets refused. Also, anyone on the internet can make the server email your print inbox any file, as often as they like. What should happen?" | **"Make it work, signed-in only (Recommended)"** — "Only signed-in businesses can send. Their business and board come from their sign-in. A bigger size limit on this one address, a few sends an hour, and a smaller PDF." |
| 3 | "Business details: after today's fix, anyone counting through business numbers can still collect each business's name, address, phone, GST number and NZBN. That includes sign-ups that were never confirmed. Receipts do need these details. What next?" | **"Send details with the sale (Recommended)"** — "Each customer page gets the business details along with the sale it is already showing, and the look-up-by-number address is removed. Also stop sending the owner's name and sign-in email with per-sale payment links, which no screen shows." |
| 4 | "Which of these clean-ups may I do?" (several allowed) | **All three:** "Remove unused sign-up/invoice addresses" — "POST /api/merchants/verify (confirms a sign-up with a new password, which your 23 Sept rule forbids), POST /api/checkout/pay (unused), and the old /business-details page with its email-status look-up (tells anyone which business numbers exist)."; "Remove 3 unused public look-ups" — "GET /api/tapt-stones/:id (lists every board of every business by number), GET /api/windcave/status, and GET /api/payments/digital-wallet/config. No screen or app uses them."; "Clearer reset-link message" — "The password-reset page says 'expired link' even when the check failed for some other reason. Make it say 'we couldn't check this link, please try again' instead." |

## Background

- 1: batch 3a (`567e1cfa`, `8fb4d341`; `SPLIT_INVOICE_SESSION_FINDING` and
  `SPLIT_INVOICE_SHARE_FINDING` in `server/route-review.ts`). The single-payment invoice branch was
  fixed the same day (`567e1cfa`, R1-T7's rule); a split invoice records none of the sessions opened
  for it. The other options were waiting for R3's payment attempts engine (production closed
  meanwhile) or turning off invoice splitting until R3.
- 2: batch 3c (`d0d5495b`). Measured in Chromium on the production build: the page sends 9,473,632
  bytes against the JSON parser's 102,400-byte limit, so every send is 413; the route is public with
  no limit and emails the print inbox what it is sent.
- 3: batch 3c. `ae82a31c` already removed the contact email (the sign-in address) and the account
  holder's name from `GET /api/merchants/:id`; this answer retires the read itself and trims the
  per-payment link's business details the same way.
- 4: batch 3a (`POST /api/checkout/pay`), batch 3b (`POST /api/merchants/verify`,
  `GET /api/merchants/:id/email-status` and its only caller, the old `/business-details` page; the
  reset page's message), batch 3c (the three public look-ups).

## What this authorizes

- 2, 3 and 4: code and tests on this branch, tests first. No deploy or push.
- 1: a migration and its code on this branch, tests first. Applying it to the development database
  is a separate data change that the owner approves or runs (the auto-mode safety check denies such
  writes, 2026-09-25 and 2026-09-26); production is untouched.
- Removing a route also removes its review entry and regenerates the route policy.

## Outcome (same day, local commits, not pushed)

- 4, the three unused public look-ups: **`6fd8eeea`**.
- 4, the unused sign-up and invoice routes and the old business-details page: **`8fac4b34`**. It
  also removed what only that page used: its save route (`PUT /api/merchants/:id/business-details`)
  and resending a confirmation link by account number (check-email's `?id=` links predate
  2026-09-23).
- 4, the reset page: **`9d8b9fab`** ("We couldn't check this link" / "Please try again.").
- 2, Send to Print: **`29f13ffd`** (signed in, business and board from the records, ≤ 3 MB read
  after sign-in, PDF ≤ 2 MB, 3 sends free then waits of 10 → 60 minutes; the page's send went from
  9,473,632 to 150,278 bytes).
- 3, business details with the sale: **`12aecb03`** (the by-number read removed; a board's page reads
  its board's name and logo; payment links drop the holder's name and contact email).
- 1, split-invoice sessions: **`1a77530e`**, migration **0030**. Found while building it and fixed
  with it: the checkout page kept its ready Apple Pay / Google Pay session after a split was chosen,
  so Apple Pay charged the whole invoice while showing a share. Still for R3: sessions opened at once
  can leave up to a cent per share unpaid.
- **Not done: applying 0030 to the development database** — the owner's to run (the auto-mode safety
  check denies such writes). Until then, in dev only, split invoice checkouts and rent GST copies
  fail. Production is closed, and 0030 must be applied there before this code is released.
