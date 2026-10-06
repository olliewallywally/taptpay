# R1-T5c — connecting Apple from a signed-in owner

Exact branch `remediation/r1-continuation-20260907`, code `3520df77`, base `3cf92efa`
(T5b code `0a12124a`; the two commits above it are documentation).
[Plan and preflight](../../../PLAN-2026-10-04-r1-t5-sign-in-with-apple.md).
T5c is code-complete; independent review is owed. **R1-T5 is not complete**: no screen
leads to these routes yet (T5d), and going live needs the owner's Apple setup and a real
iPhone. Owner decision 2026-09-29 (answer 2) governs.

## How this batch was made

The previous session stopped mid-step on 2026-10-04 at 09:39 UTC (its transcript ends on
a tool result, with nothing in flight). It left the T5c preflight committed (`3cf92efa`)
and, uncommitted: the failing tests, the three storage contracts in both
implementations, the connect cookie, and the exported read of a live session. No route
existed. This session treated that tree as an unverified draft: it re-read the plan and
the draft, re-ran the tests (38 passing, 49 waiting on the routes), built the routes and
their registrations, and re-proved the red state on an archived copy of the base. One
thing in the draft was changed: the connect cookie's reader accepted a login id of up to
sixteen digits, which JavaScript cannot always hold exactly; it now accepts at most ten,
as a database id is, with two tests that failed first.

## What was built

Three routes for the signed-in owner, and a second path through Apple's one callback:

- `GET /api/auth/apple/connection` — whether Apple signs this login in, the address Apple
  gave (possibly a relay address) and since when; and whether a connect can start here.
  Never Apple's subject, issuer or client id.
- `POST /api/auth/apple/connect` — the start. A POST with the page's CSRF token, never a
  link. The owner proves the **current password**, counted in the same bucket as changing
  the password (five wrong between changing, connecting and disconnecting, then every
  attempt waits). It answers with Apple's address for the page to go to and sets the
  starting cookie, which carries the state, the nonce, the start time, **the login's id
  and the session's id** under the server's signature, with a key used for nothing else:
  a sign-in's cookie is never a connect's, nor the reverse. A login that already has
  Apple connected is told so (409) before its password is checked.
- `POST /api/auth/apple/disconnect` — removes the login's Apple identity, behind the same
  password. Nothing about that Apple account is kept. It needs nothing of Apple, so it
  works while Apple is not set up. It ends no session.
- `POST /api/auth/apple/callback` with a connect's cookie — Apple's return is a
  cross-site post with no session cookie on it, so **who is being connected is never
  taken from the post**: it is the login and session the cookie names. The state must be
  that cookie's, within ten minutes, and each start is taken up once. The session that
  asked must still stand and still be that owner's, **checked before Apple is asked and
  again before the write**; the write re-reads the login under its row lock and takes
  nothing but an active owner's. Apple's verified token (held to that cookie's nonce)
  says which identity. An identity never seen, or pending, becomes the owner's whatever
  email it held; one that is another login's is never moved; a login has one. Every
  outcome is a 303 to `/settings?apple=<one fixed word>`; no session, no handoff code,
  nothing of Apple's in an address. A sign-in's path is unchanged.

Order of refusals on the start, by the plan's protected order: not signed in (401), no
CSRF token (403), Apple not set up or not an https origin (503 `APPLE_NOT_AVAILABLE`,
no password checked), not the owner (403), no password in the body (400), already
connected (409), too many wrong passwords (429), wrong password (400).

Only an address Apple verified is kept, lower-cased; it is shown to the owner and decides
nothing. Connecting and disconnecting are written to the security log by login id only.
Returns that get as far as asking Apple are counted per visitor address in sign-in's
bucket, once addresses can be told apart; a connect that connects gives its count back.

No migration: the table from `0033` is enough. No client change.

## Verification

- Red first, replayed on an archived copy of `3cf92efa` with the final test files:
  **93 of 95 new tests fail** there (the routes, the cookie and the storage contracts do
  not exist). The other two pass on the base by design: they are the first tests of
  sign-in's own per-address limit on Apple's callback, which T5b built and nothing
  tested (they are held by the mutation check below, not by the base). The five older
  tests in the two shared files still pass there. The changed role and served-route
  tests fail on the base too (3: a request for a route that does not exist).
- Focused green **100 pass** across six suites: the flow over HTTP **50**, the connect
  cookie **19**, storage in both implementations with the captured SQL **15**, the
  per-address limit **6**, not configured **7** (3 older), a non-https origin **3**
  (2 older).
- The routes are registered and held by the existing machinery: route suites **25
  suites / 1,740 tests pass**, with three new reviews, the callback's review extended to
  two branches, a served case and a role case for each new route, the storage pins, and
  the three connect checks recorded as route facts.
- Affected regression **86 suites / 2,891 tests pass** (sign-in, sessions, the throttle,
  configuration, routes, the cross-site guard, contracts, the harness guards). It ran
  before the last two tests were added and one was tightened; the six focused suites
  were rerun afterwards, and the full run below has them all.
- Fresh actual PostgreSQL 16 **13 pass / 0 fail** (`scripts/verify-apple-connect-postgres.ts`)
  on a new empty database through the existing runner: an identity never seen and a
  pending one becoming the owner's (the same row; its address replaced only by one given
  now, the relay mark with it); the same identity again changing nothing, not even when
  it was linked; an identity that is another login's never moved; a login taking no
  second; only an active owner's login taking one; **a login switched off, or demoted,
  while a connect waits for its row being refused when the row is released**; eight
  rounds of two connects at once for one login; eight of two logins for one identity;
  six of the same connect twice; six of a connect against a first sign-in with the same
  identity (one has it, nothing half-made); disconnecting; and the read by login id.
  T5b's verifier still passes 10 of 10 on the same code.
