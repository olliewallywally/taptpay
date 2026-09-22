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
- [ ] 5 — B: the `TRUST_PROXY_HOPS` setting (off by default) and spoofed-header tests, **plus the
  address-keyed limits moved here from C**: per-address buckets for sign-in (refunded on success,
  never cleared), forgot-password and the Google callback — active only when the setting says the
  client address is real.
- [ ] 6
