# Owner answers — before R1-T3 (2026-09-27)

Date: 2026-09-27 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `2ea74684`,
R1-T2 closed). Asked after the owner's "ok lets do the next step but first you need to make sure
everything is finished before moving on", once R1-T2's check had been re-proved on the day's code
(working notes, "R1-T2 closed"). The answers are the options he chose, verbatim.

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "The plan says each piece of work should be checked by a reviewer other than the one who built it before building on it. None of the route-review work (R1-T2) has had that check yet. R1-T3 will turn those 184 route reviews into tests, so any mistake in them would be copied into the tests. When batch 4's reviews were re-read, 9 of 29 were wrong. Get an independent check first?" | **"Start R1-T3 now"** — "The independent checks stay on the owed list, as for the earlier work. R1-T3 starts from the reviews as they are." |
| 2 | "Two small bugs came up in the review with no later phase to fix them. (1) Clearing a client's or tenant's email, phone or notes doesn't clear it, but the screen says it saved. (2) Cancelling a trades invoice leaves nothing in the client's history. Fix both before R1-T3?" | **"Fix both now (Recommended)"** — "Tests first, both verticals for (1): an emptied field is cleared. A cancelled trades invoice gets a history entry, as a rent one does." |
| 3 | "52 commits are local only; the last push was on 26 September. Push the branch?" | **"Push now (Recommended)"** — "Same checks as last time: no .claude-home or local settings files in what's sent, a scan for secrets, fast-forward only. The repository stays private." |
| 4 | "The dev server is still running the code from before today's trades changes: it started at 06:19 and doesn't reload by itself. Restart it so it runs today's code?" | **"Restart it (Recommended)"** — "A few seconds offline. Checked afterwards with the page and a sign-in attempt. Split-invoice checkout in dev still needs migration 0030, which is yours to apply." |

The recommendation for 1 was "Independent check first" (a fresh reviewer, a separate agent without
this session's memory, re-reading R1-T2's reviews and fixes against the code with the plan's §21.1
template). The other options were "Leave them recorded" (2), "Not yet" (3) and "Leave it" (4).

## Background

- 1: plan §21.1 asks for an approving reviewer pass, and a second independent reread, before work
  proceeds. The ledger's "independent reviews owed" list holds every C10 batch and most of R1's
  earlier work. The 2026-09-26 re-read of batch 4 found 9 of its 29 reviews wrong or incomplete.
- 2: (1) the edit screens send the whole form, so a cleared field arrives as "" (trades client: email,
  phone, notes; rent tenant: email, phone, co-tenants). The shared schemas turn "" into undefined, and
  Drizzle leaves undefined out of an update (`mapUpdateSet`), so the old value stays. (2) voiding a
  trades invoice writes no job event; voiding a rent invoice logs `Invoice_Voided`.
- 3: the last push was `93aa6a0a..30c9d8cb` on 2026-09-26, with the checks listed in the working notes
  ("Pushed").

## What this authorizes

- 1: R1-T3 starts from the reviews as committed; the independent reviews stay on the owed list.
- 2: code and tests on this branch, tests first: an emptied optional field in the client and tenant
  edits is cleared; voiding a trades invoice records an event. No deploy.
- 3: pushing `remediation/r1-continuation-20260907` to `origin`, fast-forward only, after checking
  that no `.claude-home/` or `.claude/settings.local.json` path is in what is sent and scanning the
  new blobs for secrets.
- 4: restarting the development server (`npm run dev`) and checking it with `GET /` and a made-up
  sign-in.
