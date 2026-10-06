# R1-T5 — Sign in with Apple

Branch `remediation/r1-continuation-20260907`. Authority: the supplied integration
plan's R1-T5 (App Store guideline 4.8; "protocol-specific adapter on T4's
primitives"), v2.2 §8.6, and the owner's answer 2 of 2026-09-29:

> **"Build it now (Recommended)"** — Server and app code built and tested with
> stand-ins for Apple. It goes live once you've set up Apple and tried it on an
> iPhone.

That answer named what only the owner can do: a Services ID, a Sign in with Apple
key, his team ID, and a test on a real iPhone. The finish-R1 authorization of
2026-10-03 persists. Nothing here goes live without those.

## What exists (read on `9a7f9cda`)

No Sign in with Apple code. What R1-T4 built and this reuses:

- A starting cookie that binds a one-time `state` to the browser under the server's
  signature, good for ten minutes and taken up once (`server/google-sign-in.ts`,
  the throttle slot keyed by the state).
- A one-time handoff code: the callback never gives the browser a session; it sets a
  60-second HttpOnly code that the login page redeems once by a same-origin POST
  (`createAuthHandoffCode`, `consumeAuthHandoffCode`, `startBusinessSession`).
- Server sessions in an HttpOnly cookie with a CSRF token, and the list of
  cross-site callbacks (`server/cross-site.ts`), which already names Apple's form
  post as the one R1-T5 will add.
- Per-address limits on callbacks that get as far as asking the provider.

What Google's flow does that Apple's must **not** copy (the plan says so): it joins an
existing business by a verified email. For Apple there is no joining by email at all.

## The flow chosen, and why

The web flow through the Services ID, with Apple's form post back. The iPhone app
shows the live website, so one flow serves the browser and the app, and the owner's
answer already names the Services ID and key this flow needs. The native
`AuthenticationServices` sheet needs the app target, its entitlement and a device:
that is A-T2's (entitlements and provisioning) and is recorded there, not built here.

1. `GET /api/auth/apple` sets a signed starting cookie (state and nonce) and sends the
   browser to Apple with `response_mode=form_post`, the Services ID, the exact
   redirect address, `state` and `nonce`.
2. `POST /api/auth/apple/callback` is Apple's form post from `appleid.apple.com`. The
   state must be this browser's, in time, and unused. The code is exchanged at Apple's
   token endpoint with a short-lived client secret signed by the Apple key. The
   identity token that comes back is verified: Apple's signature against Apple's
   published keys, issuer, audience (the Services ID), time, and the nonce this
   browser was given.
3. The stable Apple subject, keyed by issuer and client id, decides who this is:
   known → that login; unknown with an email no TaptPay login uses → a new business,
   as a first Google sign-in makes; unknown with an email a login already uses → **no
   link**, a pending identity is recorded, and the person is told to sign in the usual
   way and connect Apple from Settings.
4. The session is handed over exactly as Google's is: a one-time code in an HttpOnly
   cookie, redeemed once by the login page.

Linking happens only from a signed-in owner's session, by the same flow started from
Settings. Apple's name and email arrive only on the first authorization and may be a
private relay address: they are kept only when present, and no later sign-in depends
on them.

## Decomposition

- **T5a — Apple's token boundary.** The client secret (ES256, the team's key), the
  code exchange, Apple's published keys (fetched, cached, refetched on an unknown
  key id), and identity-token verification, all behind a transport the tests replace.
  The configuration group. No routes, no schema.
- **T5b — identities and sign-in.** A table for Apple identities (issuer, client id,
  subject; the login it belongs to, or pending), the start and callback routes, the
  session handoff, a new business on first sign-in, the duplicate-email refusal.
- **T5c — connecting from Settings.** The signed-in owner's link flow, and what a
  pending identity becomes when its owner connects it.
- **T5d — the screens.** "Continue with Apple" on the login page at the same weight as
  Google's, the handoff, and the Settings row. A browser check on phone, tablet and
  desktop.
- **T5e — runbooks and the owner's list.** Key rotation; revoking Apple's grant when
  an account is deleted (by a fresh authorization at that moment, so no Apple token is
  ever stored: account deletion itself is A-T6); the route inventory; what the owner
  sets up in Apple's console.

## Recorded for the owner (defaults taken, none blocks T5a or T5b)

