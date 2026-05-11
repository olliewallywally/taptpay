# Protect Merchant Data on Every Restart

## What & Why

Every time the dev server restarts (code push, workflow restart, etc.), `drizzle-kit push --force` runs automatically. The `--force` flag bypasses all confirmation prompts and silently applies **destructive** schema changes — including dropping columns and tables — without any warning. If a column is ever accidentally removed from `shared/schema.ts`, that column and all its data in the live database will be gone permanently, with no alert shown.

The goal is to make schema pushes safe by default: additive changes (new columns, new tables) apply automatically, but anything destructive requires a deliberate manual step.

## Done looks like

- Server startup no longer runs `drizzle-kit push --force`. It runs without `--force` so destructive changes are blocked automatically.
- If the schema push detects a destructive change and fails, the server logs a clear, visible message: "⚠️ Schema has destructive changes — run `npm run db:push` manually to review before applying."
- Additive schema changes (new columns, new tables) still apply automatically on restart without any developer action.
- The `seed.ts` function has an explicit guard comment making it clear that the seed check must never be removed, and that seeding must never truncate or delete from merchant data tables (stock_items, transactions, merchants).
- `replit.md` is updated with a one-line policy: "Never use `--force` in auto schema push. Destructive schema changes must be applied manually with `npm run db:push`."

## Out of scope

- Changing the database provider or connection logic
- Adding database backups or snapshots
- Changing any data in the database
- Modifying any frontend pages

## Tasks

1. **Remove `--force` from auto schema push** — In `server/index.ts`, change the auto schema push command from `drizzle-kit push --force` to `drizzle-kit push`. When exit code is non-zero (destructive change blocked), log a clear warning message explaining what to do.

2. **Add seed data guard comments** — In `server/seed.ts`, add a clear comment above the existing `existingMerchants.length > 0` guard stating this check must never be removed, and that stock_items and transactions must never be truncated or seeded with replacement data.

3. **Update replit.md** — Add a short "Data Safety" section documenting the `--force` policy.

## Relevant files

- `server/index.ts:140-174`
- `server/seed.ts`
- `replit.md`
