# R1-T4 phase E — sessions: design for the owner's review (2026-09-29)

Branch: `remediation/r1-continuation-20260907` (at `66b18a31`). Owner direction, 2026-09-29: "Yes, follow
the plan (Recommended)": the design is written and shown first; no code until it is approved
([decision](decisions/2026-09-29-finish-r1-owner-answers.md)). **Approved for building 2026-09-30, with two
additions** (rotation completes on first use of the new secret, §2.1; an explicit exception list for
cross-site callbacks, §2.3) ([decision](decisions/2026-09-30-r1-t4-phase-e-go-owner-answers.md)). Source: plan R1-T4 (~line 660) and
v2.2 §8.6; phases A–D are built ([R1-T4 plan](PLAN-2026-09-21-r1-t4-sign-in-security.md)).

## In plain words

Today, when someone signs in, the server hands the browser a pass (a token) that the web page keeps in the
browser's storage and shows on every request. Any script running on the page can read that storage, so a
single bad script (a compromised library, an injected ad) could copy the pass and use it elsewhere. The pass
also lasts only an hour, so everyone is signed out every hour.

After this change the pass lives in a cookie the page's scripts cannot read at all, and the server keeps a
record of every signed-in device, so it can end any of them at once. Because a cookie is sent
automatically, every action that changes something also carries a second, per-session check that other
websites cannot produce, so another site cannot make a signed-in browser act. A sign-in lasts as long as
you choose below and renews itself quietly while it is used.

What people notice: everyone signs in once when this ships; after that, no more hourly sign-outs. Nothing
else on screen changes.

## 1. What exists today (read in the code, 2026-09-29)

