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
  - owner questions: apply 0029 to dev (dev push broken until then); disable a teammate → stop
    their notifications?; confirm resume-on-sign-in after remote sign-out.
  - then: evidence file + review brief, ledger/task row, commit; owner OK needed to apply 0029 to dev.
- [ ] 4  - [ ] 5  - [ ] 6
