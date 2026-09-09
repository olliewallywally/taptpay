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
const UNDECLARED_BY_DESIGN: Readonly<Record<string, string>> = {
  crypto_transactions:
    "orphan from the removed crypto-payment feature; adopted by " +
    "0018_adopt_crypto_transactions.sql so a rebuild matches production, but " +
    "deliberately not re-imported into the ORM surface. FEATURE_CRYPTO stays " +
    "a false-only kill switch.",
};

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

  test("every documented exception is still absent from the Drizzle schema", () => {
    const declared = tablesDeclaredByDrizzle();
    for (const [name, reason] of Object.entries(UNDECLARED_BY_DESIGN)) {
      expect(reason.length).toBeGreaterThan(0);
      expect(declared.has(name)).toBe(false);
    }
  });
});
