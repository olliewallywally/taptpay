# Split Payment Page Improvements

## What & Why
Two UX fixes on the split payment page: fix the blue card overlapping the confirm button, and add a custom amount input so each person can pay a different amount than the equal split.

## Done looks like
- The blue card and turquoise confirm button section no longer overlap — the button is fully visible and tappable
- On the "your turn to pay" screen, a subtle "pay a different amount" toggle appears below the suggested share amount
- When toggled, an input field appears for the customer to type their own amount (must be > $0 and ≤ total remaining)
- The "pay" button reflects the custom amount if one has been entered
- The custom amount is passed to the checkout page via query param and used as the charge amount there
- The checkout page's displayed amount updates to reflect the custom amount when present

## Out of scope
- Changing how the backend stores or tracks split amounts
- Validation that custom amounts across all payers add up to the total

## Tasks
1. **Fix the overlap** — Adjust the padding and negative margin values on the blue and turquoise sections so the confirm/pay button sits cleanly below the blue card with no overlap.

2. **Add custom amount toggle** — On the "waiting" (your turn to pay) state, add a "pay a different amount" link below the suggested share. When tapped, show a numeric input pre-filled with the split share. Validate it's a positive number. Update the pay button label to reflect the custom amount.

3. **Pass custom amount to checkout** — When navigating to `/checkout/:id`, append `?amount=X` if a custom amount was entered. Update the checkout page to read this query param and use it as the display amount and the amount sent to Windcave when creating the payment session.

## Relevant files
- `client/src/pages/split-payment.tsx`
- `client/src/pages/checkout.tsx:28-100,207-260,355-370`
