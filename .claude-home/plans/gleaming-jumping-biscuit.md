# Customer Checkout Redesign — All Verticals + Trades 3-Step + Split

> **STATUS (updated 2026-07-11, verified against working tree by Fable):**
> **Stages 1 & 2 are COMPLETE** (uncommitted) and **visually verified** — mock-mode playwright screenshots at 390×844 confirm retail, property (with "weekly rent payment" subtitle), and trades invoice pages all render the navy design, and the "enter credit card" panel expands sky-blue with white fields and a navy Pay button. `npm run check` passes.
> **Remaining work: Stages 3, 4, 5, 6.** All line numbers below were re-verified against the current files on this date. If an anchor doesn't match, search for the named symbol instead of trusting the number.
> The working tree also contains **unrelated uncommitted work** (report-generation Task #59, perf route-preloading in App.tsx, dashboard/analytics edits). Do not revert or "clean up" any modified file you weren't asked to touch.

## Context

The user uploaded 6 mockups (`attached_assets/*_customer_payment_page_*.png`, `customer_split_payment_page_*.png`, 2026-07-11) replacing the old blue/cyan HPP design with the brand-wide navy language: off-white `#F4F4F4` page, centered rounded navy `#040D6D` card, serif "tapt**pay**" wordmark, sky-blue `#58ABFF` text, huge amount figure. Beyond the restyle (done), trades gets a new **one-page animated 3-step flow** for quotes, replacing the separate quote-response page.

**Confirmed with user:** restyle applies to all verticals (done); trades 3 steps animate on ONE page (view quote → confirm [+ QR icon that re-opens quote PDF] → pay deposit); no deposit → just the payment step; "view quote" and the QR button both open the existing quote PDF; split redesign is restyle-only (behavior unchanged); merchant `customLogoUrl` still replaces the wordmark; the expanded card panel is **sky blue** (done).

## Mockup spec (per page)

- **Retail/hospo** ✅: label ("lunch"), `$25.00`, dark Google Pay pill, footer link "enter credit card ∨" → sky-blue expanding card panel.
- **Property** ✅: address title, `$650`, subtitle "weekly rent payment", same pay controls.
- **Trades step 1**: title "deck replacement", FULL amount `$2,500`, subtitle "10% deposit required", single outline "view quote" button.
- **Trades step 2**: same info; button row animates to outline "confirm" + small square QR-icon button (re-opens quote PDF).
- **Trades step 3** ✅ (layout shipped as the plain trades-invoice page): deposit amount `$250`, subtitle "10% deposit of $2,500", GPay + card link — this layout alone serves deposit-less trades invoices.
- **Split**: chip "Person 1 of 2", label, amount, circular − N + stepper, "enter amount" input, outline "confirm".

## What Stages 1–2 delivered (already in tree)

- `client/src/lib/checkout-theme.ts` — theme tokens, shared `CSSProperties` constants, `money()` helper. **Reuse these in Stages 4–5; don't invent new constants.**
- `client/src/styles/checkout.css` — Larken `@font-face` pair (900 normal + italic).
- `client/src/components/checkout/tapt-wordmark.tsx` — `<TaptWordmark customLogoUrl={...}>`; renders `<img>` when a logo is set.
- `client/src/pages/checkout.tsx` fully restyled (now 1566 lines). Subtitle logic at ~1044–1056 already consumes `invoiceData.frequency` and `invoiceData.quote` — **the mock returns these but the real server does not yet; that's Stage 3.**
- `client/src/mocks/mock-api.ts` resolve handler extended with `frequency`, `quote: null`, `customLogoUrl: null`.
- `overlayBgColor` already navy `{r:4,g:13,b:109}` (checkout.tsx:706); HF `fieldStyle` already white-bg/navy-text (659–667).

## Key facts (all re-verified 2026-07-11)

- `client/src/pages/checkout.tsx` is the single HPP for retail (`/checkout/:transactionId`) and property/trades invoices (`/r/:token`); `isInvoice = !!token` (line 86), endpoint switch at 99–103, `payId` at 103. Style constants live at the bottom of the file (~1450–1566).
- Wallet pre-sessions require `transaction?.id && payId` (effects at 283–344) — in quote mode neither exists until confirm, so **introducing the deposit-invoice token mid-page is safe**; sessions are created fresh afterward.
- `/trades/quote/:token` (App.tsx:352) → `client/src/pages/trades/quote-response.tsx` (50 lines); fetches `GET /api/trades/quotes/token/:token` (routes.ts:6738 — marks quote `viewed`+`viewedAt` on first GET when status is `sent`; auto-expires past `validUntil`), responds via `POST .../respond` (routes.ts:6766, body `{ accept: boolean }` per `acceptQuoteSchema` schema.ts:1140). On accept it **always** creates a `job_invoice` — `kind:"deposit"` if `depositEnabled && depositCents>0`, else `kind:"full"` for the total — status `pending_dispatch`, and returns `{ quote, depositInvoice (incl. token), paymentUrl, delivered }`. Decline returns `depositInvoice: null`. 409 already-responded, 410 expired. Customer PDF at routes.ts:6712 (`GET /api/trades/quotes/token/:token/pdf`). The quote URL is baked into emails/SMS (`server/trades-delivery.ts:74`) and the quote PDF (`server/trades-quote-pdf.ts:163`) — keep the route path.
- Route param trap: `/trades/quote/:token` fills the same `token` param checkout.tsx reads — quote mode must treat it as the QUOTE token and not let it reach `isInvoice`/resolve.
- **Navigation guard is Windcave-scoped**: the guard block (checkout.tsx 360–628) patches href/assign/replace/pushState/replaceState/window.open/form.submit but only blocks URLs matching `WINDCAVE_HPP_RE`. `window.open("/api/trades/quotes/token/x/pdf")` passes through fine. Do not modify the guard.
- **wouter v3 trap (changes Stage 4 design):** wouter 3.3.5 patches `history.replaceState` at module load and dispatches a route event on every call (`node_modules/wouter/esm/use-browser-location.js`). Calling `history.replaceState(null,"","/r/"+token)` after confirm would re-match the Switch to the `/r/:token` route and **remount Checkout, destroying the crossfade animation**. Therefore Stage 4 does NOT swap the URL (see revised step 3 below).
- Resolve gaps (Stage 3): `GET /api/checkout/resolve/:token` (routes.ts:6058) returns no `frequency`, no `quote` object, and auto-created deposit invoices have null `jobDetails` → trades `description` falls back to "Job invoice". Quote GET returns no invoice token for already-accepted quotes (needed for revisit → jump to step 3).
- Property frequency source: `invoices_rent_requests.scheduleId → active_schedules.frequency` (`weekly|fortnightly|monthly`, schema.ts:802).
- `framer-motion@11` already a dep (used in `page-transition.tsx`).
- Mock mode: `client/src/mocks/mock-api.ts` covers transactions/resolve/merchant/windcave-env and seeds quotes with tokens `quote_8000`+ (line 309), but has **no handlers** for quote-token GET / respond — Stage 4 must add them.

## Verification environment (how to actually test — hard-won facts)

- Dev server: `VITE_MOCK=1 npm run dev` → port **5000**.
- **Mock mode uses HASH routing** (App.tsx:407 wraps routes in `useHashLocation` only when `IS_MOCK`; mock-api.ts:488 auto-sets `#/dashboard`). Checkout URLs in mock mode are `http://localhost:5000/#/checkout/90210`, `/#/r/<token>`, `/#/split/90210`, `/#/trades/quote/<token>` — path-style URLs silently land on the dashboard.
- Mock tokens: retail transaction `90210`; property invoices `inv_5000`–`inv_5119`; trades `job_7000`+; quotes `quote_8000`+. Statuses are seeded — probe for a payable one from the browser console: `fetch('/api/checkout/resolve/inv_5024')` (known-payable: `inv_5024`, `job_7007`).
- **Playwright:** the bundled headless-shell is broken (missing `libnspr4.so`). Launch with the system browser: `chromium.launch({ executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium' })`. Import playwright by absolute path if the script lives outside the repo: `/home/runner/workspace/node_modules/playwright/index.mjs`. Viewport 390×844. A working script exists at the session scratchpad `shots.mjs` pattern (probe tokens in-page via `page.evaluate(fetch)`).

## Stages

### ~~Stage 1 — Shared brand foundation~~ ✅ DONE
### ~~Stage 2 — Restyle checkout.tsx (all verticals)~~ ✅ DONE (screenshots verified)

### Stage 3 — Server: additive resolve/quote-GET fields (`server/routes.ts`)
- Resolve (6058): add `frequency` (via `scheduleId` → active_schedules lookup, property invoices only; null otherwise), `quote: { totalCents, depositType, depositValue } | null` (trades invoices with a `quoteId`), and trades description fallback → linked quote's first line-item description when `jobDetails` is null. **Match the field names the client already reads** (checkout.tsx ~1044–1056) and the mock's shape (mock-api.ts resolve handler).
- Quote GET (6738): when `status === "accepted"`, include the latest non-voided deposit/full `job_invoice` as `invoice: { token, kind, amountCents, status }`.
- Additive JSON only — do not change any existing field, status code, or side effect.

Check: curl a rent token (has `frequency`), a quote-deposit token (has `quote`, real description), an accepted quote (has `invoice.token`). `npm run check`.

### Stage 4 — Trades quote mode (3-step animated page)
- `App.tsx`: point `/trades/quote/:token` (line 352) at `<Checkout quoteMode />`; delete `pages/trades/quote-response.tsx` and its lazy import (App.tsx:57).
- `checkout.tsx`: `quoteMode` prop; `quoteToken = params.token` in quote mode; `const [acceptedInvoiceToken, setAcceptedInvoiceToken] = useState<string|null>(null)`; effective `token = quoteMode ? acceptedInvoiceToken ?? undefined : params.token` so all downstream wiring (isInvoice at 86, endpoints 99–103, payId 103) is untouched. New quote `useQuery` against `GET /api/trades/quotes/token/:token` (copy pattern from quote-response.tsx before deleting it). Steps:
  1. `quote-view`: title = first line-item description, amount = `totalCents`, subtitle "`{depositValue}`% deposit required" (fixed → "deposit required"; none → "quote total"); outline "view quote" → `window.open("/api/trades/quotes/token/"+quoteToken+"/pdf")` (nav guard won't block it — Windcave-only). Server marks viewed on the GET itself; start at step 2 if `quote.viewedAt` already set.
  2. `quote-confirm`: framer-motion `layout` animates the button row → "confirm" + square QR-icon button (re-opens PDF); subtle "decline" text link underneath (endpoint supports `{accept:false}`; mockups omit it — already flagged to user, keep unless they object).
  3. Confirm → `POST .../respond` body `{accept:true}` → `setAcceptedInvoiceToken(res.depositInvoice.token)`; `AnimatePresence mode="wait"` crossfades card content to the standard payment layout; wallet pre-sessions init fresh (verified safe). No-deposit quotes get a `kind:"full"` invoice from the same endpoint — identical transition.
  - **Do NOT call `history.replaceState` to swap the URL** — wouter v3 intercepts it and would remount the page mid-animation (see Key facts). The URL stays `/trades/quote/:token`; refresh/revisit is covered by the next bullet.
  - Revisit accepted link (incl. refresh after confirm) → jump straight to step 3 using Stage-3's `invoice.token` (or show already-paid state if `invoice.status` is paid); declined/expired (409/410/status) → styled terminal states in the same navy shell.
  - Gate the `!payId` "Invalid payment link" early-return (now ~1097–1101) behind `!quoteMode`. Optionally extract steps 1–2 presentation to `client/src/components/checkout/quote-steps.tsx`; card shell + step 3 stay in checkout.tsx so the card never remounts.
- Extend `mock-api.ts`: handlers for quote token GET (serve the seeded `quote_8000`+ rows) + respond POST returning a `depositInvoice.token` that the mock resolve handler can then resolve (easiest: return an existing payable `job_` token, or register a synthetic invoice).

Check (mock, hash URLs): full 3-step animation at `/#/trades/quote/quote_8000`; QR button re-opens PDF; refresh after confirm lands on step 3; deposit-less quote goes straight from confirm to full-amount payment. Real-mode: create quote → open emailed link → accept → verify quote status + deposit invoice in DB, and `/r/:token` still works standalone.

### Stage 5 — Restyle split-payment.tsx (behavior frozen)
Tailwind hex/class swap only: navy card on `#F4F4F4`, `<TaptWordmark>` component (delete the teal CSS-filter `logoStyle` hack at split-payment.tsx:147–149), "Person N of M" chip, big ACCENT amount, circular − / + steppers (2–10 clamp untouched), "enter amount" → existing `editMode`, ACCENT progress bars, outline confirm/pay button, keep "pay full amount instead" link, subsequent-payer + done states restyled. `handlePay`, `/split`+`/pay` calls, SSE (50–64), share math (66–104) untouched. Reuse `checkout-theme.ts` tokens.

Check: `/#/split/90210` (mock) matches mockup; custom amount > total still rejected; real-mode second payer sees remaining via SSE.

### Stage 6 — Final verification
- `npm run check`; mock-mode playwright screenshots at 390×844 (see Verification environment above): retail, property, trades steps 1/2/3, split (both payer states), expanded sky-blue card panel, success/error/already-paid, `customLogoUrl` variant.
- Real mode (Windcave unconfigured → simulated session path): drive rent invoice, trades quick invoice, quote-with-deposit, quote-without-deposit end to end via the app (no invoice seed script exists).
- Note for user: device spot-check Apple Pay (iOS Safari), GPay TEST sheet (Android Chrome), in-app-browser warning.

## DO NOT TOUCH (payment wiring — current line numbers)
`checkout.tsx`: endpoint switch (99–103), `navigateAfterSuccess` (210+), Apple/Google pre-session effects (283–344), HF lazy-load (~345–358), navigation-guard block (360–628) + beforeunload blocker (630–656), `initHostedFields` (669–712) — its values are already restyled, structure stays, all pay handlers + `IS_MOCK` short-circuits (751–1035), always-mounted `#hf-*` maxHeight-collapse pattern (~1360–1425). `split-payment.tsx`: handlers, SSE, share math. Server: all session/complete/callback endpoints (only the two additive Stage-3 JSON extensions). Unrelated uncommitted work in App.tsx (route preloading), dashboards, report-pdf, sw.js — leave as-is.

## Risks / notes
- Quote GET marks quote `viewed` on page open (before PDF) — same endpoint behavior as today, slightly earlier signal to merchants.
- Larken only ships Black/BlackItalic (900) — wordmark must use 900 (already handled in checkout.css).
- URL intentionally stays `/trades/quote/:token` after acceptance (wouter remount trap); flag to user in the final summary in case they wanted the address bar to become `/r/<token>`.
- `hpp-preview.html` copies (client/public, /app, ios) keep the old design — optional follow-up.
- Decline action kept as a subtle text link though mockups omit it (drop it if unwanted).
