---
name: trades-branch-git-state
description: CRITICAL recovery state — stash holds split-bill-pill work; how to restore if crashed
metadata: 
  node_type: memory
  type: project
  originSessionId: db0c107b-d45d-4610-b215-84091dd80729
---

**As of 2026-06-17, mid-operation.** To start the Trades vertical cleanly off `main`, I stashed the in-flight `fix/split-bill-pill` work and branched `feat/trades-vertical` from main.

**The stash** (`git stash list` → look for "wip: split-bill-pill + terminal button work + trades spec", includes untracked `-u`) contains:
- `fix/split-bill-pill` code changes that BELONG ON `fix/split-bill-pill`, NOT on trades: modified `client/src/App.tsx`, `components/bill-split.tsx`, `pages/login.tsx`, `merchant-onboarding.tsx`, `property/property-terminal.tsx`, `property/stat-carousel.tsx`, `split-payment.tsx`, `stock-management.tsx`, `transactions.tsx`; untracked `client/src/components/confirm-button.tsx`, `client/src/lib/auth-context.tsx`.
- The trades spec `docs/superpowers/specs/2026-06-17-trades-vertical-design.md` (untracked) — this one belongs on `feat/trades-vertical`.

**DONE so far:** spec pulled from stash (untracked files live in `stash@{0}^3`, not the main tree) and COMMITTED on `feat/trades-vertical` (commit ffb869a). Trades working tree is clean. Two new files (`confirm-button.tsx`, `auth-context.tsx`) briefly leaked here from a partial pop and were removed (they remain safe in the stash).

**STILL PENDING — split-bill work is stranded in the stash.** Could NOT switch back to `fix/split-bill-pill` to restore it: this repo TRACKS `.claude-home/`, and `.claude-home/.credentials.json` is both dirty AND differs between branches, so `git switch` aborts to avoid overwriting live credentials. Did not force it (would clobber session/credential state — worse than leaving stashed).

**Recovery when ready (do when .claude-home churn is quiet / or accept the risk):**
1. `git switch fix/split-bill-pill` (will work once `.claude-home/.credentials.json` isn't dirty, or stash just that file first: `git stash push -- .claude-home/.credentials.json`).
2. `git stash pop` the WORK stash (the one titled "wip: split-bill-pill + terminal button work + trades spec"). The trades spec will reappear untracked there — harmless (it's committed on trades); just `rm` it.
3. Only `git stash drop` AFTER confirming App.tsx/bill-split.tsx/etc. modifications + confirm-button.tsx + auth-context.tsx are back on `fix/split-bill-pill`.

The stash is the SOLE copy of the uncommitted split-bill work — do not drop it until restored. Commit messages end with Co-Authored-By Claude. Commit/push only when the user asks.
