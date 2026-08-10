import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import {
  BaselineRefusedError,
  CREATE_LEDGER_SCHEMA_SQL,
  CREATE_LEDGER_TABLE_SQL,
  INSERT_LEDGER_SQL,
  LEDGER_QUALIFIED,
  MigrationChecksumDriftError,
  MigrationExecutionError,
  applyMigration,
  assertLexicalMigrationOrder,
  baselineMigrations,
  checksumAll,
  checksumMigrationSource,
  defaultMigrationsDir,
  executableStatements,
  formatPendingReport,
  isMissingLedgerError,
  isTransactionControlStatement,
  listMigrationFiles,
  parseMigrationName,
  planMigrations,
  readMigrationLedgerIfPresent,
  reportPendingMigrations,
  runPendingMigrations,
  sortMigrationFiles,
  splitSqlStatements,
  stripSqlComments,
  type LedgerRow,
  type MigrationClient,
} from "../migrate";

// The real migration set, in the order it must be applied. `0010a` deliberately
// sits between `0010_` and `0011` — it documents that it must run before 0011.
const REAL_MIGRATIONS = [
  "0000_vengeful_zaladane.sql",
  "0001_add_email_verified.sql",
  "0002_add_billing_card_fields.sql",
  "0003_property_management.sql",
  "0004_rent_reminders.sql",
  "0005_split_bill.sql",
  "0006_whatsapp_delivery.sql",
  "0007_trades_vertical.sql",
  "0008_trades_phase3c_fixes.sql",
  "0009_trades_gst_mode.sql",
  "0010_merchant_tutorial_progress.sql",
  "0010a_reconcile_retail_payment_baseline.sql",
  "0011_payment_links_and_board_numbers.sql",
  "0012_push_notification_preferences.sql",
  "0013_subscription_plans.sql",
  "0014_reconcile_subscription_activation.sql",
  "0015_startup_schema_cleanup.sql",
  "0016_transaction_completion_time.sql",
];

/** Migrations that own a `BEGIN;` / `COMMIT;` pair. */
const SELF_TRANSACTING = REAL_MIGRATIONS.filter(
  (name) => Number.parseInt(name.slice(0, 4), 10) >= 7,
);

const MIGRATIONS_DIR = defaultMigrationsDir();

function ledgerRow(filename: string, checksum: string): LedgerRow {
  return { filename, checksum, applied_at: "2026-08-09T00:00:00Z", baselined: false };
}

/**
 * Records every statement sent, so transaction framing and ledger writes can be
 * asserted without a live database.
 */
function createFakeClient(
  handlers: {
    onQuery?: (text: string, values?: unknown[]) => unknown[] | void | never;
  } = {},
) {
  const calls: { text: string; values?: unknown[] }[] = [];
  const client: MigrationClient = {
    async query(text: string, values?: unknown[]) {
      calls.push({ text, values });
      const rows = handlers.onQuery?.(text, values);
      return { rows: (rows ?? []) as any[] };
    },
  };
  return { client, calls, texts: () => calls.map((c) => c.text) };
}

