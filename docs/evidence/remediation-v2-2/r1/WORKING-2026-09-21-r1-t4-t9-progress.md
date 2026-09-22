# WORKING NOTES — R1-T4 A–D and R1-T9 rollout (2026-09-21, from ~11:40 UTC)

Scratch progress record kept on disk as work goes (crash-recovery rule). Folded into evidence files
and deleted at the end. Decision: `docs/decisions/2026-09-21-r1-t4-t9-owner-answers.md`.

## Order

1. Schema expansion, one commit: `0026` auth_handoff_codes (A), `0027` users.session_version (D),
   `0028` auth_throttle (C); schema.ts, baseline contract, REAL_MIGRATIONS, fingerprint re-record.
2. A — Google sign-in: state + PKCE (HttpOnly cookie), `verified_email` required, refuse a
   different linked Google id, one-time handoff code in an HttpOnly cookie, `POST
   /api/auth/google/session`; analytics sends no query and no token path.
3. D — `session_version` in the JWT; bumped on password reset and "sign out everywhere".
4. C — throttles in PostgreSQL (HMAC-keyed buckets), progressive slowdown instead of lockout.
5. B — `TRUST_PROXY_HOPS` setting, off by default, tests with spoofed X-Forwarded-For.
6. R1-T9 rollout: retail stock, retail terminal, property analytics, property terminal, trades
   analytics, trades terminal, settings.

## Status (stopped on the owner's request, 2026-09-21 ~11:36 UTC; resumed 2026-09-22)

- [x] 1 — committed `7ba8bc7d` (schema 0026–0028, fingerprint re-recorded, server 64/1272).
- [x] 2 — phase A **done 2026-09-22** (committed with this note):
  - re-verified the 2026-09-21 claims first: google-sign-in 13/13, with route-policy-inventory and
    subscription-route-security 45/45; the analytics redaction (never test-run) passes 16/16;
    `login-google-handoff.test.tsx` red 3/3 for the stated reasons.
  - `client/src/pages/login.tsx` redeems `?google=complete` by `POST /api/auth/google/session`
    (`credentials: same-origin`) and never takes a token from the address; it removes only the
    sign-in results from the address, so a password form's `returnTo` survives (the old code wiped
    the whole query). Two tests added (network failure; `returnTo` kept): all 5 red on the old
    page, 5/5 green on the new one.
  - `scripts/verify-google-handoff-postgres.ts`: real PostgreSQL 16.10, migrations applied through
    the project runner, actual DatabaseStorage on two pools: 6/6 (a code redeemed exactly once by
    24 simultaneous attempts; expired incl. at-the-instant; unknown; duplicate/unknown-user issue
    refused; day-old rows reclaimed; cascade on user delete). Mutation check: with
    `consumed_at IS NULL` removed, the concurrency check fails 24 vs 1.
  - suites: client 63/567, server 65/1285, `tsc` clean.
  - **found: the development app's sign-in is broken** since the dev server restarted
    (2026-09-22 05:58 UTC) on `7ba8bc7d`/`662371ba`'s schema: `shared/schema.ts` declares
    `users.session_version` (0027), Drizzle's `select()` asks for it, and the dev database has
    migrations only through 0023. `POST /api/auth/login` with a made-up email → HTTP 500; the same
    SELECT without the column succeeds. Fix = apply 0024–0028 to dev (0025 needs a gap-13 ownership
    inventory for dev) — owner approval required; asked 2026-09-22.
- [ ] 3  - [ ] 4  - [ ] 5  - [ ] 6
