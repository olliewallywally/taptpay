# R1-T4 follow-ups — admin sign-in, and confirming an email with the password (2026-09-23)

Owner decision: [2026-09-23 answers](../../../decisions/2026-09-23-r1-t4-confirm-with-password-owner-answers.md)
to the [phase B report](R1-T4-phase-B-trusted-proxy-2026-09-23.md):
- "i cant log into admin anymore";
- confirm with the sign-up password (the recommendation);
- the team-invite message stays;
- then R1-T9.

Commits, local, not pushed:
- `ff16abfe`: admin sign-in;
- `2a935b02`: confirming with the password, plus the admin tool's corrected sign-in page.

**Not independently reviewed yet.** Review brief at the end.

The session doing this stopped at 03:31 UTC, partway through a command: it had just started the
browser check. It was recovered from its transcript (`f98eba1d`), and its claims were re-run before
anything was built on them. The dev server relaunched at 03:31:55 on the working tree, which
included the uncommitted confirmation change. It serves `/` (200) and refuses a made-up sign-in
with 401, not 500.

## 1. Admin sign-in (`ff16abfe`)

**Found** (dev, 2026-09-23 ~03:23 UTC):
- `logs/security-audit.log`: two `ADMIN_FAILED_LOGIN` (401), at 03:20:50 (`ol***@gmail.com`) and
  03:20:53 (`ol***@taptpay.co.nz`).
- The dev server's environment holds `ADMIN_EMAIL` (36 characters, lower case) and **no
  `ADMIN_PASSWORD_HASH`**. Neither does `.replit`'s userenv, and there is no `.env`. So admin sign-in
  refused everyone:
  - the admin's address got 500 "Admin login unavailable";
  - any other address got 401.
- The hash was among the values exposed on 2026-09-09
  ([R0-T7](../r0/R0-T7-public-exposure-2026-09-09.md)). The owner set the admin credentials aside on
  2026-09-12 ([decision](../../../decisions/2026-09-12-jwt-admin-owner-disposition.md)). When it
  stopped being set is not recorded.
- Both attempts got 401, not 500, so neither matched `ADMIN_EMAIL` exactly. The match was
  case-sensitive, so the admin's address with a capital letter counted as another address. A phone
  keyboard adds one at the start. The log masks all but the first two letters, so which happened is
  unknown.

**Fix:**
- `npm run admin:password` (`scripts/set-admin-password.ts`):
  - the owner types a new password twice, and nothing shows;
  - it checks the password rule and prints a cost-12 bcrypt hash for Secrets;
  - the password never passes through chat or a command line.
- The admin email is compared without regard to case (`normalizeThrottleEmail`), as merchant
  sign-in compares it.
- Startup warns when `ADMIN_EMAIL` is set without `ADMIN_PASSWORD_HASH`.
- **Corrected in recovery:** the tool's last step said "Sign in at /admin-login". No route serves
  that page (`client/src/pages/admin-login.tsx` is not in `App.tsx`). Admins sign in at `/login`
  under the "Admin" switch (`login.tsx`), and the step now says so.

**Tests first:**
- `admin-sign-in.test.ts` (2) and `admin-password-tool.test.ts` (3), on the old code: **4 of 5
  failed**:
  - the admin email with capitals got 401;
  - the tool did not exist (`ERR_MODULE_NOT_FOUND`).

  The one that passed (another address, or a wrong password, is refused) guards the other side.
  After the fix: 5/5, and 38/38 with the sign-in, throttle, proxy and timing suites.
- Added in recovery: "sends the admin to the sign-in page the app serves". It failed on `ff16abfe`'s
  script and passes on the fix.

**Live on dev** (~03:40 UTC, on the relaunched tree):
- the environment still has no `ADMIN_PASSWORD_HASH`;
- `POST /api/admin/auth/login` with the admin address in mixed case answers 500 "Admin login
  unavailable". So the address is now recognised, and sign-in is waiting for the secret.

**Owner action.** Only the owner can do this, because the password must be theirs:
1. In the Replit **Shell** tab, run `npm run admin:password`. Type a new password twice; nothing
   shows as you type.