describe("migration ordering", () => {
  test("lists exactly the checked-in migrations in apply order", () => {
    expect(listMigrationFiles(MIGRATIONS_DIR)).toEqual(REAL_MIGRATIONS);
  });

  test("sorts 0010_ before 0010a_ before 0011_ ('_' is 0x5F, 'a' is 0x61)", () => {
    expect("_".charCodeAt(0)).toBe(0x5f);
    expect("a".charCodeAt(0)).toBe(0x61);
    expect(
      sortMigrationFiles([
        "0011_payment_links_and_board_numbers.sql",
        "0010a_reconcile_retail_payment_baseline.sql",
        "0010_merchant_tutorial_progress.sql",
      ]),
    ).toEqual([
      "0010_merchant_tutorial_progress.sql",
      "0010a_reconcile_retail_payment_baseline.sql",
      "0011_payment_links_and_board_numbers.sql",
    ]);
  });

  test("sorting is code-unit based, not locale collation", () => {
    // Guards against a future refactor to `localeCompare`, where `_` can be
    // treated as ignorable punctuation and flip these two.
    const shuffled = [...REAL_MIGRATIONS].reverse();
    expect(sortMigrationFiles(shuffled)).toEqual(REAL_MIGRATIONS);
  });

  test("ordering is stable regardless of the order readdir returns", () => {
    const rotated = [...REAL_MIGRATIONS.slice(7), ...REAL_MIGRATIONS.slice(0, 7)];
    expect(assertLexicalMigrationOrder(rotated)).toEqual(REAL_MIGRATIONS);
  });

  test("parses the numeric prefix and optional letter suffix", () => {
    expect(parseMigrationName("0013_subscription_plans.sql")).toMatchObject({
      numeric: 13,
      letter: "",
    });
    expect(
      parseMigrationName("0010a_reconcile_retail_payment_baseline.sql"),
    ).toMatchObject({ numeric: 10, letter: "a" });
    expect(parseMigrationName("notes.txt")).toBeNull();
  });

  test.each([
    ["unpadded prefix", "10_foo.sql"],
    ["uppercase suffix", "0010A_foo.sql"],
    ["hyphen instead of underscore", "0010a-foo.sql"],
    ["no prefix at all", "add_column.sql"],
  ])("rejects a filename that breaks the ordering contract: %s", (_label, bad) => {
    expect(() => assertLexicalMigrationOrder([...REAL_MIGRATIONS, bad])).toThrow(
      /Migration filenames must look like/,
    );
  });

  test("lexical order agrees with numeric order for every real migration", () => {
    // The assertion the runner makes at run time, restated as a test.
    const lexical = sortMigrationFiles(REAL_MIGRATIONS);
    const numeric = [...REAL_MIGRATIONS].sort((a, b) => {
      const pa = parseMigrationName(a)!;
      const pb = parseMigrationName(b)!;
      if (pa.numeric !== pb.numeric) return pa.numeric - pb.numeric;
      return pa.letter < pb.letter ? -1 : pa.letter > pb.letter ? 1 : 0;
    });
    expect(lexical).toEqual(numeric);
  });
});

