# Google Analytics service-account attachment — key removal

Date: 2026-09-08 UTC. Owner direction: “remove the secret or mark as deactivated”.

Removed the private-key value from
`attached_assets/Pasted--type-service-account-project-id-swift-cursor-492707-t7_1775633514319.txt`
by replacing its `private_key` value with an empty string. Preserved the remaining
attachment content. Verified one value removed and zero remaining private-key
PEM blocks in this file. No key value appears in this record or tool output.

Disposition: **removed from the current working tree; Google deactivation not
verified**. No provider console or deployed environment was changed. The removal
is uncommitted and does not erase the original from Git history. Historical scan
findings remain valid; this record is not an allowlist or R0 exit approval.
