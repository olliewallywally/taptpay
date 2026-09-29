# Owner answer — the C10 route review's batch 6b question (2026-09-27)

Date: 2026-09-27 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `cd486341`,
with batch 6b's plan in the working notes). Asked during batch 6b of the C10 route review (the
business's sales, payments, refunds and reports).

## The exchange

1. Asked: "Eleven more server addresses have no screen that uses them: the \"split on/off\" switch for
   a sale (the terminal now sets splitting when it makes the sale), the business analytics and
   revenue-chart reads, \"NFC pay\" (its page already says tap-to-pay isn't available, and the sales
   it opens can never finish), three old Apple Pay / Google Pay placeholders, reading one refund by
   number, the two old export downloads (analytics and CSV — only a page nothing links to used
   them), and the old \"clear all sales\" placeholder that already answers \"retired\". Retire all
   eleven?"
2. His reply, verbatim: **"but do those functions work? we need all of those functions dont we"**
3. Answered (checked in the code first): every function keeps working through the addresses that
   stay; none of the eleven is how the app does it today. Five do not work at all: NFC pay (its
   sales can never finish; the finishing step was removed in R0-T5 for faking payments; real
   tap-to-pay is a separate address, kept, off until the iPhone hardware work), the three wallet
   placeholders (they only answer "unavailable"; customers pay with Apple Pay and Google Pay on the
   checkout page through its own addresses, kept), and "clear all sales" (disabled on purpose; sales
   are never bulk-deleted). Six work but nothing uses them: split on/off (both terminals set
   splitting when they make the sale), the analytics and revenue-chart reads (the analytics screens
   work from the sales list), the two old downloads (the phone's Transactions page makes its CSV and
   Xero CSV itself; the PDF report stays), and one refund by number (the screens list refunds per
   sale and per business, both kept).
4. Asked again: "Knowing that every feature keeps working through the addresses that stay, should I
   retire the eleven unused ones?"
5. Answer: **"Retire all eleven (Recommended)"** — "Nothing on any screen changes; splitting,
   analytics, CSV/Xero/PDF downloads, refunds, customer Apple/Google Pay and cash sales all keep
   working." (The other options were "Keep the five that work" and "Keep them all".)

## The eleven

`PATCH /api/transactions/:id/split-enabled`, `GET /api/merchants/:id/analytics`,
`GET /api/merchants/:id/revenue-over-time`, `POST /api/merchants/:merchantId/nfc-pay`,
`POST /api/payments/apple-pay/validate`, `POST /api/payments/apple-pay/process`,
`POST /api/payments/google-pay/process`, `GET /api/refunds/:refundId`,
`GET /api/merchants/:id/analytics/export`, `GET /api/merchants/:id/export/csv`,
`POST /api/merchants/:id/clear-transactions`.

Callers were checked in the live web app, which the iPhone app loads (`capacitor.config.ts`
`server.url`); the only callers were pages mounted nowhere (`merchant-terminal*.tsx`,
`admin-merchant*.tsx`, `exports.tsx`, the two wallet-button components).

## What this authorizes

Code and tests on this branch, tests first: the eleven routes removed, their pending review entries
with them, the older tests of them replaced, the route policy regenerated. No deploy or push. The
pages mounted nowhere that called them are left as they were.

## Outcome (same day, local commits, not pushed)

- **`7151d094`**: the eleven routes removed (189 remain), their pending entries with them; thirteen
  older tests of them reworked. Tests first (red 22 of 23; the routes that stay beside them a green
  guard). No screen changed.
- The ten routes that stay from batch 6b are reviewed in **`cb24fbd8`**.
