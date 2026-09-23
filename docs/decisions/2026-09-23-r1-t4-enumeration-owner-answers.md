# Owner decision — which doors may say an address has an account (2026-09-23)

Asked in the report on `f6c62f50`
([evidence](../evidence/remediation-v2-2/r1/R1-T4-password-rule-and-sign-in-timing-2026-09-23.md) §5).
Oliver's answer, 2026-09-23 ~01:00 UTC, verbatim:

> 1 yes 2 yes 3 yes, then start phase B

| Question (as asked) | Answer | As built ([evidence](../evidence/remediation-v2-2/r1/R1-T4-account-discovery-2026-09-23.md)) |
|---|---|---|
| **1** — the sign-up page says "Email already registered", which tells anyone which emails have accounts. Keep it, or always say "check your email" and email the existing owner instead? (Recommended: the latter.) | Yes: the latter | Sign-up answers every valid request "Check your email to continue.", after the same wait. An address that already has an account or a login gets a note ("someone tried to sign up with your email") instead of a second application. The resend-confirmation button beside it answers alike too. |
| **2** — forgot-password answers sooner when the address has no login. Reply first and send after (risky on Autoscale), or always wait about a second? (Recommended: wait.) | Yes: wait | Forgot-password never answers sooner than 1 s. The confirmation resend also waits 1 s; sign-up waits 1.5 s, because it does more. |
| **3** — the team-invite page's heading is white on the cream background. Fix it? | Yes | The invite form now sits on the same dark card as the invite's other states and the sign-up form. |
| Then | "start phase B" | Next: the trusted-proxy setting and the address-keyed limits. |

## How the answers were carried through

- **Q1 covers the resend-confirmation route as well.** It sits beside the sign-up form: the
  "Resend" button on the check-email page and on business details. By address it answered 404
  "Merchant not found", "Email is already verified" or "Verification email sent". Answering sign-up
  alike while that route stayed a direct oracle would not have met the answer. It now gives one
  answer after one wait. It is limited per address or account number, whether or not one exists,
  and only a waiting application is sent its own link.
- **The note carries nothing from the form.** Whoever filled it in may not own the address. At
  most 3 notes per address, then waits from 5 minutes to an hour (the reset policy). The form's
  answer never changes.
- **The sign-up reply no longer carries an account number.** It would differ between the two cases.
  The check-email page asks by address instead.
- **Found in the same flow and fixed:** the confirmation email put the form's name into its HTML
  unescaped, so anyone could make TaptPay mail any address arbitrary links. It is now escaped, as the
  board-builder email already was.

## What this authorizes

Code, tests and documents for the above on `remediation/r1-continuation-20260907`, and phase B.
No migration. Nothing deployed or pushed. The independent review of plan §21.1 is still owed.