2. Copy the long line it prints. It starts `$2b$12$`. In Replit, open **Secrets** and add
   `ADMIN_PASSWORD_HASH` with that line as the value.
3. Stop and Run the app. At `/login`, choose **Admin**, then sign in with
   oliverleonard.professional@gmail.com and the new password.

The phase B live check ([evidence](R1-T4-phase-B-trusted-proxy-2026-09-23.md) §5) needs admin
sign-in, so it waits for this.

## 2. Confirming an email took only the link

**The defect.** It predates this work; it was found during the account-discovery work
([evidence](R1-T4-account-discovery-2026-09-23.md) §5.4).
- `GET /api/auth/confirm-email?token=…` confirmed on the link alone, and `confirm-email.tsx` called
  it as soon as the page opened.
- Anyone can start an application with any address and choose its password. The address's owner is
  emailed "Confirm your TaptPay email address", and opening that link confirmed the application.
  The account then signed in with the stranger's password, under the owner's address.

**The fix:**
- `POST /api/auth/confirm-email {token, password}` replaces the GET (`server/routes.ts`):
  - no application for the token: 400 "Invalid or expired verification token", as before;
  - an application with no chosen password: 400 `NO_PASSWORD_CHOSEN`, "This application can't be
    confirmed online. Please email support@taptpay.co.nz and we'll help.";
  - every password try counts against `confirmEmailBucket(token)`. It is HMAC-keyed and uses the
    sign-in policy: 5 free, then waits doubling from 30 s to 15 min, then 429;
  - a wrong password: 400 `WRONG_PASSWORD`, "That isn't the password chosen when this application
    was made.";
  - the right password clears the count and confirms. The rest of the route is unchanged.
- **The page** (`client/src/pages/confirm-email.tsx`) asks for the password, and opening the link
  sends nothing. Old emails still work, because they link to the page, not to the API.
- **A forgotten password is not a dead end.** After a refused password the page offers "Reset your
  password" (`/forgot-password`), then says to open the confirmation link again.
  - The reset link goes to the application's own address, which is what confirming proves.
  - It replaces the password: for the owner's login, `resetUserPasswordByToken` also writes
    `merchants.password_hash` (`server/storage.ts`). So a stranger's choice stops working, and a
    test covers this.
  - The owner did not ask for this; it closes the one dead end the change made.
- **The email** says "You'll be asked for the password you chose when you signed up." in both the
  HTML and text versions.
- **Route inventory regenerated:**
  - `GET` became `POST /api/auth/confirm-email`: public, marker `getMerchantByToken(`;
  - 223 registrations, 0 unclassified;
  - the 1 suspected gap is the older `GET /api/merchants/:id/events`.
- `scripts/r1-t4-throttle-probe-server.ts` seeds a pending application (`applicant@probe.test`,
  token `probe-confirm-token`) for the browser check.

**Who can no longer confirm online:** only applications with no stored password.
- Today's sign-up always stores one, so only applications from older sign-up forms can lack one.
- Such an application has no password login: `createMerchantWithSignup` makes one only with a
  password. Before this change it could still be confirmed by the link and then signed in with
  Google. The Google callback joins a confirmed merchant on a Google-verified email
  (`server/routes.ts`, the Google callback). Now confirming stops at the support message, and
  Google sign-in keeps answering "pending verification".
- Support can still let one in. `POST /api/admin/merchants/:id/activate` (admin) activates a waiting
  application with a password the admin sets, and the applicant then resets it.
- No stranger's password exists for these applications. Letting them confirm on the link alone, as
  before, would therefore be safe. It is left for the owner (§4.3).
- Dev has **1 of 3** waiting applications with no password (read-only count, 2026-09-23). Production
  is offline and was not counted.

**Tests first:**
- `server/__tests__/confirm-email-password.test.ts` (5) and `client/src/pages/confirm-email.test.tsx`
  (3), on `ff16abfe`: **8 of 8 failed**:
  - the POST route did not exist;
  - the GET still confirmed;
  - the page confirmed as it opened.

  The session that wrote them ran this at 03:29 UTC, and the output is in its transcript.