1. **Where the button goes.** Default: beside the Google button, the same size, in
   Apple's own black style with its mark. It is the one piece of this the owner will
   want to look at before it ships.
2. **An email that already has a login.** Default, from the plan: never joined by
   email. The person sees "That email already has a TaptPay login. Sign in, then
   connect Apple in Settings."
3. **Hide My Email.** A business that signs up through Apple with a private relay
   address gets its TaptPay email there. Apple delivers it only from sender addresses
   registered in the owner's Apple account. That registration is his.
4. **Apple's server notifications** (consent withdrawn, account deleted at Apple) are
   not received in this plan; a withdrawn grant is met at the next sign-in, when
   Apple refuses the code. Receiving them is a small later addition.
5. **Your password, to connect or disconnect Apple** (added with T5c). Default: the
   owner types their current password, the same rule as changing the password, and
   counted against the same limit. Adding a way to sign in is as serious as changing
   the password, and it stops someone at an unlocked screen from adding their own
   Apple account. Cost: an owner who only ever signed in with Google has no password
   they know, and must set one with "Forgot password" first. The alternative is "only
   in the ten minutes after signing in", which asks for nothing extra but is weaker.
6. **Disconnecting Apple** (added with T5c). Default: built, behind the same password.
   Without it a wrong Apple account, once connected, could never be removed by the
   owner (one Apple account per login, and a connected one is never moved). Because it
   needs the password, a login made with Apple (which has no known password) cannot
   disconnect its only way in by accident. Disconnecting does not sign anyone out;
   "sign out everywhere" does that.
7. **Owners only** (the plan's wording, and what Google's sign-in does). A teammate
   cannot sign in with Apple or connect it. A teammate whose email meets Apple's still
   sees the "sign in, then connect Apple in Settings" message, which they cannot act
   on.
8. **No email is sent when Apple is connected or disconnected.** The app sends none
   when a password changes either; both are written to the security log. A notice
   email for both is a small later addition.
9. **The Settings row** (added with T5d). Default: in the Account section on the phone
   and on the tablet and desktop screens, for the owner only: "Sign in with Apple", whether
   it is connected and with which address, a field for the current password and one
   button (Connect Apple, or Disconnect). Plain ink, no new colours. It is new on screen
   and the owner will want to look at it. The row is not drawn at all until Apple is set
   up, unless an identity is already connected.
10. **"Forgot password?" on the login page** (found with T5c). It answers "coming soon",
    though the page exists at `/forgot-password`. An owner who has only ever signed in
    with Google has no password they know and needs that page before connecting Apple.
    Default: the Settings row links to it; the login page is left exactly as it is.
11. **Apple's mark on the button** (added with T5d). Default: the standard Apple logo
    shape, drawn in the page as Google's "G" is. Apple's own guidance asks for the
    artwork from its design resources: swapping that file in before submission is a
    one-line change, and his to choose.

## T5a preflight — Apple's token boundary

Base `9a7f9cda` (S6b code `382de840`; the commit above it is documentation).

### Verification of Prior Fixes

S6b was verified in this session: 170 suites / 4,210 tests on `382de840`. Reread for
this scope: `server/google-sign-in.ts`, the three Google routes, the configuration
module's credential groups and its PUBLIC_ORIGIN rule, how the tests replace the
network (`jest.spyOn(global, "fetch")`, and the harness's refusal of any off-machine
connection), and Apple's documented token endpoint, key set and identity-token
claims.

### Blocking Issues

None for T5a. The owner's Apple setup blocks going live, not building: every test
uses a key pair made in the test and a stand-in for Apple's two endpoints.

### High-Risk Concerns

- **Only Apple's signature counts.** RS256 only; `alg: none`, HS256 with a public key
  as the secret, and an unknown key id are refused. The key set comes from Apple's
  fixed address over HTTPS, is cached, and is refetched once when a key id is not in
  it, never more often than once a minute, so a made-up key id cannot be used to make
  the server hammer Apple.
- **Issuer, audience, time and nonce are all required.** The nonce is compared in
  constant time with the one this browser was given.
- **The email claims are read strictly.** `email_verified` and `is_private_email`
  arrive as booleans or as the strings "true" and "false"; anything else is not true.
- **The client secret is a credential.** It lives a few minutes, is made per
  exchange, and is never logged or returned. The private key is read from
  configuration only.
- **Fail closed.** Apple unreachable, a non-200, a body that is not what was asked
  for: no identity.

### Missing Steps

