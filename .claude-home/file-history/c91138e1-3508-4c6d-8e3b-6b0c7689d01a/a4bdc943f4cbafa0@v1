# Claude repository handoff

Before committing, pushing, or changing the current uncommitted merchant work, read:

- replit.md
- .agents/memory/MEMORY.md
- docs/HANDOFF-2026-07-20-onboarding-billing-tutorial.md

The 2026-07-20 handoff is authoritative for the onboarding redesign, billing-card prerequisite, crypto-payment removal, tutorial mode, migrations, test status, and staging exclusions.

If you are working on branch `feat/tablet-desktop-app` (the tablet/desktop merchant
UI — 3 verticals × 5 screens), read these two before writing any code:

- `docs/HANDOFF-2026-07-28-tablet-desktop-app.md` — what is built, the build/verify
  loop, schema traps, and the next actions. Start here.
- `docs/PLAN-2026-07-24-tablet-desktop-app.md` — the authoritative spec it implements.

That work carries a list of deliberate design deviations that Oliver wants raised as
a single list when the integration is finished — see §6 of the handoff. Do not
silently "fix" them mid-stream.

Do not blindly run git add -A. Exclude .claude-home/** and .claude/settings.local.json, preserve the requested source changes, and review the generated client/public/app hash rollover as a single unit.
