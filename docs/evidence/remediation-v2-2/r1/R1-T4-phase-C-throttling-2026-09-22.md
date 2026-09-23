# R1-T4 phase C — sign-in slowed down, never locked (2026-09-22)

Owner decision: Q5 of the [2026-09-21 answers](../../../decisions/2026-09-21-r1-t4-t9-owner-answers.md):
"Replace the hard account lockout with slowing repeated attempts down."
[Plan](../../../PLAN-2026-09-21-r1-t4-sign-in-security.md) phase C. Commit `e60e90c0`, local, not pushed.
**Not independently reviewed yet.** The review brief is at the end.

**Recovery.** The session that started phase C stopped at 08:50 UTC when it hit its usage limit. It
was still reading code, and the tree held only its design notes. The next session resumed at 21:55
UTC from its transcript (`bdb038a6-….jsonl`). Before building, it re-checked that design and
changed it in two places (§2).

## 1. The defect (verified in the code, 2026-09-22)

1. **Anyone who knew a merchant's email could lock them out.** Merchant and admin sign-in shared two
   in-memory maps (`server/auth.ts`, removed). Five wrong passwords locked that email for 15 minutes
   for everyone, the merchant included. Twenty from one `req.ip` blocked that address for 30 minutes.
2. **The limit could be beaten with a burst.** It was checked before the password and counted after.
   Measured on the unchanged code (`b9c947bb`, in a worktree): 12 simultaneous wrong guesses had
   **all 12** passwords checked (answers 4 × 401, 8 × 429).
3. **Each server kept its own count**, and a restart wiped it.
4. **The per-address block was probably one block for all merchants.** No `trust proxy` is set, so
   behind Replit's proxy `req.ip` is the proxy (plan finding 6). The HTTP tests reproduced this
   shape: they all come from 127.0.0.1, and after 20 failures in one file every later test was
   refused.
5. **Forgot-password had no limit.** Anyone could send any merchant unlimited reset emails, and each
   request cancelled the link sent before it.
6. **The login page showed the raw failure text:** `429: {"code":…}`, `401: {"message":…}`.
7. **Found during this phase: changing the password had no limit either.** The current-password
   check in `PUT /api/merchants/:id/change-password` is a password check. With a stolen session,
   someone could guess the password without limit there, then change it.

The Google callback had no limit either. The plan said these limits would be "moved"; there were
none to move.

## 2. Two changes to the design in the working notes, and why

- **No limits keyed on the client's internet address yet: they move to phase B.** Until the app is
  told how many proxies stand in front of it (phase B; owner item Q4 is the live check), every
  visitor may arrive from the proxy's address. An address bucket would then be one bucket for
  everyone, and anyone could slow every sign-in, reset or Google sign-in. The notes'
  email-plus-address "pair" bucket would also collapse into a per-email bucket. The old 20-per-address
  block is removed, not ported.
- **A device that has signed in before is slowed only by its own mistakes.** A per-email bucket
  alone still lets anyone keep a merchant waiting. Worked through with the notes' numbers, and with
  real addresses: from one address, the email's bucket reaches its limit after about 2.75 hours of
  paced guesses. After that the attacker fires the instant each 15-minute wait ends, so the merchant
  never gets a turn; a botnet does the same in seconds. That is the lockout Q5 removed, just slower
  to start. The standard remedy is OWASP's "device cookies". A successful sign-in gives the browser
  an HttpOnly mark: a random device id plus, for each email it has signed in to (up to 5), an HMAC
  tag binding that id to the email under a server key. An attempt carrying a valid tag for the
  email it is signing in to counts against that device's own bucket; every other attempt shares the
  email's "unknown devices" bucket. The mark opens nothing — the password is still required — and
  holds no email.
- Also added: **a completed password reset forgives the login's slow-downs** and marks the resetting
  browser as known. Otherwise the most common case waits out the backoff: the merchant forgets the
  password, tries 8 times on the phone, resets in the phone's browser, and returns to the app.

## 3. The fix

