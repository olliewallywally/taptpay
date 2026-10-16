## Verification of Prior Fixes
Pinned checksum-verified gitleaks8.30.1 found61 current-tree candidates. Read the
actual metadata/source shape without printing credential values:57 are exact
public source/build SHA256 rows in historical evidence;2 are occurrences of one
synthetic account password in the owned admin-delete verifier;2 are loopback URI
templates with a literal `<port>`. Historical evidence files remain unchanged.
## Blocking Issues
History still contains unresolved findings. No rotation/revocation or blanket
history approval is asserted by this classification. High dependency findings
also remain a separate release blocker.
## High-Risk Concerns
Never exempt an evidence file, commit, all hashes or all fixtures. Keep remote
URI detection and credential detection within the same evidence file.
## Missing Steps
Use exact file AND full checksum-row matches, a file-scoped literal synthetic
password exception, and extend the existing loopback-only exclusion to literal
port templates. Run positive/negative scanner tests, tree and history separately.
## Unsafe Assumptions
A checksum-looking string is not enough. These rows explicitly map source/build
artifact paths to64-hex digests; inspected fields are `.js/.mjs/.ts/.tsx/.css`
artifacts. The synthetic password is only in a guard-bound disposable verifier.
No unknown password is classified merely from its length or entropy.
## Required Ordering Changes
Red tests were recorded before these config repairs. Re-run all scanner safety
tests and both real scans before recording the result. History runs even if tree
fails so one failure cannot hide the other stage's status.
## Open Product / Provider / Legal Questions
Real credential lifecycle decisions need their existing owner/provider evidence;
they cannot be marked rotated by this review. No owner tradeoff is needed to
classify demonstrably public checksums or a known local test account.
## Compliance and Data-Handling Notes
Scanner output stays rule/file/commit/status only. Diagnostic line metadata and
native100% redaction were used locally; no credential values or author metadata
were emitted into repository evidence. No raw reports are uploaded.
## Test and Rollback Adequacy
16 scanner/config tests pass. Planted credentials in the same allowed evidence
file still fail; the same known hash used as a credential elsewhere still fails;
a remote URI with a templated port still fails. Existing ignored/tracked/symlink,
deleted-history, malformed-disposition and unresolved-exposure tests stay intact.
Current tree passes. History's nonzero status remains visible and blocks release.
## Final Recommendation (Approve / Do not approve)
**Approve** the narrow false-positive repairs and metadata-only reporting.
Separate independent reread checked every reported checksum field, both synthetic
password occurrences, current loopback policy, exact allowlist conditions and the
negative tests. Same scoped Approve. No production/security-history clearance.
