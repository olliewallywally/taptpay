# Claude repository handoff

**R8 first repository slice is on `remediation/r8-ci-20261016`.** Read
`docs/HANDOFF-2026-10-16-r8-inflight.md` first, then the R8 verification and
truthfulness runbooks. Node22.23.3/npm10.9.9, isolated CI/PG/browser tooling,
critical dependency repairs, dead auth-package removal, zero-new-error lint and
unsupported ecommerce/documentation corrections are implemented. Full isolated
client/server regression passed 1507/5249 tests with zero open handles. Final
browser/tooling evidence and the precise push state are in the handoff; verify
Git rather than assuming a background task completed. R8 remains open for high
advisories, unresolved history findings, production-install/dependency hygiene
and real-target/professional release evidence. No deployment or phase exit.
Claude retains R4. Preserve owner PID4196 and root node_modules; updated dependency
validation uses a private isolated install. Keep D13 and all deferred gates.

**R7 repository implementation and available regression are complete on
`remediation/r7-capabilities-20261015`.** Source `62a80d9c` is pushed:
locked D13, retired fake native/JS/wallet/attended paths,
truthful no-effect refusal, narrowed native navigation and a coherent verified
web snapshot. Read `docs/HANDOFF-2026-10-15-r7-capabilities.md` and
`docs/operations/r7-native-capability-release.md` first. Final evidence records
1506 client tests,270 server tests,2 artifact-guard tests and316 browser cells
(including all88 tutorial cells) passed. Native Xcode/device/redirect evidence,
owner visual acceptance and release sign-off remain open. This is not deployment,
native enablement or official phase exit. Exact Apple and production HPP hosts
remain allowed for existing cookie/sessionStorage-bound flows; no wildcard.
Claude retains R4. Preserve owner PID4196 and all deferred release gates.

**R6 repository work is pushed on `remediation/r6-operations-20261015`.** Read
`docs/HANDOFF-2026-10-15-r6-entitlements.md` first for owner-approved D9,
verified entitlement/provenance implementation, frozen0049b and remaining release
inputs. D9 is no longer pending; live activation/UAT/operations evidence remains.
Then read
`docs/HANDOFF-2026-10-15-r6-readiness.md` for the health/readiness and bounded
shutdown follow-up, then
`docs/HANDOFF-2026-10-15-r6-cron-inflight.md` for the verified durable-cron
repository step and frozen0049a. Then read
`docs/HANDOFF-2026-10-15-r6-inflight.md` for the verified first logging/inventory
slice and historical pending decisions/work, now superseded by the newer handoffs. It is
not a phase-complete or deployment handoff. Preserve owner app PID4196.

**R5 repository implementation completed on `remediation/r5-encryption-20261014`
(October 14).** Read `docs/HANDOFF-2026-10-14-r5-repository-complete.md`, its frozen
verification/source manifest and final review before further R5 or migration work.
T1–T4 tooling covers bank data, active card credentials and recoverable payer links.
0048a/b/c are frozen after owned synthetic application; shared/live policies are
not activated. Claude owns R4; canonical R4 integration, owner retention/credential
choices and real-target evidence remain. No deployment or official R3/R5 exit is
implied. The earlier R5-start handoff is historical.

Owner deferred R5's remaining release closeout on October15 while R6 continues;
track the open checks in `docs/operations/r5-deferred-closeout.md`. Deferred does
not mean waived or deployed. Durable cron coordination/status is verified as a
repository step. Health/readiness and bounded full-server shutdown follow-up is
recorded in its handoff. D9 repository work is implemented in the newest handoff;
official R6 exit remains gated on real-target
entitlement evidence, actual UAT and external operations activation.

Before committing, pushing, or changing the current uncommitted merchant work, read:

- replit.md
- .agents/memory/MEMORY.md
- docs/HANDOFF-2026-07-20-onboarding-billing-tutorial.md

The 2026-07-20 handoff is authoritative for the onboarding redesign, billing-card prerequisite, crypto-payment removal, tutorial mode, migrations, test status, and staging exclusions.

If you are working on branch `remediation/r1-continuation-20260907` (the TaptPay security
remediation program — this is the currently active branch as of 2026-09-14), read these before
doing anything:

- `docs/evidence/remediation-v2-2/CONTINUATION-2026-09-07.md` — the full execution ledger: what's
  closed, escalated, or still open. Read its most recent entries first, they supersede older ones.
- The newest `docs/HANDOFF-2026-09-14-*.md` file — the immediate in-flight state, including any
  live background-workflow task/run IDs.
