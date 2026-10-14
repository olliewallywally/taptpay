# Claude repository handoff

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
0034, and R3's `payment_attempts` trigger would refuse R2's writes. **The owner chose Option A
(2026-10-12, `docs/decisions/2026-10-12-r2-r3-option-a-owner-decision.md`): R2's columns stay
the retail representation and R3 adapts — the exact R3 changes (renumber to 0036, drop its
duplicate expectations table and `processor_transaction_id`, write-once trigger for R2's
columns, verify through R2's verifier) are in
`docs/evidence/remediation-v2-2/R2-R3-OPTION-A-ADAPTATION-2026-10-12.md`.** R4 (durable
refunds): preflight at `docs/evidence/remediation-v2-2/r4/R4-preflight-2026-10-12.md`; R4-T1
(refund provider boundary, no schema) is implemented on the R2 branch
(`docs/evidence/remediation-v2-2/r4/R4-T1-2026-10-12.md`); R4-T2 onward wait for the merged
R2+R3 tree.

The active R3 handoff is `docs/HANDOFF-2026-10-12-r3-durability-foundation.md`.
Claude owns all of R2; Codex owns R3. R2 `14942392` is integrated into the R3
working branch, with canonical retail storage and migrations 0034–0037. Read
`docs/decisions/2026-10-12-r2-r3-schema-integration.md` and the R3 integration
review before further migration work. R3 route convergence remains incomplete;
the phase is not closed, and there is no deployment approval.

**R2 and R3 are merged on `ccr-e07e3100-0wm8kr` (2026-10-13).** Codex's `27d235b8`
(migrations 0036–0038, cash commands) is merged with R4-T1. Claude's independent review is
`docs/evidence/remediation-v2-2/r3/R2-R3-MERGE-REVIEW-2026-10-13.md`. Two merge fixes are in it:
B-1, a failed session creation no longer locks a sale, and B-2, the cash write names its
business. R3's worker/inbox stays unmounted until the review's H-1–H-3 are fixed. OI-1 and
OI-2 are owner decisions. The owner applies 0034–0038 to the test database by
`docs/operations/runbook-2026-10-13-apply-0034-0038-test-database.md`, with the app stopped.
R4-T2 onward may now start on this branch.

**2026-10-14:** OI-1/OI-2 and the merge review's outstanding items are done; read
`docs/evidence/remediation-v2-2/r3/OUTSTANDING-2026-10-14.md`. It has one owner question:
recording a verified payment from a merchant route (R1-T7). R4-T2's ADR is
`docs/decisions/2026-10-14-r4-t2-refund-operation-schema.md`, revision 2: pass 4 refused
revision 1.
**R4-T2 is implemented (2026-10-14):** migration 0039, approved in pass 6 after passes 4 and 5
refused earlier revisions; read `docs/evidence/remediation-v2-2/r4/R4-T2-2026-10-14.md`. 0039 is
applied nowhere (owner runbook `docs/operations/runbook-2026-10-14-apply-0039-refund-operations.md`).
R4-T3 is next and must follow the ADR's lock-order, send-intent and lease rules.

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
