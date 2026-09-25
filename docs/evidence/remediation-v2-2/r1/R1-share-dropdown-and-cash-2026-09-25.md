# The phone share page chooses its sale; phone cash sales are recorded (2026-09-25)

Owner decision: [2026-09-25-share-dropdown-and-fixes-owner-answers](../../../decisions/2026-09-25-share-dropdown-and-fixes-owner-answers.md).
Working notes: [WORKING-2026-09-25-share-dropdown](WORKING-2026-09-25-share-dropdown.md).
Commit: `1fb41d14` (after `7051e25e`), local only.

## In plain words

- **The share page has a sale picker.** At the top of the blue section of the phone terminal's
  share page, a dropdown lists the open sales the phone can share, newest first. Sending a sale
  opens the share page with that sale chosen. If you pick another, it stays picked when you come
  back, until you send a new sale; if the picked sale is paid, the newest is shown.
- **The page shows the real thing.** The chosen sale's amount, name and real QR code; before, live
  use showed "$0.00 payment" and a decorative QR. Copy, download, SMS and email all use that
  sale's link: a board sale's is its board's page, a board-less sale's is its own.
- **Where the links come from.** A board-less sale's link is given once, when it's made (the
  server keeps only a fingerprint). So the phone that made it remembers it, until the sale is paid
  or cancelled, and at most a day. A board-less sale made on another device can't be shared from
  this phone; a board sale can, from anywhere.
- **The September pop-up is gone.** Sending now opens the share page, which the pop-up would have
  covered.
- **"download QR" saves a real, scannable picture** of exactly the link being shared. It used to
  save a decorative QR that could not be scanned.
- **Phone cash sales are recorded.** They never were: nothing was wired, so the screen said
  "success" and saved nothing, no sale in the list, the reports or analytics, and no receipt. Now
  the sale is saved before "success" shows, once however often "confirm" is tapped. The success
  screen shows the recorded amount, and "copy receipt link" gives that sale's receipt (it gave a
  demo address). If saving fails, what was typed stays and the reason is shown.

## Proof

- Tests written first and run against `7051e25e`: the view (`retail-terminal-share-sales`, 9)
  **6 red** for their reasons (no dropdown; cash "success" before and after a failed save); the
  page (`merchant-terminal-mobile-v2`, rewritten, 14) **10 red** (no share list; no cash
  recording). Guards green in both.
- Mutations **22/22**: view 11/11, page 11/11. The page's first run left one survivor, "closed
  sales are offered". A paid board-less sale drops out anyway (its remembered link is pruned), so
  only a paid board sale shows the filter. A test with one was added, and the rerun caught it.
- The hooks-order guard (R1-T8) caught the new "forget paid sales' links" effect placed after the
  page's early return. It was moved above it.
- `tsc` clean; client 93 suites / 789 tests.
- Real Chromium, production build, 390×844 and 320×568: **28/28**
  (`scripts/verify-share-dropdown-browser.mjs`, [log](share-dropdown-2026-09-25/browser-28-of-28.txt)).
  It drives the real keypad to send two sales, checks the share page opens on each with its real
  QR image, and copies and downloads (a real PNG). It picks the older sale and leaves and returns
  (kept), then records a cash sale and copies its receipt link. At 320×568 the blue panel scrolls
  to its buttons, as the terminal's layout intends (`terminal-tokens.css`, "scrolling is a
  first-class outcome"). Every control was scrolled into view and hit-tested at its centre.
- Screenshots: [after sending](share-dropdown-2026-09-25/share-after-send-390x844.png),
  [a sale picked](share-dropdown-2026-09-25/share-chosen-390x844.png),
  [320×568 scrolled](share-dropdown-2026-09-25/share-scrolled-320x568.png),
  [cash success](share-dropdown-2026-09-25/cash-success-390x844.png).
- Not run: the browser probe against the old build. The old page has no dropdown and does not open
  share on send, so the probe's first step would time out rather than report; the view and page
  tests were run red instead.