Tests red first (verification against a test key set: every wrong claim, algorithm
and key; the key cache; the client secret's claims and signature; the exchange's
request and each failure); the module; the configuration group and its tests; the
environment example; typecheck, build, affected and full runs, the mutation check,
evidence. No PostgreSQL in T5a: it stores nothing.

### Unsafe Assumptions

Apple may rotate its keys at any time: an unknown key id triggers one refetch.
Clock skew of a minute is tolerated on `iat`; none is added to `exp` beyond that.
The Services ID is the audience for the web flow; the native app's bundle id is a
different audience and is A-T2's to add.

### Required Ordering Changes

The boundary before any route, so T5b's routes call something already verified.

### Open Product / Provider / Legal Questions

None for T5a. The four recorded above are T5b–T5d's.

### Compliance and Data-Handling Notes

No real Apple account, key, token or person is used. The stand-in tokens are signed
by a key pair generated in the test. Nothing is sent off the machine.

### Test and Rollback Adequacy

A token is accepted only when every check passes; each single wrong thing (signature,
algorithm, key id, issuer, audience, expiry, not-before, nonce, missing subject) is
refused on its own. Fix forward; the module has no caller until T5b.

### Final Recommendation (Approve / Do not approve)

**Approve T5a on `9a7f9cda`**, failing tests first. It does not close R1-T5.

### Separate reread

Retraced against the existing code. `jsonwebtoken` is already a dependency and
verifies RS256 against a key object with a fixed algorithm list; Node's own
`crypto.createPublicKey` reads a JWK, so no new dependency is needed. Configuration
groups are declared with `requireCompleteGroup` and need PUBLIC_ORIGIN outside tests,
as Google's does. The harness refuses off-machine connections, so the boundary must
take its transport as a parameter that the tests supply; production passes `fetch`.
What must not move: nothing existing calls this. **Approve the same T5a scope.**

## T5a completion

Code `8b026aa7`, with the harness fix `01e22c4b`. The suite could not load on
`7c6f0f69`; then 49 pass; 11 related suites / 274 tests; 36 of 36 planted defects
caught after two weak tests were tightened; the first full server run failed one
test (the harness's guard on provider secrets, which the new key tripped), and the
repeat on `01e22c4b` passed 171 suites / 4,259 tests.
[Evidence](evidence/remediation-v2-2/r1/R1-T5a-apple-token-boundary-2026-10-04.md).
Nothing calls the boundary yet. T5b is next; its starting facts are in
`docs/HANDOFF-2026-10-04-r1-t7-s6.md`.

## T5b preflight — identities and sign-in

Base `5019ee43` (T5a code `8b026aa7` + `01e22c4b`; the commits above are
documentation and one development-only setting).

### Verification of Prior Fixes

T5a was verified in this session: 171 suites / 4,259 tests on `01e22c4b`. Reread for
this scope: the three Google routes and their reviews, `server/google-sign-in.ts`,
the cross-site guard and its list of callbacks, the handoff storage, how a new
business and its owner login are made (`createMerchantWithPassword`,
`syncOwnerUser`), `loginForUserId`, the throttle buckets, and how a new route is
registered with the inventory, the review, the matrix and the served-route tests.

### Blocking Issues

None for the server side. The login page has no Apple button until T5d, so after T5b
the routes exist and nothing on screen leads to them. Going live still needs the
owner's Apple setup.

### High-Risk Concerns

- **No joining by email, ever.** An Apple identity signs in a login only if that
  login was made with it (or, in T5c, connected to it from a signed-in owner's
  session). An unknown identity whose email already has a business or a login gets
  no session: a pending identity is recorded and the person is told to sign in and
  connect Apple from Settings. This is the plan's rule and the opposite of Google's.
- **A new business and its identity are one write.** The business, its owner login,
  its subscription and the linked identity commit together. Otherwise a failure in
  between would leave a business whose only way in (Apple) no longer recognises it.
- **Apple's return is a cross-site POST.** It is admitted only from
  `https://appleid.apple.com`, by exact origin, in the guard's list. The starting
  cookie is `SameSite=None; Secure; HttpOnly` (the only way it comes back on that
  POST), so the flow is refused on a non-https origin. The cookie carries the state
  and the nonce under the server's signature, lasts ten minutes and is taken up once,
  before Apple is asked anything.
- **Only the verified token says who it is.** The form's `user` field (the name, on
  the first authorization) is not signed: a display name is read from it and nothing
  else. The email comes from the token, and must be one Apple verified.
