import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  INVENTORY_GATED_MIGRATIONS, STAGED_INVENTORY_TABLE, UPLOAD_OWNERSHIP_REPAIR_MIGRATION,
  parseUploadOwnershipInventory, readUploadOwnershipInventory, readUploadOwnershipInventoryOption,
  requireUploadOwnershipInventory, UploadOwnershipInventoryError,
} from "../upload-ownership-inventory";
import {
  checksumAll, defaultMigrationsDir, executableStatements, inspectMigrationSafety, listMigrationFiles,
  redactedFailureText, runPendingMigrations, parseCliArgs, type LedgerRow, type MigrationClient,
} from "../migrate";

const target = { host: "127.0.0.1", port: 55439, database: "synthetic" };
const good = () => ({ version: 1, target, approvedBy: "synthetic-reviewer", approvedAt: "2026-09-19T12:00:00.000Z",
  entries: [{ fileId: 1, pathSha256: "a".repeat(64), contentSha256: "b".repeat(64), merchantId: 101,
    evidence: { kind: "authenticated-upload-log", reference: "secured-evidence-17", sha256: "c".repeat(64) } }] });
function parse(value: unknown, expectedTarget = target) {
  const source = JSON.stringify(value);
  return parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), expectedTarget);
}

it("accepts an approved inventory bound to the exact target and artifact", () => {
  expect(parse(good()).entries[0].merchantId).toBe(101);
});
it("refuses an unpinned or modified artifact", () => {
  expect(() => parseUploadOwnershipInventory(JSON.stringify(good()), "d".repeat(64), target)).toThrow(UploadOwnershipInventoryError);
});
it.each([
  () => ({ ...good(), approvedBy: "" }),
  () => ({ ...good(), approvedAt: null }),
  () => ({ ...good(), entries: [{ ...good().entries[0], merchantId: null }] }),
  () => ({ ...good(), entries: [{ ...good().entries[0], evidence: { ...good().entries[0].evidence, kind: "invoice-reference" } }] }),
  () => ({ ...good(), entries: [{ ...good().entries[0], evidence: { ...good().entries[0].evidence, reference: "" } }] }),
  () => ({ ...good(), entries: [good().entries[0],good().entries[0]] }),
])("rejects incomplete, inferred or duplicate ownership", build => {
  expect(() => parse(build())).toThrow(UploadOwnershipInventoryError);
});
it.each([ { ...target, host: "elsewhere" }, { ...target, port: 5432 }, { ...target, database: "other" } ])(
  "rejects a wrong target", other => { expect(() => parse(good(), other)).toThrow(UploadOwnershipInventoryError); },
);
it("requires an inventory for the historical attribution and both repair migrations", () => {
  for (const filename of ["0023_uploaded_files_tenant_column.sql", "0024_invoice_document_security.sql", "0025_verified_upload_ownership.sql"]) {
    expect(() => requireUploadOwnershipInventory(filename, undefined)).toThrow("UPLOAD_INVENTORY_REQUIRED");
  }
});
it("blocks the actual migration chain before creating a ledger or applying SQL", async () => {
  const issued: string[] = [];
  const client = { query: async (sql: string) => { issued.push(sql); return { rows: [] }; } };
  await expect(runPendingMigrations(client, { log: () => undefined })).rejects.toThrow("UPLOAD_INVENTORY_REQUIRED");
  expect(issued.every(sql => /^\s*SELECT\b/i.test(sql))).toBe(true);
});
it("parses the inventory path and approved digest without exposing their values in errors", () => {
  const options = parseCliArgs(["--upload-ownership-inventory=/private/inventory.json", `--upload-ownership-inventory-sha256=${"a".repeat(64)}`]);
  expect(options.unknown).toEqual([]);
  expect(options.uploadOwnershipInventoryPath).toBe("/private/inventory.json");
});

// ---------------------------------------------------------------------------
// Added 2026-09-21, before the runner wiring and migration 0025 existed: the
// failing tests for the rest of the owner's decision ("Require a trusted
// ownership inventory before migration",
// docs/decisions/2026-09-19-gap13-trusted-ownership-inventory.md).
// ---------------------------------------------------------------------------

const MIGRATIONS = defaultMigrationsDir();
const REPAIR = "0025_verified_upload_ownership.sql";

/** Every statement sent, with its values, answering only what the gate reads. */
function recordingClient(answers: {
  ledger?: LedgerRow[]; database?: string; hasFiles?: boolean; missing?: number; invalid?: number;
} = {}) {
  const calls: { text: string; values?: unknown[] }[] = [];
  const answer = (text: string): unknown[] => {
    if (text.startsWith("SELECT filename")) return answers.ledger ?? [];
    if (text.includes("to_regclass('public.uploaded_files')")) {
      return [{ database: answers.database ?? target.database, has_files: answers.hasFiles ?? true }];
    }
    if (text.includes("WITH inventory AS")) return [{ missing: answers.missing ?? 0, invalid: answers.invalid ?? 0 }];
    return [];
  };
  const client: MigrationClient = {
    async query(text: string, values?: unknown[]) {
      calls.push({ text, values });
      return { rows: answer(text) as any[] };
    },
  };
  return { client, calls };
}

