---
title: Fix Google Pay HPP redirect permanently
---
# Harden Checkout Against HPP Redirects

## What & Why

After the white-screen crash fix (navigation guard wrapped in try/catch), Google Pay on Android Chrome is once again redirecting the browser to the Windcave Hosted Payment Page (HPP) instead of completing the payment inside the native Google Pay sheet.

**Root cause (two-part):**

1. **Navigation guard intercepts the wrong hooks.** The current guard overrides `window.location.assign` and `window.location.replace` as own-properties on the Location *instance*. Windcave's SDKs also navigate via `window.location.href = url` (the `href` property *setter*), which is on `Location.prototype` and is completely missed by the current guard. The instance-property approach also fails silently (or throws) in some browsers, making the guard unreliable.

2. **Apple Pay SDK is loaded eagerly on iOS.** The SDK is loaded as soon as `envData` arrives, giving it a chance to auto-initialize and redirect to the HPP before the user has started any payment. This is the iOS path; the same principle applies — SDK side-effects should not fire until the user actually taps the button.

**The fix has three parts:**
- Replace the instance-property override with a `Location.prototype`-level intercept using `Object.defineProperty`, which catches `window.location.href = url`, `.assign()`, and `.replace()` uniformly and works in all browsers.
- Move Apple Pay SDK loading from "on envData" to "on Apple Pay button tap", eliminating the eager-load window during which the SDK can auto-redirect.
- Add a `beforeunload` / `pagehide` listener during active payment processing that blocks accidental navigation and logs the attempted URL for diagnosis.

## Done looks like

- On Android Chrome: tapping Google Pay opens the native payment sheet, user authorizes, payment completes (success or declined screen), **no Windcave HPP page appears at any point**.
- On iPhone Safari: tapping Apple Pay opens the native Apple Pay sheet with no intermediate redirect, payment completes correctly.
- On both platforms: tapping "enter card details" still opens the Hosted Fields form and card payment works.
- If any future code path somehow tries to navigate to a `*.windcave.com` URL, the attempt is blocked **and logged** (console.error) so it can be traced.

## Out of scope

- Changes to the server-side Windcave session creation or callback handling.
- Any changes to split payment, receipt, or dashboard pages.
- Adding new payment methods.

## Tasks

1. **Upgrade navigation guard to prototype level** — Replace the `window.location.assign/replace` instance-property override with a `Location.prototype` `defineProperty` intercept that catches `href`, `assign`, and `replace` in one place. Wrap with try/catch and log when a block occurs. Install on checkout mount, restore on unmount.

2. **Lazy-load Apple Pay SDK on button tap** — Remove the eager `loadScript(windcavepayments-applepay-v1.js)` call from the `envData` useEffect. Instead call it the first time the Apple Pay button is tapped (inside `handleApplePay`), after which run `checkApplePay()` and proceed. Cache a ref so the script is only fetched once.

3. **Add active-payment navigation blocker** — While `payState === "processing"`, attach a `beforeunload`/`pagehide` listener that logs (console.error) the navigation attempt and the referencing URL, to make any future regressions immediately visible in production logs.

## Relevant files

- `client/src/pages/checkout.tsx:138-206`
- `client/src/pages/checkout.tsx:97-136`
- `server/windcave.ts`