- **The session is never in an address.** As Google's: a 60-second one-time code in an
  HttpOnly cookie, redeemed once by a same-origin POST.

### Missing Steps

Tests red first (the flow end to end against a stand-in Apple; storage in both
implementations and the captured SQL); migration 0033 (`apple_identities`, additive)
with its contract entry, test-list entry, schema declaration and regenerated
fingerprint; the three routes; the cross-site entry; the throttle buckets; the route
reviews, the public-path entries, the matrix answer and the served recipes; actual
PostgreSQL for the identity rules and the atomic create; the mutation check;
typecheck, build, affected and full runs, evidence.

### Unsafe Assumptions

A first sign-in whose token carries no email (Apple shares it once, and the identity
is unknown here) cannot make a business, which needs an address: the person is told
to remove TaptPay under "Sign in with Apple" in their Apple ID settings and try again,
which makes Apple share it again. A relay address is a deliverable address only once
the owner registers TaptPay's sender with Apple; until then such a business gets no
email from TaptPay. A new business is named from Apple's display name, or the part
of its address before the @, as a Google one is. Removing a login removes its
identity row. Memory mirrors the rules for the harness; the SQL is proved on
PostgreSQL.

### Required Ordering Changes

The table and storage first; then the starting cookie and buckets; then the routes;
then the registrations (cross-site list, inventory, review, matrix, served recipes).

### Open Product / Provider / Legal Questions

None that block. The four defaults recorded at the top of this plan stand.

### Compliance and Data-Handling Notes

Stored about an Apple identity: Apple's issuer, the Services ID, the subject, the
email as Apple gave it on the first authorization, whether it is a relay address,
and when it was linked. No Apple token or code is stored or logged. Synthetic
loopback PostgreSQL and a stand-in Apple only.

### Test and Rollback Adequacy

First sign-in, later sign-in with no name or email, a relay address, a wrong or
missing state, a replayed start, a wrong nonce, audience or issuer, a withdrawn
grant, Apple unreachable, a duplicate email (business or teammate), an unverified
or missing email, a post from another site, and two first sign-ins at once. A refusal
makes no business, login, identity link or session. Fix forward; the table is
additive.

### Final Recommendation (Approve / Do not approve)

**Approve T5b on `5019ee43`**, failing tests first. It does not close R1-T5.

### Separate reread

Retraced by call site. The handoff storage is keyed by a code's hash and a login id
and knows nothing of Google, so Apple's routes reuse it unchanged under their own
cookie. `loginForUserId` already refuses a login that is not active or whose business
is not, at redemption. The guard's list takes exact origins; the only entry today is
the card callback with "any". `express.urlencoded` is global, so Apple's form is
parsed before the route. `createMerchantWithPassword` is one transaction in the
database implementation and can take the identity insert inside it without changing
what Google's path does. What must not move: Google's three routes, byte for byte;
the login page's handling of `?error=`; every existing cross-site refusal.
**Approve the same T5b scope.**

## T5b completion

Code `0a12124a`. 43 of 43 red on `71b4fe18`; then 43 pass (HTTP 29, not configured 3,
non-https origin 2, storage 9); route suites 25 / 1,709 with the three routes
registered and served; affected 73 suites / 2,603; actual PostgreSQL 10 of 10 with
migration 0033 through the runner, and the convergence rehearsal (35 applied) with a
new recorded fingerprint; 44 of 44 planted defects caught after one weak test was
tightened; full server 175 suites / 4,307 tests on the commit.
[Evidence](evidence/remediation-v2-2/r1/R1-T5b-apple-identities-and-sign-in-2026-10-04.md).

## T5c preflight — connecting Apple from a signed-in owner

Base `81933759` (T5b code `0a12124a`; the commit above it is documentation).

### Verification of Prior Fixes

T5b was verified in this session: 175 suites / 4,307 tests on `0a12124a`. Reread for
this scope: the three Apple routes and the starting cookie's signature and format;
how a request is signed in (`authenticateToken`, the session row, the CSRF check on
every change, `userOfLiveSession`); the session cookie's flags (`SameSite=Lax`: not
sent with Apple's form post); the change-password route and its counted password
check; `isAccountOwner` (which also answers yes for the platform admin, who has no
login row); the identity table's rules (one identity per login, a linked identity
never moved); and how a signed-in, owner-only route with no business in its address
is reviewed and listed.

