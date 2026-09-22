# R1-T4 phase D follow-ups — password change, and notifications per login (2026-09-22)

Owner decisions: [2026-09-22 answers](../../../decisions/2026-09-22-r1-t4-phase-d-owner-answers.md)
to open items 1 and 2 of [phase D](R1-T4-phase-D-sessions-2026-09-22.md), then the
[follow-up answers](../../../decisions/2026-09-22-r1-t4-push-follow-up-owner-answers.md) and the
[dev-database apply of 0029](../../../decisions/2026-09-22-apply-0029-to-dev.md). Commits (local,
not pushed): `50a469e7` (password change), `36a320d6` (notifications) and `b714efda` (disabling a
teammate). **Not independently reviewed yet.** The brief is at the end.

**Recovery.** The session doing this work stopped at 07:23 UTC, partway through the notifications
fix: the container restarted at 07:23:28. The next session recovered it from the transcript
(`90064242-….jsonl`). The uncommitted tree matched the transcript's edits byte for byte. Its claims
were re-run before anything was built on them: `tsc` clean, the five affected server suites 118/118,
and the empty-database CI rehearsal (below).

## 1. A signed-in password change ends every other session (`50a469e7`)

- **Defect.** `PUT /api/merchants/:id/change-password` changed the password but left every other
  session of the login working, for up to an hour.
- **Fix.** `updateUserPassword` advances `session_version` in the same `UPDATE` that sets the
  password, in both storages. The route closes the login's live-payment streams and returns a fresh
  token (`no-store`). The desktop and tablet settings page stores that token and says "Your other
  devices have been signed out." The merchant SSE client used to reconnect with the token it was
  opened with, so after a password change this device's stream was refused for good. It now
  reconnects with the token the device holds, and retries a 401 or 403 once when a newer token has
  arrived.
- **Only one form changes a password:** `DesktopSettingsPage.tsx`. The phone settings page has none
  (`grep change-password client/src` → that file alone).
- **Tests first** (from the commit, re-run today): server 1 red (no token returned) then green, plus
  a guard that a refused change ends nothing; SSE client 2 red then green; desktop page 1 red then
  green.

## 2. Notifications belong to the login that turned them on (`36a320d6`)

### The defect

`push_subscriptions` belonged to the business, not the login. So:

- A phone signed out by Log Out, "sign out of all devices", a password reset or a password change
  kept receiving "payment received" notifications.
- Turning notifications off on one iPhone turned them off on **every** iPhone of the business:
  `native-unsubscribe` deactivated all of the merchant's `apns://` rows.
- A browser signed out without turning notifications off, then signed in to another business, still
  received the first business's notifications, because nothing moved or retired the subscription.

### The fix — server

- **Migration `0029_push_subscriptions_user.sql`** (checksum `9899463a…401c2`): `user_id integer
  REFERENCES users(id) ON DELETE CASCADE`, nullable (no table rewrite), plus index
  `push_subscriptions_user_id_idx`. It is registered in `shared/schema.ts`, the baseline contract
  (column, `push_subscriptions_user_id_fkey`, index) and `REAL_MIGRATIONS`. CI's recorded empty-database
  fingerprint is now `R1-T4-push-empty-fingerprint-2026-09-22.json` (`bf3dd0f4…`): +1 column,
  constraint, foreign key and index, nothing removed.
- **Subscribe** (web and iPhone) records `req.user.userId`. Registering an existing endpoint moves
  it to the registering login, as it already moved it between businesses.
- **`deactivatePushSubscriptionsForLogin(merchantId, userId)`**: that login's devices, plus the
  business's unattributed (pre-0029) rows. No one else's. It is called by "sign out everywhere", the
  password reset and the password change.
