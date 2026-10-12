# Owner direction — finish what R2 can do; write migration 0035

Date: 2026-10-12 UTC. Owner: Oliver.
Branch: `ccr-e07e3100-0wm8kr` at `9c9126e4` (R2-T1–T6 pushed).

## Direction

Asked whether to write migration 0035 (the processor X-ID unique index, R2 exit record
R-4/O-5) now or leave it for the R1–R2 review, the owner wrote, verbatim:

> Ok commit and push and move to next step. Codex has been working on r3 so skip to next step beyond that along as you are 100% done of what you can do

Read as: finish the R2 work that can be done without the owner, then move to the phase
after R3. Writing 0035 is repository work this session can do; applying it is not.

## What is done under it

- Migration `0035_payment_attempt_processor_x_id_unique.sql`: a partial unique index on
  `payment_attempts.processor_x_id`, gated in the migration on a duplicate check that
  reports counts only. Rehearsed on a disposable local PostgreSQL 16 database.
- The database attach answers a race lost at that index (or 0022's session index) as a
  conflict, as the service's own duplicate check does.

## Still the owner's

- Applying 0034 and 0035, each after a restored-snapshot rehearsal with the count-only
  preflight in the migration headers.
- The other R2 exit items (O-1–O-4, O-7) and residuals R-1, R-2, R-3, R-5.

## Rollback

Revert the T7 commit; if 0035 was applied, the index may stay.