### Blocking Issues

None for the server side. Settings has no row for this until T5d, so after T5c the
routes exist and nothing on screen leads to them.

### High-Risk Concerns

- **Who is being connected is never taken from Apple's post.** Apple's return is a
  cross-site post, so the session cookie is not on it. The login and the session that
  asked ride in the starting cookie, under the server's signature, with a key used
  for nothing else, so a sign-in cookie can never be read as a connect cookie nor the
  other way round. The cookie is HttpOnly and is set only on the answer to a
  signed-in, CSRF-checked request that proved the password.
- **The session that asked must still be live when Apple returns, and still the
  owner's.** Checked before Apple is asked anything, and again just before the write.
  Signing out, "sign out everywhere", a password change, or the login or business
  being switched off in those ten minutes means nothing is connected. The write
  itself re-reads the login under a row lock and refuses anything but an active
  owner.
- **A connected identity is never moved, and a login has one.** An identity already
  another login's is refused; a login that already has a different identity is
  refused; the same identity again is a no-op. Two connects at once resolve to one,
  by the row lock and the table's two unique rules.
- **A pending identity's email authorizes nothing.** It becomes the owner's because
  the signed-in owner proved the password and Apple proved the identity, whatever
  email the pending row holds.
- **Adding a sign-in is a credential change.** It needs the current password, counted
  in the same bucket as change-password so the two cannot be used to double the
  guesses. Disconnecting needs it too.
- **The start is a POST, not a link.** A GET could be started by another site's link
  (the session cookie is Lax). The start answers with Apple's address for the page to
  go to.
- **Sign-in is untouched.** The callback's sign-in path stays as T5b verified it; the
  connect path is taken only when the cookie is a connect cookie.

### Missing Steps

Tests red first (the connect flow end to end against the stand-in Apple, every
refusal, the disconnect, the status; storage in both implementations and the captured
SQL); the storage contracts; the connect cookie; one exported read of "the login a
live session stands for"; the three routes and the callback's connect path; the route
reviews, the matrix rows and served recipes, both inventories; actual PostgreSQL for
the link rules and the races; the mutation check; typecheck, build, affected and full
runs, evidence. No migration: the table from 0033 is enough.

### Unsafe Assumptions

The owner's browser returns to `/settings?apple=<one fixed word>`; the page that
reads the word is T5d's. No session is made on a connect (the owner already has one),
so there is no handoff code. The email kept on the row is the verified one in Apple's
token when there is one, else what the row already had; it is shown to the owner and
decides nothing. Disconnecting deletes the row: nothing about that Apple account is
kept. Sessions that were begun by Apple before a disconnect stay until they end or
the owner signs out everywhere.

### Required Ordering Changes

Storage first; then the connect cookie; then the routes; then the registrations.

### Open Product / Provider / Legal Questions

Defaults 5 to 8 at the top of this plan, recorded for the owner. None blocks.

### Compliance and Data-Handling Notes

Nothing new is stored: the same row, now with the owner's login on it. Connecting and
disconnecting are written to the security log by login id, with no Apple subject,
token or email. Synthetic loopback PostgreSQL and a stand-in Apple only.

### Test and Rollback Adequacy

Connect an unknown identity, a pending one, the same one again; refusals for an
identity that is another login's, a login that has another, a teammate, the platform
admin, no session, no CSRF token, a wrong password, too many wrong passwords, Apple
not configured, a cancel, a wrong or replayed state, a sign-in cookie offered as a
connect cookie and the reverse, a session ended before Apple returns and while Apple
is being asked, and every Apple failure. A refusal changes no row. Fix forward; no
schema change.

### Final Recommendation (Approve / Do not approve)

**Approve T5c on `81933759`**, failing tests first. It does not close R1-T5.

### Separate reread

Retraced by call site. `authenticateToken` sets `req.authSession` for every cookie
session and checks the CSRF token on every change, so the start route gets the
session id for free. `userOfLiveSession` already answers "who is this session, if it
still stands" without presenting the cookie's secret and without counting as a use:
it is private to `server/auth.ts` and needs only an exported name. The platform admin
passes `isAccountOwner` but has no users row and no business session, so the gate
must ask for a business session and an owner login by its row id, as change-password
refuses the admin. The starting cookie's reader refuses anything but four parts, so a
six-part connect cookie under another key cannot pass it, and the new reader must
refuse four. The users table spells the owner's role `owner`. Apple needs one
registered return address, so the connect uses the same callback path and the
cross-site list does not change. What must not move: the three T5b routes' behaviour
on a sign-in cookie, byte for byte (their 43 tests are the net); change-password.
**Approve the same T5c scope.**

