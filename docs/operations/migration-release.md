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
that pointed at each document; a pointer alone proves nothing about who uploaded
the file, so `0025` removes every guessed owner and assigns only owners that the
approved list names. The runner applies **none** of the three without that list
(owner decisions [2026-09-19](../decisions/2026-09-19-gap13-trusted-ownership-inventory.md)
and [2026-09-21](../decisions/2026-09-21-gap13-ownership-rule-and-retention.md)).

### 1. Count (read-only, numbers only)

```text
GAP13_INVENTORY_DATABASE_URL=<url> npm run db:draft-upload-inventory -- \
  <the same --target/--expected-* flags as the release> --count-only
```

It prints how the rule sorts the target's invoice documents — e.g.
`total=6 owner=1 locked=5 locked.never-attached=2 …` — and the database's
`TimeZone` (the rule reads `created_at` as UTC; anything else needs a look before
drafting). Nothing is written anywhere.

### 2. Draft the list

```text
GAP13_INVENTORY_DATABASE_URL=<url> npm run db:draft-upload-inventory -- \
  <target flags> --out=<new file> --approved-by="<who reviews and approves it>"
```

Every invoice document is listed exactly once, either:

- **owner** — with evidence. The tool gives an owner only by *TaptPay's own
  records*: exactly one merchant attached the document, first no earlier than 5
  minutes before its upload time (read from the generated file name) and no later
  than 24 hours after. That is the normal upload-then-invoice flow.
- **locked** — kept, never deleted, served to no merchant or customer, readable
  only by the validated platform admin (every read durably audited). With a
  reason: `never-attached`, `several-merchants`, `attached-outside-window`,
  `attach-time-unknown`, `unrecognised-name`, `merchant-missing`, or
  `operator-decision`.

The tool refuses to overwrite an existing file, writes it readable only by its
owner, and prints its SHA-256. The file holds ids, hashes and merchant ids — no
document path, content or token. `--approved-by` must be 1–200 printable ASCII
characters (the list stores it; an identifier, not personal data about anyone
else); the tool refuses anything else before it reads the database.

### 3. Review, amend if you have evidence, approve

A locked document can be given an owner by editing its entry to
`"disposition": "owner"` with `evidence.kind` `authenticated-upload-log` or
`merchant-attestation` (a reference to where the evidence is kept, and its
SHA-256). Software cannot check that such evidence is true; you are the check.
Anything can also be locked (`operator-decision`). Recompute the SHA-256 after
any edit (`sha256sum <file>`). **Approving the list means passing that SHA-256 to
the release:**

```text
npm run db:release -- <target flags> \
  --upload-ownership-inventory=<file> \
  --upload-ownership-inventory-sha256=<its SHA-256>
```

### What the runner checks

Before it creates the ledger or runs anything, and again after locking
`uploaded_files` against writes inside `0025`'s own transaction, it refuses when
the list is missing, its SHA-256 is not the approved one, it was drafted for a
different target (host, port and database must match the declared target — a
Neon pooled host and its direct host are different targets), it does not list
every invoice document exactly once, an entry's file id, path hash or content hash
does not match, an owner is not an existing merchant, or an entry claims
TaptPay's own records when the records do not show exactly that merchant
attaching the document within the window (`UPLOAD_INVENTORY_EVIDENCE_MISMATCH`).
An upload that lands after approval makes the list stale and the release refuses;
draft again. `--dry-run` reports whether the list matches without changing
anything.

`0025` records every entry in `uploaded_file_ownership_evidence` (disposition,
owner and evidence or locked reason, who approved the list and when, and the
list's SHA-256).

The file format (version 2):

```json
{
  "version": 2,
  "target": { "host": "<host>", "port": 5432, "database": "<database>" },
  "approvedBy": "<who reviewed it>",
  "approvedAt": "2026-09-21T09:00:00+12:00",
  "entries": [
    { "fileId": 17, "pathSha256": "<…>", "contentSha256": "<…>",
      "disposition": "owner", "merchantId": 42,
      "evidence": { "kind": "system-record", "reference": "TaptPay records: one merchant, first attached 64s after upload", "sha256": "<…>" } },
    { "fileId": 18, "pathSha256": "<…>", "contentSha256": "<…>",
      "disposition": "locked", "reason": "never-attached" }
  ]
}
```

CI's convergence job uses the committed, approved, empty list
`.github/upload-ownership-inventory.ci-convergence.json`, bound to its disposable
`127.0.0.1:5432/convergence` database. It is not valid for any other target.