## Noted, not changed

- At 320×568 the terminal's top section overlaps its bar (the item name sits under it). The
  unchanged cash success screen does the same, so it predates this work.
- A cash sale's receipt is the numbered receipt page (`/receipt/<id>`), like a board sale's. Those
  pages are readable by anyone who guesses the number (`GET /api/transactions/:id` is public for
  sales without their own link): the "adjacent surface" noted in the gap-12 memo, for R1-T2/T3.
- Boards: at most 10 at a time per business (`TAPT_STONE_LIMIT`); the owner's answer said "as much
  as they want". Put back to the owner.
- **Owner's request to exempt `oliverharryleonard@gmail.com` from the card requirement:** not
  done. Planned as a one-off data change in the development database (no code exemption). The
  auto-mode safety check denied reaching that database and then preparing the change, so it is
  the owner's to allow or do.

## Handoff (plan §21.2)

```text
Phase / release:         R1 owner-directed follow-up to the no-board rework; not merged, not deployed
Exact branch and commit: remediation/r1-continuation-20260907 @ 1fb41d14 (local)
Scope completed:         share page sale dropdown; send opens share; September pop-up removed;
                         real QR download; phone cash sales recorded with their own receipt
Files changed:           RetailTerminalView(.tsx, Core.jsx), merchant-terminal-mobile-v2.tsx,
                         their tests, scripts/verify-share-dropdown-browser.mjs
Migrations:              none
Preflight queries:       none
Commands run and results: tsc clean; client 93/789; red first 6/9 and 10/14; mutations 22/22;
                         real Chromium 28/28 at 390x844 and 320x568
Negative/no-side-effect: a failed cash save shows no success and keeps the typing; a double tap
                         records once; a board-less sale from another device is not offered
Provider/UAT activity:   none
Device/browser evidence: above
Security/privacy review: board-less sale links are kept in the merchant's own browser storage
                         beside its login token, for open sales only, at most a day; the demo
                         link can no longer reach a live share or receipt
External actions:        none
Feature flags and payment mode after deploy: unchanged
In-flight operations:    none
Known warnings or deferred items: the small-phone hero overlap (pre-existing); the board limit
                         question; the card exemption (owner's to allow)
Rollback commit and constraints: revert 1fb41d14; the September pop-up returns and cash sales
                         stop being recorded again
Approvals:               owner decision 2026-09-25; plan §21.1 review owed
Stop conditions checked: no money initiation enabled; no migration; nothing pushed
Next phase prerequisites: this review
```

## Independent review — brief

**Range:** `7051e25e..1fb41d14` (one code commit), local only.

> You are the independent correctness reviewer for TaptPay. Review `7051e25e..1fb41d14` on
> `remediation/r1-continuation-20260907`: the phone terminal's share page gains a dropdown of the
> sales it can share, sending opens that page, "download QR" saves a real QR, and phone cash sales
> are recorded (they never were). Start from
> docs/evidence/remediation-v2-2/r1/R1-share-dropdown-and-cash-2026-09-25.md; treat it as claims
> and re-derive everything from the code. Attack especially:
> - Can the share page ever offer or send a link for the wrong sale: after a hand choice, after a
>   new sale arrives from another device, after the chosen sale is paid or cancelled, across a
>   reload, or with a stale remembered link?
> - Can the demo link (`demo-abc123`) reach any live share or receipt?
> - The remembered links in localStorage: scope, lifetime, pruning, behaviour when storage throws,
>   and what they expose on a shared device.
> - The cash sale: exactly-once under double taps, what shows on failure, the billing 402 path,
>   and whether the recorded sale and its receipt match what was typed.
> - The landing demo and `/smart-terminal` (demo mode): unchanged?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1 and end with Approve / Do not
> approve naming the commit range.

Reproduce: `npx tsc`; `npx jest --selectProjects client`; build and preview the client, then
`node scripts/verify-share-dropdown-browser.mjs`.
