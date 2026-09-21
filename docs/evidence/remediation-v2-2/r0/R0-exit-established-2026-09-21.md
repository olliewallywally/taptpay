# R0 exit — established 2026-09-21

Date: 2026-09-21 UTC. Branch: `remediation/r1-continuation-20260907`; gate run on `4a9129df`
(code identical to `a25aaf09`; the later commit is documentation only).
Supersedes the status line of [R0-exit-gate-assessment-2026-09-12](R0-exit-gate-assessment-2026-09-12.md),
which found every engineering criterion passing and R0 exit waiting only on three owner tasks.
All three were closed by the owner on 2026-09-14. The owner's instruction today, after the
production question was answered ([record](../../../decisions/2026-09-21-production-offline-owner-answer.md)),
verbatim: **"ok lets move on to the next phase"**.

## The gate, line by line (plan source: `attached_assets/full_intergration_plan_-_taptpay_1787816180424.txt`, R0.D)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Secret rotation and exposure review recorded by the incident owner (H1–H5) | ✅ owner-attested | H1 closed — "No, nothing happened" ([record](../../../decisions/2026-09-14-r0-h1-no-incident-disposition.md)); H2 every named credential rotated, deleted or waived (2026-09-12 records); H3 attested through H2's records; H4 closed on attestation ([record](../../../decisions/2026-09-14-r0-h4-access-log-review-disposition.md)); H5 closed, tracked uploads removed ([record](../../../decisions/2026-09-14-r0-h5-tracked-uploads-deletion.md)). These are the owner's statements; no agent re-tested them, and none can — see "What this does not establish". |
| 2 | Fake-approval routes unreachable in a production-mode test (T5) | ✅ | In today's server suite (below); unchanged since [R0-T5 wallet-validate record](R0-T5-wallet-validate-auth-and-dead-code-2026-09-11.md). |
| 3 | Transaction clearing cannot delete; `clearTransactions` gone from all three storage locations (T4) | ✅ | R0-T1 test 1 and the R0-T4 suites pass today. |
| 4 | Production seeding impossible under every flag value (T4) | ✅ | R0-T1 tests 5–6 and `r0-t4-runtime-safety` pass today. |
| 5 | Automatic production dumps removed from startup; build makes no database connection (T6) | ✅ fresh | R0-T1 test 7 passes; `npm run build` exit 0 **with `DATABASE_URL`, `NEON_DATABASE_URL` and every `PG*` variable removed from its environment**. |
| 6 | Empty and restored databases converge; startup/build run no DDL; adoption cannot touch an unknown target (T6A) | ✅ | [T6A closure, 2026-09-10](R0-T6A-closure-2026-09-10.md). Empty-database convergence re-proven today with all 27 migrations through CI's exact steps, fingerprint byte-identical ([gate evidence §10](../r1/R1-T7-gap13-ownership-inventory-gate-2026-09-21.md#10-re-verification-after-a-container-reboot-and-two-drafting-fixes-2026-09-21-late)). |
| 7 | All nine T1 tests pass; original failure output preserved | ✅ fresh | `r0-containment.test.ts` 9 / 9 today; the 9 / 9 red run is preserved in [R0-T0 baseline §"R0-T1 failing-test evidence"](R0-T0-baseline-2026-08-31.md). |
| 8 | `npm run check`, `test:client`, `test:server`, `build` and the device smoke matrix pass | ✅ fresh | `tsc` clean; client **57 / 511**; server **64 / 1272**; build exit 0; device smoke **20 / 20** (phone, tablet, desktop and the D10 short desktop × 5 routes; `vite preview` of today's build on loopback, APIs intercepted with synthetic fixtures, no application server or database); `git diff --check` clean. |
| 9 | Legitimate provider reconciliation preserved or covered by a runbook | ✅ | No Windcave credentials are configured in any environment this session can see; nothing in flight to preserve. |

Warnings recorded, as §8.1 requires: the build reports chunks over 500 kB (the lazily loaded PDF
engine, `savePdf-*.js`, 1.46 MB); the client suite prints 18 React `act(...)` warnings, all from
`Settings` — they belong to R1-T8, which the plan tasks with removing them.

## What this does not establish

- **Owner attestations are not agent verification.** H1, H3 and H4 rest on the owner's word; this
  record repeats that caveat rather than upgrading it.
- **Nothing reached production.** Production is deliberately private and its database endpoint is
  disabled ([record](../../../decisions/2026-09-21-production-offline-owner-answer.md)). Migrations
  `0022`–`0025` are R1 work; each keeps its own production preflight and approval.
- **Carried forward, not exit criteria:** R0-T3 real-device push resubscribe; R0-T6 a real restore
  proof and the restore-ACL repair exercised on a real restore; R0-T7 independent IAM/audit-log and
  old-credential-rejection checks; history cleanup of `origin/main`'s `.claude-home/` before the
  repository is ever public again.
- **Rollback constraint (plan R0.D):** an R0 rollback may never restore fake-payment, seed,
  destructive or compromised-secret behaviour, and secrets are never rolled back.

## What it unblocks

R1 tasks gated on "R0 exit": **R1-T1** (the harness audit — injection and no-network proof),
**R1-T4** (OAuth, sessions, reset, CORS, shared throttling) and **R1-T8** (the hook-order crash;
R1-H1 was already accepted on 2026-09-14). Their other dependencies are unchanged.
