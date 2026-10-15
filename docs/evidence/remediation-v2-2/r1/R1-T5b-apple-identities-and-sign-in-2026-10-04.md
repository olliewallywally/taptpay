# R1-T5b — Apple identities and sign-in

Exact branch `remediation/r1-continuation-20260907`, code `0a12124a`, base `71b4fe18`
(T5a code `8b026aa7` + `01e22c4b`).
[Plan and preflight](../../../PLAN-2026-10-04-r1-t5-sign-in-with-apple.md).
T5b is code-complete; independent review is owed. **R1-T5 is not complete**: no screen
leads to these routes yet (T5d), connecting Apple from Settings is T5c, and going live
needs the owner's Apple setup and a real iPhone. Owner decision 2026-09-29 (answer 2)
governs.

## What was built

Three routes, the web flow through the Services ID:

- `GET /api/auth/apple` sets a signed HttpOnly starting cookie holding a one-time state
  and nonce, and sends the browser to Apple asking for a form post back. The cookie is
  `SameSite=None; Secure` (`__Host-`), the only kind that returns on Apple's
  cross-site post, so the flow is refused on an origin that is not https.
- `POST /api/auth/apple/callback` is Apple's form post. It is admitted cross-site only
  from `https://appleid.apple.com`, by exact origin. The state must be this browser's,
  within ten minutes, and each start is taken up once before Apple is asked anything.
  The code is exchanged and the identity token verified by T5a's boundary, held to
  this browser's nonce. Then, by Apple's stable subject:
  - **known** → a one-time handoff code for that login;
  - **unknown, and no business or login uses its verified email** → a new business,
    its owner login, its subscription and the linked identity, in one transaction;
  - **unknown, and its email already has a business or a login** → **no session and no
    link**. The identity is recorded as pending and the person is told "That email
    already has a TaptPay login. Sign in, then connect Apple in Settings."
- `POST /api/auth/apple/session` redeems the one-time code, once, exactly as Google's
  does: the session is an HttpOnly cookie, never anything in an address.

Migration `0033` adds `apple_identities`: issuer, client id and subject (unique
together), the login it signs in or none (pending), the email Apple gave on the first
authorization and whether it is a relay address. One Apple identity per login; a linked
identity is never moved; the row goes with its login. No Apple token or code is stored
or logged.

The unsigned `user` field Apple sends once is read for a display name only (control
characters removed, at most 100 characters). An email is taken from the verified token
or, on a later sign-in of a pending identity, from what the token gave the first time;
never from the form. A first sign-in whose token carries no email, and an email Apple
has not verified, make nothing.

Google's three routes are unchanged. The handoff storage is reused as it stood.

## Verification

- Original red, replayed on an archived copy of `71b4fe18`: **43 of 43 fail** across
  the four new suites (the routes and the storage contracts do not exist).
- Focused green **43 pass**: the flow over HTTP **29** (the start; a first sign-in
  making a business, redeemed for a session and spent; a later sign-in with no name or
  email; a relay address; the unsigned form; two first sign-ins at once; no joining by
  a business's or a teammate's email, however the address is written, and a pending
  identity becoming a business only once nobody uses its email; every refusal: another
  browser's state, no cookie, a tampered cookie, Google's cookie, an expired start, a
  replayed start, a cancel, a wrong nonce, audience, issuer, expiry or signer, a
  withdrawn grant, Apple unreachable, an unverified or missing email, a post from any
  origin but Apple's; and the one-time code's own refusals), not configured **3**, a
  non-https origin and the cookie flags **2**, storage **9**. T5a's 49 still pass.
- The three routes are registered and held by the existing machinery: route suites
  **25 suites / 1,709 tests pass**, with the reviews, the public-path entries, the
  matrix answer, a served case for each route and a no-one's-code case added.
- Affected regression **73 suites / 2,603 tests pass** (sign-in, sessions,
  configuration, migrations, routes, the cross-site guard, the harness guards).
- Fresh actual PostgreSQL 16 **10 pass / 0 fail** on a new empty database through the
  existing runner, 0033 included: lookup by all three parts of the key; a pending
  identity recorded once and keeping only its first email; the business, owner login,
  subscription and identity made together; a pending row taken over, not duplicated; a
  linked identity never moved, with nothing made; an address already in use making
  nothing; an identity that cannot be written (a trigger) leaving no business, login or
  subscription; six rounds of two first sign-ins at once; the same person under two
  addresses at once; and the table's own rules (one identity per login, linked and
  unlinked each all-or-nothing, a unique subject, gone with its login).
- Mutation check, on a scratch copy only: **44 of 44 planted defects caught**, after
  one was rerun: 6 by both the unit tests and PostgreSQL, 36 by the unit tests only,
  one by PostgreSQL only (the business and its identity not being one transaction), and
  one that first survived. The survivor was a weak test, not a weak rule: a cancel was
  only ever sent without a code, so dropping the cancel check changed nothing; the test
  now also sends a cancel that carries a code, and the mutant is caught. Among those
  caught: an identity joined to an existing login by its email; the form's email
  believed; the token held to its own nonce instead of this browser's; the callback
  admitted from any site; the one-time code put in the address.
- Typecheck, production build and whitespace pass. Inventories: **190 registrations /
  0 unclassified / 0 gaps; 263 storage contracts**.
- **Full server: 175 suites / 4,307 tests pass**, exit 0, 602.304 seconds, run on
  `0a12124a` with a clean tree apart from untracked documentation. No new client or
  browser run is claimed.

## Phase handoff record

- Scope/files: `git show --stat 0a12124a`.
- Migrations/target: `0033_apple_identities.sql`, additive (one new table). Applied only
  to new empty disposable loopback databases through the existing runner. The
  empty-database convergence was rehearsed as CI runs it (35 applied, 0 pending, 0
  drifted, 0 orphaned) and the recorded fingerprint moved to
  `R1-T5b-apple-identities-empty-fingerprint-2026-10-04.json`: 1 table, 9 columns, 3
  constraints, 3 indexes and 1 sequence added, nothing removed. No application
  database was contacted.
- Commands/logs: the base replay, focused, route and affected runs, the SQL verifier,
  the convergence rehearsal, the mutation script, typecheck/build, both generators, the
  full server run. Logs under `.local/claude-scratch/session-2026-10-04/` (git-ignored).
- Negative/effect proof: every refusal makes no business, login, identity link or
  handoff code (the stored rows before and after); no Location carries a token or code;
  no log line carries one.
- Provider/UAT, devices, external actions, deploy: none. **No real Apple account, key,
  endpoint or device was used.** The stand-in signs tokens with a key made in the test.
- Security/privacy: reviewed the no-joining-by-email rule, the browser binding (state,
  nonce, signature, expiry, single use), the cross-site admission, the transaction
  boundary, what is read from the unsigned form, and response and log disclosure.
- In-flight: none. Every disposable PostgreSQL was stopped and deleted by the command
  that started it.
- Rollback/constraints: no rollback commit; fix forward. The new table can stay if the
  code is reverted.
- Approvals/stops: the T5b preflight and separate reread approve exactly this scope on
  `5019ee43`. No application, provider or production gate was crossed.
- Owner actions this adds: apply `0033` with `0030`–`0032`. Sign in with Apple stays
  off until the four `APPLE_*` settings exist.
- Deferred/next: T5c (connecting Apple from a signed-in owner's Settings, and what a
  pending identity becomes), T5d (the login button, the handoff on the login page, the
  Settings row, a browser check), T5e (runbooks and the owner's list).
