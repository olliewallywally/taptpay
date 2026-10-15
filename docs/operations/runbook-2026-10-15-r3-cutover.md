# Runbook — R3 cutover gate (2026-10-15)

Run once on any database an earlier build has used (the test database first), **with the app
stopped**, after the migrations through 0050 are applied ([0049–0050 runbook](runbook-2026-10-15-apply-0049-0050.md))
and **before** the R3 build first boots.
Claude does not run this against a shared database. It prints counts only, never row values.

Why ([R3 integration §5](../evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md)):

- A retail payment in progress under the pre-R3 route has no provider account or request
  fingerprint, so R3 can neither settle nor recover it. It must finish under the old build.
- Earlier builds had no delivery loop: they announced each event themselves and left its outbox
  row pending. R3's delivery loop starts with the database and would announce those events
  again (emails, pushes, live updates). Those rows are retired, not delivered.

## Steps

1. Stop the app. Note the time as `T` (UTC, ISO, e.g. `2026-10-20T01:00:00Z`).
2. Check: `DATABASE_URL=… node --import tsx scripts/r3-cutover.ts check --before=T`
   - `"ok": true` → go to step 5.
   - `liveRetailMissingExpectations` > 0 → start the **old** build, let those payments finish,
     stop it, and repeat from step 1. If the count has not reached 0 after about 30 minutes
     (a payer who left a payment page open), stop and send Claude the count: those attempts
     need a reviewed decision, not a guess.
   - any other preflight count > 0 → stop and send Claude the printed counts.
   - `legacyUndeliveredOutbox` listed → step 3.
3. Dry run: `… scripts/r3-cutover.ts retire --before=T` shows `eligible`, retiring nothing.
4. Apply: `… scripts/r3-cutover.ts retire --before=T --apply`. The gate it prints must say
   `"ok": true`.
5. Start the R3 build.

Retiring only marks rows `complete`; no event, payment or merchant row is changed. A row any
delivery loop has touched, or one written after `T`, is never retired.