- **`server/auth-throttle.ts`**. Policies (`:37`, `:42`). Bucket keys: `<purpose>:<HMAC-SHA256>`
  under HKDF(JWT_SECRET, "taptpay auth-throttle v1"), so no email or device id is stored. A pure
  planner, `planAuthThrottleTake` (`:102`): if any bucket is waiting, refuse with the longest wait
  and count nothing; otherwise count one attempt against every bucket, starting a wait once the
  free allowance is used. `settleAuthThrottleRow` (`:129`): "success" clears a bucket; "void"
  gives back an attempt that never reached a verdict (e.g. a storage fault). Also the refusal's
  words.
- **`server/sign-in-device.ts`**: the mark — cookie flags (`:50`), strict parsing (`:65`),
  constant-time tag check bound to realm, device id and email (`:78`), and which bucket an attempt
  counts against (`:85`).
- **Storage, both implementations** (`server/storage.ts:2564` in memory, `:8166` in the database):
  - `takeAuthThrottleSlot` is all-or-nothing in one transaction. It inserts missing rows, then locks
    every bucket's row with `SELECT … FOR UPDATE` in key order, so two attempts never deadlock. If a
    row vanished between the insert and the lock, it inserts again.
  - It first reclaims a bounded batch of rows untouched for a day, using `FOR UPDATE SKIP LOCKED`.
  - `settleAuthThrottle` handles success and void; `forgetAuthThrottle` deletes by key and by
    LIKE-escaped prefix.
  - Migration `0028`'s table is used as it stands, so no new migration was needed.
- **Routes** (`server/routes.ts`):
  - Merchant sign-in (`:815`) and admin sign-in (`:951`): counted before the password is checked;
    void on an internal error; a success clears the bucket and refreshes the mark. Merchant and
    admin each have their own buckets and their own mark (Path `/api/auth` and `/api/admin/auth`).
  - Forgot-password (`:868`): counted per email, whether or not it has a login, and checked before a
    link is made. A refused request sends nothing and leaves the live link working.
  - Reset completion (`:897`): forgets the login's unknown-devices bucket and every known-device
    bucket for the email (by key prefix), and marks the browser.
  - Change-password (`:3739`): counted per login.
  - Every refusal is a 429 with `Retry-After` and
    `{code: "TOO_MANY_ATTEMPTS", message, retryAfterSeconds}`. It is the same for every email; a
    401 no longer reports `attemptsRemaining`.
- **`client/src/pages/login.tsx:144`**: shows the server's words through `apiErrorMessage`, in the
  page's existing error box. The desktop settings page already did this for change-password.

| Limit | Free | Then | Cap | Forgotten after | Cleared by |
|---|---|---|---|---|---|
| Sign-in, per known device and email (merchant; admin separately) | 5 | 30 s, doubling | 15 min | 1 h untouched | a success on that device; a completed reset |
| Sign-in, per email, all unknown devices together | 5 | 30 s, doubling | 15 min | 1 h untouched | a success from an unknown device; a completed reset |
| Change password, per login | 5 | 30 s, doubling | 15 min | 1 h untouched | a correct current password |
| Forgot-password, per email (every request counts) | 3 | 5 min, doubling | 1 h | 24 h untouched | — |

Worst case against one account: about 4 guesses an hour, roughly 100 a day, from anywhere. The old
lockout allowed 5 per 15 minutes, about 480 a day, and more in a burst.

## 4. Tests first

- `server/__tests__/auth-throttle.test.ts` (18 HTTP tests; `support/admin-sign-in-test-env.ts` gives
  the admin a real password).
  - On the unchanged code, 15 of 15 failed: the 5th wrong password was refused as a lock; no mark
    was set; forgot-password never refused. Each test also failed on its own; run together, the
    old per-address map made every later test 429.
  - The 3 change-password tests were added later, and also failed first (no 429 after five wrong
    current passwords).
- `client/src/pages/login-slow-down.test.tsx`: 2 of 2 failed on the old page, which rendered
  `429: {"code":"TOO_MANY_ATTEMPTS",…}` and `401: {"message":…}` as text.
- `server/__tests__/auth-throttle-rules.test.ts` (20) covers the rules and the mark without HTTP:
  - the policies, backoff and cap, forgetting, all-or-nothing, the refusal's words;
  - key separation, and that keys hold no email;
  - the mark: minting, keeping 5 emails, realm, tag moved to another id, malformed values, flags.