- **Order: sessions first, notifications second.** Each route stops notifications after it has ended
  the sessions, and a failure there is logged (`[SIGN_OUT_EVERYWHERE_PUSH_STOP]`,
  `[RESET_PUSH_STOP]`, `[PASSWORD_CHANGE_PUSH_STOP]`), never returned.
  - Found on re-check: the crashed pass's "sign out everywhere" answered 500 ("Please try again")
    when this step failed, although every session, the caller's included, had already ended. The
    spent token could never retry. It now answers 204.
  - Rejected alternative: stopping notifications first. That would let a fault in the privacy step
    block the security action.
- **`native-unsubscribe`** takes an optional `deviceToken`, which stops that iPhone only. The token
  must belong to the caller's business (403 otherwise, as the web route does). Without a token, it
  stops that login's iPhones and the business's unattributed ones: iPhones set up before this change
  never remembered a token.
- **MemStorage `removeTeamMember`** now drops the removed login's subscriptions, as the database's
  `ON DELETE CASCADE` does. It kept them before (test red first).
- **Disabling a teammate** (`PUT /api/team/:id/status` → `disabled`) stops that login's devices
  with the same call (`b714efda`; owner answer 1 of the follow-up decision). As in the other
  routes, the login is disabled first, and a fault is logged (`[TEAM_DISABLE_PUSH_STOP]`), never
  returned. Removing a teammate already deleted their rows, through the cascade.

### The fix — client (`client/src/lib/push-device.ts`)

- **Log Out stops this device**, using the token it is about to discard. This covers phone
  (`pages/settings.tsx`), desktop and tablet (`DesktopSettingsPage.tsx`), and "Sign out" on the
  can't-reach-the-server screen (`App.tsx`).
  - Browser: it retires the subscription locally first, which also kills the endpoint at the push
    service, then tells the server.
  - iPhone: it forgets the remembered token first, so an immediate sign-in cannot re-register it,
    then asks the server to stop that token.
  - The request is `keepalive` and abandoned after 5 s. Log Out neither waits for it nor fails
    because of it.
- **A confirmed session re-registers this device's existing subscription** under the signed-in
  login. This happens on app open (`App.tsx`, only on the server's "ok") and after a password
  change, with the fresh token. It never turns notifications on: a browser needs permission already
  granted and an existing subscription; an iPhone needs a remembered token. This is also how a
  browser's pre-0029 row gains its login.
- **"Sign out of all devices" leaves this device to the server,** like every other device of the
  login. The server stopped them all; each resumes if it signs in again.
- **iPhone switch.** The device token is remembered when notifications are turned on, sent when they
  are turned off, then forgotten. The switch now shows **this iPhone**: on / off / unknown
  (`nativeDeviceState`). With per-iPhone "off", the old business-wide flag
  (`/api/push/status.nativeSubscribed`) would have flipped this iPhone's switch back on whenever a
  teammate's iPhone still received notifications. "Unknown" (set up before this change) still reads
  that flag, as before.

### Design choices the reviewer and the owner should know

1. **Unattributed rows fail closed.** Pre-0029 subscriptions cannot be shown to belong to anyone, so
   ending the sessions of *any* login of that business stops them. A browser re-attributes its row
   on its next app open. An iPhone does so the next time its notifications are turned on.
2. **After "sign out of all devices", a password reset or a password change, a device that signs in
   again resumes notifications** if its own switch was on. Log Out is the explicit "this device is
   done": it turns notifications off there until they are turned on again. Consequence: whoever
   signs in next on a device that was signed out remotely inherits that device's switch. It shows
   as on, and can be turned off. It moves to their login and business, so nothing reaches a device
   signed in to someone else. **Confirmed by the owner, 2026-09-22** (follow-up answer 2).

### Tests first

- Server `push-subscriptions-per-login.test.ts`, 13 tests. The crashed pass's 7 were red first (6
  red, 1 green). Its "Log Out stops only that device" case already held for the web route. Added
  today, red first: "sign out everywhere still answers 204 when stopping notifications fails" (was
  500), and "removing a teammate's login takes their devices with it". Added as guards (green
  before and after): the same fault during a password reset and a password change. Added after the
  owner's answer, both red first: disabling a teammate stops their devices (both stayed active),
  and its fault case (no stop was attempted, so nothing was logged).
