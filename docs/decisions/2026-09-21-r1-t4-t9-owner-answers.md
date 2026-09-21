# R1-T4 and R1-T9 — owner answers

Date: 2026-09-21 UTC. Owner: Oliver. Execution lineage: `remediation/r1-continuation-20260907`.

## The instruction, verbatim

> "make all fixes with your recommendation"

Given in reply to the R1-T9 design question and R1-T4's questions Q1–Q5
([plan](../PLAN-2026-09-21-r1-t4-sign-in-security.md)), each put with a recommendation. Each answer
below is that recommendation, now the owner's decision.

## R1-T9 — the failure-state design: **approved**

The design piloted on retail analytics (`2c013f33`,
[proposal](../evidence/remediation-v2-2/r1/R1-T9-failure-states-2026-09-21.md)) is approved as
shown, and is to be applied to the remaining R1-T9 screens: retail stock and terminal, property
analytics and terminal, trades analytics and terminal, and settings.

## R1-T4

| Q | Decision |
|---|---|
| Q1 — Google sign-in and existing merchants | Join an existing merchant automatically **only when Google reports the email as verified**. (Implementation also refuses when the merchant is already linked to a *different* Google account, rather than silently re-linking.) |
| Q2 — sessions | Fix phases A–D now; design phase E (revocable sessions, no hourly sign-out, phone-app Keychain) separately afterwards. |
| Q3 — past exposure in Google Analytics | Delete the affected page addresses and turn on GA's query-parameter redaction. **Owner actions in the GA account** — no agent has access; steps given in the conversation. In code, analytics stops sending query strings and token-bearing paths (phase A). |
| Q4 — trusted-proxy check | Check on the live deployment **when the owner next opens the site**. Until then phase B ships the setting, off by default, with its tests. |
| Q5 — lockout | Replace the hard account lockout with **slowing repeated attempts down**. |

## What this authorizes

Code, tests, migrations and tooling for R1-T9's rollout and R1-T4 phases A–D, on this branch.
It does not authorize applying any migration to any database, deploying, or pushing; each piece
still needs the independent review of plan §21.1 before it merges.
