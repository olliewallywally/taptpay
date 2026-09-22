# R1-T4 phase A — Google sign-in never puts an account token in an address (2026-09-22)

Owner decision: [2026-09-21 answers](../../../decisions/2026-09-21-r1-t4-t9-owner-answers.md)
(Q1: join an existing merchant only on a Google-verified email; phases A–D now). Plan:
[R1-T4 sign-in security](../../../PLAN-2026-09-21-r1-t4-sign-in-security.md), findings 1–2.
Commits: `662371ba` (schema 0026–0028, pushed; originally `7ba8bc7d`) and `a9426330` (phase A,
local). **Not independently reviewed yet.** The brief is at the end.

## The defect

- The Google callback signed a one-hour account JWT and redirected to
  `/login?token=<JWT>&merchantId=…`. The login page stored it and removed it with
  `replaceState`, but GA4 had already been configured without a `page_location`. So gtag.js
  read the page address, token included (probe of 2026-09-21, local gtag stub). The address
  also reached browser history and any proxy log.
- The start and callback carried no `state`, nonce or PKCE, which is login CSRF. The callback
  never checked Google's `verified_email`. It joined any existing merchant whose email matched.
- New, found by this pass's before/after probe: an invoice checkout link `/r/<token>` reached
  the analytics queue **with its token in `page_path`**. The redaction covered payment, split,
  checkout and receipt links, but not `/r/` or `/trades/quote/`.

## The fix

- **Start** (`GET /api/auth/google`, `server/google-sign-in.ts`): a one-time `state` and a PKCE
  verifier (32 random bytes each), bound to the starting browser by one HttpOnly cookie
  (`__Host-` and Secure on https, SameSite=Lax, 10 min). The request carries
  `code_challenge_method=S256`; `access_type=offline` is dropped.
- **Callback:** the cookie is spent either way. A missing or mismatched state is refused before
  anything is asked of Google (constant-time compare), and the code exchange sends the
  verifier. Google must report the email verified, both for joining an existing merchant and
  for creating one. A merchant already linked to a different Google id is refused, never
  re-linked.
- **Hand-back:** no token in the redirect. A one-time code (32 random bytes) goes to the browser
  in an HttpOnly SameSite=Strict cookie (60 s). Only its SHA-256 is stored, in
  `auth_handoff_codes` (0026, single use via `consumed_at`, FK cascade on user delete). The
  redirect is `/login?google=complete`.
- **Redeem** (`POST /api/auth/google/session`, public in `route-policy.ts`): the code's hash is
  consumed in one `UPDATE … WHERE consumed_at IS NULL AND expires_at > now RETURNING`. The token
  comes back in a `no-store` JSON body. `issueTokenForUserId` applies every gate a password login
  does: the user row is active, the merchant is verified or active, and a member is within the
  seat limit.
- **Login page** (`client/src/pages/login.tsx`): it redeems the code by POST
  (`credentials: same-origin`) and **never takes a token from the address**. It removes only the
  sign-in results (`google`, `error`, `token`, `merchantId`, `newUser`) and keeps `returnTo`; the
  old code wiped the whole query. The error text is no longer double-decoded (a stray `%` threw).
- **Analytics** (`client/index.html`, `client/src/lib/analytics-page.ts`, `App.tsx`): the config
  call sets `page_location` to the bare origin and `page_referrer` to `''`. Each route change
  sends `set` and `page_view` with the **redacted path only**. The referrer is reduced to its
  origin. `/r/:token` and `/trades/quote/:token` are now redacted.

## Tests first

- `server/__tests__/google-sign-in.test.ts`: 13 tests. Red first on the pre-change routes per
  the 2026-09-21 session's record (not re-run red here); green re-verified 2026-09-22. They cover state and PKCE, a mismatched or missing state (Google is never called), no
  token in any address, a verified email to join or create, no re-link to a different Google id,
  single redemption, and expired, made-up or missing codes.
