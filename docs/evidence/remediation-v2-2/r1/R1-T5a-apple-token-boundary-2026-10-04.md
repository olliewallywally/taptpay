# R1-T5a — Apple's token boundary

Exact branch `remediation/r1-continuation-20260907`, code `8b026aa7` with the harness
fix `01e22c4b`, base `7c6f0f69` (S6b code `382de840`).
[Plan, decomposition and preflight](../../../PLAN-2026-10-04-r1-t5-sign-in-with-apple.md).
T5a is code-complete; independent review is owed. **R1-T5 is not complete**: nobody
can sign in with Apple yet (T5b–T5e), and going live needs the owner's Apple setup
and a real iPhone. Owner decision 2026-09-29 (answer 2) governs.

## What was built

`server/apple-sign-in.ts`: the three things Apple's protocol asks of a server, each
failing closed, with the network as a parameter so no test leaves the machine.

- **The client secret.** A five-minute ES256 token signed with the team's key, made
  per exchange: this team (issuer) vouching for this Services ID (subject) to Apple
  (audience), naming its key id.
- **The code exchange.** Apple's one-time code, the Services ID, the secret and the
  exact redirect address, posted to Apple's token address. `invalid_grant` is Apple
  no longer honouring the code (used, expired, or the person withdrew); anything else
  that is not a 200 with an identity token is Apple not answering as documented.
- **Identity-token verification.** RS256 only, chosen by the server and never by the
  token; a key Apple publishes; Apple as issuer; this Services ID as the only
  audience; an expiry in the future; an issue time not more than a minute ahead; the
  nonce this browser was given, compared in constant time; a subject. `email_verified`
  and `is_private_email` are true only as `true` or `"true"`. The email is optional:
  Apple sends it once.
- **Apple's published keys.** Fetched from Apple's fixed address, kept, and refetched
  when a token names a key id we do not have (Apple rotates), at most once a minute.

`server/config.ts`: `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` and
`APPLE_PRIVATE_KEY`, all four or none; the key must be an EC P-256 private key (the
refusal never echoes it; a key pasted on one line is put back on its lines); and the
public origin is required outside tests, because Apple is given one exact redirect
address.

Nothing calls the module yet. No route, schema, client or dependency changed
(`jsonwebtoken` was already a dependency; keys are read with Node's own `crypto`).

## Verification

- Original red on `7c6f0f69`: the suite **cannot load** (the module does not exist).
- Focused green **49 pass**: 26 on the identity token (the accepted token, a later
  sign-in with no email, a private relay address, and every single wrong claim,
  algorithm, key and shape refused on its own), 5 on Apple's published keys (fetched
  once and reused; a rotated key picked up by one refetch; made-up key ids causing
  none within the minute; unreadable keys; non-RSA entries ignored), 10 on the client
  secret and the exchange, 8 on configuration.
- Related suites **11 suites / 274 tests pass** (configuration, its source guard,
  Google sign-in, sessions, the no-network harness).
- Mutation check, on a scratch copy only: **36 of 36 planted defects caught**, after
  two were rerun. The first pass left two survivors, and each was a weak test, not a
  weak rule: a token with no key id was refused either way, so the test now also
  requires that Apple is not asked for its keys; and the public-origin rule was
  masked by the email provider's own, so the test now uses an environment in which
  nothing else needs the origin. Both mutants are caught by the tightened tests.
- Typecheck, production build and whitespace pass. No route changed, so both
  inventories are unchanged (**187 registrations / 0 gaps; 260 storage contracts**).
- **Full server, first run on `8b026aa7`: 170 suites pass and 1 fails (4,258 of
  4,259 tests).** The failure was the harness's own guard
  (`harness-live-provider-credentials`): `server/config.ts` had started reading a
  provider secret, `APPLE_PRIVATE_KEY`, that the harness did not yet clear from the
  ambient environment. The hand-picked related suites above did not include that
  guard; the full run did its job. Fixed in `01e22c4b` (the Apple group joins the
  credentials the harness clears).
- **Full server, repeated on `01e22c4b`: 171 suites / 4,259 tests pass**, exit 0,
  607.961 seconds, with a clean tree apart from untracked documentation. No new
  client or browser run is claimed.

## Phase handoff record

- Scope/files: `git show --stat 8b026aa7`: the module, the configuration group,
  the environment key list and one test file; `01e22c4b`: the harness's list of
  credentials it clears from the ambient environment.
- Migrations/target: none. T5a stores nothing; no PostgreSQL verifier applies.
- Commands/logs: the red run, focused and related suites, the mutation script,
  typecheck/build, the full server run. Logs under
  `.local/claude-scratch/session-2026-10-04/` (git-ignored).
- Negative/effect proof: every single wrong thing about a token is refused on its
  own; a refusal's message carries no token, subject or address; no log line carries
  a secret or a key.
- Provider/UAT, devices, external actions, deploy: none. **No real Apple account,
  key, endpoint or device was used**: the stand-in signs tokens with a key pair made
  in the test and serves the matching key set. Apple's documented behaviour is taken
  on its documentation, not observed.
- Security/privacy: reviewed algorithm choice, key provenance and refetch limits,
  claim checks, constant-time nonce comparison, error and log disclosure, and the
  configuration refusals.
- In-flight: none.
- Rollback/constraints: no rollback commit; the module has no caller.
- Approvals/stops: the T5a preflight and separate reread approve exactly this scope
  on `7c6f0f69`. No application, provider or production gate was crossed.
- Deferred/next: T5b (the identity table, the start and callback routes, the session
  handoff, a new business on first sign-in, the duplicate-email refusal), then T5c
  (connecting from Settings), T5d (the screens) and T5e (runbooks and the owner's
  list). The native sign-in sheet is A-T2's.
