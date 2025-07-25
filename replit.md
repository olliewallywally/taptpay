# Scan to Pay Terminal

## Overview

This is a full-stack payment terminal application built with React, TypeScript, and Express. The system provides a QR code-based payment interface where merchants can create transactions and customers can pay by scanning QR codes. The application features real-time updates using Server-Sent Events (SSE) and a modern UI built with shadcn/ui components.

## System Architecture

The application follows a monorepo structure with clear separation between client, server, and shared components:

- **Frontend**: React with TypeScript, Vite build system
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM (configurable)
- **Real-time Communication**: Server-Sent Events (SSE)
- **UI Framework**: shadcn/ui with Tailwind CSS
- **State Management**: TanStack Query for server state
- **Revenue Model**: Fixed fee structure - $0.05 platform fee + $0.20 Windcave fee = $0.25 total per transaction

## Key Components

### Frontend Architecture
- **React Router**: Using wouter for lightweight routing
- **Form Management**: React Hook Form with Zod validation
- **State Management**: TanStack Query for server state synchronization
- **UI Components**: Complete shadcn/ui component library
- **Styling**: Tailwind CSS with custom design tokens
- **Real-time Updates**: Custom SSE client for live transaction updates

### Backend Architecture
- **Express Server**: RESTful API with TypeScript
- **Database Layer**: Drizzle ORM with PostgreSQL support
- **Storage Interface**: Abstracted storage layer (currently in-memory, designed for database integration)
- **Real-time Events**: SSE implementation for live updates
- **Route Organization**: Modular route registration system

### Database Schema
```typescript
// Merchants table
- id: serial primary key
- name: text (merchant identifier)
- businessName: text (merchant business name)
- email: text (merchant contact email)
- themeId: text (customization theme)
- qrCodeUrl: text (generated QR code URL)
- paymentUrl: text (customer payment link)

// Transactions table
- id: serial primary key
- merchantId: foreign key to merchants
- itemName: text (product/service name)
- price: decimal(10,2) (transaction amount)
- status: text (pending|processing|completed|failed)
- windcaveTransactionId: text (external payment processor ID)
- windcaveFeeAmount: decimal(10,2) (fixed $0.20 Windcave fee per transaction)
- platformFeeAmount: decimal(10,2) (fixed $0.05 platform fee per transaction)
- merchantNet: decimal(10,2) (amount merchant receives after $0.25 total fees)
- createdAt: timestamp (transaction creation time)

// Platform Fees table
- id: serial primary key
- transactionId: foreign key to transactions
- merchantId: foreign key to merchants
- feeAmount: decimal(10,2) (fixed $0.05 platform fee per transaction)
- transactionAmount: decimal(10,2) (original transaction amount)
- status: text (pending|collected|failed)
- collectedAt: timestamp (when fee was collected)
- createdAt: timestamp (fee record creation time)
```

## Data Flow

### Transaction Creation Flow
1. Merchant enters item details through terminal interface
2. Frontend validates data using Zod schemas
3. POST request creates transaction in database
4. QR code generated with payment URL
5. SSE notifies all connected clients of new transaction

### Payment Processing Flow
1. Customer scans QR code or visits payment URL
2. Customer sees transaction details and slide-to-pay interface
3. Payment initiation triggers status update to "processing"
4. SSE broadcasts status changes to merchant terminal
5. External payment processor (Windcave) handles actual payment
6. Final status update completes the transaction cycle

### Real-time Updates
- SSE connections maintained per merchant
- Transaction status changes broadcast immediately
- Both merchant and customer interfaces update in real-time
- Fallback polling mechanism for reliability

## External Dependencies

### Core Framework Dependencies
- **React 18**: Modern React with hooks and concurrent features
- **Express**: Web server framework
- **TypeScript**: Type safety across the stack
- **Vite**: Fast development and build tooling

### Database and ORM
- **Drizzle ORM**: Type-safe database queries and migrations
- **@neondatabase/serverless**: PostgreSQL serverless driver
- **Drizzle Kit**: Database migration and schema management

### UI and Styling
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first styling
- **Framer Motion**: Animations for slide-to-pay component
- **Lucide React**: Icon library

### Data Management
- **TanStack Query**: Server state management and caching
- **React Hook Form**: Form state and validation
- **Zod**: Runtime type validation and schema definition

### Development Tools
- **tsx**: TypeScript execution for development
- **esbuild**: Fast JavaScript bundler for production
- **PostCSS**: CSS processing pipeline

## Deployment Strategy

### Development Environment
```bash
npm run dev    # Starts development server with hot reload
npm run check  # TypeScript type checking
npm run db:push # Database schema synchronization
```

### Production Build
```bash
npm run build  # Builds both client and server
npm start      # Runs production server
```

### Environment Configuration
- `DATABASE_URL`: PostgreSQL connection string (required)
- `NODE_ENV`: Environment mode (development/production)
- `PORT`: Server port (defaults to process.env.PORT)

### Database Migration Strategy
- Drizzle Kit handles schema migrations
- Schema defined in `shared/schema.ts`
- Migrations output to `./migrations` directory
- Push-based deployment for development
- Migration-based deployment for production

### Static Asset Serving
- Vite builds client to `dist/public`
- Express serves static files in production
- Development uses Vite middleware for hot reloading

## Security & Production Features

### Authentication System
- JWT-based authentication with bcrypt password hashing
- Protected routes requiring login for merchant terminal and dashboard
- User session management with localStorage token storage
- Demo account: demo@tapt.co.nz / demo123

### Database Configuration
- Hybrid storage system: PostgreSQL for production, in-memory for development
- Automatic fallback to memory storage when DATABASE_URL not configured
- Drizzle ORM with type-safe database operations
- Database migration support via Drizzle Kit

