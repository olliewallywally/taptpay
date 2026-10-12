# Owner direction — proceed to R2-T6

Date: 2026-10-12 UTC. Owner: Oliver.
Branch: `ccr-e07e3100-0wm8kr` at `1359e646` (R2-T1–T5 pushed).

## Direction

The owner wrote, verbatim:

> Commit, push and move to the next

R2-T5 was already committed and pushed (`657134de`, `1359e646`); "the next" is R2-T6
(plan §9.6: the R2 test matrix, the no-raw-provider-data logging guard, and the R2 exit
record), per the [R2 preflight](../evidence/remediation-v2-2/r2/R2-preflight-2026-10-11.md) §3.

## Defaults applied (for the owner's R1–R2 review)

The [T6 review](../evidence/remediation-v2-2/r2/R2-T6-review-2026-10-12.md) found that
the subscription card-on-file flow (card setup, its read-back and the stored-card charge)
was outside T1–T5. Hardening that changes nothing for a well-formed provider reply is
applied: the card-setup page link is held to its documented relation and the mode's host,
the callback addresses to `PUBLIC_ORIGIN`, provider redirects are never followed, and
provider reply text never leaves `server/windcave.ts`.

Stricter checks that could refuse a real reply are applied **only where the reply carries
the field**: the stored-card read-back's session ID, and a stored-card charge's amount,
currency, reference and type. The repository's fixtures for these replies omit those
fields, and requiring them without an official UAT fixture could stop renewals. Whether to
require them is the owner's decision after UAT shows the real reply shape (one-line change
each).

## Rollback

Revert the T6 commits; no data or schema change.
