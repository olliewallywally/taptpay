# Fix Google Pay 400 Bad Request from Windcave

## What & Why
Google Pay payments fail with a 400 Bad Request from Windcave's AJAX submit endpoint. The logs show:
```
GOOGLEPAY_SUBMIT: { url: "https://uat.windcave.com/mh/..." }
GOOGLEPAY_RESPONSE: { status: 400, body: "Bad Request" }
```

There are two likely causes in `server/windcave.ts` `submitGooglePayToken()`:
1. **Wrong body format** — currently sends `{ "paymentData": googlePayToken }`. Windcave's `/mh/...` AJAX submit endpoint likely expects a different format.
2. **Incorrect Authorization header** — Windcave's MHPP AJAX submit URLs (`/mh/...`) use the session-specific URL for authentication; they are not REST API endpoints and should NOT receive `Authorization: Basic ...` credentials.

## Done looks like
- A Google Pay payment on the checkout page completes successfully (approved or declined — not a 400 error)
- Logs show `GOOGLEPAY_RESPONSE: { status: 200, ... }` with a valid authorisation result

## Out of scope
- Changing the overall server-side Google Pay architecture
- Apple Pay changes

## Tasks
1. **Remove Authorization header from Google Pay AJAX submit** — In `server/windcave.ts` `submitGooglePayToken()`, remove the `Authorization` header from the fetch call to Windcave's `/mh/...` URL. These MHPP AJAX endpoints authenticate via the unique opaque URL, not REST credentials.

2. **Fix the request body format** — Change the body from `{ "paymentData": googlePayToken }` to send just the raw token object (i.e. `JSON.stringify(googlePayToken)` directly). If that also returns 400, try `{ "googlePayToken": googlePayToken }`. Log the full response body so the exact error is visible. Check Windcave's hosted fields SDK source at `https://uat.windcave.com/js/windcavepayments-hostedfields-v1.js` for how it submits Google Pay tokens, and also check the Drop-In SDK at `https://uat.windcave.com/js/windcavepayments-dropin-v1.js`.

3. **Test and verify** — After the fix, trigger a Google Pay payment using the UAT test environment. Confirm the log shows HTTP 200 from Windcave and the transaction completes.

## Relevant files
- `server/windcave.ts:243-273`
- `server/routes.ts:1474-1531`
- `client/src/pages/checkout.tsx:298-347`
