# Exports and the business details — found during R1-T9 (2026-09-23)

Date: 2026-09-23 UTC. Branch: `remediation/r1-continuation-20260907`. Fix: `707cff2f`.
Found while making the analytics screens' exports wait for the data they are built from
(R1-T9, v2.2 §8.8; full plan PDF p. 29).

## In plain words

Every report and export prints the business's name and GST number at the top, and shows GST only
if the business is GST registered. One helper fetches those details. It only worked for merchants
who signed in with Google. For everyone who signed in with an email and password it never fetched
them, so their exports said "TaptPay Merchant" and showed no GST number. It now works for every
sign-in. (The GST itself was then found wrong in one case and fixed: see the correction below.)

## What was wrong

- `useMerchantProfile` (`client/src/lib/merchant.ts`) took the merchant from a `merchantId`
  storage key. Since the helper was written (`188a6608`, 2026-07-11) only Google sign-in has
  written that key (`client/src/pages/login.tsx`); password sign-in stores `authToken` and `user`
  only. With no key the query is disabled: no request, no details.
- Built on it: desktop property analytics' Export, desktop trades analytics' Export, and the phone
  Reports buttons (`PropertyReportsButton`, `TradesReportsButton`, `RetailReportsButton`).
  Desktop retail analytics has its own profile query, keyed by the session, and was not affected.
- In the documents: the header reads "TaptPay Merchant", with no GST number or NZBN. Property:
  the annual income statement shows GST only when `gstRegistered`, which was missing. (This note
  first also listed trades GST "worked out inclusive whatever the setting" as a fault. That was
  wrong: the inclusive rule is the right one; see the correction below.)
- Also: its cache entry was keyed by the string id from storage, so it never shared the entry the
  pages key by the numeric id (its comment said it did); and signed out, with a key left from an
  earlier Google sign-in, it still sent a request.
- Why no check caught it: every screenshot and verification harness writes the `merchantId` key
  itself (`scripts/desktop-shots/retail-fixtures.mjs`, `trades-fixtures.mjs`,
  `client/src/mocks/mock-api.ts`), which is exactly what a real password sign-in does not do.
- Not a leak: a key left from another merchant's sign-in asks for that merchant's profile, and
  the server refuses it (`GET /api/merchants/:id/profile` checks ownership, 403).

## The fix — `707cff2f`

The helper takes the merchant from the session token (`getCurrentMerchantId()`), as every other
page does. Its cache entry is now the one those pages share, and it asks for nothing when signed
out.

## Proof

**Tests first.** `client/src/lib/merchant.test.tsx`, 4 of 4 fail on the unchanged helper, each
for its reason: after a password sign-in nothing loads; with a key left from an earlier sign-in it
asks for that merchant (and is refused); the cache entry is not shared; signed out it still asks.
On the fix 4/4. **Mutations** 3/3 caught (the storage key again, a string cache key, asking while
signed out). **Suites** `tsc` clean; client 78 suites / 671 tests.

**In a browser.** `scripts/verify-export-business-details.mjs` opens desktop trades analytics with
storage as a password sign-in leaves it (a session token, no `merchantId` key), for a business set
to GST exclusive, and downloads an Invoice Summary PDF from a build of `c3dab4a8` and a build with
the fix, then reads each PDF's text:

| | Build of `c3dab4a8` ([PDF](r1-t9-rollout-2026-09-23/export-business-details-before.pdf)) | With `707cff2f` ([PDF](r1-t9-rollout-2026-09-23/export-business-details-after.pdf)) |
|---|---|---|
| Header | TaptPay Merchant | Wallace Electrical, GST 123-456-789 |
| GST summary | inclusive, 15%: excl. $9,492.17 · GST $1,423.83 · incl. $10,916.00 | exclusive, 15%: excl. $10,916.00 · GST $1,637.40 · incl. $12,553.40 |

Same invoices ($10,916.00), GST $213.57 apart. **The right-hand GST figures are wrong** (corrected
by `5132caa9`, below): the name and GST number are right, but the exclusive-mode summary adds 15%
on top of amounts that already include GST.

## Correction — `5132caa9`: GST is the 15% inside what was paid

NZ GST is 15% of the price before GST. Every trades invoice amount is what the customer pays, GST
included: a quote in "exclusive" mode adds the 15% to its lines before its total is invoiced
(`shared/trades-gst.ts` `computeQuoteTotals`), the checkout charges an invoice's amount as it is
(`chargeCents = invoice.amountCents`, `server/routes.ts`), and the server's own GST receipt to the
customer shows GST as `total − total / 1.15` (`server/trades-delivery.ts`). So the GST in what was
invoiced is always `total − total / 1.15`: on $10,916.00 that is **$1,423.83**, 15% of $9,492.17.
The quoting mode changes how a quote's lines are priced, not the GST inside an amount paid.

The trades Invoice Summary's "exclusive" branch (`calcGSTByMode`, there since the reports were
added on 2026-07-10/11) instead added 15% on top: GST $1,637.40, "incl." $12,553.40, more than the
customers paid. It also showed a GST summary for businesses that are not GST registered, as did
the retail Sales Summary ("GST (15%) incl."). `707cff2f` made the business details load after a
password sign-in, and so spread the wrong branch to those merchants (whose exports had used the
right rule only because their details never loaded); it was never released (site private,
nothing pushed).

Fixed: one rule, GST = `total − total / 1.15`, shown only for a GST-registered business, in the
trades Invoice Summary ("GST summary (15%)") and the retail Sales Summary. The helpers that added
GST on top (`calcGSTExclusive`, `calcGSTByMode`) are removed. Tests first
(`client/src/lib/report-pdf/report-gst.test.tsx`, 9 of 10 red: $1,637.40 for $1,423.83, the mode
in the title, GST for unregistered businesses), mutations 5/5, client 82 suites / 729 tests. In a
browser (`verify-export-business-details.mjs`, storage as a password sign-in leaves it):

| Business | Build of `cf408c7e` | With `5132caa9` |
|---|---|---|
| GST registered, quotes exclusive | "GST summary (exclusive, 15%)": $10,916.00 · $1,637.40 · $12,553.40 | "GST summary (15%)": $9,492.17 · $1,423.83 · $10,916.00 |
| Not GST registered | the same GST summary | no GST summary |

## For the owner

What exports downloaded since the reports were added (2026-07-10/11) got wrong:

- Merchants who signed in with a password: "TaptPay Merchant" and no GST number in every export's
  header, and no GST line in a GST-registered landlord's annual income statement.
- Trades businesses quoting GST exclusive whose business details loaded (Google sign-ins): the
  Invoice Summary overstated GST, 15% of the total instead of the 15% inside it ($1,637.40
  instead of $1,423.83 on $10,916.00).
- Businesses not GST registered: a GST figure in the trades Invoice Summary and the retail Sales
  Summary, although they charge no GST.

The site is private now (2026-09-21), so nothing new goes out. Whether anyone relied on an earlier
export, for example for a GST return, only the owner can find out.
