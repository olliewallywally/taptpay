# WORKING NOTES — R1-T4 A–D and R1-T9 rollout (2026-09-21, from ~11:40 UTC)

Scratch progress record kept on disk as work goes (crash-recovery rule). Folded into evidence files
and deleted at the end. Decision: `docs/decisions/2026-09-21-r1-t4-t9-owner-answers.md`.

## Order

1. Schema expansion, one commit: `0026` auth_handoff_codes (A), `0027` users.session_version (D),
   `0028` auth_throttle (C); schema.ts, baseline contract, REAL_MIGRATIONS, fingerprint re-record.
2. A — Google sign-in: state + PKCE (HttpOnly cookie), `verified_email` required, refuse a
   different linked Google id, one-time handoff code in an HttpOnly cookie, `POST
   /api/auth/google/session`; analytics sends no query and no token path.
3. D — `session_version` in the JWT; bumped on password reset and "sign out everywhere".
4. C — throttles in PostgreSQL (HMAC-keyed buckets), progressive slowdown instead of lockout.
5. B — `TRUST_PROXY_HOPS` setting, off by default, tests with spoofed X-Forwarded-For.
6. R1-T9 rollout: retail stock, retail terminal, property analytics, property terminal, trades
   analytics, trades terminal, settings.

## Status (stopped on the owner's request, 2026-09-21 ~11:36 UTC; resumed 2026-09-22)

- [x] 1 — committed `7ba8bc7d` (schema 0026–0028, fingerprint re-recorded, server 64/1272).
- [x] 2 — phase A **done 2026-09-22** (committed with this note):
  - re-verified the 2026-09-21 claims first: google-sign-in 13/13, with route-policy-inventory and
    subscription-route-security 45/45; the analytics redaction (never test-run) passes 16/16;
    `login-google-handoff.test.tsx` red 3/3 for the stated reasons.
  - `client/src/pages/login.tsx` redeems `?google=complete` by `POST /api/auth/google/session`
    (`credentials: same-origin`) and never takes a token from the address; it removes only the
    sign-in results from the address, so a password form's `returnTo` survives (the old code wiped
    the whole query). Two tests added (network failure; `returnTo` kept): all 5 red on the old
    page, 5/5 green on the new one.
  - `scripts/verify-google-handoff-postgres.ts`: real PostgreSQL 16.10, migrations applied through
    the project runner, actual DatabaseStorage on two pools: 6/6 (a code redeemed exactly once by
    24 simultaneous attempts; expired incl. at-the-instant; unknown; duplicate/unknown-user issue
    refused; day-old rows reclaimed; cascade on user delete). Mutation check: with
    `consumed_at IS NULL` removed, the concurrency check fails 24 vs 1.
  - suites: client 63/567, server 65/1285, `tsc` clean.
  - **found: the development app's sign-in is broken** since the dev server restarted
    (2026-09-22 05:58 UTC) on `7ba8bc7d`/`662371ba`'s schema: `shared/schema.ts` declares
    `users.session_version` (0027), Drizzle's `select()` asks for it, and the dev database has
    migrations only through 0023. `POST /api/auth/login` with a made-up email → HTTP 500; the same
    SELECT without the column succeeds. Fix = apply 0024–0028 to dev (0025 needs a gap-13 ownership
    inventory for dev) — owner approval required; asked 2026-09-22. **Approved and done**
    ([decision + outcome](../../../decisions/2026-09-22-apply-0024-0028-to-dev.md)): released with
    the inventory as drafted (2 files: 1 owner, 1 locked; no owner changed); dev status 30/0/0/0;
    the sign-in probe answers 401 again.
  - evidence and review brief: `R1-T4-phase-A-google-sign-in-2026-09-22.md`; real-browser probe
    `scripts/verify-r1-t4-analytics-browser.mjs` 30/30 on the build (pre-fix build: 19 FAIL).
- [x] 3 — phase D **done 2026-09-22**, `44a5cfc2`
  ([evidence](R1-T4-phase-D-sessions-2026-09-22.md)): `sv` in tokens, 401 `SESSION_ENDED`,
  `POST /api/auth/sign-out-everywhere`, the reset advances the version, SSE streams closed, UI on
  phone, tablet and desktop. Owner questions: password change; push subscriptions per login.
- [x] 3a — password change ends other sessions, **done 2026-09-22**, `50a469e7` (owner answer 1,
  [decision](../../../decisions/2026-09-22-r1-t4-phase-d-owner-answers.md)).