- Added in recovery:
  - the page's reset offer, which failed first (no "Reset your password" button);
  - a server guard: after a reset, the new password confirms and the chosen one no longer does. The
    reset path predates this change, so this test passed from the start.

## 3. Verified (2026-09-23, recovery session)

- `tsc` clean. Server 79 files / **1,432**. Client 72 / **627**.
- The new and touched suites:
  - confirm-email 6/6;
  - admin sign-in 2/2;
  - the admin tool 4/4;
  - route inventory 5/5;
  - the page 4/4.
- Real browser **18/18**, 4 of them new:
  - the link alone sends nothing;
  - a wrong password is refused, in words;
  - a refused password offers a reset;
  - the chosen password confirms.

  Screenshot: [the refused password, with the reset offer](r1-t4-confirm-password-2026-09-23/confirm-email-phone.png).

## 4. Not done / open — for the owner

1. **Set `ADMIN_PASSWORD_HASH`** (§1). The phase B live check waits for it.
2. **An older door still confirms with the link and a new password.**
   - `POST /api/merchants/verify` is public. It takes the token and any password that meets the
     rule, replaces the password, and marks the application verified.
   - Nothing in the app calls it; only `password-rule.test.ts` does.
   - It does not reopen the hole: the stranger's password stops working.
   - It skips part of what confirming does. It sets neither `email_verified` nor onboarding
     complete, and it sends no "Verified TaptPay signup" email to oliver@taptpay.co.nz.
   - Recommendation: remove it. Not changed without your say.
3. **Applications with no password now need support** (§2). There is 1 in dev; production was not
   counted.
   - Before, they could be confirmed by the link and then signed in with Google.
   - With no stranger's password to guard against, they could safely confirm on the link alone
     again.
   - Recommendation: leave it. Only older applications are affected, and support can activate them
     from admin. Say if you want the link-alone path back for them.
4. **Independent review** (plan §21.1). Ten pieces of work now wait for one.

## Handoff (plan §21.2)

```text
Phase / release:        R1-T4 follow-ups 2026-09-23 (owner answers to the phase B report): admin
                        sign-in tool + case-blind admin email; confirming an email needs the
                        sign-up password; not merged, not deployed
Exact branch and commit: remediation/r1-continuation-20260907 @ 2a935b02 (local); ff16abfe
Migrations:             none
Commands run:           tsc; jest server 79 files / **1,432**, client 72 / **627**; red first 8/8
                        (confirm) and 4/5 (admin), +2 in recovery; browser 18/18
Provider/UAT activity:  none (email simulated; browser loopback-only); one read-only count on dev
Security/privacy:       the link alone confirms nothing; tries per link HMAC-keyed and slowed;
                        the admin password never passes through chat
Rollback:               revert the commits; nothing is stored differently
Approvals:              owner 2026-09-23; §21.1 review owed
Next phase:             R1-T9 (owner: "keep going")
```

## Independent review — brief

**Range:** `0d0a4a10..2a935b02`, local only.

> You are the independent security reviewer for TaptPay. Review `0d0a4a10..2a935b02` on
> branch `remediation/r1-continuation-20260907`. The owner decided on 2026-09-23 that confirming a
> sign-up's email needs the password chosen at sign-up, not the link alone; admin sign-in gained a
> tool to set its password and a case-blind email match. Start from
> `docs/evidence/remediation-v2-2/r1/R1-T4-admin-sign-in-and-confirm-password-2026-09-23.md`; treat
> it as claims. Attack especially:
> - Is there any way left to confirm an application, or to sign in to one, with a password its
>   applicant chose and the address's owner did not? (Consider `POST /api/merchants/verify`, the
>   admin activate route, Google sign-in, the resend and reset flows.)
> - Can the per-link count be dodged, or used to lock an applicant out for good?
> - Does the confirm route say anything about an application that the token holder should not
>   learn?
> - Does the admin tool leak the password anywhere (history, process list, logs, output)?
> - Does the case-blind admin match open anything in the throttle or device-mark keys?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1 and end with Approve / Do not
> approve naming the commit range.

Reproduce: `npm run check`; `npx jest --selectProjects server`; `npx jest --selectProjects client`;
`node scripts/verify-password-rule-browser.mjs <dir>`.
