# Actions wait while pending, keep what was typed, and cannot be sent twice (R1-T9, 2026-09-23)

Date: 2026-09-23 UTC. Branch: `remediation/r1-continuation-20260907`. Commits: `0a257926` (desktop
property), `0220c6f9` (phone "mark received"), `09000e9f` (phone retail send). Plan: R1-T9, v2.2
§8.8 (full plan PDF p. 29): "Mutations stay disabled while pending, preserve user input on
failure, and prevent double submit." This is R1-T9's last item.

## In plain words

Every button that sends or saves something was checked against three rules: it waits while its
request is in flight; if the request fails, what the merchant typed is still there; and pressing
it again cannot send the same thing twice. Almost everything already followed them. Four things
did not:

- **Desktop property, marking a payment received with a reference:** the typed reference (for
  example a bank transfer number) vanished the moment it was sent, so if marking failed it was
  lost. It now stays until the payment is marked.
- **Desktop property, overdue reminders:** the on/off switch and the timing chips stayed live while
  a change saved, so quick taps sent overlapping saves. They now wait, as trades already did.
- **Phone property and trades, "mark received":** a failure showed nothing, so the payment looked
  recorded when it was not. It now says "Could not mark as received".
- **Phone retail, send:** a second tap while a sale was being created (a slow connection) made a
  second sale, with a second payment link. One tap now sends one sale; a failed sale can be sent
  again.

## The survey

The R1-T9 desktop screens have 34 actions (`useMutation`). Each was read for: every way to
trigger it (buttons, menus, Enter keys); whether each is disabled while pending or guarded; where
typed input is cleared (only on success is right); and whether a failure is reported.

| Screen | Actions | Result |
|---|---|---|
| Desktop retail terminal | sale, create board, rename board, cancel | ok; rename board has no pending guard, but renaming is idempotent and a guard would drop a newer typed name, so left |
| Desktop retail stock | add, update, delete | ok: one shared busy flag disables the dialog; the draft clears on success only |
| Desktop retail analytics | refund | ok: disabled while pending; amount and reason clear on success only |
| Desktop property terminal | rent request, bill, mark paid, resend, cancel invoice, reminders, pause/resume, cancel schedule | **mark paid with a reference** and **reminders** fixed (`0a257926`); the rest ok (row menu disables while any row action is pending and closes on click; inline remind disables for its row) |
| Desktop trades terminal | invoice, add client, quote, recurring, reminders, schedule update, mark received | ok |
| Desktop settings | 11 (details, goal, plan, team ×5, cancel/resume, password) | ok: each disabled while pending; each form clears on success only |
| Property and trades analytics | none | — |

The phone payment screens were checked the same way, since the plan's rule is not limited to a
screen list: property and trades send buttons ignore taps while `busy`; the phone quote,
recurring, schedule and row-sheet actions are disabled while pending; the phone refund disables
its button synchronously on tap. Found: the two silent "mark received" actions (`0220c6f9`) and
the phone retail send (`09000e9f`). The phone retail board actions report their own failures
through the view.

## The fixes

- `0a257926`, desktop property: `confirmRefRow` sends with `onSuccess: closeRefRow` instead of
  closing at once; a confirm while one is pending returns; the reference field is read-only while
  pending. The reminders switch and cadence chips are disabled while `updateReminders` is pending.
- `0220c6f9`, phone property and trades: `markMutation` gains `onError` with the page's own toast;
  the screen and any typed reference stay.
- `09000e9f`, phone retail view (`RetailTerminalViewCore.jsx`): the live send path holds a ref
  while the sale is being created and ignores taps until it is created or has failed. The demo
  path (landing page) is unchanged.

## Proof

- **Tests first**, each run on the unchanged code: desktop property 3 of 3 fail (after a failed
  mark the reference row is gone; the row closes on confirm; the switch is live during a save);
  phone "mark received" 2 of 2 fail (no message); phone retail 1 of 1 fails (three taps, three
  sales).
- **Mutations** 9/9: desktop property 5/5, phone mark received 2/2, phone retail 2/2 (including
  "the guard is never released", caught by the test that retries a failed sale). Every file
  restored byte-identical.
- **Suites**: `tsc` clean; client 86 suites / 760 tests.
- No browser run for these three: the tests render the real desktop property page and the real
  retail view, and none of the fixes depends on layout.

## Not changed

- Desktop retail rename board (above).
- Desktop retail analytics: a failed refund's toast shows the raw error text (`400: {…}`). That is
  failure wording, not this item.
- The phone property "batch send / schedules" screen, which nothing opens (see
  [the 402 evidence](R1-T9-billing-402-2026-09-23.md#found-on-the-way-not-changed)).
