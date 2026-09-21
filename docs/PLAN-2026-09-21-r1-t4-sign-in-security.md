# R1-T4 — sign-in security: current state, proposed phases, owner questions (2026-09-21)

Branch: `remediation/r1-continuation-20260907` at `107d1264`. Source requirement: plan R1-T4
(`attached_assets/full_intergration_plan_-_taptpay_1787816180424.txt`, R1.B; v2.2 §8.6), unblocked
by [R0 exit](evidence/remediation-v2-2/r0/R0-exit-established-2026-09-21.md). **Nothing here is
implemented.** Phase A is proposed first because of finding 1; phases B–E follow; each needs the
independent review of plan §21.1 before it merges.

## 1. What exists today (verified in the code, 2026-09-21)

1. **The Google sign-in token reaches Google Analytics.** The callback signs a bearer JWT and
   redirects to `/login?token=<JWT>&merchantId=…` (`server/routes.ts:704-711`). The login page
   stores it and removes it from the address with `replaceState` (`client/src/pages/login.tsx:26-38`),
   but analytics runs first. Probe (gtag.js replaced by a local stub, all third-party requests
   blocked — nothing was sent to Google): on `/login?token=…` the GA4 `config` call and the
   `page_view` event both run while `location.href` still contains the token. GA4 fills
   `page_location` from the page address by default, so each Google sign-in has sent a
   **one-hour account token** to the GA property (not verified against Google, deliberately).
   The same address also reaches browser history and any proxy access log.
2. **Google sign-in has no `state`, nonce or PKCE** (`server/routes.ts:587-602`): nothing ties the
   callback to the browser that started it (login CSRF — an attacker can sign a victim into the
   attacker's account). It reads Google's `userinfo`, **does not check that Google verified the
   email**, and **links to an existing merchant because the email matches**
   (`server/routes.ts:652-695`).
3. **Sessions are one-hour JWTs in `localStorage`** (`server/auth.ts:337-347`), issued only at login
   (`routes.ts:704, 777, 910`) and never refreshed — **every merchant is signed out every hour**.
   Every request re-reads the user and merchant rows (`server/auth.ts:448-475`), so disabling a
   teammate is immediate; but no token can be cancelled early: after a password reset a stolen
   token keeps working until it expires, and there is no "sign out everywhere".
4. **Password reset is mostly right already** (`server/auth.ts:541-586`): it does not reveal
   whether an account exists, stores only a hash of the reset token, expires it after an hour and
   uses it once. Missing: ending existing sessions after a reset.
5. **Canonical origin is mostly right already**: `PUBLIC_ORIGIN` is required whenever payments,
   Google sign-in or email are configured (`server/config.ts:367-471`), and `getBaseUrl` prefers it
   (`server/url-utils.ts:6-30`); request headers are used only where it is unset (development).
6. **No trusted proxy is configured** (no `trust proxy` anywhere in `server/`). Behind Replit's proxy
   `req.ip` is probably the proxy, so the login throttle's per-IP bucket — 20 failures an hour →
   30-minute block (`server/auth.ts:72-80`) — may be **one bucket for every merchant**: 20 bad
   passwords from anyone could block all sign-ins. Needs a check on the live deployment (it is
   private now). The throttle is also per-process memory, so it resets on restart and is not shared
   between instances.
7. **No CORS headers are sent** — the browser's same-origin default. The phone app loads
   `https://taptpay.co.nz/app-login` itself (`capacitor.config.ts`), so it is same-origin too.

## 2. Proposed phases

| Phase | What | Size | Needs |
|---|---|---|---|
| **A — stop the token leak (urgent)** | The Google callback redirects with a **one-time code** (random, stored hashed, 60 s, single use) instead of the JWT; the login page exchanges it by `POST` and never puts a token in an address. Add `state` (hashed, one-time, bound to the starting browser by a short-lived `HttpOnly` cookie) and PKCE; require Google's `email_verified`. Defence in depth: analytics sends the path only, never the query. | small–medium, one migration (the one-time codes) | Q1 |
| **B — trusted proxy** | Set Express's `trust proxy` to Replit's exact depth; tests with spoofed `X-Forwarded-For`, host and protocol. | small | deployment check (Q4) |
| **C — shared throttling** | Move sign-in, reset and Google-callback throttles from process memory to PostgreSQL, keyed by account and (privacy-preserving) IP, with bounded expiry and clear retry responses; verified across two instances. | medium, one migration | Q5 |
| **D — cancel sessions** | A per-user "valid after" time: tokens issued before it are refused. Set on password reset and a new "sign out everywhere". | small, one migration | — |
| **E — the full session rebuild** | What plan R1-T4 ultimately requires: revocable server-side sessions with rotating refresh credentials; on the web an `HttpOnly`/`SameSite` `__Host-` cookie plus a CSRF token; in the phone app the refresh credential in iOS Keychain; exact CORS allowlist. This also ends the hourly sign-out. It changes how every screen and the phone app authenticate. | large; its own design and review | Q2 |

A–D are self-contained and each closes a specific finding; E is the architectural change and should
be designed separately once A–D have landed. Sign in with Apple (R1-T5) builds on A's primitives.

## 3. Questions for the owner

- **Q1 — Google accounts and existing merchants.** Today, signing in with Google joins any
  existing merchant account with the same email. Keep that, but only when Google has verified the
  email (easiest for merchants), or require a merchant to connect Google from inside their account
  first (safest — no account can be joined from outside)?
- **Q2 — sessions.** Fix A–D now and design E (stay signed in safely on a trusted device, no hourly
  sign-out, phone-app Keychain) as its own piece afterwards — or go straight to E?
- **Q3 — past exposure.** Every earlier Google sign-in sent a token to Google Analytics. Each expired
  within the hour, so none should still work; but the addresses may sit in GA's reports. Do you want
  them deleted (a GA data-deletion request) and GA's "redact query parameters" setting turned on?
  Both are done in your GA account.
- **Q4 — the proxy check.** It needs the live site reachable. Do it when you next open the site, or
  can you share Replit's deployment networking settings?
- **Q5 — lockout.** Five wrong passwords lock an account for 15 minutes, so anyone who knows a
  merchant's email can lock them out. Keep that, or slow repeated attempts down instead of locking?
