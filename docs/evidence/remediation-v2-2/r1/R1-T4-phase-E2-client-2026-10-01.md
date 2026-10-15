# R1-T4 phase E2 — the app signs in by the session cookie (2026-10-01)

Branch `remediation/r1-continuation-20260907`. Code `2611e80e`. Design:
[PLAN-2026-09-29-r1-t4-phase-e-sessions.md](../../../PLAN-2026-09-29-r1-t4-phase-e-sessions.md) §2.4, approved
2026-09-30 ([decision](../../../decisions/2026-09-30-r1-t4-phase-e-go-owner-answers.md)). The server half:
[phase E1](R1-T4-phase-E1-sessions-server-2026-09-30.md). Working notes:
[WORKING-2026-09-30-r1-t4-phase-e.md](WORKING-2026-09-30-r1-t4-phase-e.md), "E2 resumed".
**Not independently reviewed.** The brief is at the end.

## In plain words

The app no longer keeps a pass in the browser's storage. When someone signs in, the server gives the
browser a locked cookie that no script on the page can read, and the app simply asks the server "who is
signed in here?" each time it opens. Everything the app sends that changes something carries a second
code the server gave that page, so another website cannot make a signed-in browser act.

Nothing looks different on screen. One thing behaves better: if you tap Log Out while the internet is
down, the app signs you out at once and finishes the job with the server the next time it opens, rather
than quietly signing you back in.

The old pass still works on the server until E3 retires it; the app has stopped using it.

## What changed

- **`client/src/lib/session.ts`** (new). The page holds who is signed in and the session's CSRF token in
  memory only. `sessionFetch` sends the cookie with a same-origin request and the token on a change, never
  to another site; a refused token is fetched again once from the start-up check and the change retried.
  The admin area has its own session and token; with only the admin signed in, a change on a business route
  carries the admin's token, as the server reads the admin's cookie there.
- **Every call to the app's own API** goes through it: the shared fetchers (`queryClient.ts`), the property
  and trades helpers, the push helper, the live stream, and about 130 call sites in 45 files. No token is
  read from storage; no `Authorization` header is sent.
- **Start-up** (`App.tsx`): the business check is `GET /api/auth/session`, the admin area's
  `GET /api/admin/auth/me`. The page always asks: it cannot see the cookie. The first load removes what the
  page used to keep in storage (`authToken`, `user`, `merchantId`, `adminAuthToken`, `adminUser`).
- **Sign-in** (`login.tsx`): nothing is stored; the next load reads the new session.
- **Log Out** (`lib/log-out.ts`): stop this device's notifications while its session still stands, then
  have the server end the session, then forget it here.
- **Server**: `GET /api/merchants/:id/active-transaction` is told a signed-in terminal by its session
  cookie when no board is named, as the event stream is.

## Found on resuming, and fixed

The 2026-09-30 session stopped mid-step with E2 an uncommitted draft (47 changed files, 3 new, 13 of 105
test files failing against it). It was copied to scratch, then re-read hunk by hunk.

1. **The terminal's read of its current sale would have been answered 410.** E1 taught the event stream the
   cookie, not this read. Red first: 2 of 4 new tests (410 where 200 and 403 were expected).
2. **A Log Out the server could not be reached for would have been undone by the next load.** The page
   cannot delete an HttpOnly cookie. Log Out now marks the sign-out as begun (`taptpay:sign-out-pending`,
   the value `1`) before it awaits anything; a load that finds the mark signs no one in and has the server
   end the cookie's session; a new sign-in clears it. Finishing never retries a refused token, so it cannot
   end a sign-in made since.
3. **A check's answer that arrived after the check was cancelled was still held.** A retry that answered
   after a deliberate sign-out left the page holding a sign-in it was not showing. The session is now held
   when the answer is taken, not when it is read.
4. **The admin's token on business routes** (above).
5. **Three Logout buttons signed no one out**: they cleared `auth-token` and `admin-token`, keys no sign-in
   was ever kept under (`mobile-header.tsx`, `merchant-terminal-mobile.tsx`, `admin-api.tsx`; none routed).

