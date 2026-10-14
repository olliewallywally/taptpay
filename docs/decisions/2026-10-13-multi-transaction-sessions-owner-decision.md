# Owner decision — a payment session with more than one card attempt is not an error (OI-2)

Date: 2026-10-13 UTC. Owner: Oliver.
Branch: `ccr-e07e3100-0wm8kr` at `e7c4abf3`.
Question: OI-2 (finding H-2) in [R2-R3-MERGE-REVIEW-2026-10-13.md](../evidence/remediation-v2-2/r3/R2-R3-MERGE-REVIEW-2026-10-13.md).
R3's reconciliation adapter treated a Windcave session holding more than one transaction
as a mismatch and dead-lettered it. R2's verifier settles such a session when its
transactions are unambiguous.

## Decision

The owner wrote, verbatim:

> I dont think we should treat more than one attempt as a error so please change that.

R3's worker follows R2's rule. It uses R2's normalizer and verifier and adds no
exactly-one-transaction requirement. Example: a declined card followed by an approved
card in the same session is approved.

The rest of R2's rule is unchanged:

- Every transaction in the session must match the expected amount, currency and reference.
- Two approvals in one session are still ambiguous. They are never settled as one
  payment.

## Consequences

- R3's adapter, its evidence check and their tests change. The evidence for this work
  lists each assertion that encoded the old rule.
- The worker is still unmounted. This takes effect when it is switched on.

## Rollback

Revert the implementing commit. No schema change.
