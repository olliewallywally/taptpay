# Split-bill parity across all verticals — design

**Date:** 2026-06-27
**Branch:** `feat/trades-phase3c-cross-cutting`
**Status:** Approved design, ready for implementation plan

## Goal

Bring bill-splitting to the **trades** vertical and make the customer-facing
split experience **vertical-neutral** across retail, property, and trades — so it
no longer reads as a property-only ("flatmate") feature. The split stays
**merchant-gated**: the merchant enables split when sending, and the customer
performs the actual division at pay time.

## Background — current state (verified 2026-06-27)

Splitting is already plumbed end-to-end in the data model and backend for all
three verticals. This is therefore a **mostly-frontend** change.

- **Schema** — all three payment tables carry split columns:
  - `transactions` (retail): `isSplit`, `totalSplits`, `completedSplits`, `splitAmount`, `splitEnabled`
  - `invoices_rent_requests` (property): `splitEnabled`, `splitCount`, `splitPaidCount`, `splitPaidSessions`, `splitPayerEmails`
  - `job_invoices` (trades): identical shape to property — `splitEnabled`, `splitCount`, `splitPaidCount`, `splitPaidSessions`, `splitPayerEmails`
- **Backend routes:**
  - Retail: `POST /api/transactions/:id/split`, `PATCH /api/transactions/:id/split-enabled`, redirect to `/split/:id`.
  - Property + trades: shared token checkout; `POST /api/checkout/:token/split` already processes both. The trades invoice-create route (`server/routes.ts` ~6948) already persists `splitEnabled` from its request body.
- **Customer UI — two live flows, kept as-is structurally:**
  - Retail → standalone `/split-payment` page (`client/src/pages/split-payment.tsx`) — already vertical-neutral.
  - Property + trades → inline split inside shared `client/src/pages/checkout.tsx` — currently worded "Split with flatmates".
- **Dead code:** `client/src/components/bill-split.tsx` (the green `BillSplit` component) is imported nowhere.

### The actual gaps

1. **Trades merchant toggle is missing.** Property exposes a `splitMode` toggle on its send screen (`property-terminal.tsx` ~504); trades exposes no split toggle anywhere, even though its backend already accepts `splitEnabled`.
2. **Customer wording is property-specific.** Shared `checkout.tsx` and the property terminal indicator say "flatmate(s)".
3. **Balance path can't be split.** The trades balance is issued by a one-tap action (`JobActionSheet` "send remaining balance" → `POST /api/trades/invoices/:id/send-balance`, `routes.ts` ~6969). That route creates the balance invoice **without** `splitEnabled`, and there is no UI surface to set it.

## Decisions (from brainstorming)

- **UI convergence:** Neutralize wording only. Keep both customer flows (standalone retail page + inline checkout) structurally unchanged.
- **Who can split:** Merchant-gated. Merchant enables; customer divides at pay time. Ensure the enable toggle is exposed in all three verticals (the gap is trades).
- **Customer-facing label:** "Split the bill".
- **Trades toggle placement:** Quick invoice **and** balance.

## Design

### 1. Trades — quick invoice split toggle (frontend only)

Add a `splitEnabled` toggle to the **QuickInvoice** send screen in
`client/src/pages/trades/trades-terminal.tsx` (~line 318), modelled on the
existing `depositEnabled` toggle pattern already on the quote screen and on
property's `splitMode` toggle.

- Local state `splitEnabled` (default `false`), reset after send.
- When on, the create-invoice mutation includes `splitEnabled: true` (route already accepts it).
- A small confirmation indicator under the CTA: **"split enabled — bill can be divided"** (mirrors property's indicator line, neutral wording).
- Visual styling follows the trades palette tokens already in the file; no new color literals.

### 2. Trades — balance split toggle (small backend + frontend)

- **Backend:** `POST /api/trades/invoices/:id/send-balance` (`routes.ts` ~6969) accepts an optional `splitEnabled: boolean` in the request body and passes it to `createJobInvoice` for the balance invoice (currently it is omitted, defaulting to `false`). Additive only — no schema, no migration.
- **Frontend:** add a split toggle to the `JobActionSheet` "send remaining balance" action so the merchant can opt in before issuing the balance. The `jobActionMutation` `send-balance` call forwards `splitEnabled`.

### 3. Generic wording (neutralize "flatmate")

Replace property-specific copy wherever the customer or shared UI sees it:

- `client/src/pages/checkout.tsx`:
  - "Split with flatmates" → **"Split the bill"**.
  - Fix the two `// flatmate` code comments (~line 181, ~964) to neutral wording.
  - "How many of you are splitting?" stays (already neutral).
- `client/src/pages/property/property-terminal.tsx` (~504): "split bill enabled — flatmates can divide it" → **"split enabled — bill can be divided"**.
- Retail `/split-payment` page: already neutral — no change.

### 4. Cleanup

Delete the dead `client/src/components/bill-split.tsx`. Confirm no imports
remain before removal.

## Out of scope

- Splitting trades **quotes** or **deposits** (semantically odd to split a deposit; only lump-sum invoice and balance get the toggle).
- Any change to the retail standalone `/split-payment` page beyond confirming it stays neutral.
- Merging the two customer UIs into one component (explicitly declined — neutralize wording only).
- Schema changes, migrations, or changes to the split *payment* mechanics.

## Testing / verification

- `npm run check` (tsc) clean.
- Existing trades tests stay green (GST suite, any invoice/checkout tests).
- Grep confirms zero remaining "flatmate" references in customer-facing or shared client code.
- Grep confirms `bill-split.tsx` has no importers before deletion.
- **Visual verification** of the trades toggles + checkout wording must be done in the Replit webview / locally — a browser cannot be launched in this sandbox (Nix/Playwright install is banned here).

## Files touched (anticipated)

- `client/src/pages/trades/trades-terminal.tsx` — quick-invoice + JobActionSheet balance toggles.
- `server/routes.ts` — `send-balance` accepts `splitEnabled`.
- `client/src/pages/checkout.tsx` — wording + comments.
- `client/src/pages/property/property-terminal.tsx` — indicator wording.
- `client/src/components/bill-split.tsx` — deleted.
