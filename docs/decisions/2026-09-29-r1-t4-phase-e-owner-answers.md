# Owner answers — R1-T4 phase E, the session design's three questions (2026-09-29)

Date: 2026-09-29 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `1d807c6a`). The
design: [PLAN-2026-09-29-r1-t4-phase-e-sessions.md](../PLAN-2026-09-29-r1-t4-phase-e-sessions.md), §5.
Asked through the question tool after the session that wrote the design stopped on its usage limit
before asking; the design's facts were re-checked against the code first (one-hour JWT in
`server/auth.ts`, `localStorage` on the client, no CORS module, the iPhone app loading
`https://taptpay.co.nz/app-login`). The answers are the options he chose, verbatim.

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "How long should a merchant stay signed in? (Today everyone is signed out every hour.)" | **"1 day idle / 7 max"** — "Stricter: signed out after a day unused, and weekly regardless." (Not the recommended 7 days / 30 days.) |
| 2 | "How long should the admin area stay signed in? It can see every business." | **"30 min idle / 12 h max (Recommended)"** |
| 3 | "When should the iPhone app keep its sign-in in the phone's Keychain (the plan asks for this)?" | **"Later, with A-T4 (Recommended)"** — the app keeps the web's protected cookie until it bundles its own pages. |

The other options were "7 days idle / 30 max (Recommended)" and "30 days idle / 90 max" (1), "15 min idle /
8 h max" and "Same as merchants" (2), and "Now, in phase E" (3).

## What this settles

- 1: a business login's session ends after **24 hours without use** and in any case **7 days** after
  sign-in. A counter or tablet used daily signs in once a week.
- 2: the admin session ends after **30 minutes without use** and in any case **12 hours** after sign-in.
- 3: R1's exit item "native refresh credentials are Keychain-backed" moves to the Apple track's A-T4 by
  the owner's decision; phase E gives the iPhone app the same `HttpOnly` cookie as the web.

Not settled here: whether the design as a whole is approved for building (the 2026-09-29 direction was
"show it to you, then build it test-first"); asked in the same turn's reply.
