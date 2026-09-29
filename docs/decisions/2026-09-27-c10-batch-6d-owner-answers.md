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

## Two more questions, asked later the same day

Asked on resuming batch 6d (after a container restart), before any of its code, once re-reading the
trades routes against the property ones showed both.

| # | Question (as asked) | Answer |
|---|---|---|
| 3 | "When a trades client is archived, their recurring invoices keep running. Each one keeps making and emailing a new invoice every week, fortnight or month, even though the client is hidden from the lists. Archiving a rent tenant cancels their rent automations. Should trades work the same way?" | **"Cancel them, same as rent (Recommended)"** — "Archiving a client cancels their recurring invoices and records when. Restoring the client doesn't restart them. An archived client can't be given a new recurring invoice (409); the screens already don't offer it. Invoices already sent stay payable." |
| 4 | "A trades recurring invoice can be given a start date in the past: the date picker allows it, though it defaults to today. The server then catches up, sending one overdue invoice for every period since that date, one each time the scheduler runs. That's the same catch-up you chose to skip when resuming. What should a past start date do?" | **"Refuse past dates (Recommended)"** — "The server answers "The start date can't be in the past" and makes nothing. Today still works, since the form defaults to it; a date up to a day back is still taken, because the form sends the UTC date." |

The other options were, for 3, "Keep them running" ("Archiving only hides the client. Their recurring
invoices carry on until each is cancelled by hand."); for 4, "Start from the next date" ("The server
accepts it but sends nothing for the past: the first invoice is the next date on its cycle from
today.") and "Keep catching up" ("As today: every period since the start date is billed, one invoice
per scheduler run, all overdue.").

### Background

- 3: `archiveClientProfile` (`server/storage.ts`) sets only the client's status and when; the rent
  tenant's `archiveTenantProfile` also cancels the tenant's automations. Neither the trades generate
  pass (`runTradesGeneratePass`) nor the dispatch pass reads the client's status. The client
  directory, the recurring-invoice page and the desktop trades terminal leave archived clients out of
  their pickers.
- 4: both trades forms (`client/src/pages/trades/recurring-schedules.tsx` and the desktop trades
  terminal) default the start date to today's UTC date and send it at 09:00 UTC; the date input has no
  lower limit. The create stores the start date as the first run date, and the generate pass makes one
  invoice per due recurring invoice per run, then moves its next date on by one period.

### What this authorizes

- 3: code and tests on this branch, tests first: archiving a trades client cancels its recurring
  invoices not already cancelled, each recorded with the time and an event; restoring the client does
  not restart them; a new recurring invoice for an archived client is refused (409) and nothing is
  made. No deploy or push.
- 4: code and tests on this branch, tests first: a recurring invoice whose start date is more than a
  day before the request is refused (400 "The start date can't be in the past") and nothing is made.
  No deploy or push.

## Outcome (same day, local commits, not pushed)

- 1, **`00ec975d`**: the three routes removed (184 remain), their pending entries with them. Tests first
  (red 6 of 7; the routes that stay beside them a green guard).
- 2, **`00ec975d`**: resuming a paused recurring invoice moves its next date to the first date on its
  cycle after the resume, a monthly one kept on its start date's day of the month
  (`nextJobRunDateAfter`), so nothing is sent for the paused time; the generate pass then has nothing
  due. Tests first (red 3 of 5; two next-date guards green).
- 3, **`00ec975d`**: archiving a client cancels its recurring invoices not already cancelled, each with
  the time and a `schedule_terminated` event; restoring the client does not restart them; a new
  recurring invoice for an archived client is 409. Tests first (red 4 of 5; one already cancelled and
  another client's stay as they were, a green guard).
- 4, **`00ec975d`**: a start date more than a day back is 400 "The start date can't be in the past";
  today at 09:00 UTC (the forms' default), 23 hours back and next week are taken. Tests first (red 2
  of 5; three guards green).
- The reviews (**`ed7082f0`**) record each answer on its route.
