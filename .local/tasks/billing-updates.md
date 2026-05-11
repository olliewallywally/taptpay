# Billing Section Updates

## What & Why
Two issues in the billing/subscription settings need fixing:
1. The free tier monthly transaction limit is set to 1,000 in the code but should be 100 — after 100 free transactions per month, merchants are charged $0.10 per transaction.
2. There is no way for a merchant to add their credit or debit card in the billing section, so automated billing cannot actually charge them when they go over the free limit.

## Done looks like
- The free tier threshold is 100 transactions per month everywhere it appears (server logic, progress bar label, tier warning message, billing history)
- Merchants on the free tier who have used 100+ transactions see charges of $0.10 per transaction in their billing history
- The billing settings section contains a card input field where merchants can add a credit or debit card
- Saved cards are displayed with the last 4 digits and card type (Visa, Mastercard, etc.)
- Merchants can remove a saved card
- The card input integrates with the existing Stripe integration already installed in the project

## Out of scope
- Automatic charge triggering (future work — card capture only for now)
- Multiple saved cards (one card at a time is sufficient)
- Invoice PDF generation changes

## Tasks
1. **Fix the free tier limit** — Change the threshold from 1,000 to 100 in the server billing logic, and update all frontend displays (progress bar max, label text, warning thresholds) to show 100 consistently.

2. **Add card input to billing settings** — Add a credit/debit card entry form in the Subscription & Billing section of Settings using Stripe Elements (the Stripe integration is already configured). Save the resulting Stripe payment method ID to the merchant's record so it can be used for future billing.

3. **Display and manage saved card** — After a card is saved, show the card's last 4 digits and brand in the billing section. Provide a "Remove card" option that detaches the payment method from Stripe and clears it from the merchant record.

## Relevant files
- `server/storage.ts:2792-2807`
- `client/src/pages/settings.tsx`
- `server/routes.ts`
- `shared/schema.ts`
