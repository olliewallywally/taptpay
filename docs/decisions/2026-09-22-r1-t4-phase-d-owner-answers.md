# R1-T4 phase D follow-ups — owner answers

Date: 2026-09-22 UTC. Owner: Oliver. Execution lineage: `remediation/r1-continuation-20260907`.
Context: [phase D evidence](../evidence/remediation-v2-2/r1/R1-T4-phase-D-sessions-2026-09-22.md),
open items 1 and 2.

## Questions put, and the answers

**1.** "When someone changes their password while signed in (Settings → Account), should that also
sign out their other devices? Today only a password reset does."

> **"Yes, keep this device (Recommended)"**. The option read: "Every other device is signed out;
> the device they changed it on stays signed in with a fresh session. Standard practice, and it
> closes the same stolen-sign-in gap a reset now closes."

**2.** "Payment notifications keep arriving on a phone after it's signed out — by 'Sign out of all
devices' or by ordinary Log Out — because notifications belong to the business, not the login.
Fix it now?"

> **"Yes, fix it now (Recommended)"**. The option read: "Tie each notification subscription to
> the login that made it; Log Out stops that device's notifications, and signing out everywhere
> stops all of that login's. Needs one small database change — I'd write and test it; applying it
> to the development database would need your OK again."

## What this authorizes

Code, tests, one migration and tooling for both, on this branch:

- A signed-in password change ends every other session of that login, and returns a fresh token
  to the device that made the change.
- Push subscriptions record the login that made them. Log Out stops that device's
  notifications. "Sign out of all devices", a password reset and a signed-in password change stop
  all of that login's notifications.

It does **not** authorize applying the new migration to any database, deploying, or pushing. The
development database needs a separate OK. Each piece still needs the independent review of plan
§21.1 before it merges.
