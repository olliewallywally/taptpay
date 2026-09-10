import {
  BASELINE_EFFECT_REQUIREMENTS,
  FIND_MISSING_BASELINE_EFFECTS_SQL,
  findMissingBaselineEffects,
} from "../migration-baseline-contract";
import { defaultMigrationsDir, listMigrationFiles } from "../migrate";
import fs from "fs";
import path from "path";

/**
 * Every `ALTER COLUMN ... DROP DEFAULT` in a migration, as
 * `migration -> "table.column"`. Statements are split on ALTER TABLE and read to
 * the next semicolon, so a default dropped in a multi-clause ALTER is still
 * attributed to its own table.
 */
function droppedDefaultsByMigration(): Map<string, string[]> {
  const dir = defaultMigrationsDir();
  const found = new Map<string, string[]>();

  for (const file of listMigrationFiles(dir)) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const columns: string[] = [];

    for (const statement of sql.split(/\bALTER\s+TABLE\b/i).slice(1)) {
      const body = statement.split(";")[0];
      const table = body.match(/^\s*(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z_][\w$]*))/i);
      const tableName = table?.[1] ?? table?.[2];
      if (!tableName) continue;

      const pattern = /\bALTER\s+(?:COLUMN\s+)?(?:"([^"]+)"|([A-Za-z_][\w$]*))\s+DROP\s+DEFAULT\b/gi;
      for (const match of body.matchAll(pattern)) {
        columns.push(`${tableName}.${match[1] ?? match[2]}`);
      }
    }

    if (columns.length > 0) found.set(file, [...new Set(columns)].sort());
  }

  return found;
}

/** Every `CREATE INDEX` in a migration, as `migration -> "table::index"`. */
function indexesByMigration(): Map<string, string[]> {
  const dir = defaultMigrationsDir();
  const found = new Map<string, string[]>();
  const pattern =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][\w$]*)"?\s+ON\s+(?:ONLY\s+)?(?:public\.)?"?([A-Za-z_][\w$]*)"?/gi;

  for (const file of listMigrationFiles(dir)) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8").replace(/--[^\n]*/g, " ");
    const names = [...sql.matchAll(pattern)].map((m) => `${m[2]}::${m[1]}`);
    if (names.length > 0) found.set(file, [...new Set(names)].sort());
  }
  return found;
}

/** Every `ALTER COLUMN ... DROP NOT NULL`, as `migration -> "table.column"`. */
function droppedNotNullsByMigration(): Map<string, string[]> {
  const dir = defaultMigrationsDir();
  const found = new Map<string, string[]>();

  for (const file of listMigrationFiles(dir)) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const columns: string[] = [];

    for (const statement of sql.split(/\bALTER\s+TABLE\b/i).slice(1)) {
      const body = statement.split(";")[0];
      const table = body.match(/^\s*(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|([A-Za-z_][\w$]*))/i);
      const tableName = table?.[1] ?? table?.[2];
      if (!tableName) continue;

      const pattern = /\bALTER\s+(?:COLUMN\s+)?(?:"([^"]+)"|([A-Za-z_][\w$]*))\s+DROP\s+NOT\s+NULL\b/gi;
      for (const match of body.matchAll(pattern)) {
        columns.push(`${tableName}.${match[1] ?? match[2]}`);
      }
    }

    if (columns.length > 0) found.set(file, [...new Set(columns)].sort());
  }
  return found;
}

describe("migration baseline effect contract", () => {
  test("every checked-in migration has an explicit observable contract", () => {
    const covered = new Set(BASELINE_EFFECT_REQUIREMENTS.map((item) => item.migration));
    expect([...covered].sort()).toEqual(listMigrationFiles(defaultMigrationsDir()).sort());
  });

  // A baselined migration is recorded without running, so a dropped default is
  // only ever proven by looking. `0010a` was baselined on the development
  // database and its DROP DEFAULT never ran, leaving a foreign key with a live
  // nextval() — invisible because the contract had no way to express it.
  test("every dropped column default is an expressed requirement", () => {
    const expressed = new Set(
      BASELINE_EFFECT_REQUIREMENTS
        .filter((item) => item.kind === "column_no_default")
        .map((item) => `${item.migration}::${item.relationName}.${item.objectName}`),
    );

    const dropped = droppedDefaultsByMigration();
    expect(dropped.size).toBeGreaterThan(0);

    const unexpressed = [...dropped].flatMap(([migration, columns]) =>
      columns
        .filter((column) => !expressed.has(`${migration}::${column}`))
        .map((column) => `${migration}: ${column}`),
    );
    expect(unexpressed).toEqual([]);
  });

  // `0010a` creates five indexes and the contract sampled none of them, which is
  // how a baselined database ended up missing tapt_stones_merchant_id_idx. An
  // index is cheap to check, so coverage is exhaustive rather than sampled.
  test("every index a migration creates is an expressed requirement", () => {
    const expressed = new Set(
      BASELINE_EFFECT_REQUIREMENTS
        .filter((item) => item.kind === "index")
        .map((item) => `${item.migration}::${item.relationName}::${item.objectName}`),
    );

    const created = indexesByMigration();
    expect(created.size).toBeGreaterThan(0);

    const unexpressed = [...created].flatMap(([migration, names]) =>
      names
        .filter((name) => !expressed.has(`${migration}::${name}`))
        .map((name) => `${migration}: ${name.replace("::", ".")}`),
    );
    expect(unexpressed).toEqual([]);
  });

  test("every dropped NOT NULL is an expressed requirement", () => {
    const expressed = new Set(
      BASELINE_EFFECT_REQUIREMENTS
        .filter((item) => item.kind === "column_nullable")
        .map((item) => `${item.migration}::${item.relationName}.${item.objectName}`),
    );

    const dropped = droppedNotNullsByMigration();
    expect(dropped.size).toBeGreaterThan(0);

    const unexpressed = [...dropped].flatMap(([migration, columns]) =>
      columns
        .filter((column) => !expressed.has(`${migration}::${column}`))
        .map((column) => `${migration}: ${column}`),
    );
    expect(unexpressed).toEqual([]);
  });

  test("a column that kept its default is reported as unmet, not as absent", async () => {
    const query = jest.fn(async () => ({
      rows: [{
        migration: "0010a_reconcile_retail_payment_baseline.sql",
        kind: "column_no_default",
        relationName: "transactions",
        objectName: "merchant_id",
      }],
    }));

    await expect(
      findMissingBaselineEffects({ query } as any, ["0010a_reconcile_retail_payment_baseline.sql"]),
    ).resolves.toEqual([
      "0010a_reconcile_retail_payment_baseline.sql: transactions.merchant_id must exist without a column default",
    ]);
  });

  test("unknown migrations can never be silently baselined", async () => {
    const query = jest.fn();
    await expect(
      findMissingBaselineEffects({ query } as any, ["0099_unknown.sql"]),
    ).resolves.toEqual(["0099_unknown.sql: no baseline verification contract"]);
    expect(query).not.toHaveBeenCalled();
  });

  test("reports each database effect that is absent", async () => {
    const query = jest.fn(async () => ({
      rows: [{
        migration: "0001_add_email_verified.sql",
        kind: "column",
        relationName: "merchants",
        objectName: "email_verified",
      }],
    }));

    await expect(
      findMissingBaselineEffects({ query } as any, ["0001_add_email_verified.sql"]),
    ).resolves.toEqual([
      "0001_add_email_verified.sql: missing column email_verified",
    ]);
    expect(query).toHaveBeenCalledWith(
      FIND_MISSING_BASELINE_EFFECTS_SQL,
      [expect.any(String)],
    );
  });
});
