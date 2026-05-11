# Trades Vertical Features

## What & Why
Build the Trades sector experience for tradespeople (plumbers, electricians, builders, etc.). Same app foundation but adapted for job-based payments: client and job details on the payment form, invoices instead of receipts, 0.3% fee rate, and removal of retail-focused features that don't apply.

## Done looks like

### Fees
- Transaction fee is **0.3% of the transaction amount** (not the flat $0.10 used by hospitality/retail)
- Fee shown correctly in the terminal, transaction breakdown, and settings

### Terminal / Create Payment
- Payment creation form fields: **Client Name**, **Address**, **Job Details** (text field), **Price**
- No stock items link
- No cash sale processing button

### Receipts / Invoices
- Auto-generated post-payment document is labelled **"Invoice"** (not "Receipt") throughout the UI and in the emailed PDF
- Invoice includes: client name, address, job details, amount, date, merchant business name

### Navigation / Pages
- Stock page removed entirely for trades-sector merchants

## Out of scope
- Quote/estimate generation before payment
- Progress payment milestones (deposit + final)
- Materials cost tracking
- SMS sending (email only)

## Tasks
1. **Fee rate** — Ensure the 0.3% per-transaction fee is correctly applied and displayed for trades merchants across the terminal, transaction history, and settings. This follows from the sector fee logic built in Task #10 but needs UI confirmation in all the right places.

2. **Terminal UI** — Replace the standard item/price fields with Client Name, Address, Job Details, and Price. Remove the stock items link and cash sale button for trades-sector merchants.

3. **Invoice labelling** — Rename "Receipt" to "Invoice" everywhere for trades merchants — the emailed PDF, the in-app download link, and any UI references. Invoice content should include client name, address, job details, amount, and date.

4. **Remove stock page** — Remove the stock/items page and all navigation links to it for trades-sector merchants.

## Relevant files
- `client/src/pages/merchant-terminal.tsx`
- `client/src/pages/receipt.tsx`
- `server/email-service-multi.ts`
- `server/storage.ts`
- `client/src/App.tsx`
