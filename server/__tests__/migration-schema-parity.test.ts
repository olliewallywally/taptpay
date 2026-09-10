import fs from "node:fs";
import path from "node:path";

import { defaultMigrationsDir, listMigrationFiles } from "../migrate";

/**
 * `migrations/` and `shared/schema.ts` are two descriptions of the same
 * database, and R0-T6A showed they had silently stopped agreeing: production
 * carried `crypto_transactions` and neither description mentioned it, so
 * "rebuild from migrations reproduces production" was false by one table and
 * nothing noticed for months.
 *
 * These tests make the relationship between the two an asserted fact.
 */

const SCHEMA_FILE = path.join(__dirname, "..", "..", "shared", "schema.ts");

/**
 * Tables a migration creates but `shared/schema.ts` deliberately does not
 * declare, with the reason. Adding a name here is a decision, not a chore: it
 * means `drizzle-kit push` will offer to DROP that table, because push diffs
 * `public` against the Drizzle schema and cannot see the migration history.
 */
const CRYPTO_RESIDUE =
  "orphan of the removed crypto-payment feature; adopted by " +
  "0020_adopt_orphan_columns.sql so a rebuild matches the live database, but " +
  "deliberately not re-imported into the ORM surface. Empty in every " +
  "environment measured. FEATURE_CRYPTO stays a false-only kill switch.";

const UNDECLARED_BY_DESIGN: Readonly<Record<string, string>> = {
  crypto_transactions:
    "orphan from the removed crypto-payment feature; adopted by " +
    "0018_adopt_crypto_transactions.sql so a rebuild matches production, but " +
    "deliberately not re-imported into the ORM surface. FEATURE_CRYPTO stays " +
    "a false-only kill switch.",
};

/**
 * Columns a migration creates on a table `shared/schema.ts` DOES declare, which
 * the Drizzle declaration deliberately omits. Same decision as a table
 * exception, same consequence: `drizzle-kit push` will offer to DROP them.
 * Keyed `table.column`.
 */
const COLUMNS_UNDECLARED_BY_DESIGN: Readonly<Record<string, string>> = {
  "merchants.coinbase_commerce_api_key": CRYPTO_RESIDUE,
  "merchants.coinbase_webhook_secret": CRYPTO_RESIDUE,
  "merchants.crypto_enabled": CRYPTO_RESIDUE,
  "merchants.enabled_cryptocurrencies": CRYPTO_RESIDUE,
  "merchants.auto_convert_to_fiat": CRYPTO_RESIDUE,
  "merchants.min_confirmations": CRYPTO_RESIDUE,
  "invoices_rent_requests.scheduled_send_at":
    "declared on invoices_rent_requests by 988b4744 (2026-06-15), withdrawn by " +
    "d9143f2a (2026-06-17), left in the database by a push in between; adopted " +
    "by 0020_adopt_orphan_columns.sql. Today the ORM puts scheduled_send_at on " +
    "job_invoices only, which is a different table.",
};

/** Tables whose column-level parity is asserted. */
const COLUMN_PARITY_TABLES = ["merchants", "invoices_rent_requests"] as const;

/** Strips `--` line comments and `/* *​/` block comments before scanning SQL. */
function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function tablesCreatedByMigrations(): Set<string> {
  const dir = defaultMigrationsDir();
  const names = new Set<string>();
  for (const filename of listMigrationFiles(dir)) {
    const sql = stripSqlComments(fs.readFileSync(path.join(dir, filename), "utf8"));
    for (const match of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      names.add(match[1].toLowerCase());
    }
  }
  return names;
}

