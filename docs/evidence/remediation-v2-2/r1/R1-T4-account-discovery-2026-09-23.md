# R1-T4 follow-ups — no door says whether an address has an account (2026-09-23)

Owner decision: [2026-09-23 answers](../../../decisions/2026-09-23-r1-t4-enumeration-owner-answers.md)
to items 1–3 of the [password-rule report](R1-T4-password-rule-and-sign-in-timing-2026-09-23.md) §5:
- sign-up answers every address alike and mails an existing owner a note;
- forgot-password always waits about a second;
- the invite page's heading is fixed.

Commit `8fdb63e0`, local, not pushed. **Not independently reviewed yet.** Review brief at the end.

## 1. The defects (verified in the code, 2026-09-23)

1. **Sign-up said it outright.** `POST /api/merchants/signup` answered 409 "Email already
   registered" for any address with a merchant record or a login, teammates included. A new address
   got `{message: "Account created…", merchant: {id, name, email, status}}`. The id was used only
   by the check-email page's Resend button.
2. **The Resend button beside it was a second oracle, and a worse one.**
   `POST /api/auth/resend-confirmation` answered:
   - 404 "Merchant not found";
   - 200 "Email is already verified";
   - 400 "No verification token found";
   - 200 "Verification email sent".

   It answered by address, or by account number from `business-details.tsx`. Its limit was keyed
   on client address plus target, so each new target started fresh. Anyone could step through
   account numbers and send every waiting applicant a confirmation email.
3. **Forgot-password's timing.** It answered at once for an address with no login. For a login it
   answered only after saving a link and sending an email: measured 10.5 ms with the email simulated,
   more with a real provider.
4. **Found in the same flow: the confirmation email put the form's name into its HTML unescaped**
   (`email-service-multi.ts`, `Hi ${merchantName}`). Anyone could make TaptPay send any address an
   email carrying their links. The same module already escaped the board-builder email's fields
   (`escHtml`); `email-service.ts` escapes the team-invite and billing emails.
5. **The team-invite form's heading was white on the cream page.** Measured contrast: 1.1 for the
   heading, 2.2 for the description; AA needs 4.5. The invite's other two states sit on a dark card
   (`.verification-sent-card`); the form did not.

## 2. The fix

- **One answer, one wait** — `server/even-reply.ts`. `replyStart()` is read as a request begins.
  `replyNoSoonerThan(start, floor)` holds a valid request's reply until the floor has passed:
  - sign-up 1.5 s (it hashes a password, saves an application and sends an email);
  - forgot-password and the resend 1 s.

  The work's own time is returned, and each route logs `[…_SLOW]` when it ran past the floor, so a
  slow email provider shows up. Refusals that do not depend on the address answer at once: a
  malformed request (400), and a slowed-down one (429, counted per address whether or not it
  exists).
- **Sign-up** (`server/routes.ts`, the public sign-up route):
  - the password is hashed on both paths;
  - an address with a merchant record or a login gets a note, `sendExistingAccountNoticeEmail`,
    and no second application. The note carries nothing from the form, only "sign in" and "reset
    your password", and never points at confirming an application (§5.4). It is limited by
    `signupNoticeBucket` (the reset policy: 3, then 5 min doubling to 1 h), silently;
  - a new address is handled as before;
  - both answer `{message: "Check your email to continue."}` with no account number. The page goes
    to `/check-email?email=…`.
- **Resend** (`POST /api/auth/resend-confirmation`):
  - it takes `{email}` or `{merchantId}` (business-details still asks by number);
  - each request counts against `confirmationResendBucket(asked)`, keyed by the address or number
    asked, whether or not it exists, so a 429 says nothing either. The old ip+target limiter is gone
    from this route;
  - only a merchant that is not email-verified and holds a token gets its own link;
  - every valid request is answered "If that address is waiting to be confirmed, we've sent the
    link again." after 1 s.
- **Forgot-password**: the same 200 after 1 s.
- **The confirmation email** escapes the name (`escHtml`).
- **The invite page**: the form sits on `.signup-invite-card` (`merchant-signup.css`), the dark card
  the invite's other states and the sign-up form use.

## 3. Tests first

- `server/__tests__/account-discovery.test.ts` (9), on the unchanged code: **8 of 9 failed**, each for
  its reason:
  - sign-up: the merchant object and old message for a new address; 409 for an address with an
    account and for a teammate's; 409 ×4 where the notes were expected;
  - the captured email HTML held the raw `<a href="https://evil.test">`, which also proves the
    capture works. `support/resend-capture-env.ts` routes one file's email through a mocked `resend`
    package; every file's `test-env` resets it;
  - resend: 404 "Merchant not found"; "Verification email sent" by number; no 429 after 3 for an
    address;
  - forgot-password answered in 10.5 ms.
  - The one passing (a 429 answers at once) is a guard for both sides.
