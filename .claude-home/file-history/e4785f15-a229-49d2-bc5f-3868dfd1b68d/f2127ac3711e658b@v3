---
name: audit-2026-07-07-bugfixes
description: "Full bug audit on feat/property-dashboard-redesign — fixed IDORs, debug backdoors, Windcave idempotency, jest config; remaining flaws tracked"
metadata: 
  node_type: memory
  type: project
  originSessionId: e4785f15-a229-49d2-bc5f-3868dfd1b68d
---

On 2026-07-07 did a whole-app bug hunt on branch `feat/property-dashboard-redesign`.

**Fixed (committed to working tree, not yet committed to git):**
- IDOR: `PUT /api/merchants/:id/details` and `/bank-account` had NO ownership check → any merchant could rewrite another's settlement bank account. Added `checkMerchantOwnership`.
- Removed unauthenticated `/api/debug/*` routes: `fix-auth-user` (set merchant 22's login to "123456" — takeover backdoor), `test-password` (bcrypt oracle), `auth-users` (enumeration), `sync-merchants`.
- Cross-tenant IDOR on stock-item + tapt-stone update/delete (scoped only by item id) → added merchant-ownership verification in server/routes.ts.
- Windcave double-charge: `createAttendedSession` + `submitTapToPayToken` regenerated X-ID (idempotency key) on each retry. Threaded a stable xId through retries in server/windcave.ts.
- `PATCH /api/transactions/:id/split-enabled` checked `user.isAdmin` (nonexistent field) → `role === 'admin'`.
- Gated mock `POST /api/crypto-transactions/:id/confirm` (marks paid with no verification) to non-production.
- jest.config.cjs: fixed `jsx:"preserve"` inheritance (ts-jest override to react-jsx), ESM whitelist (wouter/nanoid), asset moduleNameMapper ordering. Tests 24→9 failing.
- App.tsx: LandingPage route prop type error (used children form).

**Batch 2 (commit b42925b):** locked `/cancel` (auth+ownership), crypto-random NFC session id, removed legacy `DELETE /api/tapt-stones/:id`, `merchants-old`, duplicate `clear-merchants`.

**Batch 3 (commit d8b3744):** removed in-memory auth `users` Map — merchant login now reads/writes the `merchants` table directly (authenticateUser/authenticateToken/createUser DB-backed; identity = merchantId). Fixes "valid merchant can't log in after restart / on unsynced instance." Verified E2E against Neon DB.

**Remaining flaws (NOT fixed — see plan):** public `/api/transactions/:id/split` (customer-facing, low risk, left intentionally); JWT 1h expiry w/ no refresh; login lockout/rate-limit still in-memory (single-instance OK, degrades safe); mock crypto FX rates; 9 jest smoke tests need env shims (import.meta, EventSource, wouter interop). See [[db-schema-drift-fk-sequences]].
