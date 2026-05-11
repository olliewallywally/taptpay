---
title: Harden data persistence on redeploy
---
# Harden Data Persistence on Redeploy

## What & Why

Merchant data is currently stored in Neon PostgreSQL and persists across redeploys.
However, the app has a silent fallback to in-memory storage (MemStorage) when
DATABASE_URL is missing or the DB connection fails. If this fallback ever activates
in production, any new merchant signups created during that window are permanently
lost on the next restart — with no error shown to the operator.

Additional fragilities: schema migrations aren't run automatically on deploy,
the in-memory auth sync can fail silently, and JWT_SECRET has a hardcoded dev fallback.

## Done looks like

- App refuses to start in production if DATABASE_URL is not set or DB is unreachable,
  logging a clear fatal error instead of silently falling back to MemStorage
- A startup banner logs which storage backend is active (DatabaseStorage vs MemStorage)
  and the connected DB host, so it's immediately visible in deployment logs
- Drizzle schema migrations (`db:push`) run automatically as part of the production
  start sequence so the schema is always in sync after a redeploy
- If JWT_SECRET is missing in production, startup logs a loud warning (not silently
  falling back to the hardcoded dev key)
- `syncVerifiedMerchants()` logs clearly on success and failure so auth state
  can be verified in deployment logs after every redeploy

## Out of scope

- Changing the database provider (keep Neon PostgreSQL)
- Adding new tables or schema changes
- Changing the development experience (MemStorage fallback stays for local dev without DB)
- Removing the `db.ts` orphan file (low risk, no consumers)

## Tasks

1. **Hard-fail in production if DB is unavailable** — Update the storage selection logic
   so that when `NODE_ENV === 'production'` and `isDatabaseConnected()` is false, the
   process exits with a clear error message rather than continuing with MemStorage.

2. **Add startup storage banner** — After storage is selected at startup, log a clear
   one-liner: "✅ Storage: DatabaseStorage (connected to Neon)" or "⚠️ Storage: MemStorage
   (no DATABASE_URL — data will not persist)". This makes the active backend visible
   in every deployment log.

3. **Run schema push on startup** — In `server/index.ts`, before `registerRoutes()`,
   run `drizzle-kit push` programmatically (or via a child process call to
   `npx drizzle-kit push --force`) so schema is always in sync after a redeploy.
   Wrap in try/catch — failure should warn, not crash.

4. **Loudly warn on missing JWT_SECRET in production** — Change the silent fallback
   in `server/index.ts` to log a prominent `[SECURITY WARNING]` when NODE_ENV is
   production and JWT_SECRET is not set.

5. **Log syncVerifiedMerchants outcome** — Add success/failure counts to the
   `syncVerifiedMerchants()` log output so you can verify auth state in deployment
   logs (e.g., "✅ Auth sync: 3 merchants re-registered, 0 failed").

## Relevant files

- `server/storage.ts:2926-2929`
- `server/database.ts`
- `server/index.ts:95-118`
- `server/auth.ts:232-263`