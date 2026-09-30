# Owner answers — build R1-T4 phase E; fix the admin home page (2026-09-30)

Date: 2026-09-30 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `d901adcb`). The
design: [PLAN-2026-09-29-r1-t4-phase-e-sessions.md](../PLAN-2026-09-29-r1-t4-phase-e-sessions.md).

The session that recorded the design's three answers (`d901adcb`, 2026-09-29 19:37 UTC) stopped straight
after that commit, before its reply, so the question it owed ("Not settled here" in
[the 2026-09-29 answers](2026-09-29-r1-t4-phase-e-owner-answers.md)) was asked on resuming. Before asking,
the design was re-read against the source requirement (integration plan R1-T4, R1.B) and the code; two
refinements were put to the owner with the question. Asked through the question tool; the answers are the
options he chose, verbatim.

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "Start building the new sign-in system (phase E) as designed, with the two small additions?" | **"Yes, build it (Recommended)"** — "Tests first: the server first, then the app, then switching off the old way. You apply one database change in dev when the server part lands." |
| 2 | "The admin area's home page always shows $0 revenue and 0 sales, whatever the platform really holds, because it asks the server for a list that doesn't exist. Fix it while I'm working on the admin area?" | **"Yes, fix it (Recommended)"** — "Show the real totals from the admin's own data, and say so plainly if they don't load (never a fake $0)." |

The other options were "Walk me through it first" and "Do upload scanning first" (1), and "Leave it for now"
(2).

## The two additions, as put to the owner

1. **Rotation completes only when the device uses the new secret.** The design had the old secret work for
   60 seconds after the daily swap, then treat any use as a stolen copy. A device whose response carrying the
   new cookie was lost (a dropped connection at that moment) would have been signed out and logged as a
   theft. Now the old secret keeps working until the new one is first presented; from then, 60 seconds, and a
   use after that ends the session (`SESSION_REUSE_DETECTED`), as designed. A copied secret used alongside
   the real one is still caught.
2. **The cross-site refusal carries an explicit exception list** for callbacks that legitimately arrive from
   another site. None exists today (Windcave returns the browser with a GET; its notifications and the other
   provider calls come from servers, with no `Origin`); Sign in with Apple (R1-T5) will need one for Apple's
   form post.

## What this authorizes

- 1: phase E as designed (with the additions): E1 the server, E2 the client, E3 closing the bearer path for
  the web; tests first. The new table's migration is applied to the development database by the owner (the
  agent's safety check denies dev writes, as for 0030; see the
  [ledger](../evidence/remediation-v2-2/CONTINUATION-2026-09-07.md)). Until it is, sign-in in dev fails once
  the server code runs there. Production waits for the owner to reopen
  it, as for everything else.
- 2: the admin home page (`client/src/pages/admin/GridDashboard.tsx`) reads `GET /api/transactions`, which
  the server does not serve (only `POST`), so its totals are always $0 and 0. Fix it from the admin's own
  data, with a truthful failure state (R1-T9's rule).
