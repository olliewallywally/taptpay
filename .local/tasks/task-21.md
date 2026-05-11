---
title: Fix Google Pay HPP redirect (again)
---
# Google Pay HPP Redirect Fix (Again)

## What & Why
Google Pay is once again redirecting users away from the app to the Windcave hosted payment page (HPP) instead of staying in the TaptPay branded experience. This has been patched before but the problem keeps recurring, so the fix needs to be made more robust and resilient against edge cases.

## Done looks like
- Clicking the Google Pay button completes the payment entirely within the app — no redirect to windcave.com or any external domain
- Works in both the web app and the Capacitor iOS native app
- The Windcave SDK scripts do not take over navigation under any conditions (page load timing, slow network, re-render, etc.)
- No regression on Apple Pay or the hosted fields card payment method

## Out of scope
- Changing the overall Google Pay UX flow or button placement
- Any changes to the Apple Pay implementation

## Tasks
1. **Diagnose the redirect path** — Identify which code path is now allowing the redirect through: check if the `Object.defineProperty` navigation guard on `window.location` is still active, whether lazy-loading still prevents premature SDK init, and whether any new Windcave SDK version or checkout page re-render is resetting the guard.

2. **Harden the navigation guard** — Make the redirect blocker more robust: re-apply the guard after any component re-render or script reload, ensure it cannot be bypassed by the SDK using `history.pushState` or `document.location`, and add a check that blocks any navigation to `*.windcave.com` or `*.paymentexpress.com` domains.

3. **Add a sentinel log** — Add a console warning (dev only) any time a blocked redirect attempt is detected, so future regressions are immediately visible during testing.

## Relevant files
- `client/src/pages/checkout.tsx`
- `server/windcave.ts`
- `server/routes.ts`