# The external review's R1 fixes on this branch — working notes (from 2026-10-01)

Owner, 2026-10-01: "ok pick up where you left off, also i uploaded a patch for R1 please find it and ensure
its applied and mark r1 as complete". These notes are written as the work goes, so a stop loses nothing.

## Ground truth at the start (2026-10-01 07:30 UTC)

- HEAD `cee3cf05` (phase E1's evidence). The container restarted at 03:36 UTC. The 2026-09-30 session had
  stopped mid-step at 09:57:33 UTC, right after an edit to `client/src/lib/session.ts`, with no summary:
  phase E2 (the client) is an uncommitted draft, 47 changed files and 3 new ones. Saved before anything else
  as `.local/claude-scratch/session-2026-10-01/e2-draft-tracked.patch` and `e2-draft-untracked/`.
- Server baseline re-run at `cee3cf05`: **127 files / 3,219 tests, all green** (824 s today; the transform
  cache was cold after the restart).

## Where the patch was

- Not in the workspace: no file had arrived since the last session (searched by change time, whole tree).
- On GitHub, last fetched 2026-09-03. Read live: `main` had moved to `17932265` (the owner merged PR #13,
  this branch at `b0500c5d`, on 2026-09-29 19:09 UTC), and a new branch `claude/trusting-cannon-l7wb6n`
  holds one commit on top of it, **`ce4473df` "fix(r1): apply external review fixes for
  R1-T1/T2/T3/T4/T8/T9"** (2026-09-29 19:50 UTC). Its decision record says the owner gave a Claude cloud
  session `TaptPay-R1-fixes-2026-09-30.patch` and its handoff, from an external review pass (Codex) against
  `b0500c5d`, and asked "please implement patch"; that session applied it unchanged and pushed the branch.
  The merge commit's tree equals `b0500c5d`'s, so the commit's diff is the patch.
- Fetched read-only (`main` and the two unseen `claude/*` branches). `refs/remotes/origin/main` could not be
  updated: a stale, empty lock file from 2026-09-27 sits beside it (one of 22 such files in `.git`, left by
  earlier restarts; none belongs to a running process). Left alone: the objects arrived, and nothing here
  needs that ref.

## Why it could not be applied as it stood

The patch was written against `b0500c5d`, where a sign-in was a token. This branch is 13 commits past that,
and phase E1 (`9e993da2`) made a browser's sign-in a session cookie. Applied verbatim (a three-way merge
onto `cee3cf05`; only the two generated inventory files conflict), the patch's own tests pass, and:

1. **A stream opened with a session cookie gets no check at all.** The events route installed the stream
   check only when an `Authorization` header was sent. After phase E every browser signs in by cookie, so the
   review's cross-instance finding would have stayed open for every browser.
2. Re-running the request's authentication for a cookie's stream would have been wrong too: the stream keeps
   the secret it connected with, the daily swap replaces that secret, and a replaced secret presented after
   its 60 seconds ends the session as a stolen copy. It would also count as a use, so an open tab would never
   run out.
3. **Log Out left the closed stream's 5-second timer running** (`disconnectSession`, added by E1, removed the
   subscriber without going through the patch's `unsubscribe`).
4. The Google start cookie was signed with the account tokens' secret itself; every other key here is derived
   from it for one purpose (HKDF and a label).

Found while porting, present before the patch as well:

5. **A stream that closes late can drop a newer stream of the same business.** `unsubscribe` deleted the
   business's entry by number when its own (old, empty) set was empty, whichever set was registered by then.
   The newer stream stayed open and received nothing.

## The port (server side)

- `server/auth.ts`: `isStreamSessionActive(signIn, merchantId)`. A session cookie's stream is checked by its
  session id: the row must not have been ended or run out, and its login is re-read by the same code a request
  uses (`resolveSessionLogin`, split out of `resolveSessionCookie`). No secret is presented, nothing is
  written, the check is not a use. A token's stream (until E3) re-runs the request's authentication, as the
  patch had it. Either answers only for the stream's own business, or the platform admin.
- `server/routes.ts`: the events route gives every signed-in stream its check; a board's stream has none.
  The Google callback takes the start's slot before asking Google anything.
- `server/sse-broker.ts`: the patch's per-event and 5-second re-check; `disconnectSession` goes through
  `unsubscribe`; `unsubscribe` removes only its own set (5).
- `server/google-sign-in.ts`: the signed start cookie as in the patch, under a key of its own
  (`taptpay google-state v1`); the signature is checked before the start time is believed.
- `server/auth-throttle.ts`: the once-only bucket lives with the other buckets (`googleStateBucket`, keyed
  `google-state:<HMAC>` like every bucket; the patch had it in `google-sign-in.ts` under a plain SHA-256).
