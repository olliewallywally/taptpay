# R1-T4 phase D — a password reset or "sign out everywhere" ends every session (2026-09-22)

Owner decision: [2026-09-21 answers](../../../decisions/2026-09-21-r1-t4-t9-owner-answers.md)
(phases A–D now; phase E, revocable server-side sessions, designed separately). Plan:
[R1-T4 sign-in security](../../../PLAN-2026-09-21-r1-t4-sign-in-security.md), finding 3 and
phase D. Commit: `44a5cfc2` (local), on the schema of `662371ba` (`users.session_version`,
0027). **Not independently reviewed yet.** The brief is at the end.

## The defect

Account tokens are one-hour JWTs, issued at sign-in and never refreshed. Every request re-reads
the users row, so disabling a teammate took effect at once. But nothing could cancel **one
login's** tokens early. A stolen token kept working after the owner reset their password, and
there was no "sign out everywhere".

## The fix

- **Tokens carry `sv`.** `generateToken` stamps the login's `users.session_version`, via
  `userRowToUser`. `authenticateToken` validates it with the other claims: absent counts as 0,
  and it must otherwise be a non-negative integer, or the answer is 401 `INVALID_SESSION`. After
  reading the row, it answers **401 `SESSION_ENDED`** ("You were signed out. Please sign in
  again.") when `sv` differs from the row. The client already treats 401 as "signed out"
  (`probeSession` in `App.tsx`; `property-api.ts` and `trades-api.ts` bounce to /login).
- **Tokens from before phase D** carry no `sv` and count as version 0. They keep working, for at
  most their remaining hour, until the login's sessions are first ended. Deploying this signs
  nobody out.
- **`POST /api/auth/sign-out-everywhere`** (merchant logins only; an admin token gets 403). It
  runs `advanceUserSessionVersion` in one `UPDATE … SET session_version = session_version + 1`,
  then `sseBroker.disconnectUser`, so an open live-payments stream on another device is cut at
  once. It answers 204, `no-store`. Route policy: `merchant-user`, `authenticateToken`.
- **Password reset:** `resetUserPasswordByToken` advances the version in the same `UPDATE` that
  sets the password (both storages). The route closes the login's streams. `resetPassword` now
  returns the login it reset rather than `true`/`false`.
- **UI: "Sign out of all devices"** under Log Out, on phone (`pages/settings.tsx`) and on desktop
  and tablet (`DesktopSettingsPage.tsx`), via `lib/sign-out-everywhere.ts`:
  - It asks first (`window.confirm`, as "Restart all page tutorials?" already does).
  - Only the server's 204 counts as "Signed out of all devices".
  - A 401 signs this device out as **"Already signed out"**, not as success: another device may
    have signed in since this device's session ended.
  - A failure keeps this device signed in and says so.
  - Styling uses the existing palette only (`APPLE_MUTED` on phone, the desktop sheet's
    `rgba(255,255,255,0.55)`), with a 44 px tap target on phone and the Log Out button's height
    on desktop and tablet.

## Tests first

- `server/__tests__/session-version.test.ts`: 8 red first (no `sv`, no route, a reset left
  tokens valid, an odd `sv` accepted), then green. A 9th test, that sessions ending closes the
  live streams, was also red first.
- `client/src/pages/settings-sign-out-everywhere.test.tsx`: 3 red on the pre-change page, then
  green.
- `DesktopSettingsPage.test.tsx`: 4 new tests, red first (no button), then green. The 10
  existing tests are unchanged apart from sharing one `setLocation` and one `toast` mock.
- `lib/__tests__/sign-out-everywhere.test.ts`: 4.
- `auth-core-regressions.test.ts`: the two `resetPassword` assertions are now stricter (it must
  return which login was reset, `{ userId: 5, merchantId: 22 }`, or null).

## Verified (2026-09-22)

- **Suites:** client 65 suites / 578 tests; server 66 / 1,294; `tsc` clean.
  `npm run verify:mobile-keyboard` (12 routes, settings included): no findings.
- **Real PostgreSQL 16.10** (`scripts/verify-google-handoff-postgres.ts`, now phases A and D):
  10/10. A login starts at 0. 20 simultaneous sign-outs from two instances make it 20. A reset
  sets the password, clears the token and advances the version in one statement, and a spent
  reset changes nothing. An unknown login is reported.
- **The DB checks can fail:** with a read-then-write advance, only **2 of 20** concurrent
  sign-outs survive; with the reset's bump removed, the reset check fails. `storage.ts` was
  restored byte-identical.
- **Screenshots** (dev server, fixtures only; `scripts/desktop-shots/shot-sign-out-everywhere.mjs`):
  - [phone 390×844](r1-t4-phase-d-2026-09-22/phone-390x844.png): Log Out 48 px, the new button
    44 px.
  - [tablet 1194×834](r1-t4-phase-d-2026-09-22/tablet-1194x834.png): both 49 px.
  - [desktop 1440×900](r1-t4-phase-d-2026-09-22/desktop-1440x900.png): both 44 px.
  - No page errors.

## Not done / open — for the owner

1. **Changing the password while signed in** (`PUT /api/merchants/:id/change-password`) does not
   end other sessions. The plan named only reset and "sign out everywhere". Recommended: yes,
   and keep this device signed in by returning a fresh token.
2. **Payment notifications keep reaching signed-out devices.** `push_subscriptions` belongs to the
   merchant, not the login (no `user_id`), and ordinary Log Out does not unsubscribe either. So a
   phone signed out by "sign out everywhere" still receives "payment received" pushes. Fixing it
   needs `user_id` on subscriptions (a migration), unsubscribing on Log Out, and removing a
   login's subscriptions when its sessions end.
3. The **running dev server** has phase A's server code, not phase D's: `tsx` does not reload.
   The dev client already shows the button, which fails ("Couldn't sign out of all devices")
   until the server restarts.
4. **Independent review** of `46cdc475..44a5cfc2` (plan §21.1).

## Handoff (plan §21.2)

```text
Phase / release:        R1-T4 phase D (session versions), code complete; not merged, not deployed
Exact branch and commit: remediation/r1-continuation-20260907 @ 44a5cfc2 (local); GitHub head 93aa6a0a
Scope completed:        sv in tokens; SESSION_ENDED; sign-out-everywhere endpoint + UI (phone,
                        desktop, tablet); reset advances the version; SSE streams closed on both
Files changed:          `git diff --stat 46cdc475 44a5cfc2` (14 files)
Migrations:             none new; uses 0027 (51da432f…c455c), applied to dev 2026-09-22 only
Commands run:           tsc; jest client 65/578, server 66/1294; verify-google-handoff-postgres
                        10/10; verify:mobile-keyboard clean; screenshots at 3 sizes
Negative tests:         read-then-write advance → 2/20; reset without bump → FAIL; old pages → red
Provider/UAT activity:  none
Security/privacy:       every token of a login ends on reset or sign-out-everywhere; open SSE
                        streams closed; push notifications NOT stopped (open item 2)
Rollback:               revert 44a5cfc2; tokens with sv stay valid under the old code (it ignores sv)
Approvals:              owner 2026-09-21 (A–D); §21.1 review owed
Next phase:             C (shared throttling, slow down instead of lockout), then B, R1-T9 rollout
```

## Independent review — brief

**Range:** `46cdc475..44a5cfc2` (one code commit), local only.

Paste-ready prompt:

> You are the independent security reviewer for TaptPay, a payment-terminal SaaS. Review commit
> `44a5cfc2` on branch `remediation/r1-continuation-20260907` (range `46cdc475..44a5cfc2`): plan
> task R1-T4 phase D. Account tokens now carry the login's session version; a password reset or
> "sign out everywhere" advances it, and older tokens are refused. Start from
> `docs/evidence/remediation-v2-2/r1/R1-T4-phase-D-sessions-2026-09-22.md`; treat it as claims
> and re-derive everything from the code. Attack especially:
> - Can any token outlive a reset or "sign out everywhere": legacy tokens without `sv`, admin
>   tokens, Google-issued tokens, SSE streams, or any route that does not use
>   `authenticateToken`?
> - Can one login end another login's sessions, or a teammate end the owner's?
> - Is the advance atomic under concurrency, in both storages?
> - Does the reset still refuse every case it refused before?
> - Does the client ever claim "Signed out of all devices" without the server's 204, or sign a
>   device out on a failure?
> - Do the edits to older tests keep what they checked?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1
> (`docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md`) and end with Approve / Do not approve
> naming the commit range.

Reproduce:
- `npm run check`
- `npx jest --selectProjects client`
- `npx jest --selectProjects server --runInBand`
- The PostgreSQL verifier, as in the phase A evidence.
- `npm run verify:mobile-keyboard`
- `node scripts/desktop-shots/shot-sign-out-everywhere.mjs <out dir>`, against a dev server
  restarted on this commit.