- `docs/PLAN-2026-08-24-taptpay-remediation-v2-2.md` — the authoritative remediation plan,
  including §21.1's required reviewer-pass template.

The immediate R1-T10 handover is now `docs/HANDOFF-2026-10-12-r1-t10-terminal-followup.md`.
Read it after the ledger; it records terminal contrast/name repairs, actual keypad
operations, corrected golden fixtures, exact frozen builds, completed reduced
motion tutorials and the owner decision to retain the property feed-under-dock
layout. Historical October 11 evidence remains linked; actual devices, owner
visual/golden acceptance and independent review are still open. Claude owns task 7
and the stock hidden-focus review. The next-task readiness review is linked there.
Then read `docs/HANDOFF-2026-10-11-review-findings-fixes.md`: an independent review of
the last two pushes and its fixes on `ccr-e07e3100-0wm8kr`, including an open zoom-detection
finding for the owner.

**R2 has started (2026-10-11) on `ccr-e07e3100-0wm8kr` while Codex finishes R1.** Read
`docs/evidence/remediation-v2-2/r2/R2-preflight-2026-10-11.md` and its §21.1 review pass
before any R2 work. Passes 1–2 approved T1–T3 only; they are implemented (see
`docs/evidence/remediation-v2-2/r2/R2-T1-T3-2026-10-11.md`). T4 is implemented as repository
work (`docs/evidence/remediation-v2-2/r2/R2-T4-2026-10-12.md`); migration 0034 is applied nowhere.
T5 is implemented on every enabled completion path, retail, numbered and invoice
(`docs/evidence/remediation-v2-2/r2/R2-T5-2026-10-12.md`). T6 is implemented and the R2 exit
record is `docs/evidence/remediation-v2-2/r2/R2-exit-2026-10-12.md`: repository work is complete
for the enabled flows, but R2 is not closed until the owner items listed there are decided.
T7 (migration 0035, unique X-ID) is implemented, applied nowhere. The owner will review R1–R2 together.

**Before merging R2 and Codex's R3 (`fix/qwen-aligned-20261010`), read
`docs/evidence/remediation-v2-2/R2-R3-SCHEMA-CONFLICT-2026-10-12.md`:** both added a migration
0034, and R3's `payment_attempts` trigger would refuse R2's writes. The owner decides the
representation. R4 (durable refunds) has a preflight at
`docs/evidence/remediation-v2-2/r4/R4-preflight-2026-10-12.md`; its code waits on that decision.

The active R3 handoff is `docs/HANDOFF-2026-10-12-r3-durability-foundation.md`.
Claude owns all of R2; Codex owns R3. R2 `14942392` is integrated into the R3
working branch, with canonical retail storage and migrations 0034–0037. Read
`docs/decisions/2026-10-12-r2-r3-schema-integration.md` and the R3 integration
review before further migration work. R3 route convergence remains incomplete;
the phase is not closed, and there is no deployment approval.

This program's established discipline: failing-tests-first; independently re-verify a prior
pass's own claims before trusting them, the way every session in this program has had to;
escalate product/security tradeoffs to the owner rather than deciding them unilaterally; record
every owner decision as its own dated file under `docs/decisions/`. Background workflow/task
state — launched by any agent — does not survive a session or environment boundary. If a handoff
doc names a task/run ID that no longer resolves, treat the doc as intent only and re-derive
ground truth from `git status`/`git diff`, never assume the described outcome happened.

If you are working on branch `feat/tablet-desktop-app` (the tablet/desktop merchant
UI — 3 verticals × 5 screens), read these two before writing any code:

- `docs/HANDOFF-2026-07-28-tablet-desktop-app.md` — what is built, the build/verify
  loop, schema traps, and the next actions. Start here.
- `docs/PLAN-2026-07-24-tablet-desktop-app.md` — the authoritative spec it implements.

That work carries a list of deliberate design deviations that Oliver wants raised as
a single list when the integration is finished — see §6 of the handoff. Do not
silently "fix" them mid-stream.

There is ~1 hour of uncommitted, unreviewed work in the tree from an interrupted
review pass, and the tree is currently in a broken state that looks fine. Before
running or committing anything, read:

- `docs/PLAN-2026-08-10-finish-review-and-fix.md` — what that pass landed, the
  decisions awaiting Oliver, and the ordered path to finishing it. Step 0 (apply the
  three pending migrations) comes before everything else.

Do not blindly run git add -A. Exclude .claude-home/** and .claude/settings.local.json, preserve the requested source changes, and review the generated client/public/app hash rollover as a single unit.
