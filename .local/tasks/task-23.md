---
title: Billing updates: limit 100, add card input (Windcave-ready stub)
---
# Billing Section Updates

  ## What & Why
  Two issues in the billing/subscription settings need fixing:
  1. The free tier monthly transaction limit is set to 1,000 in the code but should be 100 — after 100 free transactions per month, merchants are charged $0.10 per transaction.
  2. There is no way for a merchant to add their credit or debit card in the billing section. Windcave will provide a billing API for this in future, so build the UI and storage layer as a clean stub that can be wired up when the API is ready.

  ## Done looks like
  - The free tier threshold is 100 transactions per month everywhere it appears (server logic, progress bar label, tier warning message, billing history)
  - The billing settings section contains a card input form with fields for card number, expiry, and CVC — styled consistently with the rest of the settings page
  - Submitting the form saves the card details to the merchant record (stored as masked/tokenised placeholders for now — no real processing)
  - A saved card is displayed with the last 4 digits and card type label (e.g. "Visa ending in 4242")
  - There is a "Remove card" option that clears the saved card from the merchant record
  - The form shows a clear "Payment processing coming soon via Windcave" notice so merchants understand it is not live yet
  - All storage and API endpoints are structured so swapping in the real Windcave billing API requires only filling in the backend call — the UI and data model do not need to change

  ## Out of scope
  - Any live payment processing or real card charging (Windcave API not yet available)
  - Stripe or any other payment processor
  - Automatic charge triggering

  ## Tasks
  1. **Fix the free tier limit** — Change the threshold from 1,000 to 100 in the server billing logic, and update all frontend displays (progress bar max, label text, warning thresholds) to show 100 consistently.

  2. **Add card input UI to billing settings** — Add a credit/debit card entry form in the Subscription & Billing section of Settings with fields for card number, expiry, and CVC. On submit, call a new backend endpoint that stores the masked card details (last 4 digits + type) against the merchant record. Include a visible "coming soon" notice explaining Windcave will handle live processing.

  3. **Display and manage saved card** — After a card is saved, show the masked card info in the billing section. Provide a "Remove card" option that clears it from the merchant record. The backend endpoint should be structured so the Windcave billing API call can be added in place of the placeholder logic later.

  ## Relevant files
  - `server/storage.ts:2792-2807`
  - `client/src/pages/settings.tsx`
  - `server/routes.ts`
  - `shared/schema.ts`