### API Security
- Bearer token authentication for API endpoints
- Request validation using Zod schemas
- Error handling with appropriate HTTP status codes
- CORS and credential handling

### Production Considerations
- Environment-based configuration
- Secure session management
- Database connection pooling
- Error logging and monitoring

## Changelog
- July 05, 2025. Initial setup
- July 05, 2025. Added comprehensive payment dashboard with analytics, savings calculator, and transaction history
- July 05, 2025. Implemented inline editing for rate comparison to improve user experience
- July 05, 2025. Added complete authentication system with JWT tokens and protected routes
- July 05, 2025. Implemented hybrid database storage with PostgreSQL support and memory fallback
- July 05, 2025. Added complete password reset functionality with SendGrid email integration
- July 05, 2025. Redesigned mobile navigation with hamburger menu and improved mobile UX
- July 06, 2025. Fixed payment terminal SSE connection issues and slide-to-pay functionality
- July 06, 2025. Implemented public merchant signup with email verification system
- July 06, 2025. Added multi-provider email service (SendGrid, Gmail, SMTP fallback) for production reliability
- July 07, 2025. Successfully switched from SendGrid to Gmail email delivery after resolving API key issues
- July 07, 2025. Fixed signup form validation by replacing React Hook Form with plain HTML inputs to prevent input blocking
- July 07, 2025. Changed "Store Name" field to "Full Name" in merchant signup form per user request
- July 07, 2025. Fixed critical verification email URL issue - emails now use proper Replit domain instead of localhost
- July 07, 2025. Resolved admin authentication system - fixed email validation and analytics endpoint access
- July 07, 2025. Completed merchant authentication debugging - login system working with correct merchantId assignment
- July 07, 2025. Successfully cleared problematic merchant data and established clean testing environment
- July 07, 2025. Implemented automatic auth user sync for verified merchants to survive server restarts
- July 07, 2025. Fixed merchant terminal routing to use authenticated user's merchantId (22) instead of hardcoded 1
- July 07, 2025. Eliminated all hardcoded merchant IDs throughout system for complete scalability
- July 07, 2025. Added merchant validation middleware and URL display components for seamless multi-merchant support
- July 07, 2025. Created dedicated transactions page with navigation buttons from dashboard and terminal page
- July 07, 2025. Added real-time payment status indicator above QR code section with visual status updates
- July 07, 2025. Fixed import issues and authentication for transactions page to display all historical transaction data
- July 07, 2025. Restored payment status indicator above QR code section with full status flow (Awaiting Payment → Processing → Payment Accepted)
- July 07, 2025. Implemented clearTransactions functionality and removed all test transactions for clean customer payment experience
- July 07, 2025. **MAJOR**: Implemented comprehensive platform revenue collection system with $0.05 fee per transaction
- July 07, 2025. Added platform fees database table with automatic fee tracking and collection on completed payments
- July 07, 2025. Created admin revenue dashboard showing total earnings, transaction counts, and revenue analytics
- July 07, 2025. Enhanced transaction schema with fee breakdown (Windcave: $0.20, Platform: $0.05, Merchant: remainder)
- July 07, 2025. **CRITICAL FIX**: Redesigned revenue system to Marketplace Model after discovering Windcave uses percentage-based fees (2.9%), not fixed $0.20
- July 07, 2025. Implemented proper Merchant of Record architecture where platform collects all payments and settles net amounts to merchants
- July 07, 2025. Updated fee structure: Windcave 2.9% + Platform 0.5% = 3.4% total, merchants receive 96.6% of transaction amount
- July 12, 2025. **MAJOR NFC FEATURE**: Added comprehensive "tap to phone" NFC payment API with support for Apple Pay, Google Pay, Samsung Pay, and contactless cards
- July 12, 2025. Created dedicated /nfc page with device capability detection, real-time payment status updates, and intuitive mobile-first interface
- July 12, 2025. Enhanced database schema with payment method tracking (QR code, NFC tap, card reader, manual) and NFC session management
- July 12, 2025. Added NFC Pay navigation link to merchant interface for easy access to contactless payment features
- July 12, 2025. Created immersive NFC payment overlay with "TAP HERE TO PAY" banner and full-screen 80% transparency interface
- July 12, 2025. Enhanced mobile navigation with proper menu functionality and added desktop navigation banner for improved accessibility
- July 12, 2025. Created comprehensive landing page prompt document for business marketing and customer acquisition
- July 14, 2025. **CRITICAL FIX**: Resolved mobile CSS compilation issues in NFC payment page by replacing Tailwind classes with direct inline styles
- July 14, 2025. Fixed all white/unreadable button issues in NFC overlay using explicit rgba color values for green gradients
- July 14, 2025. Ensured consistent glowing green gradient buttons across all NFC payment states (ready, processing, completed, failed)
- July 14, 2025. Updated NFC payment page messaging to properly reflect merchant-customer payment flow with merchant terminal interface
- July 14, 2025. Fixed CSV export functionality on transactions page - added complete export function with proper data formatting and auto-download
- July 17, 2025. **SYSTEM VERIFICATION**: Completed comprehensive system check - all payment functions (QR, NFC, authentication, analytics) working correctly
- July 17, 2025. **FEE STRUCTURE CORRECTION**: Updated system to use fixed fees per user specification - $0.05 platform fee + $0.20 Windcave fee = $0.25 total per transaction
- July 25, 2025. **MAJOR UI MERGE**: Successfully merged payment terminal and NFC functionality into unified tabbed interface
- July 25, 2025. Enhanced tab button styling with improved glass morphism design, better spacing, and visual feedback

## User Preferences

Preferred communication style: Simple, everyday language.