- Found on self-review and fixed test-first: the reclaim `DELETE … IN (SELECT … LIMIT 100)` queued
  behind a row another attempt held. Its subquery is fixed when the statement starts, so it could
  then delete that row after the other attempt had counted it afresh. The new verifier check failed
  (`'blocked' !== 'done'`) until `FOR UPDATE SKIP LOCKED` was added.

## 5. Verified (2026-09-22)

- `tsc` clean. Client 70 files / 616 tests; server 69 / 1,347. The throttle file needs
  `jest.setTimeout(30_000)`: its tests make up to ~20 real bcrypt checks at cost 12, and
  `testTimeout: 15_000` in `jest.server.config.cjs` is ignored when jest runs both projects.
- **Real PostgreSQL 16.10**, `scripts/verify-google-handoff-postgres.ts`: 24/24 (the 15 from phases A
  and D, plus 9 for C). Actual `DatabaseStorage` on two separate pools, as two servers would run it:
  - 24 simultaneous attempts let exactly 5 through and count 5;
  - a waiting bucket refuses and counts nothing;
  - one waiting bucket refuses the lot;
  - opposite bucket orders do not deadlock;
  - void and success settle correctly;
  - forget-by-prefix deletes only its prefix, even one containing `_%`;
  - day-old rows are reclaimed;
  - a held row is skipped, not waited on;
  - a row deleted mid-lock is made again and counted.

  Mutations, with `storage.ts` restored byte-identical each time:

  | Mutation | Result |
  |---|---|
  | no `FOR UPDATE` | 24 of 24 through; 5 checks fail |
  | no re-insert loop | only the vanished-row check fails |
  | no LIKE escaping | only the forget check fails |
  | no `SKIP LOCKED` | the held-row check fails (the red run above) |

- **Real browser**, `node scripts/verify-r1-t4-throttle-browser.mjs <dir>`: 12/12. It runs the real
  routes and the real login page (Vite) on in-memory storage, with a clean environment (no ambient
  credential, simulated email), in Chromium. Confirmed:
  - the laptop keeps the mark: HttpOnly, SameSite=Strict, sent to `/api/auth` only, unreadable by
    page scripts;
  - a second browser gets 401 × 5, then 429 with `Retry-After: 30`, and the page says "Too many
    attempts. Please try again in 30 seconds.";
  - **the merchant's laptop signs straight in during that wait**;
  - a browser that has never signed in waits, even with the right password.

  Screenshots: [desktop](r1-t4-phase-c-2026-09-22/login-slowed-desktop.png),
  [phone size](r1-t4-phase-c-2026-09-22/login-slowed-phone.png). The same probe on `b9c947bb` fails
  7 checks, including the laptop being refused (429) while someone else guesses.

## 6. Not done / open — for the owner

**2026-09-23:** the owner answered items 1 and 3
([decision](../../../decisions/2026-09-23-r1-t4-phase-c-owner-answers.md)). The numbers stay; new
passwords need 8+ characters, a capital and a number or symbol; the sign-in timing leak is fixed
([evidence](R1-T4-password-rule-and-sign-in-timing-2026-09-23.md)). Item 6 is out of date: a
container restart at 23:13 UTC relaunched dev on `e60e90c0`, and a made-up-email sign-in there
answered 401 through the real Neon driver.

1. **The numbers** (table above) are constants. Recommended: keep them. Note that a password needs
   only 6 characters (`resetPasswordSchema`, `changePasswordSchema`), and at ~100 guesses a day a
   very common password can still fall. A stronger minimum and a check against known-breached
   passwords would be a separate task.
2. **Address-based limits wait for phase B**, and for the live check (Q4). Until then, an attempt to
   try one password on many accounts from one address is slowed only by each account's own 5 free
   attempts, and the Google callback has no limit.
3. **The time a sign-in takes reveals which emails have logins.** `authenticateUser` returns at once
   for an unknown email but runs bcrypt (~0.25 s) for a real one. This predates phase C and is not
   fixed here. Recommended fix: compare against a dummy hash when the email is unknown.
4. **A new phone during an active attack on its account** waits like any unknown device. A reset
   link opens in the phone's browser, not the app, so the reset marks the browser, not the app. It
   does still clear the waits. Google sign-in, where linked, is not throttled by this.
