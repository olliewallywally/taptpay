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
