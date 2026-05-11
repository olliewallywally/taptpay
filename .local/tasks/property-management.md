# Property Management Vertical

## What & Why
Build the Property Management sector experience within TaptPay. The UI is the same foundation as the existing app but with specific pages, removed clutter, and property-focused workflows. Landlords and property managers track properties, issue rent payments, monitor overdue balances, and send automated reminders and receipts to tenants.

## Done looks like

### Terminal / Create Payment
- No split payment box
- No stock items link
- Payment creation form has: **Address**, **Tenant Name**, **Amount**
- Recurring payment option with **frequency** (weekly / fortnightly / monthly) and **day** it gets sent
- No cash sale processing button

### Navigation / Pages
- Stock page removed entirely
- No split payment functionality anywhere in the UI

### Analytics Page
- Graph removed
- Top tracking cards replaced with four KPI boxes: **Total Revenue**, **Total Payments**, **Overdue Payments**, **Number of Properties**
- Receipt/record rows show: Address, Tenant Name, Amount, Last Payment date, Next Payment date, Payments Up To Date (yes/no), Overdue (yes/no), Overdue Amount
- Overdue payment rows have a **"Send Reminder"** action — sends tenant an email with the overdue amount and a payment link

### Dashboard
- Tracks and displays: **Total Revenue**, **Total Payments Sent**, **Total Payments Paid**, **Total Payments Overdue**

### Receipts
- Auto-generated receipts still sent to tenants after payment (same PDF receipt flow, tenant receives by email)

## Out of scope
- Bond tracking
- Maintenance requests
- Automatic recurring invoice scheduling without merchant confirmation
- SMS sending (email only)

## Tasks
1. **Terminal UI** — Remove split payment box, stock link, and cash sale button. Replace item/price fields with Address, Tenant Name, Amount. Add recurring payment toggle with frequency and send-day selectors.

2. **Analytics page** — Remove graph. Replace top cards with Total Revenue, Total Payments, Overdue Payments, Number of Properties. Update record rows to show property-specific fields (address, tenant, last/next payment, overdue status + amount). Add "Send Reminder" button on overdue rows that fires an email with a payment link.

3. **Dashboard** — Update dashboard metrics to: Total Revenue, Total Payments Sent, Total Payments Paid, Total Payments Overdue.

4. **Remove stock page** — Remove the stock/items page and all navigation links to it for property-sector merchants.

5. **Receipts** — Ensure auto-generated tenant receipts are still emailed after successful payment. No changes to receipt format needed.

## Relevant files
- `client/src/pages/merchant-terminal.tsx`
- `client/src/pages/transactions.tsx`
- `client/src/pages/dashboard.tsx`
- `client/src/App.tsx`
- `server/email-service-multi.ts`
- `server/routes.ts`