- Sign-in (password, Google, the admin's) returns a one-hour JWT in the response body
  (`server/auth.ts` `generateToken`); the client stores it in `localStorage` (`authToken`, the admin's
  `adminAuthToken`) and sends it as `Authorization: Bearer` (126 reads and writes across the client; the
  shared fetcher `client/src/lib/queryClient.ts` already sends `credentials: "include"`). The client also
  decodes the JWT to learn its business (`client/src/lib/auth.ts` `getCurrentUser`).
- `authenticateToken` re-reads the login and the business on every request, and compares the token's
  session version (phase D), so a disabled teammate, a password reset or "sign out everywhere" end
  sessions at once. The admin area is the same JWT with the admin principal (`authenticateAdmin`).
- Live updates (`client/src/lib/sse-client.ts`) read the stream with `fetch` and the bearer header,
  because `EventSource` cannot send one.
- No CORS headers are sent (the browser's same-origin default). The iPhone app (`capacitor.config.ts`)
  shows the live site, `https://taptpay.co.nz/app-login`, so it is the same origin as the web.

## 2. The design

### 2.1 Server-side sessions (web and iPhone app)

- A new table, `auth_sessions` (one forward migration, the owner applies it to dev as usual): session id,
  login, principal (a business login or the platform admin), the SHA-256 digest of the session secret,
  created, last used, idle expiry, absolute expiry, rotated at, revoked at and why, and a short device label
  (browser and platform from the user agent; no address is kept).
- At sign-in (password, Google's handoff, the admin's) the server creates a session and sets its secret in
  a cookie: `__Host-taptpay-session` (the admin's: `__Host-taptpay-admin-session`), `Secure`,
  `HttpOnly`, `SameSite=Lax`, `Path=/`, no domain. The body carries no token any more. The secret is 32
  random bytes; only its digest is stored.
- Every signed-in request: the digest is looked up (one indexed read, on top of the login and business
  reads that already happen); a revoked, idle-expired or absolute-expired session is 401 `SESSION_ENDED`,
  and the page sends the person to sign in, as today.
- **Renewal and rotation:** each use moves the idle expiry forward (written at most once a minute). Once a
  day the secret is replaced by a new one in the response's cookie; the old one keeps working for 60
  seconds (requests already in flight), and **a replaced secret used after that ends the whole session**
  and is logged (`SESSION_REUSE_DETECTED`): someone else holds a copy.
  - *Addition, 2026-09-30:* the swap completes only when the new secret is first presented. Until then the
    old secret stays current (a response carrying the new cookie can be lost: a dropped connection must not
    sign the device out or be logged as a theft), and a new swap may be offered after 60 seconds. The 60
    seconds for the old secret run from the new one's first use.
- **Ending sessions:** Log Out ends this session; "sign out everywhere", a password reset, a password
  change (other sessions), disabling or removing a teammate end the login's sessions. Each end is logged (`SESSION_REVOKED`,
  with why).
- The phase D session version stays as the fast "end everything" switch and still guards the short-lived
  bearer path below.

### 2.2 The cross-site check (CSRF)

- Every request that changes something (POST, PUT, PATCH, DELETE) on a cookie session must carry
  `X-CSRF-Token`: an HMAC of the session id, handed to the page by `GET /api/auth/session` and kept in
  memory only. A missing or wrong token is 403 `CSRF_REJECTED`, with nothing changed.
- In addition, such a request whose `Origin` (or, when absent, `Sec-Fetch-Site`) says another site is
  refused before anything else.
- Reads (GET) need no token; `SameSite=Lax` already keeps the cookie off other sites' background requests.
- The public routes (payment links, checkout, quotes, the provider's calls, sign-in itself) have no
  session and are unchanged; the ecommerce API keeps its keys; the scheduler its secret.

### 2.3 CORS

An exact list of the site's own origins per environment (production: `PUBLIC_ORIGIN`; development: the
dev URL). A request from any other origin, `null` included, gets no CORS headers; a state-changing one is
refused (403). Preflights and the requests that follow get the same answer. No response ever says `*` or
repeats an origin it was sent.

*Addition, 2026-09-30:* callbacks that legitimately arrive from another site are named in an explicit
exception list, each with its route and the other site's exact origin, or any origin for a route that
changes nothing. Today it holds the billing card return (`POST /api/billing/card/callback`: Windcave's card
capture may send the browser back with a form post, and the route only redirects to billing settings); the
provider notifications come from servers and carry no `Origin`. Sign in with Apple (R1-T5) adds Apple's form
post. Requests with no `Origin` (servers, the
scheduler, the ecommerce API) get no CORS headers and are otherwise treated as today; a cookie-session
change without an `Origin` still needs the CSRF token.

### 2.4 The client

- Nothing is kept in `localStorage`. On start the app asks `GET /api/auth/session` who is signed in (the
  business, the role, the CSRF token) and keeps that in memory; `getCurrentUser` reads it from there.
- The shared fetchers add `X-CSRF-Token` to every change; a 401 goes to sign-in as today.
- Live updates use `EventSource` again: the cookie goes with it.
- The admin area uses its own cookie and token the same way.
- The first load after release removes the old `authToken` and `adminAuthToken` from storage.

### 2.5 The iPhone app

The app shows the live site, so it gets the same cookie, kept by the phone's web view for the app alone.
The plan also asks that the phone keep its credential in the iPhone's Keychain, through a native adapter.
That matters once the app bundles its own pages (the Apple track's A-T4), because the site's cookie then
comes from another origin. The question below is when to build it.

### 2.6 What stays the same

Sign-in screens, the slow-down on wrong passwords (phase C), known devices, Google's one-time handoff
(phase A), the trusted-proxy setting (phase B), password reset and its email.

## 3. Tests (written first)

- Sessions: sign-in sets the cookie and no body token; every signed-in route accepts the cookie; idle and
  absolute expiry; the daily rotation, with requests in flight during the 60 seconds; a replaced secret used
  later ends the session and is logged; Log Out, sign out everywhere, a password reset or change and a
  disabled teammate end the right sessions; a second server instance sees an ending at once (sessions are in
  the database).
- CSRF: a change with no token, a wrong token, another session's token, a cross-site form post and a
  cross-site `fetch` are refused with nothing changed; the same change from the page succeeds.
- CORS: the site's own origin, a hostile origin, `null`, no `Origin`, credentials, and a preflight against
  its request.
- No credential in an address, in `localStorage`, in a log line or in an analytics call (a source guard over
  the client and a runtime check in a real browser).
- R1-T3's matrix and every served test keep passing, driven through the cookie.

## 4. Order of work

1. E1 — the server: the table and migration, sessions at every sign-in, the cookie accepted beside the
   bearer, CSRF and CORS, rotation and reuse, every way a session ends.
2. E2 — the client: `/api/auth/session`, no storage, CSRF on changes, live updates, the admin area.
3. E3 — the bearer path closed for the web (the server stops accepting a browser's bearer token), the source
   guard, the browser check.
4. The release: everyone signs in once. Production waits for the owner to reopen it, as for everything else.

## 5. Questions for the owner

**Answered 2026-09-29** ([decision](decisions/2026-09-29-r1-t4-phase-e-owner-answers.md)): 1 — **1 day
without use, 7 days at most** (not the recommendation below); 2 — as recommended; 3 — with A-T4, as
recommended.

1. **How long does a sign-in last?** Recommended: signed out after **7 days without use**, and in any case
   after **30 days**. (A counter or tablet used every day stays signed in for the 30 days.)
2. **The admin area?** Recommended: signed out after **30 minutes without use**, and in any case after **12
   hours**: it can see every business.
3. **The iPhone Keychain adapter: now, or with A-T4?** Recommended: **with A-T4**, when the app starts
   bundling its own pages. Until then the app uses the same protected cookie as the web, and building a
   Keychain path now would mean handing the credential to page scripts, which is what this design removes.
   R1's exit item "native refresh credentials are Keychain-backed" would then be recorded as moved to A-T4
   by the owner's decision.