## T5c starting facts (read, not yet changed)

- Settings has no connected-accounts row of any kind today (nothing for Google
  either), so the screen for "connect Apple" is new and is T5d's; T5c is the server.
- Apple's callback is a cross-site post, so the session cookie is not on it. The link
  intent has to ride in the starting cookie under the server's signature: the login
  and the session that started it. The callback must check that session is still
  live before it links anything.
- Start the link by a signed-in POST with the page's CSRF token (which answers with
  Apple's address for the page to go to), not by a plain GET.
- The plan says "from an already authenticated owner session". Default: the account
  owner only, connecting an identity to the owner's own login.
- Outcomes to settle in the preflight: an unknown or pending identity is linked; one
  already this login's is a no-op; one linked to another login is refused; a login
  that already has a different Apple identity is refused (one per login, by the
  table). A pending identity's stored email is not what authorizes the link: the
  signed-in session is.
- Storage needs one contract that links under the identity's row lock, and a read of
  "does this login have an Apple identity" for the Settings row.

## T5c completion

Code `3520df77`. The session before stopped mid-step; what it left uncommitted (the
tests, the storage contracts, the connect cookie) was treated as an unverified draft and
re-proved. 93 of 95 new tests red on `3cf92efa` (the other two are the first tests of
sign-in's own per-address limit from T5b, which pass there by design); then 100 pass
across six suites (the flow over HTTP 50, the connect cookie 19, storage 15, the
per-address limit 6, not configured 7, a non-https origin 3); route suites 25 / 1,740
with the three routes reviewed, registered and served and the callback's review in two
branches; affected 86 suites / 2,891; actual PostgreSQL 13 of 13, the races included,
and T5b's 10 of 10 again; 117 of 117 planted defects caught after one weak test was
tightened; full server 179 suites / 4,432 tests on the commit.
[Evidence](evidence/remediation-v2-2/r1/R1-T5c-apple-connect-2026-10-06.md).

Settled while building, by the plan's protected order (a capability before the role):
the start says Apple is not available (503) before it asks who is calling. Changed from
the draft: the connect cookie's reader takes a login id of at most ten digits.

## T5d preflight — the screens

Base `9a531b3e` (T5c code `3520df77`; the commit above it is documentation).

### Verification of Prior Fixes

T5c was verified in this session: 179 suites / 4,432 tests on `3520df77`. Reread for this
scope: the login page (the Google button, its handoff, how it cleans the address); both
Settings screens (the phone's `client/src/pages/settings.tsx`, whose Account section
holds only the account's status; the tablet and desktop's
`client/src/desktop/DesktopSettingsPage.tsx`, whose Account section has the password
row); how a page sends a change (`apiRequest` to `sessionFetch`, which adds the page's
CSRF token); `apiErrorMessage`; the client tests' set-up (jsdom, `fetch` replaced, any
React warning fails the test); the public capability reads and their reviews; R1-T4
phase E's in-process browser check; and the plan's baseline rule (R1-H1: "intentional R1
differences such as Sign in with Apple are reviewed explicitly rather than absorbed").

### Blocking Issues

None for building. What only the owner can settle is recorded, not asked: how the
button and the Settings row look (defaults 1 and 9 at the top of this plan).

### High-Risk Concerns

- **The button must not appear where it does nothing.** The owner's answer: it goes live
  once Apple is set up. The login page asks the server whether Sign in with Apple is
  offered and shows the button only on a yes. That needs one small public read
  (`GET /api/auth/apple/available`): a boolean from configuration and the origin's
  scheme, nothing else. Until the owner's setup the login page is exactly as it is now.
- **The same weight as Google's** (guideline 4.8; Apple's interface guidelines): the
  same width, height and shape, directly under Google's, Apple's mark, black, the
  approved wording "Continue with Apple".
- **The handoff takes nothing from the address** but the fixed word `complete`. The
  page redeems the one-time code by a same-origin POST and stores nothing, as Google's
  does. `apple` joins the sign-in results the page removes from its address.
