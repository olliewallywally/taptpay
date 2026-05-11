# Fix Apple Pay — Pre-create Session

## What & Why

Apple Pay silently does nothing when tapped. The root cause is that `handleApplePay()` calls `window.WindcavePayments.ApplePay.create()` with `url: null`. The Windcave Apple Pay SDK requires a real `ajaxSubmitApplePayUrl` in `opts.url` before it will call `ApplePaySession.begin()` internally. With `url: null` it skips `begin()`, the payment sheet never appears, and the UI just sits on "processing" forever.

Google Pay works because it `await`s `createSession()` before touching the Google SDK — Google Pay has no same-gesture restriction. Apple Pay *does* have that restriction, which is why the Windcave callback approach was attempted, but Windcave's SDK doesn't support a null URL at call time.

## Done looks like

- Tapping the Apple Pay button on a real iPhone (Safari, taptpay.co.nz) immediately shows the native Apple Pay payment sheet
- The "processing" spinner no longer hangs silently when Apple Pay is tapped
- If the pre-session hasn't loaded yet (extremely fast tap after page open), a clear "Apple Pay isn't ready yet — please try again" message is shown
- Google Pay, card, and all other payment flows remain unaffected

## Out of scope

- Changes to the server-side session creation endpoint
- Any Windcave Google Pay changes
- Hosted Fields card flow

## Tasks

1. **Pre-create Windcave session at page load** — In a new `useEffect` that fires when `transaction` and `envData` are both ready, call `createSession()` and store the result (sessionId + ajaxSubmitApplePayUrl) in a ref (`preSessionRef`). Only do this when Apple Pay is available.

2. **Pass pre-created URL into ApplePay.create()** — In `handleApplePay()`, read `preSessionRef.current`. If it has a valid `ajaxSubmitApplePayUrl`, set `opts.url` to it and remove the async callback-4 (the lazy session creator). If the pre-session isn't ready, show a clear error. Also set `sessionRef.current` from the pre-created session so the "done" callback can use the correct sessionId.

3. **Refresh the pre-session after each completed or cancelled payment** — Reset `preSessionRef` to null after a payment completes or is cancelled, and trigger a re-creation so the next tap is always ready.

## Relevant files

- `client/src/pages/checkout.tsx:131-159`
- `client/src/pages/checkout.tsx:568-632`
- `server/routes.ts:1610-1636`
