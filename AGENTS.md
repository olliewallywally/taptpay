# Agent instructions (Codex / any AI)

Read `CLAUDE.md` first — its rules apply to all agents, especially: never `git add -A`; always exclude `.claude-home/**` and `.claude/settings.local.json` from commits.

## Active task: tablet/desktop merchant app

The full implementation plan is `docs/PLAN-2026-07-24-tablet-desktop-app.md`. Read it end-to-end before writing any code — it contains the architecture, device-gating rules, screen-by-screen API wiring, tutorial adaptation spec, build phases, and acceptance checks.

The design source (interactive prototype + rendered screenshots of all 15 screens) is in `docs/design/desktop-app/` — viewing instructions are in the plan (§2; it must be served over HTTP, not opened via `file://`).

Hard rules from the plan worth repeating:

- The existing mobile app must not change and must only appear on phones.
- Tablet/desktop share one UI; on desktop it renders as a centered rounded 13″ frame, never full-window.
- Every control is wired to real APIs — no mock data.
- Onboarding/signup/login stay as-is on all devices; the tutorial runs on all devices (adapted per plan §7a).
