# Owner-confirmed Google Analytics key deletion

Date: 2026-09-12 UTC.
Status: deletion reported complete by Oliver; no independent provider verification.

Oliver reported "google keys are both now gone" and, when asked whether this
meant the Analytics service-account keys or Google sign-in credentials, confirmed
"yes the analytics keys".

This closes the pending owner deletion action for these two exposed keys:

| Project | Service account | Key ID prefix |
| --- | --- | --- |
| `upbeat-nation-489422-u4` | `taptpay-analytics` | `7b85d31e7946` |
| `swift-cursor-492707-t7` | `taptpay-analytics` | `74e40c04f272` |

The five exact `private-key` disposition records for the two asset paths in
[the exposure record](../evidence/remediation-v2-2/r0/R0-T7-gcp-key-exposure-2026-09-09.md)
are marked `rotated` (the scanner's vocabulary includes revocation/deletion),
based on that owner confirmation. No other finding is cleared.

No agent accessed Google Cloud, used an old key, created a replacement, inspected
secret values or changed Replit Secrets. The date records the owner's report;
the exact deletion time was not supplied. IAM-role and audit-log reviews remain
open, as does independent old-credential rejection evidence under R0-H3.

This decision does not cover `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, Figma,
the production database password, JWT/admin credentials or any other incident
check. R0-H2 and the overall R0 exit remain open. Historical exposure records
remain preserved; this dated decision supersedes only their outstanding deletion
status for these two Analytics keys.
