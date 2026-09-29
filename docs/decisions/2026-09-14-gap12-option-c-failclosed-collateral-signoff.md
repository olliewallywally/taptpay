# Gap 12 Option C (fail-closed on ambiguity) — collateral staff-terminal behaviour sign-off

Date: 2026-09-14 UTC
Owner: Oliver
Execution lineage: `remediation/r1-continuation-20260907`.

Per
[gap12-anonymous-sse-addressing-options](2026-09-13-gap12-anonymous-sse-addressing-options.md)
"Option C — keep merchant-wide, but fail closed on ambiguity and narrow the
payload", and the round-1 review panel's finding (recorded in
`docs/HANDOFF-2026-09-14-workflows-in-flight.md`) that the no-stoneId branch
of `GET /api/merchants/:id/active-transaction` is polled not only by the
customer page but by the three legacy staff terminal screens and
`demo-terminal.tsx` — files this task was not authorized to edit — fixing the
route to fail closed on ambiguity is an observable behaviour change to those
screens even though it does not touch their code.

Oliver was told, in these exact terms: fixing the route properly (both REST
and SSE) means that during a genuine ambiguity window (two or more concurrent
pending/processing stoneless sales on one merchant) the three staff terminal
screens, which poll this same branch, will show "no active transaction"
instead of a possibly-wrong guessed one, until the ambiguity resolves. He
answered: **"Yes, proceed (Recommended)."**

**Effect:** this authorizes exactly that collateral behaviour change — staff
terminals may transiently show no active transaction during a genuine
concurrent-stoneless-sale window — and nothing else. It does not authorize
touching those terminal files, does not authorize a fix for the separately
identified residual leak (a completing sale's own broadcast can still be
delivered to another concurrent sale's customer if the pending bucket drops
to 1 at the instant its check resolves — see the implementation evidence
below), and does not authorize Option A/B (retiring or replacing the standing
`/pay/:merchantId` address).

The response shape built to satisfy this sign-off — the REST poll's
ambiguous-case JSON body stays `null` (byte-identical to today's "no
transaction" response for any caller that doesn't look for it), with
ambiguity signalled only via a new `X-Legacy-No-Board-Ambiguous` response
header that only the customer page reads — was agreed as part of this
sign-off and is what was implemented.

**Implementation record:**
[R1-T2-gap12-option-c-fail-closed-2026-09-15](../evidence/remediation-v2-2/r1/R1-T2-gap12-option-c-fail-closed-2026-09-15.md),
committed on `remediation/r1-continuation-20260907`.