- Mutation check, on scratch copies only: **117 of 117 planted defects caught**, after
  one was rerun: 14 by both the unit tests and PostgreSQL (every rule the database
  itself holds: the login's row lock, the owner and active conditions, a second
  identity, a linked identity moved, the address and the relay mark kept, the link's
  moment and login, the transaction, the read and the delete), 102 by the unit tests
  only, and one that first survived. The survivor was a weak test, not a weak rule: a
  connect returning to an app where Apple is no longer set up was let further in,
  failed inside the exchange and came back with the same word by accident; the test now
  also requires that nothing is logged and that the start is not taken up, and the
  mutant is caught. Among those caught: the connect cookie's signature not checked, or
  made with the sign-in's key; the session not checked before Apple is asked, or not
  again before the write; any live session accepted whoever's login the cookie names;
  a start taken up twice; the token held to its own nonce; a connect started without
  the password, or its wrong guesses counted apart from change-password's; the role
  asked before the capability; a teammate or the platform admin let through; Apple's
  callback admitted from any site; a linked identity moved. Not planted, because
  removing one changes nothing: the owner gate's three overlapping conditions one at a
  time (the two mutants that remove them together are caught), and the memory
  stand-in's id guard on a connect.
- Typecheck, production build and whitespace pass. Inventories: **193 registrations /
  0 unclassified / 0 gaps; 266 storage contracts**.
- **Full server: 179 suites / 4,432 tests pass**, exit 0, 808.5 seconds, run on `3520df77` with a
  clean tree apart from untracked documentation. No client or browser run is claimed:
  no client file changed.

## Phase handoff record

- Scope/files: `git show --stat 3520df77`.
- Migrations/target: none. Every PostgreSQL run used a new empty disposable loopback
  database through the existing runner. No application database was contacted.
- Commands/logs: the base replay, focused, route and affected runs, both SQL verifiers,
  the mutation script, typecheck/build, both generators, the full server run. Logs under
  `.local/claude-scratch/session-2026-10-06/` (git-ignored).
- Negative/effect proof: every refusal leaves the businesses, logins and identities as
  they were (compared before and after), asks Apple nothing where it should not, sets no
  session or handoff cookie, and writes no security-log line; no Location carries a token
  or code; no log line carries a token, a code or Apple's subject.
- Provider/UAT, devices, external actions, deploy: none. **No real Apple account, key,
  endpoint or device was used.** The stand-in signs tokens with a key made in the test.
- Security/privacy: reviewed who a connect is for (the signed cookie, never the post),
  the session's standing at both moments, the password and its shared count, the two
  cookies never standing in for each other, the cross-site admission, the link rules and
  their races on PostgreSQL, and response and log disclosure.
- In-flight: none. Every disposable PostgreSQL was stopped and deleted. (Three mutation
  lanes were first launched with too short a time limit, stopped by hand, their
  databases stopped and deleted and the tested files' hashes confirmed, then relaunched.)
- Rollback/constraints: no rollback commit; fix forward. No schema change.
- Approvals/stops: the T5c preflight and separate reread approve exactly this scope on
  `81933759`. No application, provider or production gate was crossed.
- Owner actions this adds: none. (`0030`–`0033` for development, ClamAV and the Apple
  setup stay as recorded.)
- Recorded for the owner, not decided here: the plan's defaults 5 to 8 (the password to
  connect or disconnect; disconnecting exists; owners only; no email is sent). One fact
  found on the way: the login page's "Forgot password?" says "coming soon" although the
  page exists at `/forgot-password`; an owner who has only ever signed in with Google
  needs that page to set a password before connecting Apple.
- Deferred/next: T5d (the login button, the handoff on the login page, the Settings row
  on phone and desktop, a browser check), T5e (runbooks and the owner's list).
