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

**Database Schema Highlights:**
-   `Merchants` table: Stores merchant details, including business name, email, and QR/payment URLs.
-   `Transactions` table: Records transaction details, status, external processor IDs, and fee breakdowns (Windcave, Platform, Merchant net).
-   `Platform Fees` table: Tracks platform fee collection per transaction.

**Key Data Flows:**
-   **Transaction Creation:** Merchant input via terminal -> Frontend validation -> Backend creates transaction in DB -> QR code generation -> SSE notification.
-   **Payment Processing:** Customer scans QR/uses URL -> Payment details display -> Payment initiation updates status to "processing" -> SSE broadcasts status -> External processor handles payment -> Final status update.
-   **Real-time Updates:** SSE connections per merchant for immediate transaction status broadcasts to both merchant and customer interfaces.

**Security & Production Features:**
-   Authentication: JWT-based, protected routes, session management.
-   Hybrid Database: PostgreSQL for production, in-memory for development.
-   API Security: Bearer tokens, Zod validation, error handling, CORS.
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