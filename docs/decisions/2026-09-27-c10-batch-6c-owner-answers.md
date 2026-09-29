# Owner answers — the C10 route review's batch 6c questions (2026-09-27)

Date: 2026-09-27 UTC. Owner: Oliver. Branch: `remediation/r1-continuation-20260907` (at `5659c03e`,
with batch 6c's plan in the working notes, uncommitted). Asked during batch 6c of the C10 route
review (the property routes: tenants, rent automations, rent invoices, reminder settings); the answers
are the options he chose, verbatim.

| # | Question (as asked) | Answer |
|---|---|---|
| 1 | "Two property server addresses have no screen that uses them: one reads a single rent bill, the other reads one tenant's automations (the screens read all automations and pick that tenant's out). Nothing on any screen would change. Retire both?" | **"Retire both (Recommended)"** — "Removed from the server along with their tests. Every screen keeps working as today. (GET /api/property/invoices/:id, GET /api/property/tenants/:tenantId/schedules)" |
| 2 | "In property, a teammate can do everything the owner can: add and edit tenants, send rent and bills, cancel bills, mark rent as paid by cash or bank transfer, pause or stop automations, archive tenants, and change the late-rent reminder settings. In retail, refunds and the business's settings are owner-only. What should a teammate be able to do in property?" | **"Everything, as now"** — "No change: teammates keep every property action and setting." |
| 3 | "When a paused rent automation is resumed, TaptPay sends every rent request it skipped while paused, one after another (one each time the scheduler runs), most of them already overdue. Example: weekly rent paused for five weeks, then resumed, sends six requests in a row. What should resuming do?" | **"Skip the paused time (Recommended)"** — "Resuming picks up at the next rent date after today; nothing is sent for the paused weeks. The screens already show no next date while paused." |

The recommendation for 2 was "All but reminders" (the late-rent reminder settings owner-only, like the
business's other settings); the third option offered was "Also bills' money actions" (the reminder
settings, cancelling a bill and marking rent paid outside TaptPay owner-only). For 3 the other option
was "Keep sending each one".

## Background

- 1: `GET /api/property/invoices/:id` and `GET /api/property/tenants/:tenantId/schedules`. Callers were
  checked in the live web app (which the iPhone app loads): the phone property terminal, the tenant
  list and profile pages, and the desktop property terminal and clients pages. Both screens read every
  automation (`GET /api/property/schedules`) and filter by tenant; the two tenant-schedule calls found
  are the create (POST).
- 2: every property route admits any login of the business (probed: a teammate got the owner's answer
  on all 21). The team is available to every business: the owner invites from Settings, with no
  check of the business's type.
- 3: pausing sets the automation's status and leaves its next date as it was; the generate pass
  (`server/property-cron.ts`, `runGeneratePass`) makes one invoice per due automation per run and
  moves its next date on by one period. Shown with that pass: a weekly automation resumed five weeks
  after its next date sent six rent requests over six runs, five already overdue.

## What this authorizes

- 1: code and tests on this branch, tests first: the two routes removed, their pending review entries
  with them, and the route policy regenerated. No deploy or push.
- 2: nothing to change; the property reviews record that teammates have every property action and
  setting by the owner's choice.
- 3: code and tests on this branch, tests first: resuming a paused automation moves its next date to
  the first date on its cycle after the resume, so nothing is sent for the paused time. No deploy or
  push.

## A fourth question, asked later the same day

Asked after the batch's code commit (`4900a475`), once a probe showed the problem below.

| # | Question (as asked) | Answer |
|---|---|---|
| 4 | "When rent is sent with a repeat (weekly, fortnightly, monthly) to a tenant who already has a rent automation, TaptPay starts a second automation and keeps the first. The tenant then gets two rent requests every period. Example: weekly $500, then sending weekly $520 to change the rent, bills $500 AND $520 every week. No screen can change an automation's amount (only pause, resume, cancel), so re-sending is the natural way to change rent. What should happen?" | **"New one replaces old (Recommended)"** — "The new automation takes over: the tenant's running or paused automation is cancelled when the new one starts. A tenant never has two, and changing rent by re-sending works." |

The other options were "Refuse a second one" and "Keep both, as now".

Background: `POST /api/property/tenants/:tenantId/schedules` adds an automation without looking for
one already running. The phone and desktop terminals call it after every recurring send (the first
request goes at once, the automation starts one interval on), and both only pause, resume or cancel
an automation. Shown with the real generate pass: two weekly sends ($500, then $520) left two
automations running, and the first due date made two rent requests for the same week.

What this authorizes: code and tests on this branch, tests first: creating an automation cancels
the tenant's other automations that are not already cancelled, each recorded as cancelled with the
time and an event. No deploy or push.

## Outcome (same day, local commits, not pushed)

- 1, **`4900a475`**: the two routes removed (187 remain), their pending entries with them. Tests first
  (red 4 of 5; the routes that stay beside them a green guard).
- 2: nothing changed; the property reviews (**`bdbd6a60`**) record that every login of the business
  has every property action and setting by the owner's choice.
- 3, **`4900a475`**: resuming a paused automation moves its next date to the first date on its cycle
  after the resume (`nextRunDateAfter`), so nothing is sent for the paused time; the generate pass then
  has nothing due. Tests first (red 3 of 5; two next-date guards green).
- 4, **`cd6b6709`**: a new automation cancels the tenant's other automations not already cancelled,
  each recorded with the time and an event. Tests first (red 2 of 4; the guards green).
