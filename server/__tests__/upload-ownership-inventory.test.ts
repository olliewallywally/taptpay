import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ATTACH_WINDOW, INVENTORY_GATED_MIGRATIONS, STAGED_INVENTORY_TABLE, UPLOAD_OWNERSHIP_REPAIR_MIGRATION,
  buildDraftInventory, classifyInvoiceDocument, parseUploadOwnershipInventory, readUploadOwnershipInventory,
  readUploadOwnershipInventoryOption, requireUploadOwnershipInventory, summarizeClassifications,
  UploadOwnershipInventoryError, type InvoiceDocumentFacts,
} from "../upload-ownership-inventory";
import {
  checksumAll, defaultMigrationsDir, executableStatements, inspectMigrationSafety, listMigrationFiles,
  redactedFailureText, runPendingMigrations, parseCliArgs, type LedgerRow, type MigrationClient,
} from "../migrate";
import { parseDraftArguments } from "../draft-upload-inventory";

const target = { host: "127.0.0.1", port: 55439, database: "synthetic" };
// Version 2 (owner decision 2026-09-21): every invoice document is listed once,
// either with an owner and evidence, or locked (admin-only) with a reason.
const good = () => ({ version: 2, target, approvedBy: "synthetic-reviewer", approvedAt: "2026-09-19T12:00:00.000Z",
  entries: [{ fileId: 1, pathSha256: "a".repeat(64), contentSha256: "b".repeat(64), disposition: "owner", merchantId: 101,
    evidence: { kind: "authenticated-upload-log", reference: "secured-evidence-17", sha256: "c".repeat(64) } }] });
const locked = (over: Record<string, unknown> = {}) => ({ fileId: 2, pathSha256: "d".repeat(64),
  contentSha256: "e".repeat(64), disposition: "locked", reason: "never-attached", ...over });
function parse(value: unknown, expectedTarget = target) {
  const source = JSON.stringify(value);
  return parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), expectedTarget);
}