- `client/src/pages/login-google-handoff.test.tsx`: 5 tests. All 5 fail on the pre-change page
  and pass on the new one. They cover the redeem POST, a token in the address never stored, a
  network failure, `returnTo` kept, and an unredeemable code.
- `client/src/lib/__tests__/analytics-page.test.ts` and `payment-addressing.test.ts`: 16 tests,
  green (written on 2026-09-21, first run on 2026-09-22).

## Verified (2026-09-22)

- **Re-verified before building on it:** google-sign-in 13/13, and 45/45 with
  `route-policy-inventory` and `subscription-route-security`, as claimed on 2026-09-21.
- **Suites:** client 63 suites / 567 tests; server 65 / 1,285; `tsc` clean.
- **Real PostgreSQL 16.10:** `scripts/verify-google-handoff-postgres.ts`, 6/6. It uses an empty
  database, migrations through the project runner, and actual `DatabaseStorage` on two pools.
  - One code is redeemed exactly once by 24 simultaneous attempts.
  - Expired codes are refused, including one expiring at the instant of redemption.
  - Unknown codes are refused.
  - A duplicate code, or one for a nonexistent user, is refused.
  - Rows a day past expiry are reclaimed.
  - A user delete cascades to their codes.
- **The DB check can fail:** with `consumed_at IS NULL` removed from the redemption, it fails
  24 vs 1. `storage.ts` was restored byte-identical.
- **Real browser, production build** (`scripts/verify-r1-t4-analytics-browser.mjs`, fixtures
  only, every non-local request aborted; gtag.js never loads):
  - **This branch:** 30/30 PASS over five addresses: the old hand-back carrying a token, the new
    hand-back redeemed, the new hand-back expired, an invoice link, and a reset link.
  - **Pre-fix build (`662371ba`):** 19 FAIL. The config had no `page_location`; the token was
    stored from the address; the page never redeemed a code; the invoice token was in
    `page_path`.
  - Blocked hosts: fonts.googleapis.com, pay.google.com, replit.com, www.googletagmanager.com.
- **The same probe against the running dev server** (real `POST /api/auth/google/session`,
  answering 401 without a cookie): clean on all four addresses it covered.
- **Umami:** `trackEvent` calls `window.umami`, but no Umami script is loaded anywhere, so it is
  not a second leak.

## Found on the way: dev sign-in broken by the schema commit

`shared/schema.ts` declares `users.session_version` (0027), and Drizzle's `select()` asks for
every declared column. The dev database had migrations through 0023 only, so after the dev server
restarted (05:58 UTC), `POST /api/auth/login` answered 500. The owner approved applying 0024–0028
to dev ([decision and outcome](../../../decisions/2026-09-22-apply-0024-0028-to-dev.md)). Dev
status is now 30/0/0/0, and sign-in answers 401 for a wrong password again. **Consequence for
any deploy:** the schema is declared ahead of the code that uses it, so 0024–0028 must be applied
before this branch runs anywhere.

## GitHub CI after the push

- `verify.yml` runs on push only for `main` and `feat/**`, so it has **not** run on this branch.
  It can be dispatched manually.
- `secret-scan.yml` ran on `93aa6a0a`. The tree scan was clean (0 findings). The history scan was
  red: 2,351 findings, 2,227 dispositioned, 124 unresolved (108 `generic-api-key`, 10 `jwt`,
  6 `connection-uri-password`). **None of the 124 is in the 173 commits this push added.** It is
  the pre-existing, deliberately red history state.

## Handoff (plan §21.2)

