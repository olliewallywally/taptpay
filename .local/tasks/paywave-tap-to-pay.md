# Paywave: Windcave Tap to Pay on iPhone (iOS Exclusive)

## What & Why

Add Windcave's "Attended Tap to Pay on iPhone" feature — the merchant holds their iPhone near a customer's contactless card or device and the payment is taken without any external reader. This is an iOS-native-only capability (Windcave does not support it on Android or in a web browser).

Inside the native iOS app, Tap to Pay appears alongside Apple Pay and Google Pay as a third payment method option on the merchant terminal. The flow is: enter amount → tap "Tap to Pay" → hold iPhone near customer card/device → NFC capture → payment result. On the web (any browser), the Tap to Pay button is completely absent — no fallback, no message, just not there.

Architecture:
- **Backend**: A new API route receives the NFC token from the native iOS layer, submits it to Windcave's attended AJAX endpoint, and records the transaction.
- **Web UI (iOS-gated)**: A "Tap to Pay" option on the merchant terminal, rendered only when `isNativeApp()` is true.
- **Capacitor bridge + Swift stub**: The JavaScript interface the web UI calls to invoke the native NFC reader, plus a documented Swift file the iOS developer implements using the Windcave iOS SDK.

No Apple IAP is involved. Tap to Pay uses Apple's ProximityReader hardware (NFC antenna) but the payment processor is Windcave — Apple takes nothing from the transaction.

## Done looks like

- `POST /api/transactions/tap-to-pay` accepts `{merchantId, amount, windcaveToken}`, creates a Windcave attended session, submits the token, records the transaction with `paymentMethod: "tap_to_pay"`, and returns `{approved, transactionId}`.
- The transaction appears in the merchant's history alongside card, Apple Pay, and Google Pay transactions.
- Inside the iOS app, the merchant terminal shows a "Tap to Pay" button alongside the existing Apple Pay and Google Pay buttons. Web users see nothing different.
- Tapping "Tap to Pay" in the app shows: amount confirmation → animated "Hold customer card/device to top of iPhone" screen → approved or declined result.
- `src/plugins/TapToPayPlugin.swift` is a fully documented stub with the Windcave SDK calls (`WCPaymentSDK.startTapToPaySession()`) and Capacitor bridge wiring for the iOS developer.

## Out of scope

- Android NFC (Windcave does not support this).
- Any Tap to Pay UI, button, or message on the public web.
- The actual compiled Swift plugin (requires macOS, Xcode, Windcave iOS SDK, and ProximityReader entitlement).
- Split payment for Tap to Pay (future).
- Changes to Apple Pay, Google Pay, QR, or card checkout flows.

## Tasks

1. **Backend: attended tap-to-pay route** — Add `POST /api/transactions/tap-to-pay` to `server/routes.ts`. Authenticates the merchant session, validates `{merchantId, amount, windcaveToken}`, calls Windcave attended helpers, writes a transaction row with `paymentMethod: "tap_to_pay"`, and returns `{approved, transactionId}`.

2. **Windcave attended session helpers** — Add `createAttendedSession()` and `submitTapToPayToken()` to `server/windcave.ts` following the Windcave attended API documentation. Reuse existing auth header builder, timeout wrapper, and retry logic.

3. **Merchant terminal Tap to Pay UI (iOS-gated)** — On both the desktop and mobile merchant terminal pages, add a "Tap to Pay" option that is only rendered when `isNativeApp()` returns true. It appears in the same area as the Apple Pay and Google Pay buttons. Shows amount entry → animated NFC ready screen → result. Web browser visitors see no change whatsoever.

4. **Capacitor bridge + Swift stub** — Define `window.TaptPay.startTapToPay({amount, currency, merchantName})` → `Promise<{approved, token}>` as the JavaScript bridge contract. Create `src/plugins/TapToPayPlugin.swift` as a complete, well-commented stub showing Capacitor plugin registration, `WCPaymentSDK.startTapToPaySession()` invocation, and how to resolve/reject the JS promise.

## Relevant files

- `client/src/pages/merchant-terminal.tsx`
- `client/src/pages/merchant-terminal-mobile.tsx`
- `client/src/lib/native.ts`
- `server/routes.ts`
- `server/windcave.ts`
- `shared/schema.ts`
- `server/storage.ts`
