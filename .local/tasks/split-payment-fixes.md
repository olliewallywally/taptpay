# Split Payment: Amount Bug & UX Fix

## What & Why

Two related issues with the split payment page:

1. **Full amount charges through sometimes** — When person 1 uses the default equal-split (no custom amount), they are redirected to checkout WITHOUT an `?amount` query param. Checkout then displays and submits the full `transaction.price` as the display amount. The backend does use the correct split amount from the split-payment record, but the checkout UI shows the wrong figure, which confuses users. Additionally, if the split-setup API call fails silently (no error handling), the backend falls back to the full `transaction.price` entirely.

2. **Custom-amount input starts at equal share, not full amount** — When a person clicks "enter different amount", the input is pre-filled with the calculated equal-share (e.g. $4.25) instead of the full remaining amount (e.g. $12.75). The user asked that the input starts at the full amount so they can see the maximum and choose downwards.

## Done looks like

- The checkout page always shows and charges the correct per-person amount, matching exactly what was shown on the split page.
- If person 1 picks the equal split and pays, checkout shows e.g. "$4.25", not "$12.75".
- When any person clicks "enter different amount", the input is pre-filled with the full remaining amount (not the equal share), so they can see the ceiling and adjust down.
- If the split-setup API call fails, the user sees an error message on the split page rather than being silently sent to checkout with the wrong amount.

## Out of scope

- Changing the overall split flow structure or number of steps.
- Modifying the backend `/pay` or `/split` endpoint logic (backend is already correct).

## Tasks

1. **Always pass `?amount` to checkout** — In `handlePay()` for both the first-person and subsequent-payer branches, always append `?amount=X.XX` to the checkout URL, even when the amount equals the default equal share. This fixes the checkout display showing the full transaction price.

2. **Add error handling for split-setup call** — If `POST /api/transactions/:id/split` returns a non-OK response, catch it and display an error message on the split page. Do not navigate to checkout if split setup fails.

3. **Pre-fill custom amount input with the full/remaining amount** — Change the `editValue` seed for person 1 from `confirmedCustom ?? equalShare` to `confirmedCustom ?? totalAmount.toFixed(2)`. For subsequent payers, change `subEditValue` seed from `subDisplay` to `remaining.toFixed(2)`. This matches the user's request to "start at the full amount".

## Relevant files

- `client/src/pages/split-payment.tsx`
