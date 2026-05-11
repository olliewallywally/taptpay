# Fix Apple Pay User Gesture (SDK Pre-load)

## What & Why
Apple Pay's native `ApplePaySession.begin()` must be called synchronously within the original tap event. Currently the Windcave Apple Pay SDK is lazy-loaded on first tap via `await loadScript(...)`, which breaks Safari's user gesture requirement. The result is that the Face ID/Touch ID payment sheet never appears and the user is stuck on a "processing" spinner.

The Windcave Apple Pay SDK was deliberately lazy-loaded to avoid it auto-initialising without a session and redirecting to the Windcave HPP. However, the comprehensive navigation guards (Location.href setter, assign, replace, pushState, replaceState, window.open) already block any HPP redirect. These guards are safe to rely on.

## Done looks like
- Tapping the Apple Pay button on a real iPhone in Safari immediately shows the Face ID/Touch ID payment confirmation sheet.
- If the SDK fails to pre-load (network error), the Apple Pay button is hidden so the user is not presented with a broken option.
- If the user somehow taps before the SDK finishes loading, they see a clear error message rather than being stuck on a spinner.

## Out of scope
- Changes to the Google Pay, card, or Hosted Fields flows.
- Any server-side changes.

## Tasks
1. **Pre-load Apple Pay SDK at page load** — Move the `loadScript` call for `windcavepayments-applepay-v1.js` to the `useEffect` that runs when `envData` is available (same place the Google Pay script is loaded), but only if `ApplePaySession.canMakePayments()` is true. Track a `applePaySdkReady` ref that is set to true when loading succeeds.

2. **Remove the await from handleApplePay** — Delete the lazy-load block inside `handleApplePay`. Replace it with a guard that shows an error if `applePaySdkReady.current` is false (SDK still loading or failed to load). With the SDK already loaded, `ApplePay.create()` is called synchronously within the tap gesture.

3. **Hide Apple Pay button if SDK fails** — If the script load throws, set a ref/state that keeps the Apple Pay button hidden so users aren't shown a broken option.

## Relevant files
- `client/src/pages/checkout.tsx:130-144,550-624`
