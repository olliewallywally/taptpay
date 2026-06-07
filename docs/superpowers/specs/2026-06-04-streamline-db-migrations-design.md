# Streamline DB schema → migration → deploy

**Date:** 2026-06-04
**Status:** Approved (design), pending spec review

## Problem

A production-class outage was caused by editing `shared/schema.ts` (adding
`document_url` / `document_name` to `invoices_rent_requests`) without applying
the change to the database. Because Drizzle's `select()` emits every
schema-defined column, *every* invoice read then threw
`column "document_url" does not exist` → HTTP 500 across all checkout and
property-billing surfaces.

Root causes:

1. **No safety net between `schema.ts` and the DB.** Editing the schema does
   not apply anything; a human must remember to migrate. When they forget, the
   first signal is 500s in the running app.
2. **`db:push` is booby-trapped.** It detects a pre-existing drift
   (`merchant_id` is `serial` in the DB on 5 tables but `integer` in
   `schema.ts`) and offers to "fix" it by **truncating tables**. So the one
   apply mechanism is unsafe to run.
3. **No committed migration history.** The project relies solely on
   `drizzle-kit push`; `migrations/` is empty. Changes are not versioned with
   code and nothing is auto-applied on deploy.

## Goal

Make schema changes safe and near-automatic, and make the "missing column"
outage class impossible to ship. Chosen scope: **fix the drift, adopt
generated migrations, and add a guardrail** (all three).

## Non-goals

- No general schema refactoring beyond the `merchant_id` drift.
- No CI system introduced (project has none; enforcement is via npm lifecycle
  scripts, which are committed and Replit-safe — unlike the Replit-managed git
  hooks).

## Environment facts (verified)

- Replit project. Deploy: `deploymentTarget = "autoscale"`,
  `build = ["npm","run","build"]`, `run = ["npm","run","start"]`.
- Dev workspace and the autoscale deployment **share the same `DATABASE_URL`
  secret** → same Postgres database.
- `drizzle-orm ^0.39.1`, `drizzle-kit ^0.30.4`.
- `drizzle.config.ts` already sets `out: "./migrations"`, `schema:
  "./shared/schema.ts"`, `dialect: "postgresql"`. `migrations/` does not exist
  yet.
- No GitHub Actions. Git hooks present (`post-checkout`, `post-commit`,
  `post-merge`, `pre-push`) are Replit-managed → do not rely on or overwrite
  them.

## Design

### Part 1 — One-time drift cleanup (prerequisite)

Bring the DB into exact agreement with `schema.ts` so both `generate` and
`push` are safe and the migration baseline is clean.

For each of `users`, `transactions`, `refunds`, `platform_fees`,
`merchant_settlements`:

```sql
ALTER TABLE <table> ALTER COLUMN merchant_id DROP DEFAULT;
DROP SEQUENCE IF EXISTS <table>_merchant_id_seq;
```

Safe because the app always supplies an explicit `merchant_id` (a FK to
`merchants.id`); the `nextval(...)` default is vestigial and never fires.
Verification: after running, `drizzle-kit generate` reports **no** changes for
these columns (the only remaining diff should be the doc columns already
applied during the incident fix).

### Part 2 — Adopt generated migrations with a baseline

The database already exists and was not built from migrations, so a naive
`migrate()` (which runs `CREATE TABLE …`) would fail against live tables. We
**baseline** instead:

1. `drizzle-kit generate` → creates `migrations/0000_<name>.sql` plus
   `migrations/meta/_journal.json` representing the current (post-Part-1)
   schema.
2. Mark `0000` as already-applied **without running it**: insert a row into
   Drizzle's tracking table `drizzle.__drizzle_migrations`
   (`hash`, `created_at`), where:
   - `hash` = `sha256(<contents of 0000_*.sql>)` (hex),
   - `created_at` = the `when` value of entry `0000` in `_journal.json`.

   Drizzle's migrator applies a migration only when its journal `when` is
   greater than the latest `created_at` in `__drizzle_migrations`. Seeding the
   `0000` row means `migrate()` skips `0000` and applies only future
   migrations. A small one-off Node script will compute the hash and perform
   the insert.