- [x] 3b — **push subscriptions per login** (owner answer 2), **done 2026-09-22**, `36a320d6`
  ([evidence](R1-T4-phase-D-follow-ups-2026-09-22.md)). Session crashed 07:23 UTC mid-task;
  recovered 07:35 from its transcript (`90064242-….jsonl`). Uncommitted in the tree, verified
  byte-for-byte against the transcript:
  - done: `push-subscriptions-per-login.test.ts` (7; ran 6 red first) + `support/push-test-env.ts`;
    `migrations/0029_push_subscriptions_user.sql` (nullable `user_id` FK ON DELETE CASCADE + index),
    schema.ts, baseline contract (3 effects), REAL_MIGRATIONS; storage (both) +
    `deactivatePushSubscriptionsForLogin` / `deactivateNativePushSubscriptionsForLogin`; routes
    (subscribe records `userId`; native-unsubscribe per device; sign-out-everywhere, reset and
    change-password stop the login's devices); storage.test fixtures. Claimed: tsc clean, 5 suites
    118/118; empty-DB CI rehearsal 31/0, fingerprint `bf3dd0f4…` re-recorded as
    `R1-T4-push-empty-fingerprint-2026-09-22.json`, `verify.yml` repointed. **Not yet re-run.**
  - **re-run 07:50: tsc clean, the 5 suites 118/118** (claims hold).
  - found on re-check: sign-out-everywhere stopped notifications *after* ending the sessions and,
    if that threw, answered 500 ("try again") though every session had ended and the spent token
    could never retry. **Fixed** the way reset and change-password already were: sessions end
    first, the notification stop is logged best-effort (`[SIGN_OUT_EVERYWHERE_PUSH_STOP]`). Test
    red (500) → green; guards for reset and change-password pin the same. (Rejected: stopping
    notifications first — lets a notifications fault block a security action.)
  - found: MemStorage `removeTeamMember` kept the removed login's subscriptions (the DB cascades).
    Test red → fixed. Push suite now 11/11.
  - **Real PostgreSQL 16.10** (verifier +5 checks, run as `node --import tsx` — the tsx CLI's IPC
    socket is refused in the sandbox): 15/15. Mutation (unattributed rows of *every* business; no
    `apns://` filter): exactly those 2 checks FAIL (`other-unattributed-web`; `phone-owner-web`,
    `phone-unattributed-web` wrongly stopped); storage.ts restored identical.
  - **open, for the owner:** disabling a teammate (`PUT /api/team/:id/status`) closes their live
    streams but leaves their devices' notifications on. Recommend: stop them too.
  - **client done (tests first):** `lib/push-device.ts` (+ `lib/__tests__/push-device.test.ts`,
    18) — Log Out stops this device (web: local unsubscribe first, then server, keepalive, 5 s
    abort; iPhone: remembered token, forgotten first); a confirmed session re-registers this
    device's existing subscription (never opts in). Wired: phone + desktop Log Out, the outage
    screen's Sign out (App.tsx `signOut`), App.tsx "ok" (resync), desktop password change (resync
    with the fresh token). "Sign out of all devices" does NOT stop this device locally (server
    already stopped the login's devices; it resumes when it signs in again, like the others).
    Hook: iPhone remembers its token on turn-on, sends it on turn-off, and the switch reads this
    iPhone (`nativeDeviceState` on/off/unknown; unknown = set up before → business-wide flag as
    before). Red first: 9 page/hook/App tests + 1 outage sign-out, each for the right reason; now
    green. Affected suites 7/69 + outage 2/22; tsc clean. Dead logouts (layout, navigation,
    mobile-header, demo-terminal) are unreachable — left alone.
  - full suites: client 69/614, server 67/1307; CI rehearsal re-run on the final 0029 text:
    31/0/0/0, fingerprint byte-identical, test:fingerprint 28/28. Committed `36a320d6`.
  - owner answered all three (recommended): 0029 applied to dev 08:04 UTC, 31/0/0/0
    ([decision](../../../decisions/2026-09-22-apply-0029-to-dev.md)); disabling a teammate stops
    their notifications (`b714efda`, 2 tests red first); resume-on-sign-in confirmed.
  - dev server still runs the 07:23 server code (no restart loop — do not kill it); correct now
    that the column exists; picks up `b714efda` on the next Run.
  - then: evidence file + review brief, ledger/task row, commit; owner OK needed to apply 0029 to dev.
- [x] 4 — **phase C done 2026-09-22, `e60e90c0`** ([evidence](R1-T4-phase-C-throttling-2026-09-22.md)); started ~08:45 UTC (owner: "ok move to next phase").
  Found (current code):
  - sign-in (merchant `/api/auth/login` and admin `/api/admin/auth/login`) share in-memory maps in
    `server/auth.ts`: 5 failures per email → 15-min **lock**; 20 per `req.ip` → 30-min block
    (for everyone, if `req.ip` is the proxy — phase B). Per process; restart wipes it; check-then-
    record, so a parallel burst gets unlimited guesses before the first failure lands.
  - **forgot-password has no limit at all**: unlimited reset emails to any merchant, and each
    request overwrites (cancels) the merchant's previous reset link.
  - **Google callback has no limit.** The plan said "move" these; they never existed.
  - no test covers the lockout; no client reads `attemptsRemaining`/`locked`; the login page shows
    raw `429: {json}` (apiRequest error text) — use `apiErrorMessage`.
  - reset-link redemption and the Google one-time code are 256-bit single-use: not throttled
    (brute force infeasible) — documented, not built.
  Design (implementing the 2026-09-21 Q5 decision; numbers are constants, reported to the owner):
  - `auth_throttle` rows, `bucket_key = <purpose>:<hex HMAC-SHA256>`, key = HKDF(JWT_SECRET,
    "taptpay auth-throttle v1"); no email or address stored.
  - a bucket counts; once `failures >= free`, `next_allowed_at = now + min(base·2^(failures−free),
    cap)`; idle past `window` → starts again; waiting = `next_allowed_at > now`.
  - storage: `takeAuthThrottleSlot(buckets, now)` — one transaction, rows locked in key order: if
    any bucket is waiting → refuse with the longest wait, change nothing; else charge the
    `charge` buckets. `chargeAuthThrottle` (after a failure), `clearAuthThrottle` (on success).
    Reclaims rows idle > 1 day.
  - sign-in: `signin-pair` (email+address) free 5, 30 s → ×2 → cap 15 min, pre-charged, cleared
    on success; `signin-account` (email) free 20, same curve, pre-charged, cleared on success;
    `signin-address` free 50, checked first, charged on failure, never cleared. Admin sign-in the
    same. Refusal: 429, `Retry-After`, `{code: TOO_MANY_ATTEMPTS, message, retryAfterSeconds}`,
    the same for any email (no enumeration).
  - forgot-password: `reset-account` free 3, 5 min → cap 30 min; `reset-address` free 10, 1 min →
    cap 30 min; both counted per request, checked BEFORE a token is issued (a refused request
    neither emails nor cancels the live link).
  - Google callback: `google-address` free 20, 30 s → cap 15 min, checked after the state check
    (before any call to Google), charged on each failure after it; cancel not charged.
  - verify: HTTP tests (red first), real PostgreSQL across two pools (a 24-attempt burst allows
    exactly 5; mutation without the row lock allows more), client message test.
  **Session stopped 08:50 UTC (usage limit) before any code; resumed 21:55 UTC from its transcript
  (`bdb038a6-….jsonl`). Tree held only this note. Design re-checked before building — revised:**
  - **Address keys are unsafe before phase B.** No `trust proxy` is set, so behind Replit's proxy
    `req.ip` is the proxy for everyone (plan finding 6; the live check is owner item Q4). Any
    address bucket (`signin-address`, `reset-address`, `google-address`) is then ONE bucket for
    all merchants: anyone could slow every sign-in, reset or Google sign-in. And the pair bucket
    (email+address) collapses into a per-email bucket. **Moved to phase B**, active only once the
    deployment says addresses are real. The old in-memory 20-per-IP block (a global block today)
    is removed, not ported.
  - **A per-email bucket alone still lets anyone keep a merchant waiting.** Worked through: even with
    real addresses, one attacker address reaches the account bucket's 20 after ~2.75 h of paced
    guesses, then fires the instant each 15-min wait ends — the owner never gets a turn; a botnet
    does it in seconds. That is the lockout Q5 removed, just slower to start. **Fix: known devices**
    (OWASP "device cookies"): a successful sign-in gives that browser an HttpOnly cookie holding a
    random device id and a server HMAC tag binding it to that email. A request carrying a valid tag
    for the email it signs in to is counted only against its own (device, email) bucket; everyone
    else shares the email's "unknown devices" bucket. An attacker can slow only unknown devices.
  - **A completed password reset forgives that login's slow-downs** (its unknown-devices bucket and
    every device bucket for the email — keys are `signin-device:<h(email)>:<h(device)>`, cleared by
    prefix) and marks the resetting browser as known. Otherwise the commonest case — forgot the
    password, tried 8 times on the phone, reset in Safari, back to the app — waits out the backoff.
  - numbers (constants, reported to the owner): known device and unknown devices alike: 5 free, then
    30 s doubling to a 15-min cap, forgotten after 1 h idle (the old code's window); a success clears
    the bucket it was counted against. forgot-password: 3 free per email, then 5 min doubling to a
    1-h cap, forgotten after 24 h idle, every request counted; refused requests send nothing and
    leave the live link. Admin sign-in the same as merchant, own buckets and cookie.
  - worst case against one account ≈ 4 guesses/hour (~100/day) from anywhere; the old lockout
    allowed 5 per 15 min (~480/day). Note: passwords need only 6 characters (`resetPasswordSchema`).
  - storage: `takeAuthThrottleSlot(buckets, now)` all-or-nothing (insert-if-missing in key order,
    `SELECT … FOR UPDATE` in key order, re-insert if a reclaim deleted one mid-take);
    `settleAuthThrottle(buckets, "success"|"void")` (clear, or give back this attempt's charge);
    `forgetAuthThrottle(keys, prefixes)`; rows idle > 24 h reclaimed. Pure planner shared by both
    storages (`server/auth-throttle.ts`); cookie in `server/sign-in-device.ts`.
  - not throttled, by design: reset-link and Google one-time-code redemption (256-bit, single use).
    Google callback: address-only, so phase B.
  - found, not in C: `authenticateUser` returns early for an unknown email and runs bcrypt only for
    a real one — the time taken tells an attacker which emails have logins.
  - **red first (22:3x UTC):** `server/__tests__/auth-throttle.test.ts` (15) +
    `support/admin-sign-in-test-env.ts` on the unchanged code: 15/15 FAIL. Reasons: the 5th wrong
    password is refused 429 (locked) — tests 1–3, 7–10, admin 1 (each re-run alone, because in one
    file the old per-IP map is shared: after 20 failures from 127.0.0.1 every later test got 429 —
    finding 6 reproduced in the harness); no device mark is set — 4–6, reset, admin 2;
    forgot-password never refuses — both forgot tests. Burst: old checks 12 of 12 passwords.
  - client red first: `client/src/pages/login-slow-down.test.tsx` 2/2 FAIL — the old page shows
    `429: {"code":"TOO_MANY_ATTEMPTS",…}` and `401: {"message":…}` raw.
  - **built (uncommitted):** `server/auth-throttle.ts` (policies, HMAC keys, pure planner, refusal
    words), `server/sign-in-device.ts` (mark), storage (both: `takeAuthThrottleSlot`,
    `settleAuthThrottle`, `forgetAuthThrottle`; Mem cleared by `clearAllMerchants`), routes (merchant
    + admin sign-in, forgot-password, reset completion), `auth.ts` old maps/timer removed,
    `login.tsx` → `apiErrorMessage`. tsc clean. Green: throttle HTTP 15/15, rules 20/20
    (`auth-throttle-rules.test.ts`), login page 7/7 (new 2 + phase A 5).
  - full suites: tsc clean; client 70/616; server 69/1344 after `jest.setTimeout(30_000)` in
    auth-throttle.test.ts (the reset test timed out at 5 s under full load: ~20 bcrypt-12 checks;
    `testTimeout: 15_000` in jest.server.config.cjs is ignored in multi-project runs).
  - **Real PostgreSQL 16.10** (`scripts/verify-google-handoff-postgres.ts`, +8 phase C checks):
    23/23. Mutations, storage.ts restored identical each time: no `FOR UPDATE` → burst 24 of 24
    through (5 expected) and 5 checks fail; no re-insert loop → only the vanished-row check fails;
    no LIKE escaping → only the forget check fails.
  - **self-review found (both fixed test-first):**
    1. the reclaim `DELETE … IN (SELECT … LIMIT 100)` queued behind a row another attempt held,
       and (subquery fixed at statement start) could then delete that row after it had been counted
       afresh. New verifier check red (`'blocked' !== 'done'`) → `FOR UPDATE SKIP LOCKED` → green.
    2. **change-password's current-password check had no limit**: with a stolen session, unlimited
       guesses, then change the password. Same class as sign-in (plan scope said sign-in, reset,
       Google), so added: `passwordChangeBucket(userId)`, SIGN_IN_POLICY. 3 HTTP tests red (no 429)
       → green. Desktop settings already shows the server's message (`apiErrorMessage`).
  - now: throttle HTTP 18/18, rules 20/20, PostgreSQL 24/24. Full: tsc clean, client 70/616,
    server 69/1347.
  - **real browser** (`scripts/verify-r1-t4-throttle-browser.mjs` + `r1-t4-throttle-probe-server.ts`:
    real routes + real login page via Vite, in-memory storage, `env`-clean, Chromium): 12/12;
    screenshots `r1-t4-phase-c-2026-09-22/`. Same probe on `b9c947bb` (worktree): 7 FAIL — incl.
    the merchant's laptop refused 429 during someone else's guesses. Old-code burst, measured in a
    worktree: 12 of 12 passwords checked (statuses 4×401, 8×429).
  - side effect, owned: `git worktree prune` after removing my worktree also pruned the stale
    `wt-clean` entry (2026-09-21 history clean; its branch `r1-clean-tmp` already gone; backup
    branch intact) — partially: its `config.worktree` is a sandbox mount (EBUSY). Nothing lost.
  - committed `e60e90c0` (13 files, explicit paths; `.replit` is not this work and stays
    unstaged); evidence, screenshots, ledger in the docs commit after it.
- [x] 4b — **phase C follow-ups, owner answers 2026-09-23 ~00:10 UTC** — **done, `f6c62f50`** (to "Questions for you" in
  the phase C report): "1. yes thats ok, 2. make it need captials, and symbols/numbers and makew it
  8 characters. 3 yes". Recovery first: the "crash" was a container restart at 23:13 after phase C's
  turn ended cleanly at 22:40 (last JSONL line `turn_duration`). Re-ran every claim: tsc clean, client
  70/616, server 69/1347, PostgreSQL 24/24, browser 12/12; live dev (restarted onto `e60e90c0`):
  `GET /` 200, made-up-email sign-in 401 via the real Neon driver (0.95 s cold, then 31–48 ms).
  - Q1: the numbers stay. Q2: new passwords need **8+ characters, a capital, and a number or
    symbol** (reading: `\p{Lu}`; `[\p{N}\p{P}\p{S}]`, so a space is not a symbol). Q3: fix the
    sign-in timing leak.
  - **Q2 found:** six schemas, three rules. signup / accept-invite / admin-create / verify:
    8 + upper + lower + digit (a symbol did not count). reset + change-password: **6, nothing else**.
    `/api/merchants/verify` and `/api/admin/merchants/:id/activate` parse **no schema at all** (any
    non-empty password; neither has a client caller, both reachable). Client rules copied by hand
    in merchant-signup.tsx, accept-invite.tsx; create-merchant.tsx says "Minimum 6 characters".
    Plan: one shared `newPasswordSchema` (shared/schema.ts) in all six schemas + both schema-less
    routes; the owner's rule exactly (the lowercase requirement goes; a symbol counts), flagged in
    the report. Sign-in is not touched: existing passwords keep working.
  - **Q3 found:** `authenticateUser` returns before bcrypt for an unknown email, an inactive login
    or a non-active merchant; admin sign-in runs bcrypt only for the admin's email. Fix: exactly one
    bcrypt compare per attempt, against a stand-in hash (random password, same cost) when there is
    no usable hash. Test with a `bcrypt.compare` spy (deterministic), timing measured for evidence.
  - **Q3 design, revised after measuring:** dev's active logins are **3 × `$2b$10$`, 2 × `$2b$12$`**
    (read-only prefix count, unsandboxed psql; merchants.password_hash likewise mixed). A cost-12
    stand-in alone would make a cost-10 login (67 ms) *faster* than "no login" (272 ms): still a leak,
    for most real accounts. Fix: every attempt spends **one cost-12 check's worth of hashing** — no
    login / malformed hash (bcrypt 6.0.0 returns false in ~0.1 ms for those): one stand-in at 12;
    a cost-c hash: its own check plus stand-ins at c, c+1, …, 11 (2^c + Σ = 2^12). Stand-in =
    `bcrypt.genSaltSync(c) + "."×31`: no hashing to make, never matches. Measured: synthetic-12
    272.9 ms, real-12 271.8, real-10 66.8, real-10 + synth 10 + synth 11 273.3. Admin: budget
    max(12, admin hash cost). Tests assert the work (Σ 2^cost over a `bcrypt.compare` spy) = 2^12.
    Checked and dismissed: Google sign-in's `createUser` copies merchants.password_hash onto the
    owner row, but change-password and reset update both in one transaction, so no revert.
  - **Red first (server), on `4b496104`:** `password-rule.test.ts` + `sign-in-timing.test.ts`: 23 of 28
    fail, each for its reason — timing work 0 (unknown email, disabled login, pending business,
    unreadable hash), 16 (cost-4 login), admin 16 vs 0; schemas keep old messages / refuse
    `Password!`, `PASSWORD1`, `Élan-vital`; reset + change take `password1` (200); verify + activate
    take `password` (200); invite / admin-create answer "Invalid invite details" / "Invalid input".
    The 5 passing are meant to pass both sides (baseline wrong-password check, admin signs in, reset
    and change allow the ALLOWED list, a `demo123`-era password still signs in).
  - **Red first (client):** 6 of 9 in accept-invite / merchant-signup / password-rule-forms fail for
    their reasons (old words shown; invite blocks `Password!`; reset submits `abcdef`; admin hint
    "Minimum 6 characters"); the 3 passing are the 2 old tests + "sends a password that meets it".
  - **Built:** `shared/schema.ts` PASSWORD_RULE / meetsPasswordRule / newPasswordSchema in all six
    schemas (reset's confirm now min 1); routes: reset, change, invite, admin-create answer
    `issues[0].message`; verify + activate check `newPasswordSchema` (non-strings refused, the
    parsed value is what gets hashed); `auth.ts` PASSWORD_HASH_COST, `checkPasswordEvenly`,
    `passwordCheckBudget`; `authenticateUser` checks the password first for every attempt; admin
    sign-in uses the even check with budget max(12, admin hash cost); signup + invite pages use the
    shared rule; admin placeholder "8+ characters". tsc clean; new server 28/28, pages 9/9 (signup
    test matches labels by prefix: a field's error sits inside its label).
  - **Full suites:** tsc clean; server 71/1375 (1347 + 28), client 71/623 (616 + 7). No older test
    set a password the rule refuses.
  - **Timing, measured** (`node --import tsx scripts/measure-sign-in-timing.ts`: real routes,
    in-memory storage, clean env, admin hash at cost 10, cases round-robin, median of 9; admin's
    email n=5, its free attempts). Old code (`4b496104`, worktree, removed without prune), two runs:
    no login 5/5 ms, cost-12 login 282/279, cost-10 login 77/74, admin's email 73/73, other email
    4/4. New code, two runs: 275/281, 276/278, 281/277, 295/284, 278/283 — ranges overlap.
  - **Q3 not fixed, for the owner (tradeoffs):** (a) `POST /api/merchants/signup` answers 409
    "Email already registered", which states outright what the timing only hinted; (b)
    forgot-password awaits the reset write + the email send only when the login exists: a timing
    leak. Replying first and sending after is the standard fix, but the deployment is Replit
    **Autoscale**, where work after the reply may be starved or lost, so reset emails could be
    delayed or lost.
  - **Also after the refactor** (rule moved to `shared/password-rule.ts`, no imports: `App.tsx` imports
    MerchantSignup eagerly, and `@shared/schema` would have put drizzle into every first load): final
    tsc clean, server 71/1375, client 71/623; browser `scripts/verify-password-rule-browser.mjs` 9/9,
    old commit 6 FAIL (the 3 "sends nothing" pass there too: the old pages refused, in other words).
    Seen, not touched: the invite page's `h1` is white on cream (predates, `c350644a`).
  - committed `f6c62f50` (14 files, explicit paths; `.replit` not staged); decision, evidence,
    screenshots, ledger in the docs commit after it.
- [x] 4c — **enumeration follow-ups, owner answers 2026-09-23 ~01:00 UTC** — **done, `8fdb63e0`** (to the questions in the
  `f6c62f50` report): "1 yes 2 yes 3 yes, then start phase B".
  - 1: sign-up answers every address the same ("check your email"); an address that already has an
    account gets a note instead of a new application.
  - 2: forgot-password never answers sooner than about one second, so its timing tells nothing.
  - 3: fix the team-invite page's heading (white `h1` on the cream page).
  - then phase B (item 5).
  - **found, before building:**
    - `POST /api/auth/resend-confirmation` is a direct oracle, next to the sign-up form. By email
      it answers 404 "Merchant not found", "Email is already verified" or "Verification email sent".
      By `merchantId` it also sends pending applicants a link. Its limiter is keyed on ip plus the
      target. Sign-up alone would not meet the owner's intent, so this route is in scope.
    - The sign-up verification email puts the form's name into its HTML unescaped
      (`email-service-multi.ts`, `Hi ${merchantName}`). Anyone can make TaptPay mail any address
      arbitrary links. The same module's `escHtml` is used for board-builder emails; in scope, same
      flow.
    - Left alone: public `GET /api/merchants/:id/email-status` (by id, not by email; already
      inventoried as an accepted public route). `business-details.tsx` resends by `merchantId`, so
      id requests stay supported.
  - **design:**
    - sign-up: hash first on both paths. An address with an account or a login gets a note (no
      form text in it), limited per address by `signup-notice` (reset policy), and no new
      application. A new address is handled as before. Both reply no sooner than 1.5 s, with
      `{message: "Check your email to continue."}` and no merchant id; the page drops `&id=`.
    - resend: `{email}` or `{merchantId}`, limited per the given address or id (the limit never
      depends on whether it exists). Only a pending application with a token gets its link. The same
      200 comes no sooner than 1 s; the ip+target limiter is dropped from this route.
    - forgot-password: the 200 no sooner than 1 s; 400/429 answer at once (they do not depend on
      the address). Log when the work passes the floor.
    - invite page: the form moves onto the same dark card as its other states
      (`.signup-invite-card`); red-first check = browser contrast of the `h1`.
  - **red first (server), `account-discovery.test.ts` on `04e557eb`: 8 of 9 fail, each for its reason:**
    - sign-up: a new address gets `{merchant:{id,…}, "Account created…"}`; an address with an
      account or a teammate login gets 409;
    - the captured email HTML holds the raw `<a href="https://evil.test">` (so the capture works);
    - resend: 404 "Merchant not found" and "Verification email sent"; no 429 after 3;
    - forgot-password: 10.5 ms.
    - The 1 passing (a 429 answers at once) is a guard for both sides.
  - built and green: server 72/1384, client 71/623, browser 14/14 (old commit 4 FAIL: `&id=2`,
    "Verification email sent", invite contrast 1.1 / 2.2). While reviewing, found that confirming an
    application needs only the link (`GET /api/auth/confirm-email`), so a stranger-made application
    confirmed by the address's owner signs in with the stranger's password (pre-existing). The note
    was reworded to point at neither confirming nor resending; reported to the owner.
  - committed `8fdb63e0` (12 files, explicit paths); decision, evidence, screenshot, ledger after it.
- [x] 5 — B: the `TRUST_PROXY_HOPS` setting (off by default) and spoofed-header tests, **plus the
  address-keyed limits moved here from C**: per-address buckets for sign-in (refunded on success,
  never cleared), forgot-password and the Google callback — active only when the setting says the
  client address is real.
  - **started 2026-09-23 (owner: "then start phase B").** Found, mapping it:
    - no `trust proxy` anywhere;
    - `getBaseUrl` reads raw `X-Forwarded-Proto`/`-Host` when no origin is configured (dev only:
      production requires PUBLIC_ORIGIN);
    - 9 `req.ip` uses: sign-in logs, the in-memory `checkRateLimit` (sign-up, pay-return,
      nfc-capabilities, SSE), `paymentTokenRateLimiter`. With the setting off these stay one
      bucket for everyone, as today; once it is on, per visitor. Not changed.
  - **design:**
    - `TRUST_PROXY_HOPS`: unset = unknown (trust nothing, address limits off); `0` = no proxy
      (the connection is the visitor); `1`–`9` = trust that many hops. Anything else fails config.
    - `registerRoutes` sets `trust proxy` to N when N > 0 (index.ts, the harness and the probes
      alike).
    - `getBaseUrl`'s fallback uses `req.protocol` (believes X-Forwarded-Proto only from a trusted
      proxy) and the Host header, never raw `X-Forwarded-*`.
    - `clientAddressForLimits(req)` (`server/client-address.ts`): null while unset; IPv4-mapped →
      IPv4; IPv6 grouped by /64.
    - Address buckets, HMAC-keyed like the others:
      - `signin-address` / `admin-signin-address`: free 50, 30 s doubling to 15 min, forget 1 h.
        Not charged for a device known to that email (phase C's promise: no one else's guesses
        keep a merchant's device out). A success gives its count back (void), never clears.
      - `reset-address`: free 10, 1 min to 30 min, forget 1 h.
      - `google-address`: free 20, 30 s to 15 min, forget 1 h. Taken after the state check,
        before Google is asked; a success gives its count back; cancels and bad states are never
        counted.
    - `GET /api/admin/request-origin` (admin-only): the caller's own request (forwarded chain,
      connection address, the address and protocol the app takes), and which address each hop
      count would take. It is the tool for the owner's live check (Q4) and the tests' observable.
  - **red first, on `fa0b0230`: 20 fail, each for its reason:**
    - config ×12: no `trustProxyHops`; nothing refused;
    - the diagnostic ×3: 404;
    - sign-in and admin sign-in: 401 where the 51st should wait;
    - forgot-password: 200 at the 11th;
    - Google: the 21st still asks Google;
    - the reset link: `https://evil.test/reset-password?token=…` from a forged X-Forwarded-Host.
    - Guards passing on both: cancels and bad states are never counted; with the setting off, 25
      callbacks from one address all reach Google.
  - **done 2026-09-23, `ce3c13de`:**
    - tsc clean; server 76/1420 (+36), client 71/623; phase B and route suites 149/149.
    - Route inventory regenerated (0 unclassified): a fresh generation on `fa0b0230` already called
      `POST /api/auth/google/session` "unclassified" (phase A hand-set "public"), so it joined
      `PUBLIC_PATH_ALLOWLIST`. The drifted documentation table was regenerated with it.
    - Evidence `R1-T4-phase-B-trusted-proxy-2026-09-23.md`, with the owner's live-check steps (§5).
    - Trap: a background `(…) &` inside a sandboxed Bash call dies with the call. Use the tool's
      run_in_background.
- [x] 5a — **owner answers 2026-09-23 ~03:20 UTC** to the phase B report: "1. i cant log into admin
  anymore. 2 fix it with your recommendation. 3. happy with your recommendation. 4. keep going".
  - 1, admin sign-in, diagnosed from `logs/security-audit.log` and the dev process:
    - two ADMIN_FAILED_LOGIN at 03:20:50 (`ol***@gmail.com`) and 03:20:53 (`ol***@taptpay.co.nz`),
      i.e. 401 wrong credentials, not slowed;
    - dev runs phase C code (pid 145, started 23:25);
    - `ADMIN_EMAIL` = oliverleonard.professional@gmail.com (from `.replit` userenv);
    - **`ADMIN_PASSWORD_HASH` is set nowhere** (not in the secrets, userenv or any `.env`), so admin
      sign-in cannot succeed in dev for anyone. It was exposed 2026-09-09; the owner said "forget
      the admin creds" 2026-09-12; the value is simply gone.
    - The two attempts also named addresses other than ADMIN_EMAIL (the admin's address would have
      answered 500 "Admin login unavailable").
    - Not caused by today's changes: dev does not run them yet.
  - fix: `npm run admin:password` (the owner types a new password twice, hidden, in the Replit Shell;
    it prints the bcrypt-12 hash for Secrets; the password never passes through chat); the admin
    email compared without regard to case; a boot warning when ADMIN_EMAIL is set without a hash.
  - 2: confirming an email asks for the sign-up password (the recommendation). 3: the team-invite
    409 stays. 4: continue with R1-T9.
  - **admin: done, `ff16abfe`** (03:27). **Confirm with password: done, `2a935b02`.**
  - The session stopped at 03:31 UTC during the browser check. That was its last command, after it
    had edited the probe server and the browser script. Dev relaunched at 03:31:55 on the working
    tree (GET / 200; made-up sign-in 401). It was recovered from transcript `f98eba1d` and every
    claim re-run.
  - Added in recovery:
    - "Reset your password" after a refused password. Its test failed first. A server guard checks
      that a reset replaces the password on `merchants` too.
    - The admin tool's last step said `/admin-login`. No route serves that; it now says `/login`
      under "Admin". Its test failed on `ff16abfe`.
  - Corrected in recovery: an application with no password *could* do something before, namely
    confirm by link and then sign in with Google. Raised with the owner (evidence §4.3).
  - Found: the unused public `POST /api/merchants/verify` confirms with the link and a *new*
    password. It does not reopen the hole. Recommend removing it (§4.2).
  - Dev: `ADMIN_PASSWORD_HASH` is still unset (~03:40); the mixed-case admin email now answers 500
    "Admin login unavailable" (recognised). Read-only count on dev: 1 of 3 waiting applications has
    no password (psql needs the sandbox off: `helium` does not resolve inside it).
  - Results: tsc clean; server 79/1432; client 72/627; browser 18/18.
- [ ] 6 — **R1-T9 rollout, started 2026-09-23 ~03:50 UTC** (owner: "keep going"; design approved
  2026-09-21). The pattern is the pilot's (`2c013f33`): `xUnavailable = query.isError && query.data
  === undefined`; `DesktopLoadFailure` canvas (role=alert, Try again) in the figure's place; quiet
  text elsewhere; data-needing actions disabled; a failed background refresh keeps what is shown.
  Optional sources say "unavailable", never zero. Tests first, then a mutation check with
  `.local/claude-scratch/r1-t9/mutate.py <src> <test> <mutations.json>` (restores the file; prints
  CAUGHT/MISSED). `.local/` is git-ignored (Replit's global ignore) and, unlike `/tmp`, survives a
  container restart — keep scratch there.
  - **Container restart 03:53:19 UTC** (every user process restarted, `/tmp` wiped) mid-way through
    the terminal's mutation check (`f708258c`, last line a tool call at 03:52:49; the page file last
    written 03:53:12). Recovered 03:56–04:05: the terminal page rebuilt from the transcript's edit
    script on `HEAD` is byte-identical to the file on disk (no mutation left behind); `mutate.py`
    rebuilt from the transcript into `.local/claude-scratch/r1-t9/`.
  - [x] retail stock (`client/src/desktop/pages/retail-stock.tsx`): products fail → alert
    "Products didn't load" + Try again in the count's place, grid says "inventory didn't load",
    best seller "shows once your products load"; sales fail → each card "sales unavailable", best
    seller "this week's sales didn't load". Add product stays available (needs no loaded data).
    Test `client/src/desktop/retail-stock-failure.test.tsx`: red 3/5 first (2 pin loading/loaded);
    6/6 with the refresh test; mutations 4/4.
  - [x] retail terminal (`retail-terminal.tsx`): sales fail → alert "Sales didn't load" + Try again
    in the figures' place, list "sales didn't load", **send payment and send split payment off**
    (title "Available once your sales load"; the rail's buttons only switch panels, `send()` has no
    other caller); products fail → stock tiles alert "Products didn't load" + Try again, a keyed-in
    sale still works. Test `retail-terminal-failure.test.tsx` 6 (red 3/6 first) + the 10 existing
    terminal tests: 16/16; mutations 7/7 (re-run after the restart). Both re-run red on `e4c25fb1`
    (worktree): 3/6 and 3/6 fail for their reasons. tsc clean; client 74/639. **Committed
    `0b0a9fb7`**; evidence `R1-T9-rollout-2026-09-23.md`.
  - screenshots (04:10): `scripts/capture-r1-t9-failure-states.mjs` + stock, terminal, terminal stock
    tiles; builds of `e4c25fb1` (worktree `.local/claude-scratch/r1-t9/wt-before`) and the tree. Loaded
    view before vs after: terminal 0/0, stock tiles 0/0, stock 0 visible (90 pixels off by 1 shade,
    all on the "my store" pill). Harness made deterministic first — the same build captured twice
    differed: 2858 px (stock cards' entrance) → `animations: "disabled"`; 13 px on the analytics
    chart (drawn against the live clock) → `page.clock.setFixedTime(RUN_AT)`; ±1-shade gradient noise
    → check on pixels off by > 2 in a channel, report both counts; builds whose chunks load in a
    different order still differed on analytics (chart edge, then the nav pill under reduced
    motion) though its code is byte-identical → `reducedMotion: "reduce"` and `R1T9_SCREENS` to run
    only the screens a change touches (a zero is proof; a non-zero may be timing).
  - [x] property analytics, **`5805a416`**: payments fail → alert + Try again, no chart, sheet
    failure; Reports / Export / Generate wait for payments, tenants and schedules (tooltip names
    the missing one). Test 8 (red 5/8), mutations 9/9, client 75/647. Capture now uses
    Playwright's comparator (`playwright-core/lib/coreBundle` `utils.getComparator`); all six
    screens match `fafc6598`. Worktree moved to `fafc6598` for "before".
  - [ ] property terminal; [ ] trades analytics; [ ] trades terminal; [ ] settings ×3.
  - Screenshots: `npx vite build --outDir <dir>` (default is dist/public, untracked) and `npx vite
    preview`, then `scripts/capture-r1-t9-failure-states.mjs` (add each screen to SCREENS). The
    "before" build comes from a worktree at `e4c25fb1` (the rollout's base).
