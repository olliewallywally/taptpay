# Gap 12 — approval to migrate the three legacy terminals to per-payment links

Date: 2026-09-14 UTC
Owner: Oliver
Execution lineage: `remediation/r1-continuation-20260907`.

Per
[gap12-owner-input-and-linkmode-finding](2026-09-13-gap12-owner-input-and-linkmode-finding.md),
per-transaction addressing (`linkMode: "per_payment"` → `/pay/t/<token>`)
already exists, already ships, and the desktop retail terminal already uses it
for board-less sales — which is why those sales are already immune to gap 12.
The entire vulnerable population is three older terminals that never pass
`linkMode` and silently default to `"legacy"`:
`client/src/pages/merchant-terminal.tsx:198`,
`merchant-terminal-mobile.tsx:237`, `merchant-terminal-mobile-v2.tsx:221`.

R1-H1's client-work gate having been lifted this session (see
[r1-h1-visual-baseline-acceptance](2026-09-14-r1-h1-visual-baseline-acceptance.md)),
Oliver was shown this finding and the resulting scope — three client files
made to do what a fourth already does, plus building the missing per-sale
"share this link" UI each of those three currently lacks — and answered:
**"Yes, proceed now."**

**Effect:** approved. Does **not** cover retiring the standing
`/pay/:merchantId` address (needs a production traffic-drain window,
separately scheduled) and does **not** cover the SSE-ambiguity fail-closed fix
from the same options memo (gap 12's other, disjoint piece — see
[gap12-anonymous-sse-addressing-options](2026-09-13-gap12-anonymous-sse-addressing-options.md)
"Option C"), which is authorized separately and tracked on its own.

Implementation status: launched as a background workflow the same session;
that workflow's state did not survive the session boundary (see
`docs/HANDOFF-2026-09-14-workflows-in-flight.md`) and was re-derived/redone in
the following session — see its own evidence file once landed for the actual
implementation record.
