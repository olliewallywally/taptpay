# No-board payments work like the other verticals: the business-wide address is retired (2026-09-25)

Owner decision: [2026-09-25-no-board-rework-402-and-batch-owner-answers](../../../decisions/2026-09-25-no-board-rework-402-and-batch-owner-answers.md),
item 1. Working notes (the investigation, red runs and findings as they happened):
[WORKING-2026-09-25-no-board-rework](WORKING-2026-09-25-no-board-rework.md).

## In plain words

- **Before.** A business without a payment board had one shared web address for all its
  customers, `/pay/<business number>`, printed as a QR code or written to an NFC tag. A customer
  scanned it and waited; the page then took them to "the business's current sale". To make that
  work, the address was public: anyone who knew or guessed a business's number could watch every
  board-less sale it rang up (item, price, status), live. That was gap 12. The September fixes
  narrowed it, but could not close it while the shared address existed.
- **What you asked for.** "a with payment board system and without which basically works like the
  other verticals."
- **Now.**
  - **With a board:** nothing changed. The board's own QR code, NFC tag and page work as before.
  - **Without a board:** every sale gets its own private link and QR code, as a property or trades
    invoice does. The phone terminal shows it when the sale is made, and its share screen offers
    it until the sale is paid or cancelled.
  - **The shared address is switched off:**
    - its live feed and its "current sale" read are refused;
    - its QR image and NFC tag address answer "gone";
    - a customer who opens it sees "Ask for your payment link — Each sale now has its own payment
      link. Ask the business to show you the QR code for your sale.";
    - no screen or response hands the address out any more.
- **Nothing is deployed or pushed.** The work is five local commits, with its tests and this record.

## Ground truth before the change (read 2026-09-25, not taken from older records)

- Server: 15 places built the business-wide address (`server/routes.ts`: the NFC tag route, the
  business QR route, the public and settings merchant reads, `active-transaction`, sale create,
  split, cancel, admin link check, admin signup; plus the event stream's anonymous branch).
  `POST /api/transactions` still defaulted `linkMode` to `"legacy"`.
- The **live phone terminal read its own current sale from the anonymous no-board poll** (no
  Authorization header). Since `8666dafc` its no-board sales carry their own link, which that poll
  excludes, so the poll could never return them: its 30 s refetch set the current sale to `null`
  mid-payment. The "Payment Received" chime needs a non-null previous status, so any payment
  taking over 30 s missed it and left the link pop-up open.
- The **phone terminal's share screen** (the bottom bar's "share") and its QR pop-up were handed
  `/pay/<business>` and the business QR whenever no board was chosen. After the per-sale pop-up
  closed, copy/SMS/email sent a link that could not reach the sale.
- The **board builder** ("Send to Print" emails a print-ready design to the print team) defaulted
  to "Main Payment Link": the business QR, i.e. the printed no-board sticker.
