# Owner disposition — no further JWT/admin credential action

Date: 2026-09-12 UTC.
Status: owner directs no further action; rotation or revocation not claimed.

Oliver instructed: "ok please forget the JWT and admin creds". In the context
of the preceding Figma disposition, this removes `JWT_SECRET` and the admin
password behind `ADMIN_PASSWORD_HASH` from the owner's actionable integration
checklist. Do not repeatedly prompt for their rotation or confirmation.

Record these as owner-accepted exceptions for this continuation. Preserve the
historical exposure findings. No replacement, revocation, rejection test or
current-credential comparison has been reported or performed in this turn.
The decision does not establish that exposed credentials were harmless or that
they no longer authenticate.

Existing scanner dispositions remain unchanged: `rotated` would incorrectly
assert a completed credential action. Do not suppress findings or weaken the
scanner. Release evidence must distinguish these owner exceptions from verified
technical completion. This decision alone does not close R0 or approve release.

This record supersedes outstanding owner action requests for JWT/admin credentials
only. It does not cover the production database password, Google sign-in
credentials, provider keys or unrelated incident checks. No runtime, credential,
provider, production or financial-data changes were made.