describe("checksums", () => {
  test("is the SHA-256 hex digest of the source", () => {
    const source = "SELECT 1;\n";
    expect(checksumMigrationSource(source)).toBe(
      createHash("sha256").update(source, "utf8").digest("hex"),
    );
    expect(checksumMigrationSource(source)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("changes when a single character changes", () => {
    expect(checksumMigrationSource("SELECT 1;")).not.toBe(
      checksumMigrationSource("SELECT 2;"),
    );
  });

  test("ignores CRLF line endings and a leading BOM", () => {
    const lf = "ALTER TABLE a ADD COLUMN b text;\nSELECT 1;\n";
    const crlf = lf.replace(/\n/g, "\r\n");
    const bom = `﻿${lf}`;
    expect(checksumMigrationSource(crlf)).toBe(checksumMigrationSource(lf));
    expect(checksumMigrationSource(bom)).toBe(checksumMigrationSource(lf));
  });

  test("every real migration hashes to a distinct value", () => {
    const checksums = checksumAll(MIGRATIONS_DIR, REAL_MIGRATIONS);
    expect(checksums.size).toBe(REAL_MIGRATIONS.length);
    expect(new Set(checksums.values()).size).toBe(REAL_MIGRATIONS.length);
  });
});

describe("SQL statement splitting", () => {
  test("joining every chunk reproduces the input exactly", () => {
    for (const filename of REAL_MIGRATIONS) {
      const source = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      const rejoined = splitSqlStatements(source)
        .map((chunk) => chunk.raw)
        .join("");
      expect(rejoined).toBe(source);
    }
  });

  test("does not split on a semicolon inside a single-quoted literal", () => {
    const chunks = executableStatements(
      "INSERT INTO t (a) VALUES ('one; two');\nSELECT 1;\n",
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0].raw).toContain("'one; two'");
  });

  test("handles doubled quotes inside literals and identifiers", () => {
    const chunks = executableStatements(
      `SELECT 'it''s; fine', "we""ird; col" FROM t;\nSELECT 2;\n`,
    );
    expect(chunks).toHaveLength(2);
  });

  test("does not split on a semicolon inside a line or block comment", () => {
    const chunks = executableStatements(
      "SELECT 1 -- trailing; comment\n;\n/* block ; comment */\nSELECT 2;\n",
    );
    expect(chunks).toHaveLength(2);
  });

  test("handles nested block comments", () => {
    const stripped = stripSqlComments("SELECT /* a /* b ; */ c */ 1;");
    expect(stripped).not.toContain("b ;");
    expect(executableStatements("SELECT /* a /* b ; */ c */ 1;")).toHaveLength(1);
  });

  test("keeps a DO $$ ... $$ block as one statement", () => {
    const sql = [
      "DO $$",
      "BEGIN",
      "  IF to_regclass('t') IS NULL THEN",
      "    RAISE EXCEPTION 'missing; table';",
      "  END IF;",
      "END",
      "$$;",
      "SELECT 1;",
    ].join("\n");
    const chunks = executableStatements(sql);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].raw).toContain("RAISE EXCEPTION");
    expect(chunks[0].isTransactionControl).toBe(false);
  });

  test("does not mistake a positional parameter for a dollar quote", () => {
    const chunks = executableStatements("SELECT $1;\nSELECT $2;\n");
    expect(chunks).toHaveLength(2);
  });

  test("handles a named dollar-quote tag", () => {
    const chunks = executableStatements(
      "CREATE FUNCTION f() RETURNS int AS $body$ BEGIN; RETURN 1; END $body$ LANGUAGE plpgsql;\nSELECT 1;",
    );
    expect(chunks).toHaveLength(2);
  });

  test("treats E'...' backslash escapes correctly", () => {
    const chunks = executableStatements(
      "SELECT E'a\\'; b' AS x;\nSELECT 1;\n",
    );
    expect(chunks).toHaveLength(2);
  });

  test("reports a 1-based line number for each statement", () => {
    const chunks = executableStatements("SELECT 1;\n\n\nSELECT 2;\n");
    expect(chunks[0].line).toBe(1);
    expect(chunks[1].line).toBe(1); // chunk 2 starts on the newline after `;`
    expect(chunks[1].raw).toContain("SELECT 2");
  });
});

describe("transaction-control detection", () => {
  test.each([
    "BEGIN",
    "COMMIT",
    "END",
    "ROLLBACK",
    "ABORT",
    "BEGIN WORK",
    "COMMIT TRANSACTION",
    "START TRANSACTION",
    "BEGIN ISOLATION LEVEL SERIALIZABLE",
    "COMMIT AND CHAIN",
    "ROLLBACK AND NO CHAIN",
  ])("strips %s", (normalized) => {
    expect(isTransactionControlStatement(normalized)).toBe(true);
  });

  test.each([
    "SAVEPOINT S1",
    "RELEASE SAVEPOINT S1",
    "ROLLBACK TO SAVEPOINT S1",
    "CREATE TABLE T (ID INT)",
    "SELECT 1",
    "DO $$ BEGIN END $$",
  ])("keeps %s", (normalized) => {
    expect(isTransactionControlStatement(normalized)).toBe(false);
  });

  test("strips the top-level BEGIN/COMMIT of every self-transacting migration", () => {
    for (const filename of SELF_TRANSACTING) {
      const source = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      const all = splitSqlStatements(source);
      const control = all.filter((chunk) => chunk.isTransactionControl);
      expect(control.map((chunk) => chunk.normalized)).toEqual(["BEGIN", "COMMIT"]);
    }
  });

  test("migrations 0000-0006 contain no transaction control at all", () => {
    const plain = REAL_MIGRATIONS.filter(
      (name) => Number.parseInt(name.slice(0, 4), 10) <= 6,
    );
    expect(plain).toHaveLength(7);
    for (const filename of plain) {
      const source = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      expect(
        splitSqlStatements(source).filter((chunk) => chunk.isTransactionControl),
      ).toHaveLength(0);
    }
  });

  test("no executable statement of any real migration is transaction control", () => {
    for (const filename of REAL_MIGRATIONS) {
      const source = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      const statements = executableStatements(source);
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) {
        expect(statement.isTransactionControl).toBe(false);
        expect(statement.isEmpty).toBe(false);
      }
    }
  });
});

