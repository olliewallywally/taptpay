# Owner decision — R2's representation for retail payments; R3 adapts (Option A)

Date: 2026-10-12 UTC. Owner: Oliver.
Branches: R2 `ccr-e07e3100-0wm8kr` at `14942392`; R3 `fix/qwen-aligned-20261010` at `f1e34585`.
Question: [R2-R3-SCHEMA-CONFLICT-2026-10-12.md](../evidence/remediation-v2-2/R2-R3-SCHEMA-CONFLICT-2026-10-12.md).

## Decision

The owner wrote, verbatim:

> Go with option a

Option A, as put to the owner: R2's columns stay the retail representation (plan §10.1:
keep `payment_attempts` and "extend it additively with expected provider fields from
R2"). R3 drops its duplicates for retail (`payment_attempt_expectations`,
`payment_attempts.processor_transaction_id`), protects R2's columns write-once instead of
freezing every unlisted column, leaves `last_reconciliation_code` and `last_reconciled_at`
mutable, has its worker verify through R2's `verifyWindcaveOutcome`, and renumbers its
migration after R2's (0036). R3 keeps what R2 does not have: `invoice_payment_attempts`,
`payment_session_bindings`, the notification inbox, settlement events and the delivery
outbox.

## Consequences

- R2's migrations 0034 and 0035 and its code stay as they are.
- R3's changes are listed exactly in
  [R2-R3-OPTION-A-ADAPTATION-2026-10-12.md](../evidence/remediation-v2-2/R2-R3-OPTION-A-ADAPTATION-2026-10-12.md).
  They are R3's owner's (Codex's) to make on `fix/qwen-aligned-20261010` after merging
  `ccr-e07e3100-0wm8kr`; this session does not push to that branch.
- R4-T1 (the refund provider boundary, no schema) can start on the R2 branch now: its
  provider boundary is R2's client. R4-T2 onward wait on the merged R2+R3 tree.

## Rollback

A decision record only; reversible before either branch merges.
