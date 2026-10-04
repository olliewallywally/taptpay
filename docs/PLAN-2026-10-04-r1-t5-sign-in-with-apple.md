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