describe("planMigrations", () => {
  const files = ["0000_a.sql", "0001_b.sql", "0002_c.sql"];
  const checksums = new Map([
    ["0000_a.sql", "aaa"],
    ["0001_b.sql", "bbb"],
    ["0002_c.sql", "ccc"],
  ]);

  test("classifies recorded migrations as applied and the rest as pending", () => {
    const plan = planMigrations(files, checksums, [ledgerRow("0000_a.sql", "aaa")]);
    expect(plan.applied).toEqual(["0000_a.sql"]);
    expect(plan.pending).toEqual(["0001_b.sql", "0002_c.sql"]);
    expect(plan.drifted).toEqual([]);
    expect(plan.orphaned).toEqual([]);
  });

  test("reports nothing pending once every migration is recorded", () => {
    const plan = planMigrations(
      files,
      checksums,
      files.map((f) => ledgerRow(f, checksums.get(f)!)),
    );
    expect(plan.pending).toEqual([]);
    expect(plan.applied).toEqual(files);
    expect(formatPendingReport(plan)).toEqual([]);
  });

  test("detects checksum drift on an already-applied migration", () => {
    const plan = planMigrations(files, checksums, [
      ledgerRow("0000_a.sql", "aaa"),
      ledgerRow("0001_b.sql", "STALE"),
    ]);
    expect(plan.drifted).toHaveLength(1);
    expect(plan.drifted[0]).toMatchObject({
      filename: "0001_b.sql",
      recordedChecksum: "STALE",
      actualChecksum: "bbb",
    });
    // A drifted migration is neither applied nor re-runnable as pending.
    expect(plan.applied).not.toContain("0001_b.sql");
    expect(plan.pending).not.toContain("0001_b.sql");
  });

  test("flags a recorded migration whose file has disappeared", () => {
    const plan = planMigrations(files, checksums, [
      ledgerRow("0000_a.sql", "aaa"),
      ledgerRow("0009_gone.sql", "zzz"),
    ]);
    expect(plan.orphaned).toEqual(["0009_gone.sql"]);
  });

  test("flags a pending migration that sorts before an applied one", () => {
    const plan = planMigrations(files, checksums, [
      ledgerRow("0000_a.sql", "aaa"),
      ledgerRow("0002_c.sql", "ccc"),
    ]);
    expect(plan.pending).toEqual(["0001_b.sql"]);
    expect(plan.outOfOrder).toEqual(["0001_b.sql"]);
  });

  test("does not flag out-of-order when nothing has been applied yet", () => {
    const plan = planMigrations(files, checksums, []);
    expect(plan.pending).toEqual(files);
    expect(plan.outOfOrder).toEqual([]);
  });

  test("the pending report names each pending file and the command to run", () => {
    const plan = planMigrations(files, checksums, [ledgerRow("0000_a.sql", "aaa")]);
    const report = formatPendingReport(plan).join("\n");
    expect(report).toContain("MIGRATIONS PENDING");
    expect(report).toContain("0001_b.sql");
    expect(report).toContain("0002_c.sql");
    expect(report).toContain("npm run db:migrate");
  });

  test("the drift report is loud and explains the fix", () => {
    const plan = planMigrations(files, checksums, [ledgerRow("0000_a.sql", "STALE")]);
    const report = formatPendingReport(plan).join("\n");
    expect(report).toContain("CHECKSUM DRIFT");
    expect(report).toContain("0000_a.sql");
    expect(report).toContain("STALE");
  });
});