function tablesDeclaredByDrizzle(): Set<string> {
  const source = fs.readFileSync(SCHEMA_FILE, "utf8");
  const names = new Set<string>();
  for (const match of source.matchAll(/pgTable\(\s*"([a-z_][a-z0-9_]*)"/g)) {
    names.add(match[1]);
  }
  return names;
}

/** Columns a migration creates on `table`, from CREATE TABLE bodies and ADD COLUMN. */
function columnsCreatedByMigrations(table: string): Set<string> {
  const dir = defaultMigrationsDir();
  const names = new Set<string>();
  const createRe = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"?${table}"?\\s*\\(([\\s\\S]*?)\\n\\s*\\);`,
    "gi",
  );

  for (const filename of listMigrationFiles(dir)) {
    const sql = stripSqlComments(fs.readFileSync(path.join(dir, filename), "utf8"));

    for (const match of sql.matchAll(createRe)) {
      for (const line of match[1].split(",\n")) {
        const column = line.match(/^\s*"?([a-z_][a-z0-9_]*)"?\s+[a-z]/i);
        if (column && !/^(constraint|primary|foreign|unique|check)$/i.test(column[1])) {
          names.add(column[1].toLowerCase());
        }
      }
    }

    // ALTER TABLE <table> ... ADD COLUMN [IF NOT EXISTS] <name>
    for (const statement of sql.split(/\bALTER\s+TABLE\b/i).slice(1)) {
      const body = statement.split(";")[0];
      if (!new RegExp(`^\\s*"?${table}"?\\s`, "i").test(body)) continue;
      for (const match of body.matchAll(/\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
        names.add(match[1].toLowerCase());
      }
    }
  }
  return names;
}

/** Columns `shared/schema.ts` declares on `table`, from its pgTable block. */
function columnsDeclaredByDrizzle(table: string): Set<string> {
  const source = fs.readFileSync(SCHEMA_FILE, "utf8");
  const start = source.search(new RegExp(`pgTable\\(\\s*"${table}"`));
  if (start < 0) throw new Error(`shared/schema.ts does not declare ${table}`);

  const body = source.slice(start);
  const end = body.search(/\n\}/);
  const names = new Set<string>();
  // Anchored on `field: type("column"` so `.default("pending")` is not a column.
  for (const match of body.slice(0, end).matchAll(/^\s*\w+:\s*\w+\(\s*"([a-z_][a-z0-9_]*)"/gm)) {
    names.add(match[1]);
  }
  return names;
}

describe("migrations and shared/schema.ts describe the same database", () => {
  test("every table Drizzle declares is created by a migration", () => {
    const declared = tablesDeclaredByDrizzle();
    const created = tablesCreatedByMigrations();
    const missing = [...declared].filter((name) => !created.has(name)).sort();

    // A name here means provisioning from `migrations/` alone yields a database
    // the app cannot run against: Drizzle's select() enumerates every declared
    // column, so the first query against the missing table fails.
    expect(missing).toEqual([]);
  });

  test("the only tables a migration creates without declaring are the documented exceptions", () => {
    const declared = tablesDeclaredByDrizzle();
    const created = tablesCreatedByMigrations();
    const undeclared = [...created].filter((name) => !declared.has(name)).sort();

    expect(undeclared).toEqual(Object.keys(UNDECLARED_BY_DESIGN).sort());
  });

  test("crypto_transactions is adopted by a migration and stays out of the ORM", () => {
    expect(tablesCreatedByMigrations().has("crypto_transactions")).toBe(true);
    expect(tablesDeclaredByDrizzle().has("crypto_transactions")).toBe(false);
  });

  test.each(COLUMN_PARITY_TABLES)(
    "on %s, the only migration-created columns Drizzle omits are documented",
    (table) => {
      const declared = columnsDeclaredByDrizzle(table);
      const created = columnsCreatedByMigrations(table);
      expect(created.size).toBeGreaterThan(0);

      const undeclared = [...created]
        .filter((column) => !declared.has(column))
        .map((column) => `${table}.${column}`)
        .sort();

      const documented = Object.keys(COLUMNS_UNDECLARED_BY_DESIGN)
        .filter((key) => key.startsWith(`${table}.`))
        .sort();

      expect(undeclared).toEqual(documented);
    },
  );

  test("every documented column exception is created by a migration and absent from the ORM", () => {
    for (const [key, reason] of Object.entries(COLUMNS_UNDECLARED_BY_DESIGN)) {
      const [table, column] = key.split(".");
      expect(reason.length).toBeGreaterThan(0);
      expect(columnsCreatedByMigrations(table).has(column)).toBe(true);
      expect(columnsDeclaredByDrizzle(table).has(column)).toBe(false);
    }
  });

  test("every documented exception is still absent from the Drizzle schema", () => {
    const declared = tablesDeclaredByDrizzle();
    for (const [name, reason] of Object.entries(UNDECLARED_BY_DESIGN)) {
      expect(reason.length).toBeGreaterThan(0);
      expect(declared.has(name)).toBe(false);
    }
  });
});