- **The password is typed, used once and forgotten**: component state, cleared when the
  request ends, never stored, never in an address.
- **The page leaves only for Apple.** The start's answer is believed only when its
  address is Apple's own authorize page (`https://appleid.apple.com/`).
- **The return word is one of eight.** Each maps to a fixed message; anything else says
  nothing; the word is removed from the address either way.
- **Owners only.** The row is not drawn for a teammate (the server refuses them too),
  and not drawn at all when Apple is not offered and nothing is connected.
- **No new status colours** (the owner's rule): the row is neutral ink.

### Missing Steps

Tests red first (the read, in its three configurations; the button's presence, absence
and click; Apple's handoff; the row on the phone and on the desktop screen: its states,
connecting, disconnecting, each refusal, each return word, the address cleaned); the
read with its review, public-path entry and served case; the shared client piece; the
login page; the two Settings screens; a real browser on phone, tablet and desktop
against the real routes, over https, with a stand-in Apple; typecheck, build, affected
and full runs for server and client, the mutation check, evidence.

### Unsafe Assumptions

The iPhone app shows the live site, so these pages are what it shows; Sign in with Apple
inside that app, and Safari itself, are the owner's real-device check. The browser check
here is Chromium: it proves the pages and this server's cookies together (the starting
cookie returning on Apple's cross-site post, the session cookie staying behind and being
there again on the way back), not Safari's own rules. A stand-in page plays Apple's
sign-in screen and posts the form back the way Apple does.

### Required Ordering Changes

The read first; then the shared client piece; the login page; the two Settings screens;
the browser check last, on the built app.

### Open Product / Provider / Legal Questions

Defaults 1 and 5 to 8 stand. Added with T5d, recorded for the owner: (9) what the
Settings row says and where it sits; (10) the login page's "Forgot password?" answers
"coming soon" although the page exists at `/forgot-password` — the row links to that
page for an owner who has no password they know, and the login page is left as it is.

### Compliance and Data-Handling Notes

The pages store nothing new. Analytics gets `auth_method: "apple"` on the same three
sign-in events Google's has, with no identifier. The row shows the address Apple gave,
to its owner only.

### Test and Rollback Adequacy

Each screen's states are driven with the server's real answers as fixtures; the browser
check drives the real routes end to end at three sizes. A refusal leaves the page as it
was. Fix forward; nothing here changes a stored row's shape.

### Final Recommendation (Approve / Do not approve)

**Approve T5d on `9a531b3e`**, failing tests first. It does not close R1-T5: the
runbooks (T5e) and the owner's setup and iPhone check remain.

### Separate reread

Retraced by call site. The login page's effect already handles `?error=` for any
provider, so Apple's refusals are shown today; only `apple=complete` and the button are
new. `/settings` draws the phone screen for the phone and `DesktopSettingsPage` for
tablet and desktop, in three verticals from one component: two places take the row, not
six. Both screens already know whether the login is the owner (`/api/auth/me`). The
desktop Account section ends with the password row, which stays; the Apple row follows
it. A fresh query client in a test has no default fetcher, so the shared piece must
bring its own. `window.location.assign` is what jsdom cannot do: the shared piece
leaves through one small function the tests replace. What must not move: Google's
button, handoff and tests; the password row; every existing Settings test.
**Approve the same T5d scope.**

## T5d completion

Code `3e5db51d`. Red on `d86d6f11`: five server assertions, the five new client suites
unable to load, and the one changed test. Then: server 60 focused; client 117 new tests
(the shared rules 33, the shared row 41, the login page 15, the phone screen 10, the
tablet and desktop screen 18); route suites and their neighbours 32 / 1,881 with the
read registered and served; **a real browser on the real routes with a stand-in Apple,
83 of 83 checks at phone, tablet and desktop**, the server seeing Apple's post back as a
cross-site form post from Apple's origin with the starting cookie and, on a connect,
without the session cookie; 81 of 81 planted defects caught (74 in the pages, 7 on the
server), none surviving; full client 117 suites / 1,420 tests and full server 179 suites / 4,436 tests on the
commit. [Evidence](evidence/remediation-v2-2/r1/R1-T5d-apple-screens-2026-10-06.md).

Settled while building: "connected" is said on a return only when the server's own
answer agrees (the word alone is anyone's to put in a link); a refusal shows the
server's words or one fixed sentence, never a raw body; the password field's name for
assistive technology is "Current password for Apple" on both screens.
