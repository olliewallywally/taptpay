# R1-T4 notifications per login — owner answers on teammates and on resuming

Date: 2026-09-22 UTC. Owner: Oliver. Execution lineage: `remediation/r1-continuation-20260907`.
Context: [phase D follow-ups evidence](../evidence/remediation-v2-2/r1/R1-T4-phase-D-follow-ups-2026-09-22.md),
open items 2 and 3.

## Questions put, and the answers

**1.** "When you disable a teammate's login, their phone keeps receiving the business's payment
notifications. Removing a teammate already stops them. Should disabling stop them too?"

> **"Yes, stop them too (Recommended)"**. The option read: "Disabling a login also stops
> notifications on every device of that login. A small change, built test-first like the rest."

The other option was "No, leave it": "I record it as a known gap and move on to the next step."

**2.** "When a device is signed out from somewhere else (sign out of all devices, a password reset
or a password change) and later signs back in, should its notifications come back on by
themselves? Log Out on the device itself always turns them off until someone turns them on
again."

> **"Yes, as built (Recommended)"**. The option read: "That device's own on/off switch was never
> touched, so they resume once it's signed in again. Whoever signs in there sees the switch on and
> can turn it off."

The other option was "No, keep them off": "They stay off until turned on again in Settings on that
device. More work: the app must check with the server each time it opens."

## What this authorizes

- Code and tests on this branch so that disabling a teammate's login (`PUT /api/team/:id/status`
  → `disabled`) stops notifications on that login's devices. It uses the same call, and the same
  order and logging, as "sign out everywhere": the login is disabled first, and a failure to stop
  notifications is logged, never returned.
- Keeping the resume behaviour of `36a320d6` as built, as a confirmed design choice rather than an
  open question.

It does **not** authorize deploying or pushing. Each piece still needs the independent review of
plan §21.1 before it merges.
