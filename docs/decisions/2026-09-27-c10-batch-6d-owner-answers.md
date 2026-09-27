# Owner answers — the C10 route review's batch 6d questions (2026-09-27)

Date: 2026-09-27 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `9e4d6399`,
with batch 6d's plan in the working notes, uncommitted). Asked during batch 6d of the C10 route
review (the trades routes: clients, quotes, invoices, recurring invoices, the reminder and GST
settings); the answers are the options he chose, verbatim.

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "Three trades server addresses have no screen that uses them: reading one quote by its id, re-sending a quote, and re-sending a job invoice. Nothing on any screen would change. Retire all three?" | **"Retire all three (Recommended)"** — "Removed from the server along with their tests. Every screen keeps working as today. (GET /api/trades/quotes/:id, POST /api/trades/quotes/:id/resend, POST /api/trades/invoices/:id/resend)" |
| 2 | "Trades recurring invoices pause the same way rent automations did: resuming one sends every invoice it skipped while paused, one after another, most already overdue. For rent you chose to skip the paused time. Same for trades?" | **"Skip it, same as rent (Recommended)"** — "Resuming picks up at the next invoice date after today; nothing is sent for the paused time." |

The other options were "Keep all three" and "Keep sending each one".

## Background

- 1: callers were checked in the live web app (which the iPhone app loads) and in `ios/`: the phone
  trades pages, the settings page, and the desktop trades terminal and clients pages. The only
  `/resend` calls in the client are the team invite's; nothing reads one quote by id (the screens
  read the quote list, and open a quote's PDF).
- 2: the trades cron (`server/trades-cron.ts`, `runTradesGeneratePass`) makes one invoice per due
  recurring invoice per run and moves its next date on by one period (monthly ones anchored to the
  start date's day); pausing leaves the next date where it was. The rent answer (2026-09-27, batch 6c,
  answer 3) moved a resumed rent automation's next date to the first date on its cycle after the
  resume.

## What this authorizes

- 1: code and tests on this branch, tests first: the three routes removed, their pending review
  entries with them, and the route policy regenerated. No deploy or push.
- 2: code and tests on this branch, tests first: resuming a paused recurring invoice moves its next
  date to the first date on its cycle after the resume, keeping a monthly one's day of the month, so
  nothing is sent for the paused time. No deploy or push.
