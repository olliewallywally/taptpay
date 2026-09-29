---
name: Schema push gating & drift
description: How this project's automatic drizzle-kit schema push actually behaves, and what to do when it hangs on unrelated prompts.
---

The server's schema-push-on-startup block only runs `drizzle-kit push` when `RUN_SCHEMA_PUSH=true` or `RUN_MIGRATIONS=true` is set in the environment. In a normal dev restart without that env var, no schema sync happens automatically — new columns/indexes added to the Drizzle schema do NOT get applied just by restarting the workflow.

**Why:** the project's data-safety policy (see `replit.md`) intentionally avoids running schema sync as an unconditional app-start side effect, because `drizzle-kit push` can also surface destructive-change prompts for unrelated tables.

**How to apply:** to apply a schema change, run `npm run db:push` manually (or set the env var) — do not assume a workflow restart is sufficient. If `db:push` presents an interactive prompt about an unrelated table (e.g. an existing unique-constraint conflict from unrelated schema drift), it is not safe to blindly answer through a bash pipe — the CLI is an arrow-key TUI, not a y/n prompt, and forcing an answer risks touching data outside the current task's scope. For a change that is purely additive (e.g. adding new indexes with no drops), it's safer and just as correct to apply the equivalent `CREATE INDEX IF NOT EXISTS ...` statements directly via SQL, matching exactly what the schema change specifies, then verify with `pg_indexes`.
