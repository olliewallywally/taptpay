# Handoff — onboarding, billing-card gate, crypto-payment removal, and merchant tutorials

Date: 2026-07-20 UTC
Repository: olliewallywally/taptpay
Current branch: feat/property-dashboard-redesign
Base HEAD before this uncommitted work: 76ad41a
Status: implemented, browser-checked, typechecked, tested, and production-build green
Commit/push status: NOT committed and NOT pushed

## Read this before staging

The working tree contains the requested application work plus local Claude/Replit metadata. Do not use a blind git add -A.

Exclude these machine/session files from any product commit:

- .claude-home/**
- .claude/settings.local.json

Do not reset or restore the remaining source changes: they contain the requested onboarding, billing, crypto-removal, and tutorial work. Review and stage them intentionally.

The tracked client/public/app bundle has a large hash rollover: old generated assets are deleted and replacement hashed assets are untracked. If that checked-in deployment snapshot is meant to ship, stage the directory with git add -A client/public/app so additions and deletions remain paired. npm run build writes to dist/public and does not refresh client/public/app; verify the repository's deployment convention before publishing that snapshot.

## 1. Consolidated merchant signup and onboarding

The merchant account-creation flow was redesigned as one branded four-stage Stepper:

1. Contact details: full name, email, and phone.
2. Business details.
3. Remaining KYC/security information.
4. Verify: creates the pending account and sends the verification email.

Implemented behavior:

- React Bits-style Stepper integrated with the TaptPay navy, sky blue, and off-white palette.
- Responsive animated step transitions and per-step validation.
- Shared publicSignupSchema validates the complete payload and password confirmation.
- Bank-account inputs were removed from signup/onboarding.
- The old merchant bank-account update endpoint now returns HTTP 410 and does not collect new details.
- Legacy bank columns/storage methods remain for backward compatibility and data safety; do not drop them casually.
- Final signup sends the merchant to the dedicated Check your email page.
- Confirmation/resend flows are connected.
- After confirmation, complete consolidated applications are marked email verified and onboarding complete.
- Email confirmation sends the completed application to oliver@taptpay.co.nz, including contact, business, and KYC fields.
- Email output escapes merchant-supplied HTML and strips newlines from the subject.
- The onboarding success action performs a full navigation to /dashboard so the app-wide auth state is refreshed and the new-user tutorial can start.

Primary files:

- client/src/components/Stepper.jsx
- client/src/components/Stepper.css
- client/src/components/Stepper.d.ts
- client/src/pages/merchant-signup.tsx
- client/src/pages/merchant-signup.css
- client/src/pages/check-email.tsx
- client/src/pages/confirm-email.tsx
- client/src/pages/merchant-onboarding.tsx
- shared/schema.ts
- server/routes.ts
- server/storage.ts
- client/src/__tests__/signup-schema.test.ts

## 2. Settings billing card and payment-send prerequisite

Merchants can add or remove a billing card in Settings. Payment requests are blocked until masked metadata represents a supported, unexpired card.

Implemented behavior:

- Card number is Luhn validated.
- Expiry must be a valid, unexpired MM/YY value.
- Supported brands are Visa, Mastercard, and Amex.
- CVC is validated but never stored.
- Only brand, last four digits, and expiry are persisted.
- Authenticated GET/POST/DELETE billing-card endpoints are provided.
- Payment-creation and payment-delivery paths return HTTP 402 with code BILLING_CARD_REQUIRED when the merchant is not ready.
- The frontend converts that response into a persistent top-of-screen warning with an Open Settings action.
- Retail, Property, Trades, scheduled sends, reminders, resend paths, and background delivery jobs received server-side checks.
- Public merchant responses strip bank/card financial fields.

Important production limitation:

This is currently an eligibility gate, not live card tokenisation. server/routes.ts contains a TODO to tokenise through Windcave when its billing API is available. The full number reaches this server endpoint for validation but is not persisted; CVC is not persisted. Before representing this as a production billing payment method, replace the placeholder with a PCI-appropriate hosted/tokenised flow and store only the provider token plus masked metadata.

Primary files:

- server/billing-card.ts
- server/routes.ts
- server/storage.ts
- server/property-cron.ts
- server/trades-cron.ts
- server/trades-delivery.ts
- client/src/pages/settings.tsx
- client/src/components/notification-system.tsx
- client/src/lib/queryClient.ts
- client/src/lib/property-api.ts
- client/src/lib/trades-api.ts
- client/src/pages/property/property-terminal.tsx
- client/src/pages/trades/trades-terminal.tsx
- shared/schema.ts
- client/src/__tests__/billing-card.test.ts

Database note: shared/schema.ts includes billing_card_last4, billing_card_brand, and billing_card_expiry. There is no dedicated billing-card SQL migration in this change set. Before deployment, verify whether those columns already exist in the target database; otherwise create/review an additive migration or apply the schema through the project's guarded schema process.

## 3. Crypto-payment feature removal

Everything product-facing for cryptocurrency payments was removed while preserving normal card, QR, NFC, Property, Trades, scheduled delivery, authentication, and security behavior.

Verification:

- A domain search for cryptocurrency, Bitcoin, Ethereum, crypto-payment labels, wallet addresses, BTC, ETH, USDC, and USDT returns no matches in client/src, server, or shared.
- Node's built-in crypto module remains intentionally. It is used for secure tokens, nonces, session IDs, passwords, and timing-safe comparisons. Do not remove it as part of crypto-payment cleanup.
- client/public/app was replaced with a crypto-free generated asset set; the hash rollover must be staged as additions plus deletions.
- Security and delivery changes in server/index.ts, server/routes.ts, cron/delivery files, and the API helpers must be reviewed as part of the combined diff rather than discarded.

## 4. First-visit, page-by-page tutorial mode

A durable merchant tutorial system now covers 20 authenticated merchant pages across Retail, Property, Trades, and Settings.

Behavior:

- New merchants automatically receive a tutorial the first time they open each page after completing onboarding.
- Tutorials do not navigate between pages.
- Each page has two concise, feature-targeted steps.
- A white spring/bounce card appears over a blurred navy-tinted background.
- The selected feature remains sharp with a sky-blue outline and tag.
- The card has a top-right X, bottom-right arrow, step counter, keyboard focus trap, Escape support, and reduced-motion support.
- Closing with X dismisses only the current page.
- Completing or dismissing a page prevents that page from opening automatically again.
- A first visit to a different page still starts that page's tutorial.
- Browser Back/Forward dismisses the old-page overlay so it cannot remain over the destination route.
- Progress is stored per authenticated merchant on the server, not just in localStorage.
- Generation numbers make Restart Tutorials atomic and isolate stale requests.
- Delayed responses from an old generation cannot repopulate the restarted client cache.
- Existing merchants are not surprised automatically by migration; they can start the tutorials from Settings.
- Settings includes Tutorial & Help, page progress, confirmation, and Start/Restart Tutorials.
- Restart increments the generation, resets all effective progress, and starts Settings immediately under the same page-by-page rules.
- Admin and pre-onboarding routes do not run merchant tutorials.

Tutorial files:

- shared/tutorial.ts
- client/src/features/tutorial/tutorial.tsx
- client/src/features/tutorial/tutorial.css
- client/src/features/tutorial/tutorial-registry.ts
- client/src/App.tsx
- client/src/pages/settings.tsx
- client/src/pages/property/tenant-profile.tsx
- client/src/pages/trades/client-profile.tsx
- server/routes.ts
- server/storage.ts
- shared/schema.ts
- migrations/0010_merchant_tutorial_progress.sql
- client/src/__tests__/tutorial-registry.test.ts

Migration 0010:

- Adds merchants.tutorial_generation, default 1.
- Adds merchants.tutorial_auto_enabled, default true for new merchants.
- Backfills existing merchants to false so they must opt in from Settings.
- Creates merchant_tutorial_progress with merchant/generation/page uniqueness and a merchant/generation lookup index.

The project intentionally gates automatic schema pushes. Apply and review migrations/0010_merchant_tutorial_progress.sql through the approved deployment migration process; do not assume a normal restart will apply it.

## 5. Verification already completed

Commands and results:

- npm run check — passed.
- npx jest client/src/__tests__/tutorial-registry.test.ts client/src/__tests__/billing-card.test.ts client/src/__tests__/signup-schema.test.ts --runInBand — 3 suites, 12 tests passed.
- npm run build — passed for Vite client and esbuild server.
- git diff --check — passed.

Browser verification used Chromium 125 from Nix because the bundled Playwright binary lacked libnspr4.

Verified browser journeys:

- Dashboard tutorial opens without changing route.
- X dismisses Dashboard only and persists that state.
- Stock tutorial automatically opens on its first visit.
- Completing Stock prevents it reopening after reload.
- Settings tutorial can be dismissed.
- Restart Tutorials increments the generation, stays on /settings, and immediately reopens the Settings walkthrough.
- Mobile screenshots were visually inspected for Dashboard, Stock, and restarted Settings.
- Reduced-motion rendering was also exercised.

Non-blocking output warnings:

- Browserslist/baseline mapping data is old.
- Vite reports existing chunks larger than 500 kB.
- Jest reports the existing force-exit/open-handle warning.

## 6. GitHub handoff checklist

1. Re-read this file and inspect git status --short.
2. Review source diffs by feature; do not discard overlapping server/routes.ts, server/storage.ts, or shared/schema.ts edits.
3. Exclude .claude-home/** and .claude/settings.local.json.
4. Decide whether client/public/app is a checked-in deployment artifact. If yes, stage the whole directory with deletions and replacement hashes together.
5. Stage the source, tests, migration, this handoff, .agents/memory updates, replit.md, and CLAUDE.md intentionally.
6. Run git diff --cached --check and inspect git diff --cached --stat.
7. Re-run npm run check, the three focused Jest suites, and npm run build.
8. Verify the target database plan for the billing columns and migration 0010.
9. Commit only after the staged scope is clean. Suggested message: feat: rebuild merchant onboarding, billing gate, and tutorials
10. Push feat/property-dashboard-redesign to origin or create a clean feature branch/PR if repository policy prefers that.

No commit or push was performed by Codex.
