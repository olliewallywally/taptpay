# Owner decision — build T-3's full decline supersession now (2026-10-15)

**Question:** T-3's full fix (a later approved card in a Windcave session already recorded as
declined is recorded on the sale, automatically) was refused in its first review as incomplete, and
it matters only if Windcave lets a second card through after reporting a decline. Build it now, or
wait for the UAT answer and rely meanwhile on the interim guarantee (such a payment raises
`PAYMENT_APPROVAL_NOT_RECORDED` and is handled by hand)?

**Decision (owner, 2026-10-15): build it now.**

The design is [the T-3 ADR](2026-10-15-t3-decline-supersession.md), revision 3, which must meet
every condition of [review pass 1](../evidence/remediation-v2-2/r4/T3-review-pass-1-2026-10-15.md)
and be approved in an independent review before it is implemented. The interim guarantee stays as
the safety net for any approval the supersession still cannot record. The UAT case stays on the
checklist.
