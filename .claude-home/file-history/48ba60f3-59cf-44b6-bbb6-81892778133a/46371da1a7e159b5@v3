---
name: checkout-redesign-handoff
description: Customer checkout redesign — ALL stages 1-6 built & screenshot-verified (uncommitted); ready for review/commit
metadata: 
  node_type: memory
  type: project
  originSessionId: 48ba60f3-59cf-44b6-bbb6-81892778133a
---

Customer payment page redesign (all verticals + trades 3-step quote flow + split restyle). Plan: `.claude-home/plans/gleaming-jumping-biscuit.md`, fully re-verified and rewritten by Fable 2026-07-11 for execution by a cheaper model; **Fable must /code-review + visually verify when the executor finishes Stages 3–6**.

State as of 2026-07-11: ALL 6 stages built by Fable (user switched model to Opus but the build ran here), uncommitted, `npm run check` green. Verified via mock screenshots: retail/property/trades invoice cards, sky-blue card-entry panel, quote 3-step animation (view→confirm+QR→pay-deposit with "10% deposit of $2,500" subtitle), accepted-quote revisit jumping to payment, quote decline terminal, split-bill first-person + edit states.

Files changed: `server/routes.ts` (resolve + quote-GET additive fields), `server/storage.ts` (new `getJobInvoicesByQuote`), `client/src/pages/checkout.tsx` (quoteMode 3-step flow), `client/src/App.tsx` (route → `<Checkout quoteMode/>`, deleted quote-response route), `client/src/pages/split-payment.tsx` (navy restyle), `client/src/mocks/mock-api.ts` (quote GET/respond + SPLIT_DEMO_TX id 90222). Deleted `client/src/pages/trades/quote-response.tsx`.

How the traps were handled (for review):
- wouter v3 `replaceState` remount trap → did NOT swap URL after accept. Instead `acceptedInvoiceToken` state flips the effective `token`; card shell stays mounted. URL stays `/trades/quote/:token`. **Flag to user: address bar does not become `/r/<token>` after acceptance — confirm that's acceptable.**
- Revisit accepted quote jumps to step 3 via Stage-3 `invoice` field (effect adopts `invoice.token`).
- Quote steps + accept-loading render inside the shared card via a dedicated branch (`inQuotePhase || inAcceptLoading`) placed before the invoice terminal returns; `!payId` invalid-link return gated behind `!quoteMode`.
- Payment machinery (endpoints, guards, wallet pre-sessions, HF) untouched.
- Mock HASH routing; playwright via system chromium `/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-.../bin/chromium`.
- Decline kept as subtle "decline quote" footer link (mockups omit it — drop if unwanted).
- Left unrelated uncommitted work ([[report-gen-integration]], [[app-perf-loading]]) untouched.

Still owed: real-mode E2E (create quote→accept→pay against real DB), device spot-check of Apple/Google Pay sheets. Not committed yet.
