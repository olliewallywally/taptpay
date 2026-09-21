# R1-T9 — truthful failure states: proposal and pilot (2026-09-21)

Date: 2026-09-21 UTC. Branch: `remediation/r1-continuation-20260907`. Pilot commit: `2c013f33`.
Plan: R1-T9 / C16 (v2.2 §8.8; source plan R1.C). Follows R1-T8 (`387d189d`).
Owner instruction, verbatim, in reply to *"do you want to give me a design … or shall I propose
one in the app's existing style (no new colours) for you to approve before I apply it
everywhere?"*: **"ok go ahead"** — read as: propose it, then apply after approval.
**Status: the design awaits the owner's approval; one screen carries it.**

## The problem

Every desktop screen R1-T9 names reads a failed request as "no data". Retail analytics with its
sales request failing (500) — **today**: "$0.00 total revenue", "0 transactions", and "no sales
yet — take your first payment from the Terminal"
([screenshot](r1-t9-proposal-2026-09-21/retail-analytics-failed-today.png)). The requests *do*
fail properly (their query functions throw on a non-OK answer); the pages never look at the
failure, and draw from `data ?? []`.

## The proposal

`client/src/desktop/DesktopLoadFailure.tsx` — one in-frame message, built only from values the
desktop screens already use (no red, green or amber; the wording carries the state):

- **On the navy canvas**, in the figure's place: "Sales didn't load" (34 px, `textSoft`), "Your
  totals stay hidden until they do." (the hero caption's style), and a **Try again** pill in the
  selected-segment style (`active` fill, navy text). It carries `role="alert"`.
- **On the light sheet**: "Payment history didn't load." (the sheet's empty-state style) and an
  outlined **Try again** in the Reports-button style. Not announced a second time.
- **Nothing is drawn from data that did not load**: no figure, count or chart; actions that need
  the data (Reports, Export) are dimmed and unavailable, with a tooltip saying why.
- **A failed background refresh** keeps the figures already shown rather than replacing them.

Proposed ([screenshot](r1-t9-proposal-2026-09-21/retail-analytics-failed-proposed.png)); the
loaded screen is unchanged — **pixel-identical** to the pre-change build when both are captured
in one run ([screenshot](r1-t9-proposal-2026-09-21/retail-analytics-loaded-unchanged.png);
`scripts/capture-r1-t9-failure-states.mjs`, synthetic, loopback, third-party origins blocked).

## Pilot — retail analytics (`2c013f33`)

Tests first — `client/src/desktop/retail-analytics-failure.test.tsx`: 3 of 5 red for the stated
reason (no alert; Reports and Export enabled), 2 pin the loading and loaded states. Then 5 / 5;
mutations 3 / 3 caught (failure read as "no sales" again; Export left available; Try again doing
nothing); client 61 suites / 557 tests; `tsc` clean.

## Rollout once approved — what each screen shows on a failed load today

| Screen | Shows today when its data fails | Also |
|---|---|---|
| Retail stock | "no products yet — add your first", "no sales this week" | |
| Retail terminal | "no sales yet", "no products yet — add them on the Stock page"; today's revenue as $0 | the sale button must not stay live on a failed load |
| Property analytics | "no payments in this period", $0 totals | |
| Property terminal | "no requests here", "no tenants match", $0 outstanding | bill/request buttons |
| Trades analytics | "no payments in this period", $0 totals | |
| Trades terminal | "no jobs match" | its schedules query turns a failed request into `[]` (`trades-terminal.tsx:165`) |
| Settings (all three) | "No subscription invoices yet." | plus the plan's "no saved card" case and 402 banners |

Also in scope (plan R1-T9): optional sources show "unavailable", never a made-up zero; mutations
stay disabled while pending, keep the user's input on failure and cannot double-submit.
Found under R1-T8 and routed here: six pages throw on a malformed response (see
[R1-T8 evidence](R1-T8-hook-order-crash-2026-09-21.md)).