function appliedThrough(last: string): LedgerRow[] {
  const files = listMigrationFiles(MIGRATIONS);
  const checksums = checksumAll(MIGRATIONS, files);
  return files.slice(0, files.indexOf(last) + 1).map((filename) => ({
    filename, checksum: checksums.get(filename)!, applied_at: "2026-09-19T00:00:00Z", baselined: false,
  }));
}

// Reads only: SELECTs, plus the coverage check, a read-only CTE.
const touchedNothing = (calls: { text: string }[]) =>
  calls.every(({ text }) => /^\s*SELECT\b/i.test(text) || /^\s*WITH inventory AS \(/.test(text));

describe("the runner's ownership gate", () => {
  it("names only migrations that exist, so a typo cannot silently switch the gate off", () => {
    const files = new Set(listMigrationFiles(MIGRATIONS));
    expect([...INVENTORY_GATED_MIGRATIONS].filter((name) => !files.has(name))).toEqual([]);
    expect(UPLOAD_OWNERSHIP_REPAIR_MIGRATION).toBe(REPAIR);
  });

  it("refuses the development database's shape too (0023 applied, the rest pending) before any transaction", async () => {
    const { client, calls } = recordingClient({ ledger: appliedThrough("0023_uploaded_files_tenant_column.sql") });
    await expect(runPendingMigrations(client, { log: () => undefined })).rejects.toThrow("UPLOAD_INVENTORY_REQUIRED");
    expect(touchedNothing(calls)).toBe(true);
  });

  it("keys on the repair migration's file name, not on its position", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inventory-gate-"));
    try {
      fs.writeFileSync(path.join(dir, "0000_a.sql"), "CREATE TABLE a (id int);\n");
      fs.writeFileSync(path.join(dir, REPAIR), "SELECT 1;\n");
      const { client, calls } = recordingClient();
      await expect(runPendingMigrations(client, { dir, log: () => undefined })).rejects.toThrow("UPLOAD_INVENTORY_REQUIRED");
      expect(touchedNothing(calls)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // Guards against an over-broad gate. Passes before the gate exists too, by design.
  it("asks for nothing when no gated migration is pending", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inventory-gate-"));
    try {
      fs.writeFileSync(path.join(dir, "0000_a.sql"), "CREATE TABLE a (id int);\n");
      const { client } = recordingClient();
      await expect(runPendingMigrations(client, { dir, log: () => undefined }))
        .resolves.toMatchObject({ appliedNow: ["0000_a.sql"] });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("checks the inventory against the database before anything is applied", async () => {
    for (const mismatch of [{ missing: 1 }, { invalid: 1 }]) {
      const { client, calls } = recordingClient(mismatch);
      await expect(runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: parse(good()) }))
        .rejects.toThrow("UPLOAD_INVENTORY_COVERAGE_MISMATCH");
      expect(touchedNothing(calls)).toBe(true);
    }
  });

  it("refuses an inventory approved for a different database", async () => {
    const { client, calls } = recordingClient({ database: "some_other_database" });
    await expect(runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: parse(good()) }))
      .rejects.toThrow("UPLOAD_INVENTORY_TARGET_MISMATCH");
    expect(touchedNothing(calls)).toBe(true);
  });

  it("stages the inventory inside 0025's own transaction, after locking uploads and before its first statement", async () => {
    const inventory = parse(good());
    const { client, calls } = recordingClient();
    const result = await runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: inventory });
    expect(result.appliedNow).toContain(REPAIR);

    const transactions: { text: string; values?: unknown[] }[][] = [];
    let open: { text: string; values?: unknown[] }[] | null = null;
    for (const call of calls) {
      if (call.text === "BEGIN") { open = []; continue; }
      if (call.text === "COMMIT") { transactions.push(open!); open = null; continue; }
      open?.push(call);
    }
    const ledgerFile = (tx: { text: string; values?: unknown[] }[]) =>
      tx.find(({ text }) => text.startsWith("INSERT INTO drizzle.applied_migrations"))?.values?.[0];
    const repair = transactions.find((tx) => ledgerFile(tx) === REPAIR)!;
    const others = transactions.filter((tx) => ledgerFile(tx) !== REPAIR);
    const at = (pattern: RegExp) => repair.findIndex(({ text }) => pattern.test(text));

    const lock = at(/^LOCK TABLE public\.uploaded_files IN SHARE ROW EXCLUSIVE MODE$/);
    const coverage = at(/WITH inventory AS/);
    const staged = at(new RegExp(`INSERT INTO pg_temp\\.${STAGED_INVENTORY_TABLE}`));
    const firstOwn = repair.findIndex(({ text }) =>
      text === executableStatements(fs.readFileSync(path.join(MIGRATIONS, REPAIR), "utf8"))[0].raw);
    expect(lock).toBeGreaterThanOrEqual(0);
    expect([lock < coverage, coverage < staged, staged < firstOwn]).toEqual([true, true, true]);
    expect(repair[staged].values).toEqual(expect.arrayContaining([inventory.approvedBy, inventory.sha256]));
    expect(others.some((tx) => tx.some(({ text }) => /LOCK TABLE public\.uploaded_files/.test(text)))).toBe(false);
  });

  it("reports rather than refuses in a dry run, and touches nothing", async () => {
    const { client, calls } = recordingClient();
    const log: string[] = [];
    await expect(runPendingMigrations(client, { dryRun: true, log: (line) => log.push(line) }))
      .resolves.toMatchObject({ appliedNow: [] });
    expect(log.join("\n")).toContain("UPLOAD_INVENTORY_REQUIRED");
    expect(touchedNothing(calls)).toBe(true);
  });
});

