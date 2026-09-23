# Owner decision — admin sign-in, confirming with the password, R1-T9 next (2026-09-23)

Asked in the report on phase B (`ce3c13de`, `0d0a4a10`;
[evidence](../evidence/remediation-v2-2/r1/R1-T4-phase-B-trusted-proxy-2026-09-23.md)).
Oliver's answer, 2026-09-23 ~03:22 UTC, verbatim:

> 1. i cant log into admin anymore. 2 fix it with your recommendation. 3. happy with your recommendation. 4. keep going

| Question (as asked) | Answer | As built ([evidence](../evidence/remediation-v2-2/r1/R1-T4-admin-sign-in-and-confirm-password-2026-09-23.md)) |
|---|---|---|
| **1** — the live check that switches phase B on: sign in to admin, paste one line into the Console, read the "hops" number off your own address's row. | "i cant log into admin anymore" | A report, not a choice. Diagnosed: `ADMIN_PASSWORD_HASH` is set nowhere, so admin sign-in refuses everyone. Fixed in `ff16abfe`: `npm run admin:password` makes a new hash from a password typed in the Shell; the admin email is compared without regard to case; startup warns when the hash is missing. **The owner still has to set the secret** (evidence §1). The live check waits for that. |
| **2** — a stranger can start a sign-up with your address and a password they choose; confirming needs only the emailed link. Ask for the password on the confirmation page (recommended), or have people set their password when they confirm? | "fix it with your recommendation" | Confirming asks for the password chosen at sign-up. The link alone confirms nothing. |
| **3** — inviting a teammate still says "That email address already has a TaptPay login" (only a signed-in owner sees it). Left as is (recommended). | "happy with your recommendation" | Unchanged. |
| **4** — carry on with R1-T9, or pause for the 9 independent reviews? | "keep going" | R1-T9 next. The reviews stay owed. |

## How the answers were carried through

- **Q2: the link alone confirms nothing.** `GET /api/auth/confirm-email?token=…` is gone. Its
  replacement, `POST /api/auth/confirm-email`, takes the token and the password. The page asks for the
  password instead of confirming when it opens. Old emails still work: they link to the page, not the
  API.
- **Wrong passwords are counted per link**, as sign-in counts them: 5, then waits doubling from 30 s.
- **An applicant who has forgotten the password is not stuck.** After a refused password the page
  offers "Reset your password". The reset link goes to the same address, so it proves the same
  thing. It also replaces the password, so a stranger's choice stops working. This was not asked for;
  it closes the one dead end the change made.
- **An application with no chosen password cannot be confirmed online.** The page says to email
  support@taptpay.co.nz, and an admin can activate it. Today's sign-up always stores a password, so
  only older applications can lack one; dev has 1. Before, such an application could be confirmed by
  the link and then signed in with Google. No stranger's password exists for it, so the link-alone
  path could safely return for it. That choice is left to the owner (evidence §4.3).
- **The confirmation email says it will ask for the password.**

## What this authorizes

Code, tests and documents for the above on `remediation/r1-continuation-20260907`, then R1-T9. No
migration. Nothing deployed or pushed. The independent reviews of plan §21.1 are still owed.