it("accepts an approved inventory bound to the exact target and artifact", () => {
  const [entry] = parse(good()).entries;
  expect(entry.disposition === "owner" && entry.merchantId).toBe(101);
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
  facts?: Record<string, unknown>[];
} = {}) {
  const calls: { text: string; values?: unknown[] }[] = [];
  const answer = (text: string): unknown[] => {
    if (text.startsWith("SELECT filename")) return answers.ledger ?? [];
    if (text.includes("to_regclass('public.uploaded_files')")) {
      return [{ database: answers.database ?? target.database, has_files: answers.hasFiles ?? true }];
    }
    if (text.includes("WITH inventory AS")) return [{ missing: answers.missing ?? 0, invalid: answers.invalid ?? 0 }];
    if (text.includes("WITH refs AS")) return answers.facts ?? [];
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

// Reads only: SELECTs, plus the coverage check and the facts query (read-only CTEs).
const touchedNothing = (calls: { text: string }[]) =>
  calls.every(({ text }) => /^\s*SELECT\b/i.test(text) || /^\s*WITH (?:inventory|refs) AS \(/.test(text));

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
    // A locked (admin-only) entry must never receive an owner.
    expect(statements[assign]).toMatch(/disposition\s*=\s*'owner'/i);
    expect(inspectMigrationSafety(REPAIR, source())).toEqual([]);
    expect(statements.some((s) => /\b(?:DELETE|DROP|TRUNCATE)\b/i.test(s))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Owner decision 2026-09-21 ("please go ahead with all of your recommendations"):
// TaptPay's own records are proof when exactly one merchant attached the document
// within 24 hours of its upload; every other document is kept but locked to the
// audited admin, and no longer blocks the release. Written before the code.
// ---------------------------------------------------------------------------

const uploadedAt = new Date("2026-07-01T10:00:00Z");
const facts = (over: Partial<InvoiceDocumentFacts> = {}): InvoiceDocumentFacts => ({
  fileId: 1, pathSha256: "a".repeat(64), contentSha256: "b".repeat(64), nameRecognised: true, uploadedAt,
  merchants: 1, merchantId: 7, merchantExists: true, firstAttachedAt: new Date(+uploadedAt + 2 * 60_000), ...over,
});

describe("the automatic rule", () => {
  it("gives the document to the one merchant who attached it within 24 hours of upload", () => {
    expect(classifyInvoiceDocument(facts())).toMatchObject({ disposition: "owner", merchantId: 7 });
  });

  it("accepts the edges: exactly 24 hours after, and up to 5 minutes before (clock skew)", () => {
    expect(ATTACH_WINDOW).toEqual({ beforeMs: 5 * 60_000, afterMs: 24 * 3_600_000 });
    for (const offset of [ATTACH_WINDOW.afterMs, -ATTACH_WINDOW.beforeMs]) {
      expect(classifyInvoiceDocument(facts({ firstAttachedAt: new Date(+uploadedAt + offset) })).disposition).toBe("owner");
    }
  });

  it.each<[string, Partial<InvoiceDocumentFacts>, string]>([
    ["never attached to anything", { merchants: 0, merchantId: null, firstAttachedAt: null }, "never-attached"],
    ["attached by two merchants", { merchants: 2, merchantId: null }, "several-merchants"],
    ["first attached more than 24 hours after upload", { firstAttachedAt: new Date(+uploadedAt + 24 * 3_600_000 + 1) }, "attached-outside-window"],
    ["attached more than 5 minutes before its recorded upload", { firstAttachedAt: new Date(+uploadedAt - 5 * 60_000 - 1) }, "attached-outside-window"],
    ["named in a way the upload route never generates", { nameRecognised: false, uploadedAt: null }, "unrecognised-name"],
    ["attached by a merchant that no longer exists", { merchantExists: false }, "merchant-missing"],
    ["with no recorded attach time", { firstAttachedAt: null }, "attach-time-unknown"],
  ])("locks a document %s", (_, over, reason) => {
    expect(classifyInvoiceDocument(facts(over))).toEqual({ disposition: "locked", reason });
  });
});

describe("the version-2 list", () => {
  it("accepts a locked (admin-only) entry that carries only its reason", () => {
    expect(parse({ ...good(), entries: [good().entries[0], locked()] }).entries[1])
      .toMatchObject({ disposition: "locked", reason: "never-attached" });
  });

  it.each([
    ["a locked entry that names an owner", () => locked({ merchantId: 101 })],
    ["a locked entry that carries evidence", () => locked({ evidence: good().entries[0].evidence })],
    ["a locked entry with an unknown reason", () => locked({ reason: "felt-like-it" })],
    ["an owner entry with no evidence", () => ({ ...good().entries[0], evidence: undefined })],
    ["an owner entry that also gives a locked reason", () => ({ ...good().entries[0], reason: "never-attached" })],
  ])("refuses %s", (_, entry) => {
    expect(() => parse({ ...good(), entries: [entry()] })).toThrow("UPLOAD_INVENTORY_INVALID");
  });

  it("refuses a version-1 list, which could not lock a document", () => {
    const { disposition: _d, ...v1Entry } = good().entries[0];
    expect(() => parse({ ...good(), version: 1, entries: [v1Entry] })).toThrow("UPLOAD_INVENTORY_INVALID");
  });
});

/** The facts query's row shape (bigint milliseconds arrive from pg as strings). */
const factRow = (over: Record<string, unknown> = {}) => ({
  file_id: 1, path_sha256: "a".repeat(64), content_sha256: null, name_recognised: true,
  uploaded_ms: String(+uploadedAt), merchants: 1, merchant_id: 101, merchant_exists: true,
  first_attached_ms: String(+uploadedAt + 60_000), ...over,
});
const systemRecord = () => ({ ...good(), entries: [{ ...good().entries[0],
  evidence: { kind: "system-record", reference: "first attached 60s after upload", sha256: "f".repeat(64) } }] });

describe("the runner checks TaptPay's own records itself", () => {
  it("accepts an entry the records support", async () => {
    const { client } = recordingClient({ facts: [factRow()] });
    await expect(runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: parse(systemRecord()) }))
      .resolves.toMatchObject({ appliedNow: expect.arrayContaining([REPAIR]) });
  });

  it.each([
    ["names a different merchant", { merchant_id: 202 }],
    ["was attached two days after upload", { first_attached_ms: String(+uploadedAt + 48 * 3_600_000) }],
    ["was attached by two merchants", { merchants: 2 }],
  ])("refuses an entry claiming the records when the document %s, before anything runs", async (_, over) => {
    const { client, calls } = recordingClient({ facts: [factRow(over)] });
    await expect(runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: parse(systemRecord()) }))
      .rejects.toThrow("UPLOAD_INVENTORY_EVIDENCE_MISMATCH");
    expect(touchedNothing(calls)).toBe(true);
  });

  it("stages locked entries with no owner, and owners with their evidence", async () => {
    const inventory = parse({ ...good(), entries: [good().entries[0], locked()] });
    const { client, calls } = recordingClient();
    await runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: inventory });
    const staged = calls.find(({ text }) => text.includes(`INSERT INTO pg_temp.${STAGED_INVENTORY_TABLE}`))!;
    expect(JSON.parse(String(staged.values![0]))).toEqual([
      expect.objectContaining({ file_id: 1, disposition: "owner", merchant_id: 101, evidence_kind: "authenticated-upload-log", locked_reason: null }),
      expect.objectContaining({ file_id: 2, disposition: "locked", merchant_id: null, evidence_kind: null, locked_reason: "never-attached" }),
    ]);
  });
});

