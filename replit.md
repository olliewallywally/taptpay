# Scan to Pay Terminal

## Overview

This project is a full-stack payment terminal application enabling QR code and NFC-based transactions. Its core purpose is to provide merchants with a real-time payment interface where customers can pay by scanning QR codes or tapping their devices. The system ensures real-time updates via Server-Sent Events (SSE) and features a modern, intuitive user interface.



The business vision is to offer a streamlined, efficient, and modern payment solution, simplifying transactions for both merchants and customers, with a revenue model based on fixed fees per transaction.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application adopts a monorepo structure, separating client, server, and shared components.

**Core Technologies:**
-   **Frontend:** React with TypeScript and Vite.
-   **Backend:** Express.js with TypeScript.
-   **Database:** PostgreSQL with Drizzle ORM.
-   **Real-time:** Server-Sent Events (SSE).
-   **UI Framework:** shadcn/ui with Tailwind CSS.
-   **State Management:** TanStack Query.

**Frontend Design & Features:**
-   Utilizes `wouter` for lightweight routing.
-   Forms managed with React Hook Form and Zod validation.
-   Comprehensive shadcn/ui component library with custom Tailwind CSS design tokens.
-   Custom SSE client for live transaction updates.
-   Unified tabbed interface for payment terminal and NFC functionalities, with glass morphism design for tab buttons.
-   Optimized customer payment page for faster loading times and minimalist NFC redesign.
-   Reusable AnimatedBrandBackground component for consistent brand theming across pages (turquoise background, floating blue circles, line-art shapes with animations).

**Backend Design & Features:**
-   RESTful API with modular route registration.
-   Drizzle ORM for database interaction, supporting PostgreSQL and an in-memory fallback for development.
-   Abstracted storage layer.
-   Robust SSE implementation for real-time updates.
-   JWT-based authentication with bcrypt hashing, supporting protected routes and session management.
-   API security includes bearer token authentication, Zod schema validation, and proper error handling.
-   Comprehensive refund system with dedicated API routes, database schema, and real-time SSE notifications.
-   Web Push notifications for real-time transaction alerts (created, completed, failed, refunded) using VAPID/Web Push API.

**Database Schema Highlights:**
-   `Merchants` table: Stores merchant details, including business name, email, director, address, NZBN, phone, GST number, Windcave API key, custom logo URL, and QR/payment URLs.
-   `Transactions` table: Records transaction details, status, external processor IDs, and fee breakdowns (Windcave, Platform, Merchant net).
-   `Platform Fees` table: Tracks platform fee collection per transaction.
-   `Push Subscriptions` table: Stores Web Push subscription endpoints per merchant (endpoint, VAPID keys, active status).

**Key Data Flows:**
-   **Transaction Creation:** Merchant input via terminal (with optional Split Bill toggle) -> Frontend validation -> Backend creates transaction in DB with `splitEnabled` flag -> QR code generation -> SSE notification.
-   **Payment Processing (Windcave HPP):** Customer scans QR/uses URL -> `/pay/:merchantId` page displays amount -> Customer clicks Pay -> `POST /api/transactions/:id/pay` creates Windcave session -> Backend returns `{ hppUrl }` -> Frontend redirects to Windcave HPP -> Customer enters card details on Windcave's secure page -> Windcave POSTs to `/api/windcave/notification` -> Session state machine updates DB -> SSE broadcasts to merchant -> Customer browser redirected to `/api/windcave/callback` -> Redirect to `/payment/result/:id?status=approved|declined|cancelled`.
-   **Split Bill Flow:** Merchant toggles "Split Bill" on before creating transaction -> Customer opens payment URL -> Redirected to `/split/:transactionId` -> Customer chooses number of splits (2-10) -> `POST /api/transactions/:id/split` sets `isSplit=true` -> Each person goes through Windcave HPP for their share -> After each payment, callback redirects to `/receipt/:id?splitId=X` where each payer receives their individual receipt.
-   **Receipt Flow:** After successful payment, customer is redirected to `/receipt/:transactionId` (optionally with `?splitId=X` for split payments). Receipt shows full business info (name, GST number, NZBN, address), itemised breakdown, GST calculation (15% NZ), total, and PDF download + Share buttons. Web Share API used for sharing — shares the PDF file on mobile, falls back to link sharing on desktop. Failed/cancelled payments show "Try Again" button on `/payment/result/:id?status=declined|cancelled`.
-   **Real-time Updates:** SSE connections per merchant for immediate transaction status broadcasts to both merchant and customer interfaces.
-   **Push Notifications:** On transaction status changes (created, completed, failed, refunded), push notifications sent to all active subscriptions for the merchant via Web Push API. Merchants enable/disable in Settings page.

