# Owner decision — begin R2 while Codex finishes R1

Date: 2026-10-11 UTC. Owner: Oliver.
Branch: `ccr-e07e3100-0wm8kr` at `0cf210be` (R1 through Codex's `c7001802`, plus the
review fixes recorded in `docs/HANDOFF-2026-10-11-review-findings-fixes.md`).
Authority: plan v2.2 §6 release map and §9 (R2).

## Context

The ledger marked R2 "GATED: implement only after the source dependencies". R1 is
not closed: T10e/T10f, the zoom-detection fix, the stock-sheet focus review and the
final independent review remain, and Codex is finishing R1 on
`fix/qwen-aligned-20261010`.

## Decision

The owner directed, verbatim:

> Ok i need you to commit and push all, we need to move on to the next phase
> completely, you will come back to this one for final review one codex is done.
> No thats still R1, we are moving to the next phase. Codex is finishing r1

R2 starts now on this branch, in parallel with Codex's R1 completion. This session
returns to R1 for its final review once Codex is done.

## What this does not change

- Plan §1.4 still applies: no R2 implementation begins until a §21.1 review of the
  proposed phase reaches **Approve** and a second pass confirms it.
- R1 is not declared complete, and no R1 gate is waived.
- No migration is applied, no live Windcave call is made, and nothing is deployed
  without the approvals the plan names.

## Consequences and rollback

R2 work and Codex's R1 work proceed on different branches. Merge Codex's final R1 into
this branch before any R2 release candidate, and re-run R2 verification after that
merge. To undo, stop R2 work; nothing in this decision touches data or deployment.
