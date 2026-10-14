# R5 encrypted restore convergence repair

## Verification of Prior Fixes

The actual encrypted pg_dump/pg_restore drill succeeds but strict schema equality
fails for R3's `invoice_attempt_payer_email_check`: BETWEEN originally builds a
nested AND expression, whereas the dumped expanded comparisons parse as one AND.

## Blocking Issues

Owned synthetic scratch proof 17/18 passed before the restore comparison failed.
Both definitions have the same three tests: length >= 3, length <= 254 and @ after
position 1; nullable email remains permitted. All other fingerprint sections match.
Applied 0040, 0048a and 0048b checksums stay immutable.

## High-Risk Concerns

Successful dump/restore does not currently reproduce identical catalog text for
that one constraint. Do not normalize arbitrary constraints or relax fingerprint CI.

## Missing Steps

Add forward 0048c replacing this named constraint with the identical expanded AND
expression, then rerun fresh/restored migrations and both encrypted restore proofs.

## Unsafe Assumptions

Equivalent validation alone is insufficient evidence for an unchanged fingerprint.
No claim about target data is made from the synthetic fixture.

## Required Ordering Changes

0048c follows 0048a/b. Real migration runner owns atomic DDL; existing validation
stays effective until transaction commit. R4 canonical ordering still needs review.

## Open Product / Provider / Legal Questions

None introduced by this syntax-only convergence repair. Existing D8 and rollout
approval gates remain.

## Compliance and Data-Handling Notes

No credentials, row values or email values appear in evidence. No data updates,
constraint weakening, ledger rewriting or applied migration edits are proposed.

## Test and Rollback Adequacy

Require all constraint/index/trigger/routine/ACL fingerprint sections equal on
fresh schema, populated migration and encrypted logical restore. Re-run migration
inventory/framing/parity tests. Production-sized lock/runtime rehearsal remains.

## Final Recommendation (Approve / Do not approve)

**Approve** this precise forward repair in owned synthetic/repository scope.
Separately recorded reread before implementation: compared both actual
pg_get_constraintdef results with immutable 0040 source; checked original inclusive
bounds and NULL behavior, named constraint replacement, transaction framing and
CI implications. Same recommendation after reread. No external reviewer claimed.

Final documentation reread corrected the first three heading labels to the exact
§21.1 template; the substantive proposal and separately recorded reread above
were written before 0048c implementation. No external review is implied.
