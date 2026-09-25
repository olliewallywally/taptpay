# Working notes — the share page's sale dropdown and the two fixes (2026-09-25, after 7051e25e)

Decision: [2026-09-25-share-dropdown-and-fixes-owner-answers](../../../decisions/2026-09-25-share-dropdown-and-fixes-owner-answers.md).
Kept on disk as the work goes.

## Ground truth (read at 7051e25e)

- The live phone terminal (`merchant-terminal-mobile-v2.tsx`) is the only live mount of
  `RetailTerminalViewCore`. `/smart-terminal` mounts it with no props (demo mode).
- Live `liveState` is `{ items: [], pending: null, sent }` (`:422`), so the share screen's hero
  always shows "$0.00 payment" in live use, and the cash-success screen "$0.00 cash payment".
- In live use, sending does not open the share screen (`handleSend`, only demo does); the share
  screen is reached from the bar (`SUBBAR_ROUTE[2]`). The ✕ on it does not cancel anything live
  (`liveState.pending` is always null).
- **No live screen passes `onCashSale`** to the view (grep: only the view, its types and the demo
  wrapper name it). `handleCashCommit` calls `onCashSale?.(...)` without awaiting and shows
  "success" regardless: a phone cash sale is never recorded. The route exists
  (`POST /api/transactions/cash-sale`, owner-only, billing-gated, returns `{ transaction }`).
- "download QR" (`handleBrowserShare`) saves `RETAIL_QR_SVG`, a decorative picture.
- `qrcode` 1.5.4 has a browser build and is already used client-side (`info.tsx` dynamic import).
- The per-sale QR image (`/api/pay/t/:token/qr`) and a board's are cyan on transparent, shown on
  `QRCodeDisplay`'s dark card; the September pop-up showed exactly that.
- Boards: at most 10 at a time per business (`TAPT_STONE_LIMIT`). A board's QR encodes
  `/pay/<business>/stone/<board id>`; ids are never reused, so it is fixed until deleted.

## Design

- View (`RetailTerminalViewCore.jsx`), live use only (the landing demo is unchanged):
  - new prop `liveShareSales` (newest first: `{ id, name, amount, payLink, qrElement }`) replaces
    `livePayLink`/`qrElement`;
  - the share page's navy panel starts with a dropdown ("sale to share"); the hero shows the
    chosen sale's amount and name; the QR card shows its real QR; expand, copy, download, SMS and
    email use its link;
  - choice: a newly sent sale (an id never seen before at the top) becomes the chosen one; a hand
    choice stays until then; if the chosen sale leaves the list (paid/cancelled), the latest;
  - after a live send succeeds (not Tap to Pay) the terminal opens the share page; a failed send
    stays, draft kept (as before);
  - cash: `handleCashCommit` awaits `onCashSale` in live use and opens "success" only when it
    resolves; new prop `liveReceipt` (`{ name, amount, url }`) gives the success screen the
    recorded sale and its receipt link; with none, no share buttons (never the demo link).
- Page (`merchant-terminal-mobile-v2.tsx`):
  - builds `liveShareSales` from the open sales it can share: board sales (their board's page and
    QR) and board-less sales whose link this phone remembers;
  - remembers each board-less sale's link from its creation, in memory and in `localStorage`
    (`taptpay:retail-sale-links:v1:<merchant>`, try/catch, dropped once the sale is no longer
    open, and after 24 hours);
  - the September pop-up (`share-link-overlay`) goes: sending opens the share page instead;
  - `onCashSale` records the sale (`POST /api/transactions/cash-sale`), puts it in the list, and
    sets `liveReceipt` (`<origin>/receipt/<id>`); a billing 402 is the banner's alone (R1-T9);
  - "download QR" draws a PNG of the shared link with `qrcode` (dynamic import), navy on white.

## Progress log
- View tests first (`retail-terminal-share-sales.test.tsx`, 9): **red 6 of 9** on `7051e25e` (no
  dropdown ×4; cash "success" before recording, and after a failed recording); 3 guards green.
  Green after the view change (one test fix: the leaving screen is still in the page while the next
  slides in, so the test reads the arriving one).
- Page tests rewritten (`merchant-terminal-mobile-v2.test.tsx`, 14): **red 10 of 14** (no share
  list ×7, no cash recording ×3); 4 guards green (503, signed-in read, the two R1-T9 402s). Green
  after the page change.
- The two share tests added to `retail-terminal-view-boundary.test.tsx` in `f5ef0d11` used the
  retired `livePayLink` prop; the new file covers both cases, so they were removed.
- **Owner's extra request mid-turn (2026-09-25):** "remove the need for a card on file for
  oliverharryleonard@gmail.com ... jsut for this account one off". Planned as a one-off data change
  in the development database (a paid-up period on that business's subscription; no code
  exemption, since a code backdoor would ship everywhere). **Not done:** the auto-mode safety check
  denied reaching the development database outside the sandbox (the sandbox cannot resolve its
  host), and then denied preparing the change. Left to the owner; nothing was changed.
- Mutations: view 11/11; page 10/11 then 11/11 ("closed sales are offered" survived: a paid
  board-less sale drops out through pruning anyway, so only a paid board sale shows the filter; a
  test with one added). The hooks-order guard caught the prune effect after the early return;
  moved above it. `tsc` clean; client 93/789.
- Real Chromium 28/28 at 390x844 and 320x568. At 320x568 the first "fits on screen" check only
  compared a bounding box with the viewport; replaced by scrolling each control into view and
  hit-testing its centre (the panel scrolls by design, `terminal-tokens.css`). **Committed
  `1fb41d14`.** Record: [R1-share-dropdown-and-cash-2026-09-25](R1-share-dropdown-and-cash-2026-09-25.md).