describe("ledger writes", () => {
  test("creates the schema and table, outside `public`", () => {
    expect(LEDGER_QUALIFIED).toBe("drizzle.applied_migrations");
    expect(CREATE_LEDGER_SCHEMA_SQL).toContain("CREATE SCHEMA IF NOT EXISTS drizzle");
    expect(CREATE_LEDGER_TABLE_SQL).toContain("CREATE TABLE IF NOT EXISTS");
    expect(CREATE_LEDGER_TABLE_SQL).toContain("filename      text PRIMARY KEY");
    expect(CREATE_LEDGER_TABLE_SQL).toContain("checksum      text NOT NULL");
    expect(CREATE_LEDGER_TABLE_SQL).toContain("applied_at    timestamptz NOT NULL");
  });

  test("applyMigration runs the statements and the ledger insert in one transaction", async () => {
    const { client, calls, texts } = createFakeClient();
    const result = await applyMigration(
      client,
      "0007_x.sql",
      "BEGIN;\nCREATE TABLE a (id int);\nCREATE TABLE b (id int);\nCOMMIT;\n",
    );

    expect(result.statements).toBe(2);
    expect(texts()[0]).toBe("BEGIN");
    expect(texts()[texts().length - 1]).toBe("COMMIT");
    // Exactly one BEGIN and one COMMIT — the file's own pair was stripped, so
    // there is no nested transaction.
    expect(texts().filter((t) => t === "BEGIN")).toHaveLength(1);
    expect(texts().filter((t) => t === "COMMIT")).toHaveLength(1);

    const insert = calls.find((c) => c.text === INSERT_LEDGER_SQL);
    expect(insert).toBeDefined();
    expect(insert!.values![0]).toBe("0007_x.sql");
    expect(insert!.values![1]).toBe(
      checksumMigrationSource(
        "BEGIN;\nCREATE TABLE a (id int);\nCREATE TABLE b (id int);\nCOMMIT;\n",
      ),
    );
    expect(insert!.values![3]).toBe(false); // not baselined
  });

  test("applyMigration rolls back and records nothing when a statement fails", async () => {
    const { client, calls, texts } = createFakeClient({
      onQuery(text) {
        if (text.includes("CREATE TABLE b")) throw new Error("boom");
      },
    });

    await expect(
      applyMigration(client, "0007_x.sql", "CREATE TABLE a (id int);\nCREATE TABLE b (id int);\n"),
    ).rejects.toBeInstanceOf(MigrationExecutionError);

    expect(texts()).toContain("ROLLBACK");
    expect(texts()).not.toContain("COMMIT");
    expect(calls.find((c) => c.text === INSERT_LEDGER_SQL)).toBeUndefined();
  });

  test("a failed migration names the file and the failing line", async () => {
    const { client } = createFakeClient({
      onQuery(text) {
        if (text.includes("SELECT 2")) throw new Error("syntax error");
      },
    });
    await expect(
      applyMigration(client, "0042_bad.sql", "SELECT 1;\nSELECT 2;\n"),
    ).rejects.toThrow(/0042_bad\.sql failed at the statement starting on line 1/);
  });

  test("isMissingLedgerError recognises a missing table or schema", () => {
    expect(isMissingLedgerError({ code: "42P01" })).toBe(true);
    expect(isMissingLedgerError({ code: "3F000" })).toBe(true);
    expect(isMissingLedgerError({ code: "28P01" })).toBe(false);
    expect(isMissingLedgerError(new Error("nope"))).toBe(false);
  });

  test("readMigrationLedgerIfPresent returns null instead of creating the ledger", async () => {
    const { client, texts } = createFakeClient({
      onQuery() {
        throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
      },
    });
    await expect(readMigrationLedgerIfPresent(client)).resolves.toBeNull();
    expect(texts().some((t) => t.includes("CREATE"))).toBe(false);
  });
});

