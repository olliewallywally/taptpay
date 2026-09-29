import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { uploadedFiles } from "@shared/schema";

/**
 * Gap 13: the Drizzle schema and migration 0023 must describe the same tenant
 * column, and the migration must stay additive — attribution is deterministic
 * or it does not happen (a NULL-tenant row is fail-closed), and nothing is ever
 * deleted to make it so.
 */
const migration = readFileSync(resolve(process.cwd(), "migrations/0023_uploaded_files_tenant_column.sql"), "utf8");

// Strip `--` comments so prose in the header cannot satisfy or trip a check.
const sql = migration
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("uploaded_files tenant column — schema", () => {
  const config = getTableConfig(uploadedFiles);

  it("declares a nullable merchant_id foreign key to merchants", () => {
    const column = config.columns.find(({ name }) => name === "merchant_id");
    expect(column).toMatchObject({ notNull: false, dataType: "number" });

    const fk = config.foreignKeys.find((key) => key.reference().columns.some(({ name }) => name === "merchant_id"));
    expect(fk).toBeDefined();
    expect(getTableConfig(fk!.reference().foreignTable).name).toBe("merchants");
    // Plain FK (NO ACTION): deleting a merchant that still owns uploads is
    // blocked until retention policy (plan A-H3) decides, never silently cascaded.
    expect(fk!.onDelete).toBe("no action");
  });

  it("indexes merchant_id", () => {
    expect(config.indexes.map(({ config: c }) => c.name)).toContain("uploaded_files_merchant_id_idx");
  });
});

describe("migration 0023_uploaded_files_tenant_column.sql", () => {
  it("adds the same column, foreign key and index the schema declares", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS merchant_id integer\b/);
    expect(sql).toContain("uploaded_files_merchant_id_merchants_id_fk");
    expect(sql).toMatch(/FOREIGN KEY \(merchant_id\) REFERENCES merchants \(id\)\s*;/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS uploaded_files_merchant_id_idx\s+ON uploaded_files \(merchant_id\)/);
  });

  it("is additive: it never deletes, drops, truncates or rewrites a stored reference", () => {
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    // Its only UPDATEs stamp the tenant on uploaded_files rows, and only NULL ones.
    const updates = sql.match(/\bUPDATE\b[\s\S]*?;/gi) ?? [];
    expect(updates).toHaveLength(2);
    for (const statement of updates) {
      expect(statement).toMatch(/UPDATE uploaded_files AS f\s+SET merchant_id = /);
      expect(statement).toContain("f.merchant_id IS NULL");
    }
  });

  it("refuses to accept an existing merchant_id column of the wrong shape", () => {
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toContain("unexpected shape");
  });

  it("attributes an invoice document only when every referencing row agrees on one existing merchant", () => {
    expect(sql).toContain("count(DISTINCT r.merchant_id) = 1");
    expect(sql).toMatch(/count\(\*\) = \(SELECT count\(\*\) FROM refs AS x WHERE x\.path = r\.path\)/);
    expect(sql).toContain("JOIN merchants AS m ON m.id = r.merchant_id");
    for (const table of ["invoices_rent_requests", "quotes", "job_invoices"]) {
      expect(sql).toMatch(new RegExp(`FROM ${table}\\b`));
    }
  });
});