**Security & Production Features:**
-   Authentication: JWT-based, protected routes, session management.
-   Admin Authentication: Configurable via ADMIN_EMAIL and ADMIN_PASSWORD_HASH env vars. Admin login disabled if ADMIN_PASSWORD_HASH not set. Uses bcrypt for password verification.
-   Merchant Route Authorization: All merchant data routes enforce ownership checks via `checkMerchantOwnership()` helper - admins can access all merchants, regular users can only access their own merchant data.
-   Hybrid Database: PostgreSQL for production, in-memory for development.
-   API Security: Bearer tokens, Zod validation, error handling, CORS.
-   Merchant Update Security: PUT /api/merchants/:id endpoint validates and restricts updatable fields to prevent privilege escalation (allowlist: businessName, director, address, nzbn, phone, email, gstNumber, windcaveApiKey).
-   File Upload Security: Logo uploads restricted to PNG format, 20MB max, with automatic file cleanup on errors/deletions.
-   **Payment Stone Isolation Security (Production-Ready):**
    -   Server-side validation: Verifies stoneId belongs to merchantId before returning transactions, preventing URL tampering.
    -   Payment endpoint verification: Triple verification (transaction→merchant, transaction→stone, stone→merchant) with Zod schema validation blocks cross-stone and cross-merchant payment tampering.
    -   Transaction ownership: Payments require merchantId and stoneId in request body; rejected with 403 Forbidden if relationships don't match.
    -   SSE filtering: Real-time updates filtered by specific stoneId, ensuring each stone only receives its own transaction events.
    -   Rate limiting: 100 requests per minute per IP across all payment endpoints with automatic cleanup, returns 429 on limit exceeded.
    -   Audit logging: All payment page accesses and payment attempts logged with IP addresses; security violations logged with SECURITY prefix.
    -   Multi-stone support: Supports unlimited payment stones per merchant with complete isolation; stone renaming safe (uses immutable IDs).
-   Deployment: `npm run dev` for development, `npm run build` for production, Drizzle Kit for database migrations.

## Data Safety Policy

- **Nothing syncs the schema on startup.** Starting the server does **not** apply schema changes, and as of 2026-08-10 it performs no DDL of any kind — the three ad-hoc `ADD COLUMN IF NOT EXISTS` blocks were moved into `migrations/0015`. The `drizzle-kit push` block in `server/index.ts` only runs when `RUN_SCHEMA_PUSH=true`, which is normally off. `RUN_MIGRATIONS` is **retired** and now exits fatally if set; it never ran migrations, it aliased the push. Adding a column to `shared/schema.ts` and restarting therefore changes nothing in the database — and because Drizzle's `select()` lists every declared column, the *code* will then query a column the database does not have and every read of that table fails. On 2026-08-09 this took the whole app down: `/api/auth/me` threw, and since first paint is gated on it, every device sat on a loading spinner.
- **Apply schema changes as numbered SQL migrations.** Write additive SQL in `migrations/`, then run `npm run db:migrate`. `npm run db:migrate:status` reports applied/pending/drifted; startup never applies anything by itself. In development it reports pending work loudly and boots anyway; **in production it refuses to boot** rather than serve traffic against a schema it does not recognise, so a deploy is always migrate-first. Adopting the runner on a database that already has the effects is `npm run db:migrate:baseline -- --confirm`, which now verifies the effects are genuinely present before recording them. Both dev and production were baselined at 15 migrations on 2026-08-09; dev reached 18 on 2026-08-10.
- **Migrations are a deploy step, not a runtime feature.** `npm run db:migrate` is `tsx server/migrate.ts`, and `tsx` is a devDependency — deliberately, because every deploy already installs devDependencies to run the build (`vite`/`esbuild`). Run migrations from that same context. `pg` is different: `server/index.ts` reaches the migration gate on every boot and that gate imports `pg` at runtime, so `pg` is a **production** dependency. With the gate now fail-closed, a `--omit=dev` install that could not resolve `pg` would stop production from booting.
- **Never use `--force` with `drizzle-kit push`, and prefer not to use push at all.** It reports the FK columns that were created as `serial` (`transactions.merchant_id`, `platform_fees.transaction_id`, `refunds.transaction_id`) as destructive changes and offers to truncate those tables. Without `--force` it refuses and exits non-zero rather than destroying data. Use a migration instead.
- **Never truncate or seed over live data.** The `seedDatabase()` function in `server/seed.ts` has a guard that exits immediately if any merchants exist. This guard must never be removed. Stock items, transactions, and merchant records must never be deleted or replaced by any startup routine.
- **`migrations/` is not yet a complete schema history.** Nine tables and a number of `merchants`/`invoices_rent_requests` columns exist in the databases but are created by no migration — they arrived via `drizzle-kit push` and the ad-hoc `ADD COLUMN IF NOT EXISTS` blocks in `server/index.ts`. The runner guarantees nothing is missed going forward, but the database cannot yet be rebuilt from `migrations/` alone.

## External Dependencies

**Core Frameworks:**
-   React 18
-   Express
-   TypeScript
-   Vite

**Database & ORM:**
-   Drizzle ORM
-   `@neondatabase/serverless` (PostgreSQL driver)
-   Drizzle Kit

**UI & Styling:**
-   Radix UI
-   Tailwind CSS
-   Framer Motion
-   Lucide React

**Data Management:**
-   TanStack Query
-   React Hook Form
-   Zod

**Development Tools:**
-   tsx
-   esbuild
-   PostCSS

**Payment Integrations:**
-   Windcave (external payment processor)

**Email Service (for authentication/verification):**
-   SendGrid (or similar, adaptable)

**Digital Wallet Integration:**
-   Native Apple Pay and Google Pay integration with proper branded buttons and compliance
-   Payment Request API implementation for cross-browser compatibility
-   Built-in "tap to phone" NFC payment API with support for Apple Pay, Google Pay, Samsung Pay, and contactless cards
-   Feature detection and graceful fallback for unsupported devices

## Current Implementation Handoff — 2026-07-20

Before committing or pushing the current merchant onboarding, billing-card prerequisite, crypto-payment removal, or tutorial work, read docs/HANDOFF-2026-07-20-onboarding-billing-tutorial.md and .agents/memory/merchant-onboarding-billing-tutorial-2026-07-20.md. The work is implemented but deliberately uncommitted. Do not stage .claude-home/** or .claude/settings.local.json, and review the client/public/app generated-asset rollover as one unit.