- The **Payment Stack's** "Copy Link" gave board-less sales `/pay/<business>`.
- The **"Customer Payment Page"** button (phone and desktop settings) and its tutorial step open
  `/pay/<business>`. They are exempt by name from the settings redesign by the owner's instruction
  (`docs/PLAN-2026-08-30-settings-apple-redesign.md` §2, "Byte-for-byte, same position, same
  markup, same behavior"; `settings.tsx:1593`), so they were left exactly as they are: see the
  owner questions.
- Not mounted anywhere, so left as they are: `merchant-terminal.tsx`, `merchant-terminal-mobile.tsx`,
  `demo-terminal.tsx` (declared in `App.tsx`, never rendered), `admin-merchant.tsx`,
  `admin-merchant-broken.tsx`. Two of the three terminals `8666dafc` changed are among them.
- The iOS app loads the live site (`capacitor.config.ts` `server.url`), so no old copy of the
  terminal runs on phones.

## What changed, by commit

| Commit | What |
|---|---|
| `09df766f` | Server: the anonymous no-board feed and "current sale" read answer **410 `NO_BOARD_ADDRESS_RETIRED`**; the `legacy-no-board` audience and Option C's ambiguity gate are gone. The terminal's read is **signed in** (the business's newest open sale, any board or none). A sale without a board is always per-payment; asking for a shared one is **400 `NO_BOARD_SALE_NEEDS_OWN_LINK`**. |
| `f5ef0d11` | Clients: the no-board customer notice; board pages unchanged; split page listens only for a board's sale; phone terminal reads signed in and its share screen/QR pop-up carry the sale's own link; shared view never offers the demo link in live use; `QRCodeDisplay` has no business-wide fallback. |
| `a2634ef3` | Found on the way: the phone **Payment Stack** could not load its sales (see below). |
| `a703847b` | Server: the business QR image and NFC tag answer 410 (the tag with a notice page); no response carries the address; the admin "test payment link" check answers 410; link helpers require a board, so building the address is a type error. |
| `5c2cdb27` | Merchant screens: Payment Stack "Copy Link" only for board sales; board builder prints a board's QR (no "Main Payment Link"; with no boards it says to add one and offers no print); admin merchant page loses its "Payment URL" row. |

## Proof

Each piece had its tests written first and run against the commit before it (for part 1 on the
server, in a separate checkout of `da90d1a1`), failing for the stated reason; then each new piece
of code was broken on purpose and a test had to fail.

| Piece | Red first | Mutations |
|---|---|---|
| Server part 1 (`no-board-address-retired`, `no-board-sale-flag-off`) | 10 of 15 (5 guards green) | 11/11 |
| Clients part 1 (customer, split, phone, view, QR) | 2 + 1 + 3 + 1 + 1 | 11/11 |
| Payment Stack sign-in | 2 of 2 | 2/2 |
| Server part 2 (`no-board-standing-links-retired`) | 7 of 9 (2 guards green) | 9/9 |
| Merchant screens part 3 (stack, builder, admin) | 1 + 2 + 1 | 7/7 (stack 2, builder 5; one builder breakage first written so it did not compile, rewritten so it does) |

Totals: **mutations 40/40**. At `5c2cdb27`: `tsc` clean; server 84 suites / 1,472 tests (was
83 / 1,466 at `da90d1a1`: −17 Option C, −1 events rate limit, +24 new); client 92 suites / 779
tests (was 87 / 763: 17 new in other files, and the customer page's file went from 5 Option C
tests to 4 new ones).
Route policy regenerated twice: 223 registrations, 0 unclassified, **0 suspected gaps** (was 1:
the events route); no route's principal changed except `events` (unauthenticated-suspect →
merchant-user) and `active-transaction` (public → merchant-user, with its public board branch
still visible in its markers).

**Real browser** (Chromium, production build via `vite preview`, API mocked by the shared retail
fixtures; `scripts/verify-no-board-rework-browser.mjs`):

- on `5c2cdb27`: **21/21**
  ([log](no-board-rework-2026-09-25/browser-21-of-21.txt));
- on `da90d1a1`: **9/21**, the 12 failures each for its reason
  ([log](no-board-rework-2026-09-25/browser-before-da90d1a1-9-of-21.txt)). The customer page
  read the sale and opened the feed, with no notice. The terminal's read carried no Authorization.
  The share screen offered "copy link" with no link of the sale's own.
- Checked: the customer notice at 320 and 390 px (no sale read, no feed, no sideways scroll); a
  board's page still waits on and reads its board's sale; the phone terminal (320, 390) reads its
  current sale signed in, and with no board and no sale its share screen says "no payment link to
  share yet", with no copy button, no demo link and no business-wide address. The probe blocks every
  outside host (fonts, analytics, the Replit banner) and mocks the board's stream, so those
  requests' refusals are filtered as its own.
- Screenshots: [customer notice 390](no-board-rework-2026-09-25/customer-notice-390.png),
  [320](no-board-rework-2026-09-25/customer-notice-320.png),
  [before](no-board-rework-2026-09-25/customer-page-before-390.png);
  [phone share screen](no-board-rework-2026-09-25/terminal-share-no-link-390.png),
  [before](no-board-rework-2026-09-25/terminal-share-before-390.png).
- Not checked in a browser: the NFC tag page (server-rendered; covered by the server tests) and a
  real sale made through the keypad (the create path and the kept link are covered by the page
  tests).

## Found on the way

- **Fixed (`a2634ef3`):** the phone Payment Stack read `/api/merchants/:id/transactions` and
  `/tapt-stones` with no Authorization header since `c7220cea` (2026-05-12). Both answered 401: a
  fresh visit showed an empty stack; one reached from the terminal showed the terminal's cached
  list and never refreshed it.
- **Fixed with the rework:** the phone terminal's missed "Payment Received" (above).
- **Left as found, for the owner:**
  - the share screen's "download QR" saves `RETAIL_QR_SVG`, a decorative picture that cannot be
    scanned (since `d325bebd`, 2026-08-11), for board and board-less sales alike;
  - the cash-sale success screen's "copy receipt link" copies the demo address
    `https://pay.taptpay.com/p/demo-abc123` in live use;
  - `POST /api/board-builder/submit` is public with no rate limit and emails a supplied PDF to the
    owner's inbox (fixed recipient, so not an open relay): for R1-T2's route review (C10);
  - `authenticateToken` answers 403 "Invalid or expired token" for a token that doesn't verify, on
    every signed-in route; plan §5.4 would say 401 (R1-T4's area).

## Owner questions

1. **The "Customer Payment Page" button** (phone and desktop settings, shown to retail, property
   and trades) and its tutorial step ("Share your payment page — Open the public customer page you
   can print or link so customers can pay you") are yours by instruction, so they are unchanged.
   They now open the "Ask for your payment link" notice. Remove them, point them at a board's page,
   or leave them?
2. **Re-sharing a board-less sale's link later.** The link is shown when the sale is made and kept
   on that phone until the sale is paid or cancelled. After a reload it can't be shown again (only
   its fingerprint is stored, so nobody can rebuild it). Want a "new link" button that replaces it?
3. The two pre-existing faults above (download QR, cash receipt link): fix them now?

## Release

- Production still runs the old terminals, which make shared no-board sales. Release when none is
  pending (a count-only check once production is reopened), or accept that a customer waiting on
  the old shared page at that moment is shown the notice. A customer already on a numbered
  checkout (`/checkout/<id>`) is unaffected: those pages remain for board sales.
- `FEATURE_NEW_RETAIL_PAYMENTS` must be on (the owner attested it is; no agent has verified it).
  With it off, a board-less sale is refused (503), just as property and trades bill nothing with
  invoice payments off.
- The merchant rows' stored `payment_url`/`qr_code_url` columns still hold the old address; nothing
  reads them any more. Dropping them would be a migration: not done, not needed.

## Handoff (plan §21.2)

```text
Phase / release:         R1 owner-directed rework (gap 12 closed by retirement, Option A); not
                         merged, not deployed
Exact branch and commit: remediation/r1-continuation-20260907, da90d1a1..5c2cdb27 (local)
Scope completed:         the business-wide no-board address retired end to end (feed, current-sale
                         read, create default, QR image, NFC tag, every response and live screen
                         that handed it out); board flow unchanged
Files changed:           see the five commits
Migrations:              none
Preflight queries:       none (production's pending shared no-board sales: count-only check owed
                         before release, once production is reopened)
Commands run and results: tsc clean; server 84/1,472; client 92/779; red first per piece
                         (above); mutations 40/40; route policy 0 unclassified, 0 suspected;
                         real Chromium 21/21 (9/21 on da90d1a1)
Negative/no-side-effect: refused creates make no row and no broadcast; tombstones read nothing;
                         anonymous no-board stream subscribes nothing
Provider/UAT activity:   none
Device/browser evidence: real Chromium, production build, 320 and 390 px (above)
Security/privacy review: gap 12's feed, read and residual are gone, not narrowed: no anonymous
                         path returns or streams a board-less sale; route inventory 0 suspected
External actions:        none
Feature flags and payment mode after deploy: FEATURE_NEW_RETAIL_PAYMENTS must be on for
                         board-less sales (owner-attested, unverified)
In-flight operations:    old shared no-board sales pending at release lose their waiting page
Known warnings or deferred items: the three owner questions; the found-on-the-way items above
Rollback commit and constraints: revert the five commits together; a partial revert leaves
                         clients reading a retired address
Approvals:               owner decision 2026-09-25 (item 1); plan §21.1 review owed
Stop conditions checked: no money initiation enabled; no migration; nothing pushed
Next phase prerequisites: this review; the owner's answers; then R1-T2's remaining parts (C10)
```

## Independent review — brief

**Range:** `da90d1a1..5c2cdb27` (five commits), local only.

> You are the independent correctness and security reviewer for TaptPay, a payment-terminal SaaS.
> Review `da90d1a1..5c2cdb27` on branch `remediation/r1-continuation-20260907`. The owner decided
> (docs/decisions/2026-09-25-no-board-rework-402-and-batch-owner-answers.md, item 1) that with a
> payment board the board's own page and stream stay unchanged, and without one every sale has
> its own private link (`/pay/t/<token>`), the way property and trades bill. These commits retire
> the business-wide no-board address `/pay/:merchantId`: its anonymous live feed, its anonymous
> "current sale" read, the `"legacy"` default for board-less sales, its QR image, its NFC tag,
> and every response and live screen that handed it out. They also fix the phone Payment Stack's
> unsigned reads. Start from docs/evidence/remediation-v2-2/r1/R1-no-board-rework-2026-09-25.md;
> treat it as claims and re-derive everything from the code. Attack especially:
> - Is there any anonymous path left that returns or streams a board-less sale, or its item,
>   price or status? Include `GET /api/transactions/:id`, the numeric checkout, split and receipt
>   routes (kept for board sales), `/api/merchants/:id` and every `broadcastToStone` caller.
> - The signed-in `active-transaction` branch: authentication, tenant ownership (owner, teammate,
>   disabled teammate, admin), what it returns for board, private-link and old shared sales.
> - `POST /api/transactions`: can any request still create a shared board-less sale? What happens
>   with the flag off, an old client that omits `linkMode`, or a board that is inactive or someone
>   else's?
> - Is any business-wide address still built anywhere (`generatePaymentUrl` now needs a board)? Do
>   the 410 tombstones read nothing and leak nothing?
> - The phone terminal: is the kept sale link ever shown for a different sale, kept after the sale
>   is paid or cancelled, or lost while it is still needed? Does the share screen ever offer the
>   demo link in live use?
> - The old Option C tests were deleted and storage's no-board lookup removed: is any guarantee
>   they held now untested?
> - Release: what happens to a shared no-board sale pending at deploy, and to a customer already
>   on its numbered checkout?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1 and end with Approve / Do not
> approve naming the commit range.

Reproduce:
- `npx tsc`;
- `npx jest --selectProjects server`, then `npx jest --selectProjects client`;
- `node --import tsx scripts/generate-route-policy.ts` (expect 0 unclassified, 0 suspected);
- build and preview the client, then `node scripts/verify-no-board-rework-browser.mjs` on each end
  of the range (it exits 1 on `da90d1a1`, 0 on `5c2cdb27`).
