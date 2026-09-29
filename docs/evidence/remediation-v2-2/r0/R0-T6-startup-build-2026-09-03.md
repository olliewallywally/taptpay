# R0-T6 — startup and build side-effect containment

Date: 2026-09-03 UTC

## Changes

- Removed the automatic on-boot and daily database dump block from
  `server/index.ts`, including its child-process launcher.
- Changed the Replit deployment build command to exactly
  `npm run build`. Migration remains a separate, explicitly approved release
  operation.
- Added a source contract proving normal startup contains no backup launcher,
  the deployment build contains no migration/seed/backup action, and database
  dumps remain ignored and absent from the isolated worktree.

The operator-only backup script remains available for a future hardened manual
workflow. It is no longer reachable from application startup or deployment
builds. No backup file was opened, created, moved, or deleted.

## Verification

- `r0-t6.test.ts`: 3/3 passed.
- The original R0 startup-backup assertion is now green; five unrelated R0-T5
  and R0-T7 assertions remain red as expected.
- `npm run check`: passed.
- `npm run build`: passed. The build completed compilation without invoking the
  migration runner or connecting to a database.
- `git diff --check`: passed.

No server was started, no migration was applied, and no external provider or
production system was contacted.
