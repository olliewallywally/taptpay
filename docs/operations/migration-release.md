# Running a migration release

This documents R0-T6A's release command and its safety gate. It assumes the
target is already declared — see [naming the migration target](migration-target.md),
which every command here inherits.

Build and startup remain read-only. Migrations are a deliberate release step, run
by one command, never a side effect of `npm run build` or of a server boot.

## The command

```text
npm run db:release -- --target=<local|ci|staging|production> \
  --expected-host=<host> [--expected-port=<port>] --expected-database=<name>
```

`db:release` applies every pending migration and then **re-plans against the
ledger to prove its own end state**: it reports success only when the database
reports 0 pending, 0 drifted, 0 orphaned and 0 out-of-order migrations. A
release that cannot say that has not finished, whatever the apply loop printed.

Rehearse first with `--dry-run`, which lists what would be applied and reports
any safety findings without touching the database.

`npm run db:migrate` still exists and still applies migrations. The difference is
only the end-state proof, so prefer `db:release` for anything you would call a
release.

## The safety gate

Before anything is applied — before the ledger is even created — every pending
migration's statements are scanned. Two hazards are refused, and they are
deliberately not treated the same way.

**Destructive** statements destroy rows: `DROP TABLE`, `DROP COLUMN`,
`DROP SCHEMA`, `DROP DATABASE`, `DROP TYPE`, `TRUNCATE`, and `DELETE` with no
`WHERE`. These are a decision, not a defect, so they are refused unless you pass
`--allow-destructive`. Passing that flag is you saying you have reviewed the
data loss, and it belongs in a reviewed change, not in muscle memory.

**Non-transactional** statements cannot honestly run inside the single
transaction this runner wraps every file in: anything `CONCURRENTLY`, `VACUUM`,
`REINDEX`, and `ALTER TYPE … ADD VALUE`. These are refused **outright**, and
`--allow-destructive` does not override them. `CREATE INDEX CONCURRENTLY` inside
a transaction-wrapped file does not fail loudly on a good day and half-applies on
a bad one. A reviewed non-transactional runner mode does not exist yet; when one
is built it will be an explicit mode, not an exception slipped into the current
files.

### What the scanner will not do

- It does not read comments as code — they are stripped before matching.
- It does not read string literals as code, so an audit-log insert mentioning
  `DROP TABLE` is not a finding.
- It **does** scan inside `DO $$ … $$` blocks. A `DO` block executes real SQL
  with real effects and is not a safe harbour.
- It does not flag constraint, default or index *reshapes*. `ALTER TABLE …
  DROP CONSTRAINT` and `ALTER COLUMN … DROP DEFAULT` destroy no rows, and the
  checked-in history already uses the drop-then-re-add pattern; flagging them
  would block every fresh database for no safety gain.

Every checked-in migration passes the gate unassisted, and a test asserts it, so
a future migration that needs `--allow-destructive` will announce itself in
review rather than at 2am.

### If the gate refuses

Read the finding: it names the file, the hazard, the rule and the statement
position. Then choose deliberately.

- Genuinely destructive and intended → reviewed decision, then
  `--allow-destructive`.
- Genuinely destructive and *not* intended → fix the migration before it ships.
- Non-transactional → the migration needs splitting, or it needs the reviewed
  non-transactional mode to be built first. Do not work around the gate by
  editing a historical migration; ship a new forward migration.

## The upload-ownership inventory (gap 13)

Migrations `0023`–`0025` decide which merchant owns each stored invoice document,
and so who may download it. `0023` guessed owners from the invoices and quotes
that pointed at each document; a pointer proves nothing about who uploaded the
file, so `0025` removes every guessed owner and assigns only owners that an
operator has verified. On the owner's decision
([2026-09-19](../decisions/2026-09-19-gap13-trusted-ownership-inventory.md)) the
runner applies **none** of the three without an approved inventory:

```text
npm run db:release -- <target flags> \
  --upload-ownership-inventory=<file> \
  --upload-ownership-inventory-sha256=<SHA-256 of that exact file>
```

It refuses before it creates the ledger or runs anything when the inventory is
missing, when the file's SHA-256 is not the approved one, when it was approved
for a different database (host, port and database name must match the declared
target), or when it does not match the database exactly: every stored invoice
document listed once, and every entry matching a real invoice document by id,
path SHA-256 and content SHA-256 and naming a merchant that exists. Inside
`0025`'s own transaction it checks all of that again after locking
`uploaded_files` against writes, so an upload that lands after approval makes the
approval stale rather than slipping through. `--dry-run` reports whether the
inventory matches without changing anything.

The file (version 1; no document path, content or token appears in it):

```json
{
  "version": 1,
  "target": { "host": "<host>", "port": 5432, "database": "<database>" },
  "approvedBy": "<who reviewed the evidence>",
  "approvedAt": "2026-09-21T09:00:00+12:00",
  "entries": [
    {
      "fileId": 17,
      "pathSha256": "<sha256 of the stored path, e.g. invoices/invoice-…pdf>",
      "contentSha256": "<sha256 of the stored bytes>",
      "merchantId": 42,
      "evidence": {
        "kind": "authenticated-upload-log",
        "reference": "<where the evidence is kept>",
        "sha256": "<sha256 of the evidence itself>"
      }
    }
  ]
}
```

`evidence.kind` is `authenticated-upload-log` or `merchant-attestation`. The
software checks the file's integrity, completeness and target; **it cannot check
that the evidence is true**. A person reviews each piece of evidence before
approving the file's SHA-256. A document with no acceptable evidence blocks the
release: it is not deleted, quarantined or given an owner by inference.

`0025` records what it applied in `uploaded_file_ownership_evidence` (file id,
verified merchant, the hashes, the evidence reference, who approved it and when,
and the inventory's SHA-256).

CI's convergence job uses the committed, approved, empty inventory
`.github/upload-ownership-inventory.ci-convergence.json`, bound to its disposable
`127.0.0.1:5432/convergence` database. It is not valid for any other target.
