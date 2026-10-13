# Runbook — apply migrations 0034–0038 to the test database (owner), 2026-10-13

For Oliver. Applies R2 (0034, 0035), R3 (0036, 0037) and the cash-command change (0038)
to the **test/development** database only — never production. Claude cannot do this
from its cloud session: the session has no database credentials, and the plan keeps
applying migrations to a shared database an owner step.

**Do not start until Claude says the merged branch is ready** (the integration review and
full test suites must pass first). Commands that change nothing come first; the one that
changes the database is in step 4. Everything below runs from the TaptPay Replit shell,
where `DATABASE_URL` is already set as a secret. Never paste a database URL or password
into a chat, a command line or a file.

## 0. Get the code that contains the migrations

```bash
git fetch origin ccr-e07e3100-0wm8kr
git checkout ccr-e07e3100-0wm8kr
git pull --ff-only origin ccr-e07e3100-0wm8kr
npm ci
```

## 1. Which database is "test"?

The Replit-attached development database is the `workspace` target: host `helium`,
database `heliumdb` (pinned in `server/migrate.ts`). The commands below use it. If your
test database is a separate Neon database instead, use `--target=staging` with its real
host and database name, change `sslmode=require` to `sslmode=verify-full` and remove
`channel_binding=require` from that URL secret (see `docs/operations/migration-target.md`).

```bash
TARGET="--target=workspace --expected-host=helium --expected-database=heliumdb"
```

## 2. Back up first

Take a backup or snapshot of the test database with Replit's database tools before step 4.
(The repo's own `scripts/db-backup.mjs` covers local/ci/staging/production targets and
needs a GPG key; it does not cover the Replit workspace database.) The plan's full gate is
a restored-snapshot rehearsal; for a database holding only test data, a backup you know
how to restore is the practical safeguard — your call.

## 3. Look before changing anything (read-only)

```bash
npm run db:migrate:status -- $TARGET
npm run db:release -- $TARGET --dry-run
```

Paste both outputs to Claude. They show which migrations are pending and any safety
finding; they contain no secrets. Expected: 0034–0038 pending, possibly older ones too.
If either command stops with `MIGRATE_TARGET_CLASS_WORKSPACE_HOST`, `DATABASE_URL` is
not the Replit workspace database (it may be Neon). Nothing was touched. Paste the code
to Claude and use the staging variant in step 1.

**If 0023, 0024 or 0025 is pending**, the runner will not apply them without the approved
upload-ownership list (who owns each stored invoice document). Do these first and paste
the count to Claude:

```bash
GAP13_INVENTORY_DATABASE_URL="$DATABASE_URL" npm run db:draft-upload-inventory -- $TARGET --count-only
GAP13_INVENTORY_DATABASE_URL="$DATABASE_URL" npm run db:draft-upload-inventory -- $TARGET \
  --out=/tmp/upload-inventory.json --approved-by="Oliver"
sha256sum /tmp/upload-inventory.json
```

(Details: `docs/operations/migration-release.md`, "The upload-ownership inventory".)

## 4. Stop the app, then apply

Stop the TaptPay app first (the Stop button in Replit, and pause any test deployment
that uses this database). Migrations 0036 and 0037 are applied one after the other,
each in its own transaction. In the moment between them, or if 0037 stops, a running
app could not start or settle card payments. With the app stopped, nothing can be
caught in that moment. Stopping the app also means 0037 does not have to wait for a
lock behind live payment traffic. It has 5 seconds to get that lock before it gives up.

```bash
npm run db:release -- $TARGET
# or, when 0023–0025 were pending:
npm run db:release -- $TARGET \
  --upload-ownership-inventory=/tmp/upload-inventory.json \
  --upload-ownership-inventory-sha256=<the sha256 from step 3>
```

`db:release` applies every pending migration in order, each in its own transaction, and
succeeds only if it then proves 0 pending, 0 drifted, 0 orphaned and 0 out of order.
0035 and 0037 stop on their own (changing nothing) if they find conflicting payment data;
they report counts only. If anything stops, paste the error code to Claude — the codes
contain no secrets.

## 5. Confirm

```bash
npm run db:migrate:status -- $TARGET
```

Expected: nothing pending. Only then start the app again. If step 4 stopped part-way,
leave the app stopped, paste the error code to Claude, and do not start it until
0037 has been applied too. Payments stay as they are configured
(`PAYMENT_MODE`); refunds stay off (`FEATURE_REFUND_INITIATION`).

## After this

The UAT Windcave key can go into the test environment's secrets
(`WINDCAVE_USERNAME`, `WINDCAVE_API_KEY`, `WINDCAVE_ENDPOINT=https://uat.windcave.com/api/v1`,
`PAYMENT_MODE=uat`), never into production, and never into git or a chat.
