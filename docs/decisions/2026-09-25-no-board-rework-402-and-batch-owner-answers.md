# Owner decision — no-board payments work like the other verticals; the 402 and batch answers (2026-09-25)

Asked in the report on R1-T1 and the live-updates fix (`3fac8ac8`;
[evidence](../evidence/remediation-v2-2/r1/R1-live-updates-compression-2026-09-25.md)) and, for
2a–2c, first in the R1-T9 report (2026-09-23;
[evidence](../evidence/remediation-v2-2/r1/R1-T9-billing-402-2026-09-23.md)). Oliver's answer,
2026-09-25, verbatim:

> 1. what is the safest and securest way without compromising features or can we rework the
> system. i just wqant a with payment board saystem and without which basically works like the
> other verticles . 2. yes, yes, yes bnring it back. fix and mnove to the next phase

| Question (as asked) | Answer | Carried out as |
|---|---|---|
| **1** — Live updates reach customers' no-board page again, and with them gap 12's residual. Keep that, or keep live updates off there until per-transaction addressing closes it? | "what is the safest and securest way without compromising features or can we rework the system. i just want a with payment board system and without which basically works like the other verticals" | **Rework into two modes.** With a board: the board's own page and stream, unchanged. Without a board: every sale has its own private link (`/pay/t/<token>`), the way property and trades bill. The sale screens already do this for new sales (`8666dafc`). **Retired:** the shared merchant-wide page and its open feed, which are gap 12's leak and its residual. |
| **2a** — A customer who accepts a quote while the business's billing needs attention is turned away, and the business never hears of it. Should the business be told, by email or a notice when it next signs in? | "yes" | By email: the channel the business already gets its billing emails on, needing no schema change. At most one per quote per day. The owner may prefer a sign-in notice instead or as well. |
| **2b** — The public quote route's 402 body still carries the business's billing message. Give the customer the customer wording there too? | "yes" | Server change on the public route. |
| **2c** — Since June, phones cannot pause, resume or cancel rent automations or batch-resend: the button that opened that screen was replaced (`7b99299a`). Bring the entry back, or remove the screen? | "yes bring it back" | The entry is restored on the phone property terminal. |
| — | "fix and move to the next phase" | The work above, then the next phase in the plan's order: R1-T2's remaining parts (C10). |

## What the rework relies on (the owner's earlier answers)

- **No printed no-board QR codes or programmed NFC tags are in the field**, "demo only"
  ([2026-09-13](2026-09-13-gap12-owner-input-and-linkmode-finding.md)). That was the one blocker
  to retiring the shared address.
- **`FEATURE_NEW_RETAIL_PAYMENTS` is on in production**, per the owner's 2026-09-14 attestation
  ("It's in production, that needs to work properly"). No agent has verified it. With that flag
  off, a no-board sale has no link to use, just as property and trades have none with invoice
  payments off.

## What this authorizes

Code, tests and documents on `remediation/r1-continuation-20260907`. It does not authorize
applying a migration to any database, deploying or pushing. Each piece still needs the plan §21.1
independent review.

For the release, the rework replaces the "production traffic-drain window" noted on 2026-09-14.
Production still runs the old terminals, which create shared no-board sales. So release when none
is pending (a count-only check once the owner reopens production), or accept that a customer
mid-payment on the old shared page loses it.