- Unchanged from the patch: push registration under the login's row lock (`server/storage.ts`, both routes),
  the route inventory's method coverage (`server/route-inventory.ts`), the no-network guard
  (`support/no-network.ts`), the refusal-effects observer and its four suites, the R1-T8 note.
- Carried further: the three refusal blocks written after `b0500c5d` (a board's public routes, twice; a
  provider's call naming what is no one's) observe effects as the rest now do.
- Route reviews (`server/route-review.ts`) of the four changed routes brought up to date; inventory
  regenerated: 187 registrations, 0 unclassified.

## Tests first

- `server/__tests__/r1-review-fixes-sessions.test.ts` (28, new) and `support/session-browser.ts`, with the
  patch's own new tests (22 in four files).
- **Against `cee3cf05`: 44 of 76 fail** (21 of the patch's 22; 23 of the 28). The passes pin what must hold
  both before and after.
- **With the patch verbatim: the patch's 22 pass; 20 of the 28 fail**, among them the route-level one (a
  cookie's stream is given no check), the timer left running by Log Out, the late close, and the key.
- **With the port: 76 of 76.** `tsc` clean.

## Found on the way, not part of the patch (for phase E2)

- `GET /api/merchants/:id/active-transaction` still tells a signed-in caller by the `Authorization` header
  alone. E1 taught the events route the cookie, not this one. Once the app stops sending a token (E2), a
  signed-in terminal asking without a board would be answered 410. To fix with E2, test first.
- Log Out on one device while that device's own push registration is still in flight: the registration is
  refused only when the login's session version moved. Log Out ends one session without moving it. A browser
  retires its endpoint at the push service itself, so the gap is the iPhone app's. Closing it needs the
  subscription to remember the session that registered it (a migration). Recorded as open.

## Results so far (2026-10-01, 08:40 UTC)

- Full server suite with the port: **130 files / 3,269 tests, all green** (was 127 / 3,219). `tsc` clean.
- The no-network guard got three tests that do not depend on the machine's proxy settings (an agent that
  would route an outside request through a local proxy; fetch refused before it is handed on; a resolver's
  questions refused even for this machine's own name): 12 of 12.

## Real PostgreSQL 16.10 (the handoff's limit 1: "has NOT been executed")

`scripts/verify-google-handoff-postgres.ts`, two storage instances on separate pools, on an empty local
database each run (`.local/claude-scratch/session-2026-10-01/pg-review-port.sh`). Six checks added:

- a device registers under the login's current session version; under a spent one it is refused, nothing is
  written and a device on file is not switched back on;
- a disabled login, another business's login and no login are refused;
- a registration queued behind "sign out everywhere" (the login's row held by the sign-out's uncommitted
  statement) is refused once it holds the row, and writes nothing while it waits;
- 45 registrations racing "sign out everywhere", in three orders (registration 25 ms ahead, sign-out 25 ms
  ahead, both at once): every registration is stored or refused, and no device of an ended login is left on;
- 30 logins of one business ending their sessions at once: every device stopped, no statement lost;
- one Google sign-in start is taken up exactly once by 24 simultaneous callbacks from two instances.

**The race found a defect that predates the patch** (phase D's follow-ups, 2026-09-22). Each ending of a
login's sessions also stops the business's unattributed devices (`deactivatePushSubscriptionsForLogin`), so
endings that happen together rewrite the same rows. PostgreSQL reported `deadlock detected` in **3 of the
first 4 runs** of the race (37 times in one run; "Process 119 waits for ShareLock on transaction 1129;
blocked by process 120 … while rechecking updated tuple", both processes running that one statement). The
statement rolled back leaves its login's devices switched on after its sessions ended; the route only logs
the fault (`[SIGN_OUT_EVERYWHERE_PUSH_STOP]`). The first version of the race check had hidden it: every
sign-out had queued behind the registrations for a connection ("40 registered first, 0 refused").

Fixed in `DatabaseStorage`: both statements (`deactivatePushSubscriptionsForLogin`, and the iPhone-only
`deactivateNativePushSubscriptionsForLogin`) lock their rows in id order before writing, and leave devices
already stopped alone. **After the fix: 6 runs of 6 pass, 40 checks each, with no new deadlock line in the
server's log**; each run exercised both orders (for example "registered first, then stopped: 19; refused:
26"). The server log with the deadlocks is kept as `pg-server-deadlocks-before-fix.log` (scratch).

Mutation check of the port: **39 of 40 caught**. First run 38: a check that throws was never driven (two
broker tests added, caught); the realm test in the session check changes nothing (the login's own checks
refuse both directions).

Committed: `d9382672` (the fixes, ported), `bc9f37ff` (the deadlock). Full server suite on the tree with
phase E2's one server change as well: 130 files / 3,278 tests. Evidence:
[R1-review-fixes-on-phase-E-2026-10-01.md](R1-review-fixes-on-phase-E-2026-10-01.md).
