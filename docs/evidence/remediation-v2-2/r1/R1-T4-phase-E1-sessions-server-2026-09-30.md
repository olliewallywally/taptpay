# R1-T4 phase E1 — sessions the server keeps: the server side (2026-09-30)

Branch `remediation/r1-continuation-20260907`. Code `9e993da2`; this evidence and the tests the mutation
check added, the commit after it. Design:
[PLAN-2026-09-29-r1-t4-phase-e-sessions.md](../../../PLAN-2026-09-29-r1-t4-phase-e-sessions.md), approved 2026-09-30
with two additions ([decision](../../../decisions/2026-09-30-r1-t4-phase-e-go-owner-answers.md)). Working notes:
[WORKING-2026-09-30-r1-t4-phase-e.md](WORKING-2026-09-30-r1-t4-phase-e.md). Source requirement: integration plan
R1-T4 (`attached_assets/full_intergration_plan_-_taptpay_1787816180424.txt`, lines 672–685).

## In plain words

Signing in now starts a session the server keeps, and the browser gets a locked cookie for it that no
script on the page can read. The server can end any one session (Log Out), all of a login's (sign out
everywhere, a password reset or change, a teammate disabled or removed), and ends one by itself after a day
unused or a week in all (the admin's: 30 minutes and 12 hours). Once a day the cookie's secret is swapped; a
copy of an old secret used later ends the session. A change sent with the cookie needs a second, per-page
code, and any change sent from another website is refused before anything else.

On the server's side nothing else changes yet: the app's token keeps working beside the cookie until the app
is switched over (E2) and the token is retired (E3).

## What changed (`9e993da2`)

- **`auth_sessions` (migration 0031):** one row per signed-in device; only SHA-256 digests of its secrets
  (current, offered by the daily swap, and the one replaced), the login and its session version (a
  business session) or an HMAC tag of the admin's credentials (an admin session), the device's browser and
  platform, and the times. No address. Checks keep each row one kind or the other.
- **The cookie:** `__Host-taptpay-session` (the admin's `__Host-taptpay-admin-session`), `<id>.<secret>`,
  HttpOnly, Secure, SameSite=Lax, Path=/, no Domain, for the session's absolute life. Set by the password
  sign-in, Google's handoff redemption, the admin's sign-in, and a password change (a new session for this
  device). `server/auth-sessions.ts`.
- **Every signed-in request** (`authenticateToken`, `server/auth.ts`): with no Authorization header, the
  cookie signs the request in. The row is found by the cookie's id and its secret compared in constant time;
  the login and business are re-read as for a token, and the login's session version must still be the
  session's. The admin area (`/api/admin/*`) reads only the admin's cookie; every other route the
  business's, then the admin's, so the platform admin keeps the answers its token got (R1-T3's matrix is
  unchanged). A refusal clears the cookie. A change needs `X-CSRF-Token`, an HMAC of the session id and the
  site's origin (403 `CSRF_REJECTED`). Only a request let through is recorded as a use (at most once a
  minute; the unused limit never passes the 7-day one), is offered the daily swap, or takes one up.
- **The daily swap:** after a day a response offers a new secret; it becomes current on its first use, and
  the replaced one is accepted 60 seconds more. A lost offer is re-made after a minute. A replaced secret
  used after its 60 seconds ends the session (`SESSION_REUSE_DETECTED`).
- **Ending sessions:** Log Out (`POST /api/auth/logout`, `POST /api/admin/auth/logout`) ends this session,
  clears its cookie and closes its live streams only. Sign out everywhere, a password reset or change, and
  disabling or removing a teammate end the login's sessions and record why (`SESSION_REVOKED`); the session
  version still ends them all by itself. An admin session ends when the admin's email or password hash
  changes.
- **The start-up check** `GET /api/auth/session` answers anyone with 200: `{ signedIn: false }`, or the
  login with the page's CSRF token. A 401 there would be logged as an error in every signed-out visitor's
  browser (the device checks require none). The admin area's `GET /api/admin/auth/me` hands the admin's
  token. Both are never cached.
- **Live updates** open on the cookie (a board's page keeps its board stream even in a browser signed in to
  the business); each stream records its session.
- **Other websites** (`server/cross-site.ts`, the last middleware before the routes): a POST, PUT, PATCH or
  DELETE whose Origin is not the site's own, `null` included, or with no Origin but a Sec-Fetch-Site of
  cross-site or same-site, is 403 `CROSS_SITE_REJECTED` before any route runs. The one listed exception is the
  billing card return (`POST /api/billing/card/callback`), which changes nothing. CORS: only the exact site
  origin gets `Access-Control-Allow-Origin`, with credentials; other preflights are 403 with no CORS headers;
  nothing answers `*`. Requests with neither header (servers) pass as before.
- Route inventory: 187 routes, 0 unclassified; the three new routes reviewed and served; the reviews of the
  changed routes updated; the middleware policy lists the guard.

## Tests first

`server/__tests__/auth-sessions.test.ts` and `server/__tests__/cross-site-guard.test.ts`, written against a
constants-only `server/auth-sessions.ts`: **44 of 56 red**, each for the stated reason (no session cookie;
401 where the cross-site refusal's 403 was expected). The 12 green pin what must not change (a refused
sign-in starts no session; the site's own origin and origin-less servers pass; reads from another site carry
no CORS headers; nothing answers `*`; the billing card return still redirects; a provider's notification is
unaffected).

## Results

- At `9e993da2`: server **127 files / 3,216 tests**, all green; `tsc` clean; the route suites 24/1,460.
- **Mutations: 34 of 34 caught** (`.local/claude-scratch/session-2026-09-30/mutate-e1.py`, files restored and
  hash-checked). The first run caught 30 of 33. The three misses were tests that could not tell one guard
  from another:
  - the 7-day limit, masked by the unused limit's cap;
  - the session-version check, masked by each sign-out path also recording the ends;
  - the start-up check reading the admin's cookie, which the principal check then refused.

  Each got a test that exercises it on its own: a row whose unused limit lies past its 7-day one; the version
  advanced alone; no Set-Cookie at all for an admin-only request. A 34th mutation (the cap itself) was added
  and caught. The session test file is 36 tests, the cross-site one 25.
- **PostgreSQL 16.10**, CI's empty-database job rehearsed exactly (`127.0.0.1:5432/convergence`, the CI
  inventory): dry run clean, **33 migrations applied, 0 pending, 0 drifted, 0 orphaned**. The schema
  fingerprint (`sha256:f542c715…`, reproducible) differs from the recorded one by exactly 0031: **1 table,
  18 columns, 6 constraints (4 checks, its key, 1 foreign key) and 3 indexes; nothing removed**. Recorded as
  [R1-T4-phase-E-auth-sessions-empty-fingerprint-2026-09-30.json](R1-T4-phase-E-auth-sessions-empty-fingerprint-2026-09-30.json);
  `verify.yml` points at it.
- **PostgreSQL verifier** (`scripts/verify-google-handoff-postgres.ts`, two storage instances on separate
  pools): **34/34**, 10 of them new:
  - the table refuses a row whose principal fields disagree;
  - of 20 simultaneous offers from two instances exactly one is made, and none within a minute of another;
  - of 20 simultaneous first uses exactly one promotion;
  - a use is recorded only forward in time;
  - an ended session is ended once and never offered, promoted or touched;
  - ending a login's sessions spares the kept one and every other login's, and the other instance sees it at
    once;
  - a deleted login's sessions go with it;
  - rows are reclaimed 30 days past their end, not sooner;
  - an admin row carries no login.

## For the owner

- **Apply 0031 to the development database** (and 0030, still waiting). Until then, once the dev server runs
  this code, **sign-in on the dev site fails** (the session cannot be stored). Production is untouched.
- Not yet in the app: E2 switches the app to the cookie; E3 retires the token.
