---
title: Cash sale success popup: show receipt QR
---
# Cash Sale Receipt QR in Success Popup

## What & Why
When a merchant records a cash sale and the success popup appears, there is currently no way for the customer to get a digital receipt. Adding a QR code to that popup lets the customer scan it with their own phone to view or save their receipt — no merchant action required.

## Done looks like
- After a cash sale is recorded, the success modal displays a QR code alongside the existing amount/item name confirmation
- The QR code links to the transaction's receipt page (the same URL used by the existing receipt/PDF flow)
- The QR code uses TaptPay's cyan-on-transparent brand styling, consistent with the rest of the app's QR codes
- The merchant can still download or share the PDF receipt as before — the QR is additive
- The QR is sized appropriately for a phone screen — large enough to be scanned from a reasonable distance

## Out of scope
- Changing the existing receipt page design
- Sending the receipt via SMS or email from this popup
- QR codes on other payment method success flows (NFC, card, etc.) — cash sale only

## Tasks
1. **Generate a receipt URL per cash sale transaction** — After the cash sale API responds with the transaction ID, construct the receipt URL (`/receipt/:id` or equivalent) that the customer can navigate to.

2. **Add QR code to the success modal** — In the cash sale success popup in the demo terminal, render a QR code image using the existing backend QR generation endpoint, pointing to the receipt URL. Use the existing `QRCodeDisplay` component or the `/api/merchants/:id/qr` endpoint pattern.

3. **Style and layout** — Place the QR code between the success icon and the action buttons, with a "Customer can scan to view receipt" label. Keep the modal compact on mobile.

## Relevant files
- `client/src/pages/demo-terminal.tsx`
- `client/src/components/qr-code-display.tsx`
- `server/routes.ts`