# Working notes — no-board rework (owner decision 2026-09-25, item 1)

Kept on disk as the work goes, so a restart or a usage stop loses nothing. Decision:
[2026-09-25-no-board-rework-402-and-batch-owner-answers](../../../decisions/2026-09-25-no-board-rework-402-and-batch-owner-answers.md).

## Where the previous session stopped (re-derived 2026-09-25 ~10:40 UTC)

- Session `38dc2593` ended on the **weekly usage limit** at 07:38:11 UTC. Its JSONL ends with
  "You've hit your weekly limit", then `turn_duration`. It was not a crash.
- Done and committed by it: decision record + 2a/2b (`e70dc724`), 2c (`da90d1a1`). Both commits
  are intact and contain what their messages say (checked with `git show --stat`).
- Item 1 (the rework) was at investigation only. Its last step was mapping the server routes that
  still build merchant-wide `/pay/<merchant>` links. **No rework code was written.**
- The owner never saw a reply to his 07:13 message. His item-1 text was partly a question ("what is
  the safest and securest way without compromising features or can we rework the system"), and it
  is still owed an answer in plain words.
- Tree at resume: only `.replit` modified (Replit's HMR port entry; not ours, leave it).

## Ground truth: who still uses the shared no-board address (read 2026-09-25)

### Server

| Where (server/routes.ts) | What it serves | Uses merchant-wide link? |
|---|---|---|
| `GET /nfc/:merchantId` (~500) | NFC tag redirect into `/pay/:merchantId` | yes, the standing no-board address |
| `GET /nfc/:merchantId/stone/:stoneId` (~488) | board NFC redirect | no, board address (keep) |
| `GET /api/merchants/:id/qr` (~1332) | standing merchant QR PNG, 30-day public cache, download filename | yes |
| `GET /api/merchants/:id/stone/:stoneId/qr` (~1377) | board QR | no (keep) |
| `GET /api/merchants/:id` (~1425) | public brand DTO + `paymentUrl`/`qrCodeUrl` of the standing address | yes |
| `GET /api/merchants/:id/profile` (~1454) | authenticated settings + standing `paymentUrl`/`qrCodeUrl` | yes |
| `GET /api/merchants/:id/active-transaction` (~2286) | no `stoneId`: anonymous "current no-board sale" (Option C fail-closed); `stoneId`: board | yes, no-stoneId branch |
| `POST /api/transactions` (~2389) | `linkMode` defaults to `"legacy"`; stoneless legacy create still allowed | yes, when stoneless + legacy |
| `POST /api/transactions/:id/split` (~2667) | PUBLIC, numeric id; refuses token sales; answers with standing URLs | yes |
| `POST /api/transactions/:id/cancel` (~2779) | merchant; answers with standing URLs | yes (cosmetic) |
| `POST /api/merchants/:id/tapt-stones` (~4140) | creates a board | board URLs (keep) |
| `POST /api/merchants/:id/test-payment-link` (~4942) | admin | yes |
| `POST /api/admin/merchants/signup` (~5631) | admin; stores `paymentUrl`/`qrCodeUrl` on the merchant row? (check) | yes |
| `GET /api/merchants/:id/events` (~5703) | no auth + no `stoneId` → `legacy-no-board` audience (the open feed) | yes |
| `broadcastToStone` / `dispatchLegacyNoBoard` (~287–340) | Option C async gate for the anonymous audience | the feed's plumbing |

Other stoneless creates that never needed the shared page: cash sale (completed at once),
tap-to-pay, `nfc-pay` (merchant's phone is the terminal). API v1 (`/api/v1/transactions`) already
requires per-payment (503 when the flag is off).

### Client

- `/pay/:merchantId` and `/pay/:merchantId/stone/:stoneId` both render `customer-payment.tsx`.
  No-board: polls `active-transaction` every 3 s + anonymous `EventSource` (`connectCustomer`),
  then redirects to numeric `/checkout/:id` or `/split/:id`.
- `split-payment.tsx:84` calls `connectCustomer(transaction.merchantId, transaction.taptStoneId)`:
  a numeric no-board split page **subscribes to the open feed**. Check `checkout.tsx`, `receipt`,
  `payment-result` for the same.
- **Staff terminals read their own current sale from the anonymous no-board poll**, with no
  Authorization header: `merchant-terminal.tsx:172`, `merchant-terminal-mobile.tsx:188`,
  `merchant-terminal-mobile-v2.tsx:145`, `demo-terminal.tsx:198`. Since `8666dafc` their no-board
  sales are per-payment, which that poll **excludes** (`paymentTokenHash != null`). So the poll can
  never return the terminal's own no-board sale; it only gets there via the merchant SSE
  (`connectMerchant`), which compression blocked until `3fac8ac8`. The phone terminal's 30 s
  fallback poll then overwrites the SSE value with `null`. **Check at runtime** whether "Payment
  Received" (chime, share-link close) fires for a no-board sale today; retiring the address must
  give the terminals an authenticated source either way.
- `checkout.tsx`, `receipt`, `payment-result` do not subscribe to any stream (grep: no `sseClient`).
- Which screens are live (mounted in `App.tsx`): phone terminal `merchant-terminal-mobile-v2.tsx`,
  `payment-stack.tsx`, `nfc-payment.tsx` (already a truthful "unavailable" page), `board-builder.tsx`,
  desktop `retail-terminal.tsx` (tracks sales from the authenticated transactions list, not
  `active-transaction`), `DesktopSettingsPage.tsx` (retail, property and trades), phone
  `settings.tsx`, admin `admin/MerchantDetail.tsx`, and the customer pages.
  **Not mounted anywhere (dead):** `merchant-terminal.tsx`, `merchant-terminal-mobile.tsx`,
  `demo-terminal.tsx` (declared lazily in `App.tsx` lines 41–42, never rendered),
  `admin-merchant.tsx`, `admin-merchant-broken.tsx` (only smoke tests import them). Two of the
  three terminals `8666dafc` changed are dead; only the phone v2 terminal is live.
- Live merchant screens that still hand out the retired address:
  - **Board builder** (`board-builder.tsx:339, 391, 653`): defaults to "Main Payment Link", the
    standing merchant QR, and "Send to Print" emails a print-ready PDF of it. This is the product's
    own path to the printed no-board stickers the owner confirmed are not in the field.
  - **"Customer Payment Page"** button on phone settings (`settings.tsx:1598`) and desktop settings
    (`DesktopSettingsPage.tsx:537–541, 649`, shown to retail, property and trades), plus the
    settings tutorial step "Share your payment page — Open the public customer page you can print or
    link so customers can pay you" (`tutorial-registry.ts:116`).
  - **Payment Stack "Copy Link"** (`payment-stack.tsx:79–88`): a no-board sale copies
    `/pay/<merchant>`. Since `8666dafc` that link can never show such a sale (per-payment sales are
    excluded from it), so the button is already broken for new no-board sales. A per-payment link
    cannot be rebuilt later: only its hash is stored (property/trades store their invoice tokens raw,
    `shared/schema.ts:1078, 1247, 1305`).
  - `qr-code-display.tsx` falls back to the standing merchant QR when given no `qrCodeUrl`/`stoneId`.
  - Admin `MerchantDetail.tsx:398–409` shows the merchant row's stored `payment_url`.
- The phone terminal also uses `activeTransaction` for its live **Cancel** and for **Tap to Pay**
  (`merchant-terminal-mobile-v2.tsx:310, 477`). From the anonymous poll that value can be a
  different stoneless sale (another terminal's), or `null` for its own per-payment sale.
- The 30 s poll clobbering also breaks the chime: if the poll runs while the customer is paying,
  `activeTransaction` becomes `null`; the SSE "completed" event then moves it `null → completed`,
  and the chime needs a non-null previous status (`:218–229`), so no chime and the share overlay
  stays open. Any payment taking over 30 s hits this.
- iOS app: `capacitor.config.ts` loads `https://taptpay.co.nz/app-login` (remote), so it runs the
  live web client; `ios/App/App/public/assets` is an unused leftover. No stale native client.
- **Noted for R1-T2 (C10), not this rework:** `POST /api/board-builder/submit` is public with no rate limit and emails an attacker-supplied PDF plus names to one fixed TaptPay inbox. It is not an open relay (the recipient is fixed), but it is an unauthenticated spam/phishing path into the owner's inbox.

## Design (proposed 2026-09-25; §21.1 review owed before release)

Principle, from the owner's answer: **with a board, the board's own page and stream, unchanged;
without a board, every sale has its own private link, like property and trades invoices.** Nothing
may still hand a customer the business-wide address, and nothing anonymous may read the business's
no-board sales.

Server, part 1 (the security core):
1. `GET /api/merchants/:id/events` with neither `Authorization` nor `stoneId` → **410**
   `NO_BOARD_PAGE_RETIRED` (a constant answer, no database). The `legacy-no-board` audience and all
   of Option C's plumbing go: `dispatchLegacyNoBoard`, `broadcastLegacyNoBoardAmbiguous`,
   `legacyNoBoardSubscriberCount`, `isLegacyNoBoardEligible`, `broadcast`'s `audiences` option.
   `broadcastToStone` becomes one synchronous broadcast. Merchant and board streams are unchanged.
2. `GET /api/merchants/:id/active-transaction`:
   - `Authorization` present → authenticate + merchant ownership, then the merchant's newest open
     sale (`merchant-any`, or `board` with `stoneId`), as `ownerTransactionDto` — the same shape the
     merchant stream already sends. This is the staff terminal's signed-in source.
   - `stoneId` only → the board branch, unchanged (rate limit, stone ownership, board scope).
   - neither → **410** `NO_BOARD_PAGE_RETIRED`.
3. `POST /api/transactions`: `linkMode` no longer defaults to `"legacy"`. No board ⇒ `per_payment`
   (so the flag's 503 applies); an explicit `"legacy"` with no board → **400**
   `NO_BOARD_SALE_NEEDS_OWN_LINK`, zero rows. Board sales unchanged.
4. Storage: remove the `legacy-no-board` scope and `getLegacyNoBoardActiveTransactionOrAmbiguous`
   (no caller left). `route-inventory.ts`'s `SUSPECTED_GAP_ROUTES` entry for the events route is
   resolved and removed.

Server, part 2 (the standing addresses):
5. `GET /api/merchants/:id/qr` → 410 JSON; `GET /nfc/:merchantId` → 410 HTML page with the
   customer notice. Board QR/NFC unchanged.
6. Standing `paymentUrl`/`qrCodeUrl` stop being generated or returned: profile (owner and member
   DTOs), admin DTO, `GET /api/merchants/:id` (generated, then dropped by the public DTO: dead),
   split and cancel responses (board address for a board sale, nothing otherwise), admin signup
   (computed, never stored: dead). `url-utils` link builders require a board.
7. `POST /api/merchants/:id/test-payment-link` (admin): its only caller is the dead
   `admin-merchant-broken.tsx`, and it reports the standing link "active" without testing anything
   → 410.

Client:
8. `/pay/:merchantId` (no board) → a notice with the business's logo: each sale has its own link,
   ask the business to show you the QR code for your sale. No polling, no stream. The board page
   (`/pay/:merchantId/stone/:stoneId`) is unchanged; Option C's ambiguity state goes.
9. `split-payment.tsx` opens a stream only for a board sale (a numeric no-board split relies on its
   existing 3 s poll).
10. Phone terminal (`merchant-terminal-mobile-v2.tsx`): `active-transaction` sent with the login's
    token. Fixes the terminal's view of its own no-board sale (chime, share overlay, Cancel, Tap to
    Pay).
11. `qr-code-display.tsx`: no standing fallback.
12. Payment Stack: "Copy Link" only for board sales (a no-board sale's private link was shown when it
    was made and cannot be rebuilt).
13. Board builder: no "Main Payment Link"; a board must be chosen, and with no boards the section
    says to create one first.
14. "Customer Payment Page" button (phone and desktop settings) and its tutorial step: removed.
    There is no business-wide customer page any more; a board's page is reached from its QR.
15. Admin merchant detail: the "Payment URL" row goes with the field.

Dead screens (not mounted) are left as they are and named in the evidence.

Choices made without the owner, to report (each is reversible):
- the customer notice's wording;
- removing the settings button and tutorial step (vs. pointing it somewhere else);
- a no-board sale's link cannot be re-shared after its QR is closed (a "new link" button that
  replaces the token would be new scope: owner question);
- a stale client asking for a shared no-board sale gets a 400 asking to reload.

## Progress log

- Baseline at `da90d1a1` (re-run, not trusted): `tsc` exit 0; server 83 suites / 1,466 tests, all
  pass (= the prior 1,459 + `e70dc724`'s 7).
- Part 1 tests written first: `server/__tests__/no-board-address-retired.test.ts` (flag on, as in
  production). **Red on `da90d1a1`: 9 of 13 fail, each for its stated reason** — the anonymous stream
  opens (200); anonymous `active-transaction` answers 200 with the sale; the signed-in terminal gets
  the shared sale (id 1) instead of its own private-link sale, or `null`; another business's login
  and a garbage token both get 200; a no-board create with no `linkMode` answers
  `https://harness.test/pay/1`; an explicit shared no-board create is accepted (200). The 4 guards
  pass (merchant stream gets a private-link sale's update and a board stream does not; board stream
  gets its sale; board page read; board create).
- Part 1 server **committed `09df766f`**: green 15/15; flag-off file red on `da90d1a1` too (10/15
  red overall); a garbage token is 403 "Invalid or expired token" (authenticateToken's answer on
  every route; §5.4 would say 401, out of scope). Mutations 11/11 (routes 9, broker 2). `tsc`
  clean; server 83/1,463 (−17 Option C, −1 events rate limit, +15 new). Route policy regenerated:
  only `active-transaction` (public → merchant-user) and `events` (unauthenticated-suspect →
  merchant-user) changed; 0 unclassified, 0 suspected.
- Customer page: `customer-payment-flow.test.tsx` rewritten (4). **Red on the old page: the 2
  no-board tests** (no notice; it polls and subscribes). Green after the split into
  `NoBoardNotice` / `BoardPayment`.
- **Found while reading the phone terminal (live, `merchant-terminal-mobile-v2.tsx`):**
  - the bottom bar's "share" item opens `SharePayment` in live mode too
    (`RetailTerminalViewCore.jsx:50`, `SUBBAR_ROUTE[2]`). With no board it shares `livePayLink` =
    `/pay/<merchant>` (copy, SMS, email) and its expand shows the standing merchant QR
    (`qrElement` = `QRCodeDisplay merchantId` with no board). The 8666dafc overlay shows the right
    per-sale link, but once closed the share screen hands out the business-wide one.
  - `SharePayment`/`QRModal` fall back to `https://pay.taptpay.com/p/demo-abc123` when given no
    link — harmless in the landing demo, wrong in live mode.
  - pre-existing, out of scope, to report: "download QR" saves `RETAIL_QR_SVG`, a decorative,
    unscannable picture (since `d325bebd`, 2026-08-11), for board and no-board alike; and
    `CashSuccess`'s "copy receipt link" shares the demo URL in live mode.
- Part 1 client **committed `f5ef0d11`**: customer page, split page, phone terminal (signed-in read;
  share screen + QR pop-up carry the sale's own link), shared view (no demo link in live use),
  QRCodeDisplay. Red first per file (2+1+3+1+1), mutations 11/11, `tsc` clean, client 89/773.
- **Design item 14 withdrawn — owner's standing instruction.** The "Customer Payment Page" button is
  exempt by name in `docs/PLAN-2026-08-30-settings-apple-redesign.md` §2 ("Byte-for-byte, same
  position, same markup, same behavior"), and `settings.tsx:1593` says "unchanged, per Oliver's
  instruction". So the button (phone and desktop) and its tutorial step stay as they are; they now
  open the no-board notice. **Owner question:** remove it, point it at a board's page, or leave it.
- Part 2 server (standing addresses): tests `no-board-standing-links-retired.test.ts` (9). **Red on
  `f5ef0d11`: 7 of 9 for their reasons** (QR image 200; NFC 200 redirect; profile carries
  `https://harness.test/pay/1`; admin view carries `paymentUrl` (null); cancelled private-link sale
  gets `/pay/1`; split board sale gets `/pay/1` instead of its board's; test-payment-link 200). 2
  board guards green. `generatePaymentUrl`/`generateQrCodeUrl` now require a board, so any caller
  building the business-wide address is a type error: tsc listed exactly the 15 sites in the map.
  Two tombstone routes allowlisted in `PUBLIC_PATH_ALLOWLIST`; regeneration: 0 unclassified, 0
  suspected, no principal changed.
- **Also found, pre-existing, fixed separately:** the phone Payment Stack (`payment-stack.tsx:40–57`)
  reads `/api/merchants/:id/transactions` and `/tapt-stones` with no Authorization header;
  `authenticateToken` reads only the header, so both 401. A fresh visit shows an empty stack; one
  reached from the terminal shows the terminal's cached list and never refreshes it (the 5 s refetch
  errors, react-query keeps the stale data). Since `c7220cea` (2026-05-12).
- Part 2 server **committed `a703847b`** (mutations 9/9; server 84/1,472). Payment Stack sign-in
  **committed `a2634ef3`** (red 2/2, mutations 2/2). Part 3 merchant screens **committed
  `5c2cdb27`** (red 1+2+1; mutations 7/7 after one non-compiling breakage was rewritten; client
  92/779).
- Real Chromium on production builds: 21/21 at `5c2cdb27`, 9/21 at `da90d1a1`; script committed as
  `scripts/verify-no-board-rework-browser.mjs`; logs and screenshots in
  `no-board-rework-2026-09-25/`.
- Finished record: [R1-no-board-rework-2026-09-25](R1-no-board-rework-2026-09-25.md).
