# Owner decision — R1-T4 phase C follow-ups (2026-09-23)

Asked in the phase C report ([evidence](../evidence/remediation-v2-2/r1/R1-T4-phase-C-throttling-2026-09-22.md),
§6). Oliver's answer, 2026-09-23 ~00:10 UTC, verbatim:

> 1. yes thats ok, 2. make it need captials, and symbols/numbers and makew it 8 characters. 3 yes

| Question | Answer | As built ([evidence](../evidence/remediation-v2-2/r1/R1-T4-password-rule-and-sign-in-timing-2026-09-23.md)) |
|---|---|---|
| **Q1** — keep the slow-down numbers? (5 free sign-in attempts, then waits doubling from 30 s to 15 min; reset emails 3, then 5 min doubling to 1 h) | Yes | Unchanged. |
| **Q2** — passwords need only 6 characters. Set up a separate task for a stronger minimum and a check against known leaked passwords? | "make it need capitals, and symbols/numbers and make it 8 characters" | Every new password needs 8+ characters, a capital letter, and a number or symbol, wherever one is set. Sign-in does not apply the rule. |
| **Q3** — fix the sign-in timing leak (sign-in took longer when the email had a login)? | Yes | Every merchant and admin sign-in attempt spends one full password check's work, whatever the email. |

## How the answer was read

- "symbols/numbers" = a number **or** a symbol. A symbol is punctuation or a symbol character; a
  space is not one. A capital may be any capital letter (`É` counts), not only A–Z.
- The rule applies wherever a password is set: sign-up, team invites, email verification,
  admin-created accounts, admin activation, password reset and change.
- It does not apply to sign-in, so a password set under an older rule keeps working until it is
  changed. Nobody is made to change theirs.
- **One rule everywhere replaces three.** Sign-up, invites, verification and admin-created accounts
  used to require a lowercase letter and a digit. Under the owner's rule a lowercase letter is no
  longer required, and a symbol counts in place of a number. Reported to the owner with the work;
  reversible in one line (`shared/password-rule.ts`).
- The leaked-password check from the question was not mentioned in the answer, so it was not built.

## What this authorizes

Code, tests and documents for the rule and the timing fix on
`remediation/r1-continuation-20260907`. No migration is involved. Nothing is deployed or pushed.
The independent review of plan §21.1 is still owed before merge.
