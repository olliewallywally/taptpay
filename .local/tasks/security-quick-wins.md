# Security Quick Wins

## What & Why

Three small, high-value security hardening changes identified during a security review:

1. **JWT_SECRET fatal crash** — Currently, if `JWT_SECRET` is missing in production, the server silently falls back to a known dev secret (`dev-secret-key-change-in-production`). Anyone who knows that string can forge merchant or admin tokens. The correct behaviour is to crash immediately with `process.exit(1)` so a misconfigured deployment is obvious rather than silently insecure.

2. **Bcrypt cost factor 10 → 12** — The current cost factor of 10 was standard several years ago. Bumping to 12 doubles the compute cost to crack a password hash offline and adds only ~80ms to login time. One-line change.

3. **Cancel DoS vector on Windcave callback** — The GET `/api/windcave/callback` endpoint marks a transaction as `failed` purely based on `?result=cancelled` in the URL, with no further verification. An attacker who knows any `transactionId` (integer, easily guessable) could fire `?transactionId=X&result=cancelled` and disrupt a legitimate payment in progress. Add a guard: only process a `cancelled` result if the session state is still `pending` AND the request carries the correct `sessionId` that matches the stored session (or skip the cancel path entirely and let Windcave's notification handle it).

## Done looks like

- Server crashes with a clear error message and non-zero exit code if `JWT_SECRET` is absent in `NODE_ENV=production`. Dev behaviour (warning + fallback) is unchanged.
- Bcrypt cost factor is 12 in `server/auth.ts`. Existing bcrypt.hashSync call for the admin user is also updated.
- The Windcave callback's `cancelled` branch verifies that the sessionId in the request matches the transaction's stored `windcaveSessionId` before marking the transaction failed. If it doesn't match (or no sessionId is supplied), the cancelled branch is skipped and the transaction is left for the notification handler to resolve.

## Out of scope

- JWT HttpOnly cookie migration (separate large task)
- Redis rate limiting (not needed until multi-instance)
- Admin password change (handled by the operator directly)
- Admin MFA or magic link auth (future task)

## Tasks

1. **JWT_SECRET production crash** — In `server/index.ts`, if `NODE_ENV === 'production'` and `JWT_SECRET` is not set, log a fatal error and call `process.exit(1)` instead of falling back to the dev secret.

2. **Bcrypt cost factor bump** — In `server/auth.ts`, change the bcrypt cost factor from `10` to `12` in all `bcrypt.hash` and `bcrypt.hashSync` calls.

3. **Windcave cancel guard** — In the `/api/windcave/callback` route in `server/routes.ts`, add a sessionId match check before processing the `cancelled` result: only mark the transaction failed if the `sessionId` query param matches `transaction.windcaveSessionId`. If there's no match or no sessionId, skip the cancel branch silently.

## Relevant files

- `server/index.ts:101-117`
- `server/auth.ts:1-220`
- `server/routes.ts:3131-3170`