- Client:
  - `lib/__tests__/push-device.test.ts`, 15 tests. The module is new.
  - `use-push-notifications-native.test.tsx`: 7 tests, 5 red on the old hook, 2 guards.
  - `push-resync-on-open.test.tsx`: 5 tests, 2 red (app open; outage Sign out) and 3 guards.
  - Phone settings: 1 red (Log Out), plus 1 guard.
  - Desktop settings: 2 red (Log Out; password change), plus 1 guard.
  - Every red test failed for its stated reason, not setup: `stopThisDevicePush` or
    `resyncThisDevicePush` not called, the token not remembered, or the switch showing the business
    flag.

### Verified (2026-09-22)

- **Suites:** client 69 suites / 614 tests; server 67 / 1,307; `tsc` clean. After `b714efda`:
  server 67 / 1,309, `tsc` clean.
- **Real PostgreSQL 16.10**, `scripts/verify-google-handoff-postgres.ts`: 15/15 (10 from phases A
  and D, plus 5 new). It runs 0029 through the project runner, then exercises the actual
  `DatabaseStorage` from two pools. The new checks:
  - A subscription records its login and moves with the device.
  - It cannot name a login that does not exist (the FK).
  - Ending a login's sessions stops exactly its devices and its business's unattributed ones, never
    a teammate's or another business's.
  - Turning notifications off with no token stops only iPhones.
  - Deleting a login deletes its rows and keeps unattributed ones.
- **The checks can fail.** Mutated storage: unattributed rows of every business, and no `apns://`
  filter. Exactly those two checks fail. The wrongly stopped rows were `other-unattributed-web`, then
  `phone-owner-web` and `phone-unattributed-web`. `storage.ts` was restored byte-identical. Run with
  `node --import tsx`: the sandbox refuses the `tsx` CLI's IPC socket.
- **CI empty-database job, rehearsed locally** (PostgreSQL on 127.0.0.1:5432, the CI inventory and
  arguments): preflight lists 0029; release 31 applied, 0 pending; status 31/0/0/0. The fingerprint
  is byte-identical to the recorded file (`bf3dd0f4…`). `npm run test:fingerprint` 28/28.
- **No visual change.** Only handlers changed, not markup, so no screenshots or layout gates were
  re-run.
- **Development database, read-only check:** last applied 0028; `push_subscriptions.user_id`
  absent; 2 subscriptions, both active. A `SELECT` naming `user_id` fails there.

## Not done / open — for the owner

1. ~~Apply 0029 to the development database~~: **done at 08:04 UTC**, owner-approved
   ([decision and outcome](../../../decisions/2026-09-22-apply-0029-to-dev.md)). Status is
   31/0/0/0, the reads that failed work again, and the two existing rows are unchanged.
   - Until then, dev push was broken: the dev server restarted at 07:23:29 on the crashed pass's
     tree, which already declared the column.
   - The dev server still runs the server code it loaded at 07:23. It is correct now that the
     column exists, but it lacks `b714efda` until it is restarted (Run). No restart loop wraps
     it, so killing it would leave dev down.
2. ~~Disabling a teammate~~: **done** (`b714efda`), owner decision.
3. ~~Confirm the resume behaviour~~: **confirmed** by the owner.
4. **Reset is best-effort.** The password reset stops notifications after the reset. If that one
   statement fails, the signed-out devices keep receiving them, and the failure is logged.
   Putting it inside the reset's `UPDATE` would make it atomic, but a fault there would then block
   the reset.
5. **iPhones set up before this change** are not re-attributed on app open. Their switch reads the
   business-wide flag until next used. APNs token rotation is not refreshed (pre-existing).
6. **Unreachable logout code is untouched:** `components/layout.tsx`, `components/navigation.tsx`,
   `components/mobile-header.tsx` (imported nowhere), and `demo-terminal.tsx`'s `handleLogout`
   (never called).
