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
-   **Transaction Creation:** Merchant input via terminal -> Frontend validation -> Backend creates transaction in DB -> QR code generation -> SSE notification.
-   **Payment Processing:** Customer scans QR/uses URL -> Payment details display -> Payment initiation updates status to "processing" -> SSE broadcasts status -> External processor handles payment -> Final status update.
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