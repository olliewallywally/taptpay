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
- qrCodeUrl: text (generated QR code URL)
- paymentUrl: text (customer payment link)

// Transactions table
- id: serial primary key
- merchantId: foreign key to merchants
- itemName: text (product/service name)
- price: decimal(10,2) (transaction amount)
- status: text (pending|processing|completed|failed)
- windcaveTransactionId: text (external payment processor ID)
- createdAt: timestamp (transaction creation time)
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

## User Preferences

Preferred communication style: Simple, everyday language.