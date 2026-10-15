# R5 deferred closeout — still required before release

Owner direction, October15 2026: “Ok mark those things to close of r5 for later.
Please continue with the next step.” R5 repository implementation is complete at
3534978f. These live-target checks are deferred while R6 continues; they are not
waived, completed, or permission to deploy/enable charging.

- [ ] Record the unused merchant Windcave credential disposition: delete, or
  temporary encryption with an approved deletion date and review reference.
- [ ] Record D8 bank retention/deletion dates, backup access/retention windows,
  key availability and the approved rollback/contract window.
- [ ] Select the real target securely, review the counts-only preflight, deploy
  complete readers/writers and explicitly activate both encrypted scopes.
- [ ] Run and verify the real backfills, prove zero plaintext in the agreed scope,
  and perform an authorized restore/decrypt drill with the retained keyring.
- [ ] Review and integrate Claude's R4 against canonical R3/R5 migration history;
  preserve every applied migration name/checksum and use reviewed forward fixes.
- [ ] Complete actual Windcave UAT and a production-sized migration rehearsal
  before the combined release. Synthetic tests do not supply provider evidence.

Source: [R5 completed-repository handoff](../HANDOFF-2026-10-14-r5-repository-complete.md),
“Remaining official phase exit / owner actions”; use its frozen evidence and
[rollout runbook](r5-encryption-rollout.md). Assign the actual release operator and
record dated evidence/sign-off here when each item is done. No dates or approvals
are inferred. R6's separate D9 and UAT obligations also remain open.