Everyday workflow afterward:

```
edit shared/schema.ts
  → npm run db:generate     # writes migrations/NNNN_*.sql
  → review + commit the .sql with the code change
```

`db:push` is retired from the normal flow (kept available for emergencies only,
and now safe after Part 1).

### Part 3 — Auto-apply + guardrail

New npm scripts in `package.json`:

| Script | Command | Purpose |
|---|---|---|
| `db:generate` | `drizzle-kit generate` | Create a migration from `schema.ts` changes |
| `db:migrate`  | `tsx server/migrate.ts` (calls Drizzle `migrate()`) | Apply pending migrations |
| `db:check`    | drift guard (see below) | Fail if `schema.ts` has uncaptured changes |

`server/migrate.ts`: a tiny script that opens a connection, runs Drizzle's
`migrate({ migrationsFolder: "./migrations" })`, and exits.

**Auto-apply (kills the outage class):**

- **Production / deploy:** run `db:migrate` as part of the **build step** —
  `build = ["sh","-lc","npm run build && npm run db:migrate"]` (or a dedicated
  predeploy step). The build step runs **once** per deploy, avoiding the
  multi-instance race that a per-instance `prestart` migrate would cause under
  autoscale.
- **Local:** `predev` runs `db:migrate` before `tsx server/index.ts`, so every
  `npm run dev` brings the local view of the DB up to committed migrations.

Result: in any environment that builds or boots, the DB is always caught up to
the committed migration files. The "edited schema, forgot to migrate, ship
500s" path is closed.

**Drift guard — "warn & block" (chosen):**

`db:check` runs `drizzle-kit generate` against a throwaway/temp output and
fails (non-zero exit) if it would emit a new migration — i.e. `schema.ts`
diverges from the committed migration files. It does **not** silently
auto-generate; it stops and tells the developer to run `db:generate`, review
the SQL, and commit it. Wired into `predev` so it surfaces at dev time.

Implementation note: the cleanest detection is to run `drizzle-kit generate`,
then check `git status --porcelain migrations/` for a newly created file; if
one appears, report it and (to avoid leaving a stray uncommitted file) either
keep it for the developer to review or remove it and instruct them to run
`db:generate`. The plan will choose the least-surprising mechanism that
`drizzle-kit 0.30` supports cleanly.

## Verification (how we know it works)

1. After Part 1: `drizzle-kit generate` shows no `merchant_id` changes;
   `db:push` no longer warns about truncation.
2. After Part 2 baseline: `npm run db:migrate` on the live DB is a no-op
   (reports nothing to apply), and tables are untouched.
3. End-to-end: add a throwaway nullable column to `schema.ts` →
   `npm run db:generate` writes a migration → `npm run db:migrate` applies it →
   column exists in DB. Then revert (generate + migrate a drop, or restore).
4. Guard: edit `schema.ts` without generating → `npm run db:check` (and
   `npm run dev`) fail with a clear message.
5. Deploy path: a build that includes `db:migrate` applies pending migrations
   exactly once.

## Risks / open considerations

- **Baseline hash correctness.** If the seeded `__drizzle_migrations` row is
  wrong, `migrate()` could try to re-run `0000` (CREATE TABLE) and fail loudly
  — non-destructive, but blocks boot until fixed. The baseline script must be
  verified against the live DB before relying on auto-apply.
- **Build-step migrate needs `DATABASE_URL` at build time.** Confirm Replit
  exposes secrets to the deployment build step (expected, but verify).
- **Shared dev/prod DB.** Because they are the same database, a migration
  applied locally is immediately "live." This is the existing reality, not
  introduced here, but worth stating: treat migration generation as a
  production change.
- **Replit may regenerate git hooks**, which is why enforcement lives in npm
  scripts rather than a pre-commit hook.