describe("migration 0025", () => {
  const source = () => fs.readFileSync(path.join(MIGRATIONS, REPAIR), "utf8");

  it("refuses to run unless the runner staged a verified inventory in the same transaction", () => {
    const [first] = executableStatements(source());
    expect(first.raw).toMatch(new RegExp(`to_regclass\\('pg_temp\\.${STAGED_INVENTORY_TABLE}'\\) IS NULL`, "i"));
    expect(first.raw).toMatch(/RAISE EXCEPTION/i);
  });

  it("clears every inferred invoice-document owner before assigning verified ones, and destroys nothing", () => {
    const statements = executableStatements(source()).map(({ raw }) => raw);
    const clear = statements.findIndex((s) => /SET\s+merchant_id\s*=\s*NULL/i.test(s) && s.includes("'invoices/%'"));
    const assign = statements.findIndex((s) =>
      /UPDATE\s+uploaded_files/i.test(s) && new RegExp(`FROM\\s+pg_temp\\.${STAGED_INVENTORY_TABLE}`, "i").test(s));
    expect(clear).toBeGreaterThan(0);
    expect(assign).toBeGreaterThan(clear);
    expect(inspectMigrationSafety(REPAIR, source())).toEqual([]);
    expect(statements.some((s) => /\b(?:DELETE|DROP|TRUNCATE)\b/i.test(s))).toBe(false);
  });
});

describe("the command line", () => {
  it("needs both inventory flags or neither", () => {
    expect(readUploadOwnershipInventoryOption({}, target)).toBeUndefined();
    expect(() => readUploadOwnershipInventoryOption({ path: "/private/inventory.json" }, target))
      .toThrow("UPLOAD_INVENTORY_FLAGS_INCOMPLETE");
    expect(() => readUploadOwnershipInventoryOption({ sha256: "a".repeat(64) }, target))
      .toThrow("UPLOAD_INVENTORY_FLAGS_INCOMPLETE");
    const options = parseCliArgs([`--upload-ownership-inventory-sha256=${"a".repeat(64)}`]);
    expect(options.uploadOwnershipInventorySha256).toBe("a".repeat(64));
  });

  it("never puts the inventory's path or digest into an error", () => {
    const secretPath = path.join(os.tmpdir(), "merchant-evidence-do-not-print.json");
    const digest = "e".repeat(64);
    let message = "";
    try {
      readUploadOwnershipInventoryOption({ path: secretPath, sha256: digest }, target);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("UPLOAD_INVENTORY_UNREADABLE");
    expect(message).not.toContain("do-not-print");
    expect(message).not.toContain(digest);
  });

  it("prints an inventory refusal as written, with what to do next", () => {
    let error: unknown;
    try { requireUploadOwnershipInventory(REPAIR, undefined); } catch (caught) { error = caught; }
    const text = redactedFailureText(error);
    expect(text).toContain("UPLOAD_INVENTORY_REQUIRED");
    expect(text).toContain("--upload-ownership-inventory-sha256");
    expect(text).not.toContain("MIGRATE_UNEXPECTED_FAILURE");
  });
});

describe("the CI convergence inventory", () => {
  it("is an approved, empty inventory bound to CI's disposable database", () => {
    const workflow = fs.readFileSync(path.resolve(".github/workflows/verify.yml"), "utf8");
    const file = /UPLOAD_OWNERSHIP_INVENTORY:\s*(\S+)/.exec(workflow)?.[1];
    const digest = /UPLOAD_OWNERSHIP_INVENTORY_SHA256:\s*([0-9a-f]{64})/.exec(workflow)?.[1];
    expect([file, digest].every(Boolean)).toBe(true);
    const inventory = readUploadOwnershipInventory(path.resolve(file!), digest!,
      { host: "127.0.0.1", port: 5432, database: "convergence" });
    expect(inventory.entries).toEqual([]);
  });
});