7. **Independent review** of `50a469e7`, `36a320d6` and `b714efda` (plan §21.1).

## Handoff (plan §21.2)

```text
Phase / release:        R1-T4 phase D follow-ups (password change; push per login), code complete;
                        not merged, not deployed
Exact branch and commit: remediation/r1-continuation-20260907 @ b714efda (local); GitHub head 93aa6a0a
Scope completed:        password change ends other sessions + fresh token; push subscriptions record
                        their login; Log Out / sign-out-everywhere / reset / password change stop
                        the right devices; per-iPhone off; app-open re-registration; disabling a
                        teammate stops their devices
Files changed:          `git diff --stat 6abc2a03 50a469e7` (9 files); `git diff --stat 50a469e7
                        36a320d6` (22 files, most lines the recorded fingerprint JSON);
                        `git diff --stat a7dc7db5 b714efda` (2 code files + 1 decision)
Migrations:             0029 (9899463a…401c2), additive; applied to the development database only
                        (2026-09-22 08:04 UTC, owner decision; 31/0/0/0)
Commands run:           tsc; jest client 69/614, server 67/1309; verify-google-handoff-postgres 15/15;
                        CI convergence rehearsal 31/0/0/0 + fingerprint byte-identical;
                        test:fingerprint 28/28
Negative tests:         mutated storage → the 2 targeted PostgreSQL checks FAIL; old pages/hook/App →
                        10 red; sign-out-everywhere fault → 500 before the fix; team disable → 2 red
Provider/UAT activity:  none (no push sent; test VAPID keys generated per run)
Security/privacy:       signed-out devices stop receiving payment notifications; one iPhone's "off"
                        no longer affects the business's other iPhones
Rollback:               revert b714efda, then 36a320d6 (0029 may stay: the old schema never selects
                        user_id); revert 50a469e7 separately
Approvals:              owner 2026-09-22 (all four answers); §21.1 review owed
Next phase:             C (shared throttling, slow down instead of lockout), then B, R1-T9 rollout
```

## Independent review — brief

**Range:** `6abc2a03..b714efda` (three code commits and one docs commit), local only.

Paste-ready prompt:

> You are the independent security reviewer for TaptPay, a payment-terminal SaaS. Review commits
> `50a469e7`, `36a320d6` and `b714efda` on branch `remediation/r1-continuation-20260907` (range
> `6abc2a03..b714efda`): R1-T4 phase D follow-ups. A signed-in password change now ends every other
> session. Push subscriptions now record the login that made them (migration 0029). Log Out, "sign
> out everywhere", a password reset, a password change and disabling a teammate stop the right
> devices' notifications.
> Start from `docs/evidence/remediation-v2-2/r1/R1-T4-phase-D-follow-ups-2026-09-22.md`; treat it
> as claims and re-derive everything from the code. Attack especially:
> - Can a signed-out device keep receiving notifications, or re-register itself, by any path:
>   web or iPhone, legacy (unattributed) rows, a request authenticated just before the sessions
>   ended, the app-open re-registration?
> - Can one login stop another login's, or another business's, notifications? Consider the
>   `deviceToken` on `native-unsubscribe` and the `OR … IS NULL` clauses.
> - Can the password change leave another session alive, or this device without a working token or
>   stream?
> - Is "sessions first, notifications second, logged" the right order? Is anything misreported?
> - Does the client ever block or fail Log Out, or opening the app, because of notifications? Does
>   it ever turn notifications on for a device that had none?
> - Is 0029 safe on a live table, and do the contract, fingerprint and cascade match the code?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1
> (`docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md`) and end with Approve / Do not approve
> naming the commit range.

Reproduce:
- `npm run check`
- `npx jest --selectProjects client`
- `npx jest --selectProjects server --runInBand`
- The PostgreSQL verifier, on an empty disposable database:
  `TEST_DATABASE_URL=… TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-google-handoff-postgres.ts`
- The CI `migration-convergence` job's steps, then `npm run test:fingerprint`.
