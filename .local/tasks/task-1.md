---
title: Switch to Windcave Hosted Fields + Apple/Google Pay
---
# Switch to Windcave Hosted Fields + Apple/Google Pay

## What & Why
Replace the Windcave HPP redirect with a fully TaptPay-branded payment page. Instead of sending customers away to Windcave's generic hosted page, the entire checkout stays on our own page. The design must match hpp-preview.html exactly.

The Windcave REST session returns three AJAX links: `ajaxSubmitCard` (Hosted Fields), `ajaxSubmitApplePay` (Apple Pay JS wrapper), and `ajaxSubmitGooglePay` (Google Pay). We use all three.

## Done looks like
- Customer scans QR and sees a TaptPay-branded checkout page matching hpp-preview.html pixel-for-pixel:
  - Blue card (#0055FF, 40px radius) at top: TaptPay logo (turquoise-filtered), item name (dim white), amount in large white text (56px, bold)
  - Apple Pay black button inside the blue card (only visible on Safari/Apple devices)
  - Google Pay button inside the blue card (only visible on Android/Chrome where Google Pay is available); styled similarly — dark background, Google Pay branding
  - "Cancel Payment" turquoise button (#00E5CC, blue text) inside the blue card
  - Turquoise expandable "enter card details" tab below the blue card (collapsed by default): credit card icon + chevron, slides open to reveal the Hosted Fields card form (card number, expiry, CVV, cardholder name) and a blue "Pay $X.XX" button
- 3DS challenges appear as a popup (handled by Windcave JS library)
- After any payment method succeeds, customer is redirected to `/payment/result/:id?status=approved`
- After failure, error state with "try again" button
- Merchant terminal receives SSE updates exactly as before
- Split bill flow still works (split page shown before the checkout page)

## Out of scope
- Subscription billing
- Admin portal
- Changing the receipt or result pages

## Technical notes for executor

**Windcave JS files to load (from Windcave's domain — cannot be self-hosted):**
- Hosted Fields: `https://{env}.windcave.com/js/lib/hosted-fields-v1.js` and `https://{env}.windcave.com/js/windcavepayments-hostedfields-v1.js`
- Apple Pay: `https://{env}.windcave.com/js/windcavepayments-applepay-v1.js`
- Google Pay: use Google's own PaymentsClient API (`https://pay.google.com/gp/p/js/pay.js`) — no separate Windcave wrapper found; after Google Pay token is obtained, POST to backend which forwards it to Windcave's `ajaxSubmitGooglePay` AJAX endpoint
- `env` = `uat` or `sec` based on `WINDCAVE_ENDPOINT` env var

**Session creation:**
- Backend must return all three links: `ajaxSubmitCardUrl`, `ajaxSubmitApplePayUrl`, `ajaxSubmitGooglePayUrl`
- Session is created lazily — only when the customer clicks a payment button (not on page load)
- For Apple Pay: session URL is passed to `WindcavePayments.ApplePay.create()` via `onValidateMerchant` callback (this is the correct place to create the session asynchronously, as documented in the Apple Pay wrapper docs)
- For Google Pay: call backend on token receipt to POST to Windcave
- For Hosted Fields: call backend on Pay button click, get URL, then `controller.submit(url, ...)`

**Backend additions needed:**
- `createWindcaveSession()` must extract and return `ajaxSubmitCardUrl`, `ajaxSubmitApplePayUrl`, `ajaxSubmitGooglePayUrl` from the `links` array
- `POST /api/transactions/:id/pay` must return all three URLs
- New `POST /api/transactions/:id/hosted-fields-complete` endpoint: accepts `sessionId`, queries Windcave, updates DB, fires SSE, returns outcome
- New `POST /api/transactions/:id/googlepay-complete` endpoint: accepts `{ sessionId, googlePayToken }`, posts token to Windcave `ajaxSubmitGooglePay` URL, updates DB, fires SSE
- Apple Pay: `WindcavePayments.ApplePay.create()` `onSuccess` fires with `outcomeNotificationFunction` — we query our backend for the outcome, call `outcomeNotificationFunction(true/false)`, then redirect
- Simulation mode must return fake URLs for all three methods

**Apple Pay-specific:**
- Requires `WINDCAVE_APPLE_PAY_MERCHANT_ID` env var (provided by Windcave after domain validation)
- Button only renders if `window.ApplePaySession?.canMakePayments()` returns true
- Apple Pay domain must be validated with Apple before it works in production

**Google Pay-specific:**
- Use Google PaymentsClient with `gateway: 'windcave'` and `gatewayMerchantId` from Windcave
- Button only renders if `paymentsClient.isReadyToPay()` resolves true
- Requires `WINDCAVE_GOOGLE_PAY_MERCHANT_ID` env var

**Design:**
- Must match hpp-preview.html exactly — same border-radius, colors, fonts, paddings, shadow values
- The Hosted Fields containers must match the `.form-input` style: `background: rgba(255,255,255,0.55)`, `border: 1.5px solid rgba(0,85,255,0.18)`, `border-radius: 12px`, `padding: 11px 14px`, `font-family: Inter`, `font-size: 14px`
- Use Hosted Fields `styles` option to pass these styles into the iframes (Windcave supports: background-color, color, font-family, font-size, padding, border, border-radius etc.)
- Expandable card form uses CSS `max-height` transition (same as preview HTML)

**Existing notification webhook:**
- `POST /api/windcave/notification` still fires server-side — keep it unchanged
- `GET /api/windcave/callback` kept as fallback

## Tasks
1. **Backend — multi-method session URLs** — Update `createWindcaveSession()` to extract and return all three AJAX submit links. Update `POST /api/transactions/:id/pay` to return all three URLs. Add `POST /api/transactions/:id/hosted-fields-complete` and `POST /api/transactions/:id/googlepay-complete` endpoints. Update simulation mode to return fake URLs for all three methods.

2. **Frontend — branded checkout page matching the preview** — Replace the HPP redirect in `customer-payment.tsx` (or create a new `/checkout/:transactionId` route it redirects to) with the full checkout UI. Load Windcave and Google Pay JS files. Implement the exact preview layout: blue card → Apple Pay button (device-conditional) → Google Pay button (device-conditional) → Cancel button → turquoise expandable card details tab → Hosted Fields form → Pay button. Wire up all three payment methods with their respective submit/callback flows. On success, call the appropriate complete endpoint and redirect to the result page.

## Relevant files
- `server/windcave.ts`
- `server/routes.ts:1139-1274`
- `client/src/pages/customer-payment.tsx`
- `client/public/hpp-preview.html`