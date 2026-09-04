# R0-T5 / R0-T7 containment evidence — 2026-09-04

## Scope

- Disabled Tap to Pay and merchant NFC initiation before billing or transaction writes.
- Removed the public NFC-completion and Windcave simulator routes.
- Removed provider-absence success fallbacks from payment creation, completion,
  callbacks, notifications, refunds, and invoice checkout flows.
- Disabled refund initiation before reservation or refund creation.
- Hid the disabled ecommerce API behind a public `404` before API-key lookup.
- Tombstoned unfinished digital-wallet processing and required authentication for
  the processing routes.
- Removed merchant-owned Windcave credential input from the update schema and
  Settings client; readiness now derives from centralized platform capability.
- Removed tracked runtime credential assignments from `.replit`.

## Verification

- `npm run check`: pass.
- `npm run test:client`: 52 suites, 486 tests pass.
- `npm run test:server` (with loopback permission): 30 suites, 405 tests pass.
- `npm run build`: pass; no database migration command is invoked.
- Focused R0 suites: 14 tests pass, including all original containment assertions.

## Operator follow-up (not satisfied by repository changes)

Repository removal does not revoke credentials already present in Git history.
The JWT signing secret, admin password hash/password, VAPID keypair, Windcave
credentials, database credentials, OAuth secrets, Xero secret, cron secret, and
payment-return-state secret must be inventoried, rotated at their owning systems,
installed through the deployment secret store, and verified independently. No
rotation values should be placed in this repository or evidence directory.

The 41 ignored local backup files recorded in R0-T0 remain quarantined and require
human classification before deletion or retention can be signed off.