- The rules test now also keeps the three new counters apart from the others: 20/20.
- **Real browser** (`scripts/verify-password-rule-browser.mjs`): 4 new checks. On `04e557eb` all 4
  failed:
  - sign-up landed on `/check-email?…&id=2`;
  - Resend answered "Verification email sent";
  - invite heading contrast 1.1, description 2.2.

## 4. Verified (2026-09-23)

- `tsc` clean; server 72 files / **1,384** (1,375 + 9); client 71 / **623**.
- Real browser **14/14**:
  - sign-up lands on `/check-email?email=…` with no number;
  - Resend answers the one message, and the page says "Email sent!";
  - invite heading contrast **19**, description **7.9**.

  Screenshot: [the invite form on its card](r1-t4-account-discovery-2026-09-23/invite-on-card-phone.png).

## 5. Not done / open — for the owner

1. **Timing past the floor.** A reply takes longer than the floor only when the work does, e.g. a
   slow email provider. Then the timing can tell again for that request. The `[SIGNUP_SLOW]`,
   `[FORGOT_PASSWORD_SLOW]` and `[CONFIRMATION_RESEND_SLOW]` log lines show whether the floors need
   raising.
2. **A signed-in merchant can still ask about an address**: inviting a teammate answers "That email
   address already has a TaptPay login" (`POST /api/team/invite`). It needs a signed-in owner and is
   not changed. Tell me if you want it to answer alike too.
3. **`GET /api/merchants/:id/email-status`** stays public. It says by account number, not by
   address, whether an application is confirmed (inventoried as accepted).
4. **A stranger can start an application in your name, and you can be led to confirm it**
   (pre-existing, found here).
   - Anyone may sign up with any address, choosing the password.
   - The address's owner is emailed "Confirm your TaptPay email address". Confirming
     (`GET /api/auth/confirm-email`) needs only that link, not the password, and then the account
     "can sign in", with the stranger's password, under the owner's address. The owner can take it
     back with a password reset.
   - Fix options, your call:
     - ask for the sign-up password on the confirmation page;
     - or clear the password at confirmation and send a set-password link instead.
   - The new note mentions neither confirming nor resending, so as not to lead anyone there. The
     check-email page's Resend is unchanged.
5. **Independent review** (plan §21.1).

## Handoff (plan §21.2)

```text
Phase / release:        R1-T4 follow-ups 2026-09-23 (owner answers 1–3): sign-up, resend and
                        forgot-password answer every address alike; invite heading; not merged,
                        not deployed
Exact branch and commit: remediation/r1-continuation-20260907 @ 8fdb63e0 (local)
Migrations:             none
Commands run:           tsc; jest server 72/1384, client 71/623; account-discovery red 8/9 first;
                        browser 14/14 (old commit: 4 FAIL)
Provider/UAT activity:  none (email captured by a mocked client; browser loopback-only)
Security/privacy:       replies carry no account number; the note carries no form text; the name
                        in the confirmation email is escaped; counters key on HMACs, as before
Rollback:               revert the commit; nothing is stored differently
Approvals:              owner 2026-09-23; §21.1 review owed
Next phase:             B (trusted proxy + address-keyed limits)
```

## Independent review — brief

**Range:** `04e557eb..8fdb63e0`, local only.

> You are the independent security reviewer for TaptPay. Review commit `8fdb63e0` on branch
> `remediation/r1-continuation-20260907` (range `04e557eb..8fdb63e0`). The owner decided on
> 2026-09-23 that no door says whether an email address has an account. Sign-up, the confirmation
> resend and forgot-password now answer alike and no sooner than a floor. The confirmation email
> escapes the sign-up name. Start from
> `docs/evidence/remediation-v2-2/r1/R1-T4-account-discovery-2026-09-23.md`; treat it as claims.
> Attack especially:
> - Is there any status, body, header, cookie, email or timing difference left between an address
>   with an account and one without, on these three routes or any other public one?
> - Can the note or the resend be used to flood an address, or to confirm a stranger-made
>   application?
> - Does any path still interpolate user text into email HTML?
> - Do the floors hold under concurrency and slow providers?
>
> Label anything you cannot verify UNVERIFIED; cite `file:line`; give a failing test for every
> Blocking issue. Return exactly the ten headings of plan §21.1 and end with Approve / Do not
> approve naming the commit range.

Reproduce: `npm run check`; `npx jest --selectProjects server`; `npx jest --selectProjects client`;
`node scripts/verify-password-rule-browser.mjs <dir>`.
