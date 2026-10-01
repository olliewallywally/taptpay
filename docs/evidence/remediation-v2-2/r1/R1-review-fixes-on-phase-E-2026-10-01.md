# The external review's R1 fixes on this branch — the server side (2026-10-01)

Branch `remediation/r1-continuation-20260907`. Code `d9382672` (the fixes, ported) and `bc9f37ff` (a
deadlock the port's own checks found). Owner direction:
[2026-10-01](../../../decisions/2026-10-01-r1-review-patch-on-this-branch-owner-direction.md), and the
[2026-09-29 decision](../../../decisions/2026-09-29-apply-r1-review-fixes-patch.md) that came with the
patch. The patch's own handoff, verbatim:
[R1-review-fixes-2026-09-29.md](R1-review-fixes-2026-09-29.md). Working notes:
[WORKING-2026-10-01-r1-review-fixes.md](WORKING-2026-10-01-r1-review-fixes.md).
**Not independently reviewed.** The brief is at the end.

## In plain words

An outside reviewer checked the R1 work as it stood on 29 September and wrote a patch for what they
found. The patch was sitting on GitHub, on a side branch. It could not simply be dropped in: since the
29th this branch has rebuilt how sign-in works (a locked cookie instead of a token the page keeps), and
the patch was written for the old way. Dropped in as it was, its own tests pass, and one of its fixes
would have done nothing for any browser.

So each fix was carried across by hand and tested against the new sign-in. Running the patch's hardest
case on a real database, which the reviewer had said they could not do, found one more fault that was
already in the code: two people of one business signing out at the same instant could leave one of
them still getting notifications. That is fixed too.

## Where the patch was, and what it is

- Nothing had arrived in the workspace. On GitHub (last fetched 2026-09-03) `main` had moved to
  `17932265`, the owner's merge of PR #13 (this branch at `b0500c5d`), and a new branch
  `claude/trusting-cannon-l7wb6n` held one commit on it: **`ce4473df`**, "fix(r1): apply external review
  fixes for R1-T1/T2/T3/T4/T8/T9" (2026-09-29 19:50 UTC). The merge's tree equals `b0500c5d`'s, so that
  commit's diff is the patch: 32 files, +881 −263.
- Its decision record: the owner gave a Claude cloud session `TaptPay-R1-fixes-2026-09-30.patch` and its
  handoff, from an external review pass (Codex) against `b0500c5d`, and asked "please implement patch". It
  was applied unchanged. The record says applying it "is not a review".

## Why "unchanged" was not possible here

This branch is 13 commits past `b0500c5d`; `9e993da2` (phase E1) made a browser's sign-in a session
cookie. A three-way merge of the patch onto `cee3cf05` conflicts only in the two generated inventory
files. With that merge taken as it comes, the patch's 22 new tests pass, and:

| What the patch does | What that leaves on this branch |
|---|---|
| Re-checks a stream's sign-in by its `Authorization` header | **A stream opened with a session cookie gets no check.** After phase E that is every browser's stream, so the review's cross-instance finding stayed open. |
| (the obvious repair: re-run the request's authentication with the cookie) | Wrong too. The stream keeps the secret it connected with; the daily swap replaces it; a replaced secret presented after 60 seconds ends the session as a stolen copy. It would also count as a use, so an open tab would never run out. |
| Stops a closed stream's 5-second timer in `unsubscribe` | E1's Log Out path (`disconnectSession`) removed the stream without `unsubscribe`: **the timer ran on for ever.** |
| Signs the Google start cookie with `JWT_SECRET` itself | Every other key here is derived from it for one purpose (HKDF and a label). |

Present before the patch as well, found while porting:

- **A stream that closes late could drop a newer stream of the same business.** `unsubscribe` removed the
  business's entry by number whenever its own set was empty, whichever set was registered by then. The
  newer stream stayed open and received nothing.

## What changed (`d9382672`)

As the patch has them:

- **R1-T1** (`support/no-network.ts`): where `fetch`, `http` and `https` are going is read before an agent
  or proxy setting can route the request through this machine; a resolver's questions (`resolve*`,
  `reverse`, `lookupService`) are refused even for this machine's own name, and a plain lookup of it is
  answered here.
- **R1-T2** (`server/route-inventory.ts`): every Node HTTP method, `app.del` and literal computed methods
  are inventoried; a dynamic method, a non-literal path or a chained `route()` registration fails loudly.
- **R1-T3** (`support/refusal-effects.ts`, four suites): a refusal is also checked for a stream event, a
  push, a mail, a provider call, a `fetch` and a file write (the security log's append excepted).
- **R1-T4, push** (`server/storage.ts`, both routes): a device is registered only if the login's session
  version is still the one the request was signed in under, checked under the login's row lock in the
  transaction that writes; otherwise 401 `SESSION_ENDED`, nothing written.
- **R1-T8**: the cleaned commit id `53f5a8b9…` noted in the old evidence (checked against the commit map:
  `387d189d` → `53f5a8b9`, an ancestor of this branch).

Ported:

- **R1-T4, streams** (`server/auth.ts` `isStreamSessionActive`, `server/routes.ts`, `server/sse-broker.ts`).
  A signed-in stream's sign-in is read again from shared storage before each event and every five seconds.
  A session cookie's stream is checked **by its session id**: the row must not have been ended or run out,
  and its login is re-read by the same code a request uses (`resolveSessionLogin`, split out of
  `resolveSessionCookie`). No secret is presented again, nothing is written, the check is not a use. A
  token's stream re-runs the request's authentication, as the patch had it, until E3. Either answers only
  for the stream's own business, or the platform admin. A board's stream has no sign-in and no check.
- **The broker**: `disconnectSession` goes through `unsubscribe`; `unsubscribe` removes only its own set.
- **R1-T4, Google** (`server/google-sign-in.ts`, `server/auth-throttle.ts`): the start cookie carries its
  start time under the server's signature, keyed `taptpay google-state v1`; the signature is checked before
  the time is believed. The once-only start is `googleStateBucket`, keyed `google-state:<HMAC>` as every
  bucket is (the patch had it in `google-sign-in.ts` under a plain SHA-256).
- **R1-T3, carried further**: the three refusal blocks written after `b0500c5d` (a board's public routes,
  twice; a provider's call naming what is no one's), the cross-site refusals and the CSRF refusals observe
  effects too.
- The route reviews of the four changed routes; the inventory regenerated (187 routes, 0 unclassified).

Not in these commits: the patch's desktop pages (R1-T9, `response-data.ts`). They touch three files of
phase E2's client and go in with it.

## Tests first

`server/__tests__/r1-review-fixes-sessions.test.ts` (30) and `support/session-browser.ts`, with the patch's
own new tests (22, in four files).

| Tree | Result |
|---|---|
| `cee3cf05`, tests only | **44 of 76 fail** (21 of the patch's 22; 23 of the 28 then written). The passes pin what must hold before and after. |
| the patch verbatim | the patch's 22 pass; **20 of the 28 fail** |
| the port | **76 of 76** |

Of the 20, four fail for what the verbatim patch does: a cookie's stream is given no check (driven
through the real route); Log Out leaves the timer running; a late close drops a newer stream; the start
cookie verifies under the token secret. The rest fail because it offers no check for a session at all.

## Results

- **Server: 130 files / 3,278 tests, all green**, on the tree that also holds phase E2's one server change
  (4 tests); `tsc` clean. Baseline re-run first at `cee3cf05`: 127 / 3,219.
- **Mutations: 39 of 40 caught** (`.local/claude-scratch/session-2026-10-01/mutate-review-port.py`; files
  restored and hash-checked).
  - The handoff's six server-side ones (seven breakages: the push check in each storage), each caught: an
    OPTIONS route off the inventory (8 tests fail); a refusal that broadcasts (117; the handoff counted 115
    at its base); the push check dropped (4, 1); the start that never expires (1); the replay not refused
    (1); the stream not re-checked (12).
  - The observer's other eyes: a refusal that pushes (117), that writes a file (117), a CSRF refusal that
    broadcasts (1).
  - 30 more, among them the cookie's stream given no check, the check ignoring an ending, ignoring
    running out, skipping the login, counting as a use, staying open on a storage fault, the timer left by
    Log Out, the late close, events out of order, the key, the bucket shared by every start, and the
    guard's three new tests' subjects.
  - First run 38 of 40. One miss was a test gap: a check that *throws* (rather than answers no) was never
    driven; two tests added, caught. The other changes nothing: the realm test in the session check is
    redundant (an admin row has no login, a business row no admin tag, so each is refused anyway). Kept as
    it mirrors the request path; recorded as not testable without a row the table forbids.
- **PostgreSQL 16.10** (`scripts/verify-google-handoff-postgres.ts`, two storage instances on separate
  pools, an empty database per run): **40 of 40**, six new. This is the handoff's limit 1 ("Real PostgreSQL
  concurrent registration/revocation has NOT been executed"):
  - a device registers under the current session version; under a spent one nothing is written and a
    device on file is not switched back on;
  - a disabled login, another business's login and no login are refused;
  - a registration queued behind "sign out everywhere" (the login's row held by the sign-out's uncommitted
    statement) writes nothing while it waits, and is refused once it holds the row;
  - 45 registrations racing "sign out everywhere" in three orders: every one stored or refused, no device of
    an ended login left on, both orders seen in every run;
  - 30 logins of one business ended at once: every device stopped, no statement lost;
  - one Google start is taken up exactly once by 24 simultaneous callbacks from two instances.

## The deadlock (`bc9f37ff`)

The race's first version had hidden it: every sign-out had queued behind the registrations for a
connection ("40 registered first, 0 refused"). Given pools of their own, **3 of 4 runs failed with
`deadlock detected`**, 37 times in one run:

```
Process 119 waits for ShareLock on transaction 1129; blocked by process 120.
Process 120 waits for ShareLock on transaction 1160; blocked by process 119.
CONTEXT: while rechecking updated tuple (4,12) in relation "push_subscriptions"
```

Both processes run the same statement. Ending a login's sessions stops that login's devices **and the
business's unattributed ones** (`deactivatePushSubscriptionsForLogin`), so endings that happen together
rewrite the same rows, each in the order it met them. The statement PostgreSQL rolls back leaves its
login's devices switched on, and the routes only log the fault (`[SIGN_OUT_EVERYWHERE_PUSH_STOP]`). In
the code since phase D's follow-ups (2026-09-22); not caused by the patch. A device registered before 0029
is unattributed until its app is next opened, so most businesses have such rows.

Fixed in `DatabaseStorage`: that statement and the iPhone-only one
(`deactivateNativePushSubscriptionsForLogin`) lock their rows in id order before writing, and leave devices
already stopped alone. **After: 7 runs of 7 pass, 40 checks each, no new deadlock line in the server's
log.** Red first is the three failed runs; the in-memory storage has no locks to test this with.

## Still open

From the patch's handoff, as they stand on this branch:

1. Real PostgreSQL races: **done** (above), on a local PostgreSQL 16, not on Neon.
2. Two deployed processes: not tested. The stream check is tested with two brokers on shared storage. An
   idle stream of an ended session closes within five seconds, not at once.
3. The no-network guard is an application-level guard: child processes and native extensions are outside it.
4. A Google sign-in in progress when this deploys must be started again (the cookie's shape changed).
5. The response checks (R1-T9) are with phase E2.
6. Owner questions. **Answered 2026-09-29**
   ([decision](../../../decisions/2026-09-29-r1-t3-owner-answers.md)): the body-token pages keep 400; the
   platform admin keeps the money routes. **Open:** whether a terminal may send a payment while its sales
   are still loading (put to the owner with phase E2's client).
7. **Open:** the plan's Google nonce, issuer and audience checks. The server asks Google directly who
   signed in (the code, with PKCE, at Google's token address, then the profile); it never trusts an ID
   token passed through the browser, so there is no token to check a nonce on. Put to the owner as a
   scope question.
8. No live proxy, Google, browser or rollback test was made.

New, from this work:

- **Each open signed-in stream reads the database every five seconds** (three reads for a session cookie),
  and before each event. Fine at today's size. If it ever matters, the interval can be raised without
  weakening the rule that no event reaches an ended session.
- **Log Out on one device while that device's own registration is still on its way.** The registration is
  refused only when the login's session version moved; Log Out ends one session without moving it. A
  browser retires its endpoint at the push service itself, so this is the iPhone app's gap. Closing it
  needs the subscription to remember the session that registered it (a migration).
- A registration whose preferences read fails now fails (500) instead of registering with default switches.
- The patch's branch on GitHub (`claude/trusting-cannon-l7wb6n`) is now superseded by this branch for
  everything but its three client files' worth of R1-T9.

## Brief for the independent review

> You are the independent security reviewer for TaptPay, a payment-terminal SaaS. Review commits
> `d9382672` and `bc9f37ff` on branch `remediation/r1-continuation-20260907` (range `cee3cf05..bc9f37ff`):
> an external review's patch for R1-T1/T2/T3/T4/T8, written against a token sign-in, carried onto a branch
> whose sign-in is now a session cookie; and a deadlock fix. Start from
> `docs/evidence/remediation-v2-2/r1/R1-review-fixes-on-phase-E-2026-10-01.md`; treat it as claims and
> re-derive everything from the code. Compare with the patch itself (`git show ce4473df`). Attack especially:
> - Can a signed-in stream outlive its sign-in: a cookie session ended, run out or revoked on another
>   instance; a login disabled or removed; an admin's credentials changed? Can the check itself end,
>   renew or rotate a session? Can it be made to answer for another business?
> - Does anything in the broker leak a timer or a subscriber, reorder one stream's events, or let one
>   stream's failure affect another?
> - Can a device be registered for a login whose sessions have ended, in any interleaving, in both
>   storages? Can the two deactivation statements still deadlock, or miss a row they should stop?
> - Can a Google start cookie be forged, extended, replayed or shared between starts?
> - Does the refusal-effects observer miss an effect a refusal could have? Do the edits to older tests
>   keep what they checked?
> - Is anything in the patch (`ce4473df`) missing from the port, besides its client files?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every Blocking
> issue. Return exactly the ten headings of plan §21.1
> (`docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md`) and end with Approve / Do not approve naming the
> commit range.

Reproduce:
- `npm run check`
- `npx jest --selectProjects server --runInBand`
- `TEST_DATABASE_URL=… TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-google-handoff-postgres.ts`
  on an empty PostgreSQL 16 database (the recipe is in the phase A evidence); run it several times, the
  race is not deterministic.
