# R1-T4 phase E — working notes (from 2026-09-30)

Design: [PLAN-2026-09-29-r1-t4-phase-e-sessions.md](../../../PLAN-2026-09-29-r1-t4-phase-e-sessions.md), approved
2026-09-30 with two additions ([decision](../../../decisions/2026-09-30-r1-t4-phase-e-go-owner-answers.md)).
Source requirement: integration plan R1-T4 (`attached_assets/full_intergration_plan_-_taptpay_1787816180424.txt`,
lines 672–685). These notes are written as the work goes, so a stop loses nothing.

## Ground truth at the start (2026-09-30 ~06:10 UTC)

- HEAD `4a6ea450` (the owner's go), tree clean. Container restarted 04:51 UTC; `npm run dev` started 05:00 on
  the clean tree.
- Dev database: 0030 still waiting for the owner (ledger). Phase E adds 0031.

## Facts read in the code (2026-09-30)

- `authenticateToken` (`server/auth.ts`): Bearer JWT only; re-reads the users row and the business on every
  request; the admin JWT is accepted too (principal `admin`, business 0), and business routes then answer it
  403 (R1-T3, P2.2) or let it through where the review says so.
- `authenticateAdmin` (`server/routes.ts`) calls `authenticateToken` and then checks the admin principal; its
  shape is pinned by `subscription-route-security.test.ts` ("await authenticateToken(req, res", the role, the
  zero business, `config.admin.email`). Every `/api/admin/*` route except `/api/admin/auth/login` must use it.
- Session-ending paths today all advance `users.session_version` atomically with their own write: password
  reset (`resetUserPasswordByToken`), password change (`updateUserPassword`), sign out everywhere
  (`advanceUserSessionVersion`). Disabling a teammate is refused live by the status check; removing deletes the
  users row.
- The routed admin area (`client/src/pages/admin/*`) calls only `/api/admin/*`, except the home page's
  `GET /api/transactions` (no such route: the always-$0 finding) and an unauthenticated receipt PDF POST.
- The live stream route `GET /api/merchants/:id/events` picks the signed-in audience by the presence of an
  `Authorization` header, else a board audience by `stoneId`, else 410.
- Cookie conventions (`server/google-sign-in.ts`, `server/sign-in-device.ts`): `__Host-` + Secure only when
  the public origin is https (plain names on http); HttpOnly; keys derived from `JWT_SECRET` with HKDF and a
  label.
- Dev runs with `PUBLIC_ORIGIN=https://$REPLIT_DEV_DOMAIN` (`.replit`), so dev gets `__Host-` cookies. Tests:
  `PUBLIC_ORIGIN=https://harness.test`.
- `GET /api/auth/me` and `GET /api/admin/auth/me` are each client's start-up "who am I" check.

## Implementation decisions (engineering, within the approved design)

1. **Cookie value `<id>.<secret>`** (selector/validator): the row is found by its id, then the secret's
   SHA-256 is compared in constant time with the current, offered and previous digests. A wrong secret for a
   known id is refused without ending the session (else anyone who saw an id could end it).
2. **The session version stays the "end everything" switch.** A business session row records the login's
   `session_version` when it starts; a request is refused when it differs. So every existing path that advances
   the version (reset, change, sign out everywhere) ends cookie sessions in the same write. The rows are also
   marked revoked with the reason, for the audit trail.
3. **The CSRF token is handed out by the existing start-up checks** (`GET /api/auth/me`,
   `GET /api/admin/auth/me`, as `csrfToken`, `Cache-Control: no-store`) instead of a new
   `GET /api/auth/session`: the same answer, one route fewer to review.
4. **Which cookie a request uses:** `/api/admin/*` reads only the admin cookie; every other route reads the
   business cookie, then the admin cookie (so the platform admin keeps today's answers on business routes:
   R1-T3's matrix is unchanged). A Bearer header, while it is still accepted (until E3), wins.
5. **The admin session ends when the admin's credentials change**: the row keeps an HMAC tag of the admin
   email and password hash; a request under a different `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` is refused.
6. **An invalid cookie is cleared** in the refusal (Set-Cookie with an immediate expiry), so a dead cookie does
   not linger.
7. **Log Out** is `POST /api/auth/logout` behind `authenticateToken`, and `POST /api/admin/auth/logout` behind
   `authenticateAdmin` (both need the CSRF token).
8. Rows are reclaimed 30 days after their absolute expiry (a session lasts 7 days at most). `SESSION_REVOKED`
   and `SESSION_REUSE_DETECTED` go to the security audit log with the session id, never the secret.

## Plan

E1 the server → E2 the client → E3 the bearer path closed, the source guard, the browser check. Commit after
each finished step, evidence right after.

## E1 — tests first (2026-09-30)

- `server/__tests__/auth-sessions.test.ts` (35 tests) and `server/__tests__/cross-site-guard.test.ts` (21 tests)
  written against a constants-only `server/auth-sessions.ts`. **Red: 44 of 56 fail**, each for the stated
  reason (no session cookie is set; no cross-site refusal: 401 where 403 is expected). The 12 that pass pin what
  must not change: a refused sign-in starts no session; the site's own origin and origin-less server calls are
  let through; reads from another site carry no CORS headers; nothing answers `*`; the billing card return
  still redirects from Windcave's origins or `null`; a provider notification with no Origin is unaffected.
- Found while writing them: `POST /api/billing/card/callback` accepts a form post (Windcave's card capture may
  return the browser that way), so the cross-site exception list is not empty today (decision and design
  corrected the same day).

## E1 — built (2026-09-30)

- Code `9e993da2`. Server 127/3,216, `tsc` clean. Route inventory 187 routes, 0 unclassified.
- Found while building: a 401 from the start-up check would be logged as an error in every signed-out
  visitor's browser (the device checks require none), so the design's `GET /api/auth/session` (200 for
  anyone) was built after all; `GET /api/auth/me` stays the token's check until E3.
- Mutations 30/33 on the first run; the three misses (the 7-day limit, the session-version check, the
  start-up check's admin cookie) each masked by another guard; each now has its own test; 34/34 with the cap.
- PostgreSQL: CI rehearsal 33/0/0/0; fingerprint re-recorded (0031 only); verifier 34/34 (10 new).
- Dev: `npm run dev` is `tsx server/index.ts` with no watcher, so the running server keeps the code it
  started with until restarted; the client is served from disk by Vite, so it changes as it is edited.

## E2 — the client (from 2026-09-30)

- `client/src/lib/session.ts`: the page holds who is signed in and the session's CSRF token in memory only;
  `sessionFetch` sends the cookie (same origin) and the token on changes (never to another origin), and
  retries once after a refreshed token; the first load removes the old stored keys.
- The ~130 token uses in ~45 files: a scripted rewrite (`.local/claude-scratch/session-2026-09-30/e2-rewrite2.py`)
  for the common shapes, then by hand. The property and trades header helpers now give the CSRF token.

### E2 resumed (2026-10-01)

The 2026-09-30 session stopped mid-step (09:57:33 UTC, no summary) with E2 an uncommitted draft: the client
rewritten to the session, 13 of 105 test files failing against it, its last edit (`session.ts`) referring to
a start-up step in `App.tsx` that was not yet written, and one test rewrite that had failed without saving.
The draft was copied to scratch before anything else, then re-read hunk by hunk.

Found on re-reading, and fixed (each with a test):

- **The server still told a signed-in terminal by its token only.** E1 taught the event stream the cookie,
  not `GET /api/merchants/:id/active-transaction`: with the app sending no token, the phone terminal's
  read of its current sale would have been answered 410 (the retired address). Now the cookie signs it in
  when no board is named, as for the stream; a board's page still reads as any customer does. Red first,
  2 of 4 (410 where 200 and 403 were expected).
- **A sign-out the server cannot be reached for.** The page cannot delete an HttpOnly cookie, so a Log Out
  made while the server is unreachable would have been undone by the next load, which finds the session
  still standing. Log Out now marks the sign-out as begun (`taptpay:sign-out-pending`, the value `1`: no
  credential) before it awaits anything; a load that finds the mark signs no one in and has the server end
  the cookie's session (`finishPendingSignOut`, which holds nothing in memory and does not retry a refused
  token, so it cannot end a sign-in made since); a new sign-in clears it.
- **An answer that arrives after the check was cancelled was still held.** The start-up check's reader
  held the session as a side effect, so a retry that answered after a deliberate sign-out left the page
  holding a sign-in it was not showing. The reader now only reads; the session is held when the check's
  answer is taken.
- **With only the admin signed in, a change on a business route carried no CSRF token** (the server reads
  the admin's cookie there, and wants the admin session's token). The token now follows the cookie the
  server reads.
- **Three Logout buttons cleared a storage key no sign-in was ever kept under** (`auth-token`,
  `admin-token`), and so signed no one out: `mobile-header.tsx`, `merchant-terminal-mobile.tsx`,
  `admin-api.tsx`. None is routed. They now end the session as every other Log Out does.

Decided while finishing it (engineering, within the approved design):

- The merchant stream is still read with `fetch` (the design said `EventSource`): `fetch` sees a 401 or 403
  and stops, where `EventSource` cannot tell a refusal from a dropped connection and would reconnect for
  ever. The cookie goes with it either way; no token is read or sent.
- The pending mark is the one thing the page writes to `localStorage` about its sign-in. It holds no
  credential. E3's source guard names it.

Tests: the twelve files that failed against the draft now pass on the session model (who is signed in is
what the page holds from the start-up check; a change carries the CSRF token; no `Authorization` header).
