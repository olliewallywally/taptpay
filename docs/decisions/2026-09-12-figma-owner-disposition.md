# Owner disposition — no further Figma deletion action

Date: 2026-09-12 UTC.
Status: owner directs no further action; revocation not claimed.

Oliver instructed: "figma is pointless to delete, please forget about ti as it
bears no issue on this."

This supersedes the earlier owner direction to delete the unused Figma OAuth app.
Remove Figma deletion from the owner's actionable integration checklist and do
not repeatedly prompt for it. Record the exposure as an owner-accepted exception
for this continuation, not an outstanding requested deletion task.

The local credential entry was previously deleted. No provider-side deletion or
revocation has been reported or verified. This instruction is an owner decision
not to pursue the action; it does not establish that the historical exposure was
harmless or that the credential no longer authenticates.

Preserve the historical exposure evidence and the existing `exposed-unresolved`
scanner dispositions: the scanner has no accepted-risk category, and `rotated`
would incorrectly assert revocation. Do not weaken or suppress the scan to turn
this decision into a passing technical check. Scanner/release evidence must
identify this owner exception separately from actionable credential work. This
decision alone does not close the remaining R0 or final release gates.

No credential, provider application, scanner code, production configuration or
financial data was changed. This record covers Figma only.
