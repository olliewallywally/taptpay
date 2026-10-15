# D9 — explicit entitlement periods and bounded dunning

Owner approved on October15,2026: “Ok go ahead”, replying to the concrete
[D9 proposal](../operations/r6-entitlement-policy-proposal.md) and approval
question. This supersedes the earlier pending D9 question.

Honor verified paid, migration-granted, complimentary and trial periods until
their recorded end. Record truthful provenance; missing billing date never
establishes a grant, and lastBillingDate records only a confirmed bill. A failed
billing attempt cannot revoke a current unpaid grant. Renewal-card readiness is
separate from service access.

Preserve initial/day1/day3/day7 billing attempts, at most four failures including
existing recorded unusable-payment-method failures. Paid renewal grace is at
most eight UTC days after the paid period end, ending sooner on exhaustion.
Initial/unpaid failure creates no paid grace. Provider uncertainty retains its
R3 attempt identity and reconciliation rather than advancing the decline count.

Authorization covers repository implementation, forward migration tooling,
counts-only comparison and owned synthetic restore rehearsal. It does not
authorize live classification/activation, provider charges, deployment, R4
integration or waive real-target/UAT/professional review evidence.
