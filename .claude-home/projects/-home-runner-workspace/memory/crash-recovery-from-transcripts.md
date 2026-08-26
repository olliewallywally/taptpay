---
name: crash-recovery-from-transcripts
description: "After a session crash, recover its findings from the transcript JSONL instead of redoing the work — and persist long-task findings to disk as you go"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 43fc2657-5cdb-40c1-a803-8d84c7f60a3b
  modified: 2026-08-15T06:17:45.366Z
---

When a session crashes mid-task, its full transcript is on disk at
`/home/runner/.claude/projects/-home-runner-workspace/<session-id>.jsonl` (mirrored under
`.claude-home/projects/`). Newest file by mtime is usually the crashed one.

**Why:** on 2026-08-15 a crashed review had already done 22 minutes of expensive work —
719 tests, a 96-visit browser sweep, a live API sweep, a forged-admin proof. All of it was
recoverable in ~5 tool calls instead of being repeated.

**How to apply:**
- Parse the JSONL line-by-line as JSON. `type:"assistant"` entries hold `message.content[]`
  with `text` blocks (the narrative — read these first, they summarize every finding) and
  `tool_use` blocks. `type:"user"` entries hold `tool_result` blocks keyed by
  `tool_use_id`.
- Build an index mapping `tool_use.id` → ordinal, then dump the results you want by ordinal.
  Listing all `tool_use` calls with a one-line description first makes it obvious which
  results are worth pulling.
- Filter `<system-reminder>` and `<local-command-caveat>` blocks out of user text to find
  the real original prompt.
- **Then invert the lesson:** on any long task, write findings to a real file on disk as you
  go, not just into context. The 2026-08-15 review kept
  `docs/REVIEW-2026-08-15-full-app-review.md` updated incrementally for exactly this reason.

Related: [[review-2026-08-15-full-app]], [[git-stash-hides-untracked]].
