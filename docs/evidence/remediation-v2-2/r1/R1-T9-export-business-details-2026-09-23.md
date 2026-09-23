# Exports and the business details — found during R1-T9 (2026-09-23)

Date: 2026-09-23 UTC. Branch: `remediation/r1-continuation-20260907`. Fix: `707cff2f`.
Found while making the analytics screens' exports wait for the data they are built from
(R1-T9, v2.2 §8.8; full plan PDF p. 29).

## In plain words

Every report and export prints the business's name and GST number at the top, and works GST out
the way the business chose (GST included in the price, or added on top). One helper fetches those
details. It only worked for merchants who signed in with Google. For everyone who signed in with
an email and password it never fetched them, so their exports said "TaptPay Merchant", showed no
GST number, and worked GST out the default way. It now works for every sign-in.

## What was wrong

- `useMerchantProfile` (`client/src/lib/merchant.ts`) took the merchant from a `merchantId`
  storage key. Since the helper was written (`188a6608`, 2026-07-11) only Google sign-in has
  written that key (`client/src/pages/login.tsx`); password sign-in stores `authToken` and `user`
  only. With no key the query is disabled: no request, no details.
- Built on it: desktop property analytics' Export, desktop trades analytics' Export, and the phone
  Reports buttons (`PropertyReportsButton`, `TradesReportsButton`, `RetailReportsButton`).
  Desktop retail analytics has its own profile query, keyed by the session, and was not affected.
- In the documents: the header reads "TaptPay Merchant", with no GST number or NZBN. Trades:
  `calcGSTByMode(…, undefined)` works GST out inclusive, whatever the business's setting.
  Property: the annual income statement shows GST only when `gstRegistered`, which was missing.
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

Same invoices ($10,916.00), GST $213.57 apart. The fix makes the export follow the business's own
setting, as the report code intends. Whether the exclusive-mode summary is itself right was not
checked: it adds GST on top of the invoice amounts, which overstates GST if those amounts already
include it (a quote's total does). That belongs with the accountant review the plan already
requires before accounting output is relied on (X-H2).

## For the owner

Exports downloaded since 2026-07-11 by merchants who signed in with a password carried
"TaptPay Merchant" and no GST number. For GST-exclusive trades businesses their GST figures
were worked out inclusive, and GST-registered landlords' annual income statements had no GST
line. The site is private now (2026-09-21), so nothing new goes out. Whether anyone relied on
an earlier export, for example for a GST return, only the owner can find out.
