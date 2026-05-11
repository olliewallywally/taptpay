---
title: Fix Google Pay redirect to Windcave HPP
---
# Fix Google Pay HPP Redirect Bug

## What & Why

When a customer taps the Google Pay button on the checkout page, the entire page redirects to `uat.windcave.com` (Windcave's Hosted Payment Page) instead of showing the native Google Pay sheet.

Root cause: The checkout page loads three Windcave SDK scripts immediately at page load — `hosted-fields-v1.js`, `windcavepayments-hostedfields-v1.js`, and `windcavepayments-applepay-v1.js` — all from `uat.windcave.com`. These scripts auto-initialise when loaded and, finding no active session or an incompatible payment context (especially `windcavepayments-applepay-v1.js` on Android), fall back to redirecting the user to the HPP URL. This happens before or concurrently with the Google Pay button being tapped.

## Done looks like

- Tapping the Google Pay button on Android shows the native Google Pay payment sheet, not a redirect to `uat.windcave.com`
- Card payments still work (Hosted Fields initialise correctly when the card tab is opened)
- Apple Pay still works on iOS (Apple Pay SDK still loads on capable devices)
- No `hppUrl` is sent to the frontend (defensive removal since no native flow needs it)

## Out of scope

- Changes to the payment processing logic (session creation, googlepay-complete, etc.)
- Changes to Apple Pay or card payment flows

## Tasks

1. **Lazy-load Windcave HF scripts** — Move `hosted-fields-v1.js` and `windcavepayments-hostedfields-v1.js` out of the initial `envData` useEffect and into a combined effect that only fires when both `envData` is ready AND `cardOpen` is true for the first time.

2. **Conditionally load the Apple Pay SDK** — In the `envData` useEffect, only load `windcavepayments-applepay-v1.js` on devices where `window.ApplePaySession` is defined (i.e., Apple devices); skip it entirely on Android.

3. **Remove `hppUrl` from the pay API response** — Strip `hppUrl` from the `res.json()` return in the `/api/transactions/:id/pay` endpoint. The HPP URL is never used by any native payment flow and should not be exposed to the browser.

## Relevant files

- `client/src/pages/checkout.tsx:94-117`
- `server/routes.ts:1494-1505`