Kept from the draft, as a decision: the merchant stream is read with `fetch`, not `EventSource` (the
design's word). `fetch` sees a 401 or 403 and stops; `EventSource` cannot tell a refusal from a dropped
connection and would reconnect for ever. The cookie goes with either.

## Results

- **Client 109 files / 1,222 tests** at `2611e80e` (104 / 1,156 before); **server 130 / 3,278**; `tsc` clean;
  `vite build` clean.
- The twelve test files that failed against the draft now pass on the session model: who is signed in is
  what the page holds from the start-up check; a change carries the token; no `Authorization` header.
  New: `session.test.ts` (39), `api-fetchers.test.ts`, `log-out.test.ts`, `login-session.test.tsx`,
  `admin-session.test.tsx`.
- **Mutations: 53 of 53** (`.local/claude-scratch/session-2026-10-01/mutate-e2.py`; restored, hash-checked).
  First run 49 of 51: nothing held the admin area's check to holding its session, and nothing refused a
  session reply that carries no CSRF token. Tests added for both, and two more breakages with them.
- **A real browser** (`scripts/verify-r1-t4-sessions-browser.ts`): Chromium 125 against this tree's server
  and its production build, in memory, nothing off the machine. **43 checks, three runs of three clean.**
  - The cookie: HttpOnly, SameSite=Lax, 7 days (the admin's 12 hours); `document.cookie` is empty; nothing
    of the sign-in in `localStorage` or `sessionStorage`.
  - A reload keeps the sign-in. A change sent with the cookie and no token is refused (403
    `CSRF_REJECTED`); with the page's token it is done.
  - The phone terminal reads its current sale and opens its live updates by the cookie.
  - Another site's `fetch` gets nothing it can read; its form post is refused (403); the business is still
    signed in afterwards.
  - "Sign out of all devices" on the laptop ends the phone's session. Log Out ends the session and the
    cookie. Log Out with the server unreachable: the page signs out at once, the mark is `1`, the cookie is
    still there, and the next load has the server end the session before anyone is signed in.
  - The admin signs in to its own cookie, which signs no business in.
  - Across the run: 720 requests on the machine, **none with an `Authorization` header**; no cookie secret,
    CSRF token or account token in any address (the 20 analytics calls included, which were aborted), nor
    in the server's request log; every change the app sent carried a CSRF token.
- The probe first ran on the Vite dev server and failed at random: the first visit to a page re-optimises
  its dependencies and reloads it mid-click. It now serves the build, as production does.

## For the owner

- **Apply 0031 (and 0030) to the development database.** Unchanged from E1: until then sign-in on the dev
  site fails.
- **When this ships, everyone signs in once.** After that, a business stays signed in for a day unused and
  a week at most.
- The admin home page's totals are still wrong (seen in the probe: 0 transactions with one sale open); that
  fix is next, as approved on 2026-09-30.

## Still to come

E3: the server stops accepting a browser's token, the test harness signs in by cookie, and a source guard
keeps tokens out of the client. The dead screens that still mention `authToken` in tests are tidied there.

## Brief for the independent review

> You are the independent security reviewer for TaptPay, a payment-terminal SaaS. Review commit `2611e80e`
> on branch `remediation/r1-continuation-20260907` (range `1cf5461c..2611e80e`): plan task R1-T4 phase E2.
> The web app stops keeping its sign-in in browser storage and signs in by the HttpOnly session cookie that
> phase E1 (`9e993da2`) introduced. Start from
> `docs/evidence/remediation-v2-2/r1/R1-T4-phase-E2-client-2026-10-01.md`; treat it as claims and re-derive
> everything from the code. Attack especially:
> - Is any credential still read from or written to `localStorage`/`sessionStorage`, put in an address, or
>   sent in an `Authorization` header by any routed page? Is the CSRF token ever sent to another origin or
>   on a read?
> - Can a page act for the wrong session: the admin's token on a business route, a business token in the
>   admin area, a token kept after the session was replaced?
> - Log Out: can a page look signed out while the session stays usable from that browser (the offline
>   case, a late retry, another tab)? Can finishing an owed sign-out end a sign-in made since?
> - Does the start-up check ever treat an outage as signed out, or an incomplete reply as signed in?
> - `GET /api/merchants/:id/active-transaction`: can the cookie branch show one business's sale to
>   another, or a signed-in view to a board's page?
> - Do the edits to older tests keep what they checked?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every Blocking
> issue. Return exactly the ten headings of plan §21.1
> (`docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md`) and end with Approve / Do not approve naming the
> commit range.

Reproduce:
- `npm run check`
- `npx jest --selectProjects client`
- `npx jest --selectProjects server --runInBand`
- `npx vite build --outDir "$PWD/<dir>" && node --import tsx scripts/verify-r1-t4-sessions-browser.ts <shots> "$PWD/<dir>"`