describe("runPendingMigrations", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-run-"));
    fs.writeFileSync(path.join(dir, "0000_a.sql"), "CREATE TABLE a (id int);\n");
    fs.writeFileSync(
      path.join(dir, "0001_b.sql"),
      "BEGIN;\nCREATE TABLE b (id int);\nCOMMIT;\n",
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function clientWithLedger(rows: LedgerRow[]) {
    return createFakeClient({
      onQuery(text) {
        if (text.startsWith("SELECT filename")) return rows;
        return undefined;
      },
    });
  }

  test("applies every pending migration in order", async () => {
    const { client, calls } = clientWithLedger([]);
    const log: string[] = [];
    const result = await runPendingMigrations(client, { dir, log: (m) => log.push(m) });

    expect(result.appliedNow).toEqual(["0000_a.sql", "0001_b.sql"]);
    const inserted = calls
      .filter((c) => c.text === INSERT_LEDGER_SQL)
      .map((c) => c.values![0]);
    expect(inserted).toEqual(["0000_a.sql", "0001_b.sql"]);
    expect(log.join("\n")).toContain("Applied 2 migration(s)");
  });

  test("creates the ledger first when adopting a database that has none", async () => {
    // The ledger read must tolerate a missing table, and the table must exist
    // before the first INSERT.
    const { client, calls, texts } = createFakeClient({
      onQuery(text) {
        if (text.startsWith("SELECT filename")) {
          throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
        }
        return undefined;
      },
    });

    const result = await runPendingMigrations(client, { dir, log: () => undefined });
    expect(result.appliedNow).toEqual(["0000_a.sql", "0001_b.sql"]);

    const createIndex = texts().indexOf(CREATE_LEDGER_TABLE_SQL);
    const firstInsert = calls.findIndex((c) => c.text === INSERT_LEDGER_SQL);
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(texts()).toContain(CREATE_LEDGER_SCHEMA_SQL);
    expect(createIndex).toBeLessThan(firstInsert);
  });

  test("reports nothing to apply when the ledger is complete", async () => {
    const checksums = checksumAll(dir, ["0000_a.sql", "0001_b.sql"]);
    const { client, calls } = clientWithLedger([
      ledgerRow("0000_a.sql", checksums.get("0000_a.sql")!),
      ledgerRow("0001_b.sql", checksums.get("0001_b.sql")!),
    ]);
    const log: string[] = [];
    const result = await runPendingMigrations(client, { dir, log: (m) => log.push(m) });

    expect(result.appliedNow).toEqual([]);
    expect(calls.filter((c) => c.text === INSERT_LEDGER_SQL)).toHaveLength(0);
    expect(calls.filter((c) => c.text === "BEGIN")).toHaveLength(0);
    expect(log.join("\n")).toContain("Nothing to apply");
  });

  test("aborts before touching anything when a checksum has drifted", async () => {
    const { client, calls } = clientWithLedger([ledgerRow("0000_a.sql", "STALE")]);
    await expect(
      runPendingMigrations(client, { dir, log: () => undefined }),
    ).rejects.toBeInstanceOf(MigrationChecksumDriftError);

    // Nothing applied — not even the genuinely pending 0001_b.sql.
    expect(calls.filter((c) => c.text === "BEGIN")).toHaveLength(0);
    expect(calls.filter((c) => c.text === INSERT_LEDGER_SQL)).toHaveLength(0);
  });

  test("the drift error explains why re-running is not the fix", async () => {
    const { client } = clientWithLedger([ledgerRow("0000_a.sql", "STALE")]);
    await expect(
      runPendingMigrations(client, { dir, log: () => undefined }),
    ).rejects.toThrow(/must be immutable/);
  });

  test("--dry-run lists the pending migrations without executing them", async () => {
    const { client, calls } = clientWithLedger([]);
    const log: string[] = [];
    const result = await runPendingMigrations(client, {
      dir,
      dryRun: true,
      log: (m) => log.push(m),
    });

    expect(result.appliedNow).toEqual([]);
    expect(calls.filter((c) => c.text === "BEGIN")).toHaveLength(0);
    expect(calls.filter((c) => c.text === INSERT_LEDGER_SQL)).toHaveLength(0);
    // A dry run must leave no trace at all — not even the ledger table.
    expect(calls.some((c) => c.text.startsWith("CREATE"))).toBe(false);
    expect(log.join("\n")).toContain("Would apply 2 migration(s)");
  });

  test("aborts the whole run at the first failure, leaving later files unapplied", async () => {
    const rows: LedgerRow[] = [];
    const { client, calls } = createFakeClient({
      onQuery(text) {
        if (text.startsWith("SELECT filename")) return rows;
        if (text.includes("CREATE TABLE a")) throw new Error("boom");
        return undefined;
      },
    });

    await expect(
      runPendingMigrations(client, { dir, log: () => undefined }),
    ).rejects.toBeInstanceOf(MigrationExecutionError);

    expect(calls.filter((c) => c.text === INSERT_LEDGER_SQL)).toHaveLength(0);
    expect(calls.some((c) => c.text.includes("CREATE TABLE b"))).toBe(false);
  });
});

