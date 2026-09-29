# Agent instructions (Codex / any AI)

Read `CLAUDE.md` first — its rules apply to all agents, especially: never `git add -A`; always exclude `.claude-home/**` and `.claude/settings.local.json` from commits. CLAUDE.md's sections are branch-specific — run `git branch --show-current` and read the section that matches before doing anything else.

## If the current branch is `remediation/r1-continuation-20260907`

This is the active branch as of 2026-09-14 — a security-remediation program, not the tablet/desktop app task below. Before doing anything:

- Read `docs/evidence/remediation-v2-2/CONTINUATION-2026-09-07.md` (the execution ledger — read its most recent entries first, they supersede older ones) and the newest `docs/HANDOFF-2026-09-14-*.md` file (immediate in-flight state, including any live background-workflow task/run IDs).
- Background workflow/task state — whether launched by Claude Code, Codex, or anything else — does not survive a session or environment reset (confirmed repeatedly in this program). If a handoff doc names a task/run ID that no longer resolves, treat the doc as intent only and re-derive ground truth from `git status`/`git diff`, the way every prior session here has had to.
- House rules: failing-tests-first; independently re-verify a prior pass's own claims before trusting them; escalate product/security tradeoffs to the owner rather than deciding them unilaterally; record every owner decision as its own dated file under `docs/decisions/`.

## Active task: tablet/desktop merchant app (branch `feat/tablet-desktop-app`)

The full implementation plan is `docs/PLAN-2026-07-24-tablet-desktop-app.md`. Read it end-to-end before writing any code — it contains the architecture, device-gating rules, screen-by-screen API wiring, tutorial adaptation spec, build phases, and acceptance checks.

The design source (interactive prototype + rendered screenshots of all 15 screens) is in `docs/design/desktop-app/` — viewing instructions are in the plan (§2; it must be served over HTTP, not opened via `file://`).

Hard rules from the plan worth repeating:

- The existing mobile app must not change and must only appear on phones.
- Tablet/desktop share one UI; on desktop it renders as a centered rounded 13″ frame, never full-window.
- Every control is wired to real APIs — no mock data.
- Onboarding/signup/login stay as-is on all devices; the tutorial runs on all devices (adapted per plan §7a).
