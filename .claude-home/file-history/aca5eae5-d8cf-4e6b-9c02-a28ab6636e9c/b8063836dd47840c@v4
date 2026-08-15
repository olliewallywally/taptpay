---
name: dev-db-unapplied-migrations
description: "2026-08-09 app-wouldn't-load incident — root cause, the 4 fixes shipped, prod migration, and what is still open"
metadata: 
  node_type: memory
  type: project
  originSessionId: aca5eae5-d8cf-4e6b-9c02-a28ab6636e9c
  modified: 2026-08-09T07:24:19.106Z
---

**2026-08-09: "app just loads forever after login" on desktop AND mobile.** Root cause was
the database, not the UI: `shared/schema.ts` had run ahead of it, so Drizzle's `select()`
(which enumerates every declared column) hit `column "billing_claim_token" does not exist`.
Express 4 does not route an async handler's rejection to the error handler, so `/api/auth/me`
never answered, and `AuthProvider` gates first paint on that one call — every device class sat
on `PageLoader` forever.

## Shipped on `feat/tablet-desktop-app`

- `5022431` — guarded the 5 handlers that could leak a rejection. An AST pass over all 204
  async handlers found exactly 5 (an earlier grep claimed ~25; it only checked line one).
- `c3c34ba` — **migration runner** (`server/migrate.ts`, `npm run db:migrate` /
  `:status` / `:baseline`). Ledger `drizzle.applied_migrations` (outside `public`, so
  `drizzle-kit push` won't offer to drop it). Startup only *reports* pending, never applies.
- `dc16ab9` — **router-level async guard** (`server/async-route-guard.ts`), installed first in
  `registerRoutes`. Verified on the live app: 500 in 1.4ms where it used to hang.
- `15e97f6` — **auth outage semantics**. Server 503 (not 404) when storage is unreachable;
  client only clears credentials on 401/403, and the session check is bounded four ways so it
  can never hang on a loader again.
- `8af83fc` — corrected `replit.md`, which wrongly claimed startup runs `drizzle-kit push`.

## Both databases are level (2026-08-09)

Dev (`helium`) and prod (`NEON_DATABASE_URL`, `ep-mute-grass-af2foouy…neon.tech/neondb`) are
both **15 applied, 0 pending, 0 drifted**. Prod was worse than dev (2 tables + 31 columns
missing, essentially pre-0013); it was rehearsed in a rolled-back transaction, then applied for
real after a `pg_dump`, then baselined.

Traps worth remembering:
- Each `migrations/*.sql` carries its own `BEGIN;`/`COMMIT;`. Run one inside an outer
  transaction and its `COMMIT` ends *yours* — a "rehearsal" would silently go live. Strip those
  lines; `DO $$ BEGIN` has no semicolon so it is unambiguous.
- `merchants.business_description` / `website_url` / `estimated_annual_turnover` are created
  **only** by the boot-time block at `server/index.ts:178`. Without them every Drizzle select on
  `merchants` throws, and `getMerchant()` runs before `getOrCreateSubscription()` in
  `/api/auth/me`. Applied to prod directly rather than relying on a boot side-effect.

**Prod reality check:** only 3 of 8 merchants can sign in — 22 (Oliver), 31, 32. Merchant 27
has a login but `merchants.status='pending'`, which `authenticateToken` answers with 404; 25/26/
28/29 have no `password_hash` so 0013 created no owner for them. All 8 subscriptions are
`solo`/`pending` with no card, so the 16 `requireBillingCard` endpoints reject payment sending
until each adds a card and the first charge clears.

## Still open

1. **`migrations/` is not a complete schema history.** 9 tables (`api_keys`, `api_requests`,
   `crypto_transactions`, `merchant_settlements`, `refunds`, `stock_items`,
   `webhook_deliveries`, `info_pack_leads`, `uploaded_files`) and ~26 `merchants` /
   `invoices_rent_requests` columns are created by no migration — they came from `drizzle-kit
   push` and the ad-hoc DDL. The DB cannot yet be rebuilt from `migrations/` alone; wants a
   catch-up migration.
2. **Three ad-hoc `ADD COLUMN IF NOT EXISTS` blocks still run on every boot**
   (`server/index.ts`) — now the only un-ledgered schema mutation path.
3. **Dead crypto schema**: `crypto_transactions` + `merchants.crypto_*` / `coinbase_*` /
   `auto_convert_to_fiat` / `enabled_cryptocurrencies` / `min_confirmations` are not in
   `shared/schema.ts` at all.
4. **`pg` is in `devDependencies`**, resolving in production only transitively via
   `connect-pg-simple`. The migration runner depends on it. Should be promoted.
5. **One indefinite-loader path remains, and it is not auth**: `<Suspense
   fallback={<PageLoader/>}>` around lazy route chunks holds if a chunk request hangs. Needs an
   error boundary + chunk-load timeout.
6. **A genuinely deleted account now lands on the recovery screen** instead of auto-logging out
   (404 no longer clears credentials). Deliberate; *Sign out* is the escape hatch. Oliver may
   want 404 to clear.
7. Auth worst case is ~13s of spinner before the error panel (4s × 3 attempts + backoff,
   14s deadline). Exported constants, invariant asserted by test.
8. Middleware registered in `server/index.ts` *before* `registerRoutes` is outside the async
   guard, and the global error handler is registered before `setupVite`/`serveStatic` so errors
   in those layers still reach `finalhandler` (pre-existing).

**Diagnosing drift:** diff `getTableConfig()` over every export of `shared/schema.ts` against
`information_schema.columns`, or just `npm run db:migrate:status`. Do NOT `db:push` — see
[[db-schema-drift-fk-sequences]]. `pg_stat_activity.state` is `'disabled'` on these instances,
so it cannot prove "no query is running".

Related: [[data-persistence-topology]], [[playwright-nix-chromium]], [[server-crash-hardening]].