describe("baseline mode", () => {
  const acceptSyntheticEffects = async () => [] as string[];

  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-baseline-"));
    fs.writeFileSync(path.join(dir, "0000_a.sql"), "CREATE TABLE a (id int);\n");
    fs.writeFileSync(path.join(dir, "0001_b.sql"), "CREATE TABLE b (id int);\n");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function baselineClient(options: { ledger?: LedgerRow[]; tables?: number } = {}) {
    const ledger = options.ledger ?? [];
    const tables = options.tables ?? 30;
    return createFakeClient({
      onQuery(text) {
        if (text.startsWith("SELECT filename")) return ledger;
        if (text.includes("information_schema.tables")) return [{ count: tables }];
        return undefined;
      },
    });
  }

  test("refuses without --confirm and executes nothing", async () => {
    const { client, calls } = baselineClient();
    await expect(
      baselineMigrations(client, { dir, log: () => undefined }),
    ).rejects.toBeInstanceOf(BaselineRefusedError);
    expect(calls.filter((c) => c.text === INSERT_LEDGER_SQL)).toHaveLength(0);
    expect(calls.some((c) => c.text.includes("CREATE TABLE a"))).toBe(false);
    // A refused baseline must leave no trace — the ledger is not created either.
    expect(calls.some((c) => c.text.startsWith("CREATE"))).toBe(false);
  });

  test("the refusal tells you the exact command to re-run", async () => {
    const { client } = baselineClient();
    await expect(baselineMigrations(client, { dir, log: () => undefined })).rejects.toThrow(
      /npm run db:migrate:baseline -- --confirm/,
    );
  });

  test("with --confirm it records every migration WITHOUT executing any of it", async () => {
    const { client, calls } = baselineClient();
    const log: string[] = [];
    const result = await baselineMigrations(client, {
      dir,
      confirm: true,
      effectVerifier: acceptSyntheticEffects,
      log: (m) => log.push(m),
    });

    expect(result.recorded).toEqual(["0000_a.sql", "0001_b.sql"]);

    // The decisive assertion: no migration SQL was ever sent.
    expect(calls.some((c) => c.text.includes("CREATE TABLE a"))).toBe(false);
    expect(calls.some((c) => c.text.includes("CREATE TABLE b"))).toBe(false);

    const inserts = calls.filter((c) => c.text === INSERT_LEDGER_SQL);
    expect(inserts).toHaveLength(2);
    // Recorded with the real on-disk checksum, and flagged as baselined.
    const checksums = checksumAll(dir, ["0000_a.sql", "0001_b.sql"]);
    expect(inserts[0].values![1]).toBe(checksums.get("0000_a.sql"));
    expect(inserts.every((c) => c.values![3] === true)).toBe(true);
    expect(inserts.every((c) => c.values![2] === null)).toBe(true);

    // All rows in one transaction.
    expect(calls.filter((c) => c.text === "BEGIN")).toHaveLength(1);
    expect(calls.filter((c) => c.text === "COMMIT")).toHaveLength(1);
  });

  test("refuses on an empty database, where baselining would skip the schema forever", async () => {
    const { client, calls } = baselineClient({ tables: 0 });
    await expect(
      baselineMigrations(client, { dir, confirm: true, log: () => undefined }),
    ).rejects.toThrow(/contains no tables/);
    expect(calls.filter((c) => c.text === INSERT_LEDGER_SQL)).toHaveLength(0);
  });

  test("refuses when the ledger already has rows, unless --force", async () => {
    const checksums = checksumAll(dir, ["0000_a.sql"]);
    const ledger = [ledgerRow("0000_a.sql", checksums.get("0000_a.sql")!)];

    const refused = baselineClient({ ledger });
    await expect(
      baselineMigrations(refused.client, { dir, confirm: true, log: () => undefined }),
    ).rejects.toThrow(/already adopted/);
    expect(refused.calls.filter((c) => c.text === INSERT_LEDGER_SQL)).toHaveLength(0);

    const forced = baselineClient({ ledger });
    const result = await baselineMigrations(forced.client, {
      dir,
      confirm: true,
      force: true,
      effectVerifier: acceptSyntheticEffects,
      log: () => undefined,
    });
    expect(result.recorded).toEqual(["0001_b.sql"]);
  });

  test("is a no-op once everything is already recorded", async () => {
    const checksums = checksumAll(dir, ["0000_a.sql", "0001_b.sql"]);
    const { client, calls } = baselineClient({
      ledger: [
        ledgerRow("0000_a.sql", checksums.get("0000_a.sql")!),
        ledgerRow("0001_b.sql", checksums.get("0001_b.sql")!),
      ],
    });
    const log: string[] = [];
    const result = await baselineMigrations(client, { dir, log: (m) => log.push(m) });

    expect(result.recorded).toEqual([]);
    expect(calls.filter((c) => c.text === INSERT_LEDGER_SQL)).toHaveLength(0);
    expect(log.join("\n")).toContain("Nothing to baseline");
  });
});

describe("startup check", () => {
  test("does nothing when DATABASE_URL is absent", async () => {
    const log = jest.fn();
    await expect(
      reportPendingMigrations({ connectionString: "", log }),
    ).resolves.toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  test("never throws when the database is unreachable", async () => {
    const log = jest.fn();
    await expect(
      reportPendingMigrations({
        // Reserved TEST-NET-1 address: guaranteed not to answer.
        connectionString: "postgres://u:p@192.0.2.1:5432/none?sslmode=disable",
        connectionTimeoutMs: 250,
        log,
      }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    expect(String(log.mock.calls[0][0])).toMatch(/non-fatal|skipped/);
  }, 20_000);

  test("does nothing when the migrations directory is missing", async () => {
    const log = jest.fn();
    await expect(
      reportPendingMigrations({
        dir: path.join(os.tmpdir(), "definitely-not-a-migrations-dir-9f3a"),
        connectionString: "postgres://u:p@192.0.2.1:5432/none",
        log,
      }),
    ).resolves.toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });
});
