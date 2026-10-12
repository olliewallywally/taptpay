# Owner direction — complete R2-T5

Date: 2026-10-12 UTC. Owner: Oliver.
Branch: `ccr-e07e3100-0wm8kr` at `6f1a67e2` (R2-T1–T4 plus Codex's R1 through `e408f597`).

## Direction

The owner wrote, verbatim:

> Ok complete t5, we will come back and review r1 - r2 once all completed

## How the open questions are applied

The [R2 preflight §4](../evidence/remediation-v2-2/r2/R2-preflight-2026-10-11.md)
questions were not answered individually. To complete T5 without switching anything
off or changing what merchants see, this session applies the options that remove no
capability, and records them here for the owner's review of R1–R2:

1. **Legacy numbered sales and invoice checkout stay usable and are verified** against
   values the server already holds (option (a), the recommendation): the sale price or
   the next pending split, the invoice amount or the amount recorded with a split
   share's session, NZD, the bound session, and the current provider environment.
2. **Merchant references are not changed.** Numbered sales already carry
   `TXN_<sale>` / `SPLIT_<split>_TXN_<sale>`, retail token sales `TAPT_<attempt>`, and
   invoices `RENT-`/`JOB-` plus eight characters of the invoice ID; the verifier
   compares those as they are. A per-share invoice reference stays an R3 question.
3. Migration `0034` (R2-T4) is still applied nowhere; T5 derives a retail attempt's
   expected values from its sale when the attempt has none, so it works before and
   after `0034`.

## Consequence the owner should check in UAT

Plan §9.1 forbids turning an unknown outcome into a decline. After T5, a session that
Windcave reports as not complete, or complete with no transaction (an abandoned or
cancelled card page, as far as the documentation shows), stays "being checked" instead
of being recorded as declined. On a retail link that keeps the share busy until it is
reconciled (R3 adds the expiry). If UAT shows Windcave reports a cancelled page as a
complete session with no transaction, recording it as cancelled is a one-line change
that needs the owner's decision.

## Rollback

Revert the T5 commit; no data or schema changes.