describe("drafting the list from a database's own records", () => {
  const all = [
    facts({ fileId: 1 }),
    facts({ fileId: 2, merchants: 0, merchantId: null, firstAttachedAt: null }),
    facts({ fileId: 3, merchants: 2, merchantId: null }),
    facts({ fileId: 4, firstAttachedAt: new Date(+uploadedAt + 3 * 86_400_000) }),
  ];

  it("lists every document once — owners with the records as evidence, the rest locked with a reason", () => {
    const { inventory, summary } = buildDraftInventory(all, { target, approvedBy: "Operator", approvedAt: "2026-09-21T00:00:00Z" });
    expect(inventory.version).toBe(2);
    expect(inventory.entries.map((e) => [e.fileId, e.disposition])).toEqual([[1, "owner"], [2, "locked"], [3, "locked"], [4, "locked"]]);
    expect(inventory.entries[0]).toMatchObject({ merchantId: 7, evidence: { kind: "system-record" } });
    expect(summary).toEqual({ total: 4, owner: 1, locked: { "never-attached": 1, "several-merchants": 1, "attached-outside-window": 1 } });
    const source = JSON.stringify(inventory);
    // A draft round-trips through the same validator the runner uses.
    expect(parse(inventory).entries).toHaveLength(4);
    expect(source).not.toMatch(/invoices\//);
  });

  it("counts without content hashes for the read-only summary", () => {
    expect(summarizeClassifications(all.map((f) => ({ ...f, contentSha256: null })))).toEqual(
      { total: 4, owner: 1, locked: { "never-attached": 1, "several-merchants": 1, "attached-outside-window": 1 } });
  });

  it("refuses to draft a list without content hashes", () => {
    expect(() => buildDraftInventory([facts({ contentSha256: null })], { target, approvedBy: "Operator", approvedAt: "2026-09-21T00:00:00Z" }))
      .toThrow();
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

describe("the drafting command line", () => {
  const base = ["--target=local", "--expected-host=127.0.0.1", "--expected-database=synthetic"];

  it("takes the runner's own target flags plus exactly one mode", () => {
    expect(parseDraftArguments([...base, "--count-only"])).toMatchObject({ countOnly: true });
    expect(parseDraftArguments([...base, "--out=/private/draft.json", "--approved-by=Synthetic Operator"]))
      .toMatchObject({ countOnly: false, out: "/private/draft.json", approvedBy: "Synthetic Operator" });
  });

  it.each([
    ["no mode", []],
    ["both modes", ["--count-only", "--out=/private/draft.json", "--approved-by=Op"]],
    ["a draft with no approver", ["--out=/private/draft.json"]],
    ["a repeated flag", ["--count-only", "--count-only"]],
    ["a runner mode", ["--count-only", "--release"]],
    ["a dry run", ["--count-only", "--dry-run"]],
    ["permission to destroy", ["--count-only", "--allow-destructive"]],
    ["an inventory to apply", ["--count-only", "--upload-ownership-inventory=/private/x.json"]],
    ["an unknown flag", ["--count-only", "--everything"]],
  ])("refuses %s", (_, extra) => {
    expect(() => parseDraftArguments([...base, ...extra])).toThrow("MIGRATE_CLI_INVALID_ARGUMENTS");
  });
});
