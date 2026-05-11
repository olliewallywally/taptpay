---
title: iOS App Store wrapper (Capacitor)
---
# iOS App Store Wrapper (Capacitor)

## What & Why

Wrap the full TaptPay web app in a native iOS shell using Capacitor. The iOS app is a complete mirror of the web app — merchants get the same terminal, dashboard, transaction history, QR code flows, Apple Pay, and Google Pay — with three targeted differences from the web experience:

1. **Live OTA updates**: Because Capacitor's WebView loads from the production URL, every deployment from Replit is instantly live in the app — no App Store re-submission required for content or feature updates.

2. **Branded app entry screen**: The app opens to a dedicated `/app-login` page (blue background, TaptPay logo, Login button) instead of the marketing landing page. The marketing landing page at `/` is untouched for web visitors.

3. **Billing is web-only**: The section where a merchant enters their own card to pay TaptPay's fees is replaced in the app with "To update your payment method, visit taptpay.co.nz." This keeps Apple entirely out of TaptPay's merchant billing. All customer payment flows (QR → checkout → Apple Pay / Google Pay / card entry) are unchanged.

No IAP, no StoreKit, no Apple billing. Under App Store guideline 3.1.5(a), a POS tool that processes physical-world payments is fully exempt.

## Done looks like

- Capacitor packages are installed and `capacitor.config.ts` exists at the project root with `appId: "nz.taptpay.app"`, `appName: "TaptPay"`, and `server.url` pointing to the production domain's `/app-login` path so the app always opens to the branded screen.
- A new `/app-login` route exists showing: full-screen blue (`#0055FF`) background, TaptPay logo centred, a "Log in" button that navigates to `/login`. No header, no footer, no marketing content.
- The marketing landing page at `/` is completely unchanged for web visitors.
- An `isNativeApp()` utility (`client/src/lib/native.ts`) returns `true` when running inside Capacitor iOS.
- In the merchant settings page, when `isNativeApp()` is true, the card/payment-method entry section is hidden and replaced with "To add or update your payment method, visit taptpay.co.nz."
- `client/public/manifest.json` has correct name (`TaptPay`), `short_name` (`TaptPay`), `theme_color` (`#0055FF`), and `background_color`.
- `ios-README.md` at the project root has numbered Xcode steps and explicitly documents that app content updates deploy via Replit with no App Store re-submission needed.

## Out of scope

- Actual Xcode compilation or App Store submission (requires macOS + Apple Developer account).
- Android Play Store.
- The native Tap to Pay / Paywave plugin (Task #20).
- Any in-app payment flows or subscription management through Apple.

## Tasks

1. **Create `/app-login` branded entry page** — Add a new route `/app-login` in the React app. Full-screen blue (`#0055FF`) background, TaptPay logo centred vertically, a prominent "Log in" button that routes to `/login`. No navbar, no footer, no landing page content. Register the route in `App.tsx`.

2. **Install and configure Capacitor** — Add `@capacitor/core`, `@capacitor/cli`, and `@capacitor/ios` as npm dependencies. Create `capacitor.config.ts` with `appId: "nz.taptpay.app"`, `appName: "TaptPay"`, `server.url` set to the production URL with `/app-login` as the path, and `allowNavigation` covering Windcave domains. Set `backgroundColor: "#0055FF"`.

3. **Add `isNativeApp()` utility** — Create `client/src/lib/native.ts` exporting `isNativeApp()` returning `window.Capacitor?.isNativePlatform() === true`. This utility is shared with the Paywave task.

4. **Hide billing section in native app** — In the merchant settings page, use `isNativeApp()` to conditionally replace the payment method / card entry section with a message: "To add or update your payment method, visit taptpay.co.nz."

5. **Update PWA manifest and write iOS README** — Set `manifest.json` name/theme correctly. Write `ios-README.md` with: numbered Xcode steps, explicit callout that content updates deploy via Replit instantly (no App Store re-submission), and the ProximityReader entitlement note for Paywave.

## Relevant files

- `client/src/App.tsx`
- `client/src/pages/settings.tsx`
- `client/public/manifest.json`
- `package.json`