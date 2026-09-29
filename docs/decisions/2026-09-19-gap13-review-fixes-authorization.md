# Gap 13 — authorization to fix independent review findings

Date: 2026-09-19 UTC.

Owner instruction, verbatim: “ok please fix all issues, be careful and detailed to ensure nothing is missed”.

Scope: fix the findings in the independent review of `454f4120..b0da2f08`, add
meaningful regression evidence, and correct unsafe migration/rollback guidance.
S1–S5 remain in force: platform admin reads are permitted and audited; files are
retained; customer reads use the invoice token; foreign attachments are refused;
foreign/missing merchant downloads return indistinguishable 404 responses.

This authorizes code and synthetic verification. It does not authorize a live
database migration or production deployment. The availability impact of removing
unproven ownership from existing invoice documents is separately pending an
explicit owner answer; it is not silently inferred from this instruction.

Implementation evidence: [review fixes](../evidence/remediation-v2-2/r1/R1-T7-gap13-review-fixes-2026-09-19.md).
