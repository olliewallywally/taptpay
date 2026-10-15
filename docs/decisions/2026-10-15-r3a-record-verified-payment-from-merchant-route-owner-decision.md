# Owner decision — R-3a: record a verified payment found by a merchant's change (2026-10-15)

**Question** (R1-T7's open item in `../evidence/remediation-v2-2/r3/OUTSTANDING-2026-10-14.md`,
R-3a in `../evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md`): before a merchant cancels
a sale, or voids or marks paid an invoice, the app asks Windcave about any open payment session.
If Windcave confirms the customer actually paid, should the app record that payment, although the
request came from the merchant's screen rather than from Windcave or the customer?

**Decision (owner, 2026-10-15): yes, record it.** Money that moved is always recorded. The
change is refused (a sale answers 409 `PAYMENT_COMPLETED`, "This sale has just been paid. Refund it
instead of cancelling."), and the merchant is told why.

This is what Codex's converged R3 (`3c98dfe9`) already does: the merchant route only asks; the
payment is recorded by the same verified finalizer, with the same R2 checks (session, amount,
reference, account, environment), as a Windcave notification or the payer's return. The merchant's
input never decides the outcome. The merchant route looks up only its own business's sale before
asking (the coverage check in the integration record found this covered).

No code change follows from this decision.