```text
Phase / release:        R1-T4 phase A (Google sign-in), code complete; not merged, not deployed
Exact branch and commit: remediation/r1-continuation-20260907 @ a9426330 (local); GitHub head 93aa6a0a
Scope completed:        state+PKCE, verified email, no re-link, one-time code hand-back, login page
                        redemption, analytics redaction (incl. /r/ and /trades/quote/)
Files changed:          see `git diff --stat 93aa6a0a a9426330` (17 files) and ed847cda..662371ba (schema)
Migrations:             0026 8fbc7453…1357, 0027 51da432f…c455c, 0028 3e99a9aa…d8c4; applied to dev
                        (workspace/helium) 2026-09-22 with 0024–0025; nowhere else
Preflight:              dev count-only inventory total=2 owner=1 locked=1
Commands run:           tsc; jest client 63/567, server 65/1285; verify-google-handoff-postgres 6/6;
                        verify-r1-t4-analytics-browser 30/30 (pre-fix build: 19 FAIL)
Negative tests:         mutation (consumed_at IS NULL removed) → 24 vs 1; pre-fix build → 19 FAIL
Provider/UAT activity:  none; Google was never contacted (fixtures and stubs only)
Device/browser:         headless Chromium 125, production build and dev server
Security/privacy:       no token in any address or analytics field; only code hashes stored
External actions:       owner: GA data deletion + query redaction in the GA account (Q3), not yet confirmed
Feature flags:          none
Rollback:               revert a9426330; tables and column stay (additive). Rolling back also
                        restores the token-in-address flaw.
Approvals:              owner 2026-09-21 (A–D), 2026-09-22 (push; dev migrations); §21.1 review owed
Next phase:             D (session_version in tokens), then C, B, R1-T9 rollout
```

## Not done / open

- **Independent review** of `ed847cda..a9426330` before this merges (plan §21.1). In the cleaned
  history that is the schema commit, the push-record docs and phase A.
- A real Google sign-in has never been run end to end; Google cannot be reached from here.
  Whether a browser sends the SameSite=Strict code cookie on the page's POST, after arriving
  through Google's cross-site redirect, is standard browser behaviour. It is **unverified** in
  this environment.
- Owner, in the GA account: the data-deletion request and "redact query parameters" (Q3).
- The `?error=` text on /login is still reflected from the address into a toast: plain text
  only, no markup, and a pre-existing behaviour. Mapping error codes to fixed messages would
  stop the content spoofing. It is left for a separate change.

## Independent review — brief

**Range:** `ed847cda..a9426330` (schema `662371ba`, docs `93aa6a0a`, phase A `a9426330`).

Paste-ready prompt:

> You are the independent security reviewer for TaptPay, a payment-terminal SaaS. Review branch
> `remediation/r1-continuation-20260907`, range `ed847cda..a9426330`: plan task R1-T4 phase A
> (Google sign-in) and its additive schema (migrations 0026–0028). Start from
> `docs/evidence/remediation-v2-2/r1/R1-T4-phase-A-google-sign-in-2026-09-22.md`; treat it as
> claims and re-derive everything from the code. Attack especially:
> - Can an account token still reach any address, log, cache or analytics field?
> - Can a callback be completed without the starting browser's state cookie, or replayed
>   (`server/google-sign-in.ts`, `server/routes.ts` Google routes)?
> - Can a one-time code be redeemed twice, late, cross-user or from another site
>   (`consumeAuthHandoffCode` in both storages; the cookie flags)?
> - Does `issueTokenForUserId` apply every gate of a password login?
> - Can an unverified or re-linked Google account reach an existing merchant?
> - Does the login page ever store a token it did not redeem, and does it keep `returnTo`?
> - Does redaction cover every route that carries a secret in its path or query?
> - Are the migrations safe to apply to a live database with traffic, and does declaring
>   `users.session_version` before 0027 is applied break anything but dev?
> - Can the tests, the PostgreSQL verifier or the browser probe pass vacuously?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1
> (`docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md`) and end with Approve / Do not approve
> naming the commit range.

Reproduce:
- `npm run check`
- `npx jest --selectProjects client`
- `npx jest --selectProjects server --runInBand`
- Against an empty disposable PostgreSQL:
  `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:<port>/<new db> TAPTPAY_TEST_DATABASE=1 npx tsx scripts/verify-google-handoff-postgres.ts`
- `npx vite build`, then `npx vite preview --host 127.0.0.1 --port 5199 --strictPort`, then
  `R1T4_BASE_URL=http://127.0.0.1:5199 node scripts/verify-r1-t4-analytics-browser.mjs`. Build
  `662371ba` too, to see the probe fail there.
