# Sector-Aware App Architecture

## What & Why
TaptPay should feel like three distinct products depending on who is using it. At signup, the merchant selects their sector (Hospitality/Retail/Events, Trades, or Property Management). From that point on, the entire app adapts — navigation labels, page names, feature visibility, fee rates, and terminology all change to match their world. One codebase, three experiences.

## Done looks like
- **Signup** has a prominent sector-selection step before the standard form: three large cards with icon, name, and a one-line pitch. The selection is saved to the merchant record (`businessSector` field).
- **Navigation** reflects the sector:
  - Hospitality → Terminal, Dashboard, Transactions, Board Builder
  - Trades → Jobs, Dashboard, Transactions, Board Builder
  - Property → Properties, Rent Roll, Transactions, Board Builder
- **Dashboard** shows sector-appropriate language and metrics (e.g. "Today's jobs" vs "Rent collected this month")
- **Fee display** throughout (terminal, receipts, settings) shows the correct rate:
  - Hospitality / Property: flat $0.10 per transaction
  - Trades: 0.3% per transaction
- **Settings** shows the merchant's sector and rate clearly
- **Sector context** is available app-wide via a React context/hook (`useSector()`) so any component can adapt without prop-drilling

## Out of scope
- Trades-specific job management pages (Task #11)
- Property-specific property/rent pages (Task #12)
- Ability for merchants to switch sector after signup

## Tasks
1. **Schema** — Add `businessSector` enum column (`hospitality_retail`, `trades`, `property`) to the `merchants` table. Default existing rows to `hospitality_retail`.

2. **Signup sector-selection step** — Add a visually distinct step to the signup page before the business details form: three large selectable cards with icon, name, and pitch line. Pass the selected sector to the create-merchant API.

3. **Sector context provider** — Create a `SectorContext` (React context + `useSector()` hook) that reads the logged-in merchant's sector and exposes: sector key, display name, fee description, and a feature-flags object (e.g. `{ hasJobs: false, hasProperties: true }`). Wrap the app in this provider.

4. **Adaptive navigation** — Update the sidebar/navbar to use `useSector()` to show the correct nav items and labels for the active sector. Hide sector-specific items that don't belong (e.g. hide "Jobs" for property merchants).

5. **Fee calculation** — Update `server/storage.ts` fee logic to apply 0.3% for trades and $0.10 flat for the other two sectors. Update any fee display components to read the correct rate from sector context.

## Relevant files
- `shared/schema.ts`
- `client/src/pages/merchant-signup.tsx`
- `server/storage.ts`
- `server/routes.ts`
- `client/src/App.tsx`
- `client/src/pages/settings.tsx`
- `client/src/pages/dashboard.tsx`