5. **Rows per submitted email.** A flood of made-up emails adds rows, reclaimed a day after their
   last use. A per-client request limit needs phase B.
6. **The running dev server** still runs the 07:23 server code. It picks up phase C on the next Run.
   Dev already has 0028, so nothing needs applying.
7. **Independent review** (plan §21.1).

## Handoff (plan §21.2)

```text
Phase / release:        R1-T4 phase C (shared throttling, slow down not lock), code complete;
                        not merged, not deployed
Exact branch and commit: remediation/r1-continuation-20260907 @ e60e90c0 (local); GitHub head 93aa6a0a
Scope completed:        merchant + admin sign-in, forgot-password, reset completion, change-password
                        throttled in auth_throttle; known-device mark; login page shows the wait;
                        in-memory lockout removed. Address keys and the Google callback: phase B.
Files changed:          `git show --stat e60e90c0` (13 files)
Migrations:             none new; uses 0028 (applied to dev 2026-09-22 06:42; not production)
Commands run:           tsc; jest client 70/616, server 69/1347; verify-google-handoff-postgres
                        24/24; verify-r1-t4-throttle-browser 12/12 (old commit: 7 FAIL)
Negative tests:         mutations — no FOR UPDATE 24/24 through; no re-insert loop, no LIKE escape,
                        no SKIP LOCKED each caught by its own check; old code red in all new tests
Provider/UAT activity:  none (email simulated; browser loopback-only)
Security/privacy:       no email, address or device id stored (HMAC keys); the mark is HttpOnly,
                        SameSite=Strict, path-scoped, holds no email; refusals identical for every
                        email; a refused reset request neither emails nor cancels the live link
Rollback:               revert e60e90c0; auth_throttle rows are then unused (harmless);
                        marks in browsers are ignored by the old code
Approvals:              owner 2026-09-21 (A–D incl. Q5); §21.1 review owed
Next phase:             B (trusted proxy setting + the address-keyed limits moved here), then the
                        R1-T9 rollout
```

## Independent review — brief

**Range:** `b9c947bb..e60e90c0` (one code commit), local only.

Paste-ready prompt:

> You are the independent security reviewer for TaptPay, a payment-terminal SaaS. Review commit
> `e60e90c0` on branch `remediation/r1-continuation-20260907` (range `b9c947bb..e60e90c0`): plan
> task R1-T4 phase C. Sign-in, forgot-password and change-password attempts are counted in PostgreSQL
> (`auth_throttle`, 0028) and slowed down instead of locking the account. A device that signed in
> before carries an HMAC-tagged mark and is counted on its own. Start from
> `docs/evidence/remediation-v2-2/r1/R1-T4-phase-C-throttling-2026-09-22.md`; treat it as claims and
> re-derive everything from the code. Attack especially:
> - Can an attacker who knows only a merchant's email stop that merchant signing in on a device
>   they have used before? Can they forge, replay or transplant a mark: across emails, across
>   merchant and admin, or by moving a tag to another device id?
> - Can a burst, across instances, get more password checks than the allowance? Check
>   `takeAuthThrottleSlot`'s locking, its re-insert loop, and the reclaim's `SKIP LOCKED`.
> - Does any refusal, status, header, body or timing added here tell whether an email has a login?
>   (The pre-existing bcrypt timing difference is disclosed as open item 3.)
> - Does a refused forgot-password request ever send email or replace the live link?
> - Is anything stored that identifies a person (email, address, device id)?
> - Is moving the address-keyed limits to phase B sound? Is anything else left unthrottled that
>   checks a password or a guessable secret?
> - Do the "void" and "success" settlements ever give an attacker back an attempt they spent?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1
> (`docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md`) and end with Approve / Do not approve
> naming the commit range.

Reproduce:
- `npm run check`
- `npx jest --selectProjects client`
- `npx jest --selectProjects server --runInBand`
- The PostgreSQL verifier, as in the phase A evidence:
  `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:<port>/<new empty db> TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-google-handoff-postgres.ts`
  (in the sandbox, start PostgreSQL TCP-only in the same command).
- `node scripts/verify-r1-t4-throttle-browser.mjs <screenshot dir>` (needs port 5055 free).
