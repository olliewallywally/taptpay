# Owner decision — retain the phone Transactions swipe layout

Date: 2026-10-08 UTC. Owner: Oliver.
Branch: `remediation/r1-continuation-20260907`.
Authority: supplied full integration plan R1-T10 and its accepted phone baseline.

## Context and alternatives

The expanded device verifier found the phone Transactions page's last visible
history row partly clipped by the collapsed swipe sheet. Changing the initial
sheet position would alter the accepted phone layout. The two presented choices
were to show complete rows on first load or retain the swipe layout and verify
complete text after expanding it.

## Decision

The owner selected, verbatim:

> Keep the swipe layout; verify text after expansion

Preserve the application layout. For this exact phone Transactions cell, capture
the initial geometry, expand the sheet through its real drag handle, then require
readable text and all existing request/error/tap checks in the expanded state.
This is an interaction-specific acceptance decision, not a general allowance for
clipped labels, ignored errors or failed requests on other screens.

## Consequences, rollback and evidence

R1-T10c-2 verifies this cell after the existing interaction. The original first-load
finding and before/after measurements remain in the evidence. No golden image is
updated, no other phone layout changes, and no release is authorized. A different
initial sheet layout needs a superseding owner decision. Reverting verification
to first load restores the observed clipping finding without changing app code.

Evidence: `docs/evidence/remediation-v2-2/r1/R1-T10c-2-preflight-2026-10-08.md` and
the final T10c-2 measurements record.
