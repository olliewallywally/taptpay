# Xero CSV Export Feature

## What & Why
Merchants need to reconcile TaptPay income in Xero. Add an "Export for Xero" button to the existing Download Reports section on the Transactions page. It generates a CSV in Xero's bank statement import format, ready to upload directly into Xero with no reformatting needed.

## Done looks like
- A new "Export for Xero" button appears alongside the existing CSV and PDF download buttons in the Download Reports section of the Transactions page
- Clicking it downloads a `.csv` file named with the merchant name and date range (e.g. `taptpay-xero-2026-03-01_2026-03-31.csv`)
- The CSV uses Xero's bank statement column format: Date (DD/MM/YYYY), Amount, Payee, Description, Reference
- Only completed and partially_refunded transactions are included (not pending/failed)
- Refunded transactions appear as negative-amount rows so the net position is accurate
- The exported data respects whatever date range filter the merchant currently has applied on the Transactions page
- A short tooltip or label on the button explains it is formatted for Xero bank statement import

## Out of scope
- Direct Xero API/OAuth integration (upload happens manually by the merchant)
- Exporting invoices, bills, or contacts — bank statement format only
- Any backend changes — this is a client-side CSV generation like the existing CSV export

## Tasks
1. **Add Xero CSV generation function** — In the Transactions page, add a `handleDownloadXeroCSV` function alongside the existing `handleDownloadCSV`. Format each completed transaction as a Xero bank statement row: Date in DD/MM/YYYY, Amount as the net (price minus fees if available, otherwise price), Payee as the item name, Description combining payment method and item, Reference as the TaptPay transaction ID. Include refunded transactions as negative rows.

2. **Add Export for Xero button** — In the Download Reports section, add a new button for the Xero export next to the existing CSV button. Use a relevant icon (e.g. `FileSpreadsheet` from lucide-react) and a tooltip clarifying it is for Xero bank statement import.

## Relevant files
- `client/src/pages/transactions.tsx`
- `shared/schema.ts`
