# Integration continuation — R0-T5, PDF page 17

Date: 2026-09-11. Branch: `remediation/r1-continuation-20260907`.
Base: `5c2384360f0c1dccaa39d011c46b45e7b0be0bfd`.
Source: corrected `full_intergration_plan_-_taptpay_1787816180424.txt`;
page references verified against its 72-page sibling PDF.

## Recovered position

Claude's latest commit records development migrations applied and two tracker
corrections. The prior R0-T6A closure is on PDF page 19; R0-T7 is page 20.
The earliest open engineering containment work resumed here is R0-T5 on page 17
(continues on page 18). R0 exit, page 21, remains unestablished. Existing R1
implementation is partial and preserved; it does not waive R0 prerequisites.

The inherited untracked disabled-route test file was preserved and extended.
It passed 10 tests, but its ecommerce request targeted an unregistered URL,
its retry/concurrency assertions allowed any error status, and storage snapshots
alone did not establish absence of provider/SSE/push calls.

## Work completed

- Corrected ecommerce checks to POST `/api/v1/transactions` and GET
  `/api/v1/transactions/:id`, asserting exact 404 responses.
- Added refund-initiation coverage and exact retry/concurrency statuses.
- Intercepted fetch, SSE broadcast and merchant push calls and asserted zero
  calls alongside complete enumerable MemStorage-state snapshots.
- Demonstrated the missed admin containment defect before fixing it: key-list
  test expected 404 but received 200; 11 tests passed and one failed.
- Removed five admin ecommerce placeholder handler bodies: list/create/revoke
  keys, metrics and usage. They now return unavailable 404 responses, with
  authentication and malformed revoke-ID 400 behavior retained. No mock key
  list, hardcoded merchant 1 write or pretend revoke succeeds through them.
- Added concurrent/repeated checks for all five admin routes and asserted their
  storage methods are never called. Updated the prior test that explicitly
  characterized fake revoke success; this implements the mandated R0 correction.
- Corrected the tracker's stale assertion that no live migration was applied:
  the September 10 owner record reports development at 23 applied, zero pending,
  drifted or orphaned. Production remains pending.

Review: [bounded preflight and separate reread](R0-T5-admin-containment-preflight-2026-09-11.md).
No migration, production operation, capability enablement or UI change in this
batch. No commit, push or deploy performed.

## Verification

- Focused containment/admin suites: **4 suites, 110 tests passed**.
- `npm run check`: passed.
- `git diff --check`: passed.
- Full server regression: **47 suites, 922 tests passed**, including runtime
  route-inventory parity. The earlier 98-suite figure in historical evidence is
  not reused as this run's count.

Sandbox socket denial was an infrastructure failure, not a test result.
Approved outside-sandbox HTTP runs use synthetic MemStorage fixtures.

## Remaining gates and next steps

R0-T5 remains partial. These tests do not prove the entire callback/simulation,
provider transport, events/outbox or database-backed no-write matrix. They
intercept fetch/SSE/push, not every possible outbound transport. Complete that
matrix, credential count-only evidence and phone/tablet/desktop smoke before
marking T5 complete. Storage placeholders outside these unreachable admin
handlers are not a real ecommerce implementation.

R0 also retains owner credential revocation/verification, access review,
upload/backup disposition, real-device push acceptance, restore ACL repair and
production release gates. The September 10 decision records a refused production
migration attempt; this continuation does not retry or bypass it. Later R1
policy, password-path, strict-query, OAuth and device gaps remain indexed in the
[full tracker](../CONTINUATION-2026-09-07.md); Apple/Xero code lanes remain gated.

Rollback: revert only this batch's explicit source/test paths if required;
that restores known fake admin behavior and is not a safe deployment state.
Preserve the inherited test file, historical evidence and all unrelated work.
