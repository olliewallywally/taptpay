# R0-T7 repository safeguards — implementation preflight

Base: `ec2072795fa3adc48b508e227884b3837685a3aa`.
Branch: `remediation/r1-continuation-20260907`; inherited dirty work preserved.

## Verification of Prior Fixes

The September 4 T5/T7 record proves the tracked runtime block was removed.
The September 7 T6 implementation removes ambient backups and protects the
operator command. Neither handoff claims operational R0 acceptance.

## Blocking Issues

None for completing repository-only T7 safeguards. T5/T6 deployment/device and
restore acceptance remain open and still block R0 exit and additional R1 work.

## High-Risk Concerns

Scanner output can contain secrets, author emails and source snippets even when
called a report. Never print scanner diagnostics or upload its native reports.
Local ignored backups/uploads and AI state must not be opened by a tree scan.

## Missing Steps

Add the blank environment-key inventory, precise ignore rules, an independent
read-only CI scanner and the owner rotation/verification runbook. Capture missing
safeguards in failing tests first. Scan tracked/current nonignored source and Git
history with a pinned Gitleaks release and metadata-only output.

## Unsafe Assumptions

An empty allowlist does not prove a clean repository. Do not suppress findings,
exclude all tests or baseline history to make CI green. Ignoring runtime uploads
does not untrack or authorize deleting the existing uploads.

## Required Ordering Changes

Finish containment safeguards before new integration features. No schema or
application changes, real-provider calls, credential rotation or deployment.

## Open Product / Provider / Legal Questions

Honor the September 7 H2 owner disposition. H4 incident review and H5 retention
decisions remain with their named owners; new findings need their disposition.

## Compliance and Data-Handling Notes

Use key names with blank values only. Scan reports expose rule, file, commit and
status only. Preserve all original source/assets and retained data.

## Test and Rollback Adequacy

Test missing/invalid scanner, findings and diagnostic suppression, inventory
coverage, ignore boundaries and preservation of sanitized fixtures/migrations.
Repository-only rollback; never restore tracked credentials.

## Final Recommendation

Approve this bounded repository-safeguard implementation. This is a local
engineering review, not R0 exit, incident closure or operational approval.

Separate reread: checked the scope against P2, R0-T7, P8.3 and yesterday's
continuation. No unresolved implementation blocker; scanner findings must remain
blocking until individually reviewed. Existing gates are unchanged.
