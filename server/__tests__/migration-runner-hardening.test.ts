import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ACQUIRE_MIGRATION_LOCK_SQL,
  RELEASE_MIGRATION_LOCK_SQL,
  MigrationHistoryError,
  checksumAll,
  reportPendingMigrations,
  runPendingMigrations,
  withMigrationAdvisoryLock,
  type LedgerRow,
  type MigrationClient,
} from "../migrate";

function fakeClient(ledger: LedgerRow[] = []) {
  const calls: string[] = [];
  const client = {
    async query(text: string) {
      calls.push(text);
      if (text.startsWith("SELECT filename")) return { rows: ledger };
      return { rows: [] };
    },
  } as MigrationClient;
  return { client, calls };
}

describe("migration runner hardening", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-hardening-"));
    fs.writeFileSync(path.join(dir, "0000_a.sql"), "SELECT 1;\n");
    fs.writeFileSync(path.join(dir, "0001_b.sql"), "SELECT 2;\n");
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("refuses to apply a migration behind recorded history", async () => {
    const checksums = checksumAll(dir, ["0000_a.sql", "0001_b.sql"]);
    const ledger: LedgerRow[] = [{
      filename: "0001_b.sql",
      checksum: checksums.get("0001_b.sql")!,
      applied_at: new Date().toISOString(),
      baselined: false,
    }];
    const { client, calls } = fakeClient(ledger);

    await expect(runPendingMigrations(client, { dir })).rejects.toBeInstanceOf(
      MigrationHistoryError,
    );
    expect(calls).not.toContain("BEGIN");
  });

  test("refuses when the ledger names a file absent from the release", async () => {
    const { client, calls } = fakeClient([{
      filename: "0099_removed.sql",
      checksum: "gone",
      applied_at: new Date().toISOString(),
      baselined: false,
    }]);
    await expect(runPendingMigrations(client, { dir })).rejects.toBeInstanceOf(
      MigrationHistoryError,
    );
    expect(calls).not.toContain("BEGIN");
  });

  test("always releases the process-wide advisory lock", async () => {
    const success = fakeClient();
    await expect(
      withMigrationAdvisoryLock(success.client, async () => "ok"),
    ).resolves.toBe("ok");
    expect(success.calls).toEqual([
      ACQUIRE_MIGRATION_LOCK_SQL,
      RELEASE_MIGRATION_LOCK_SQL,
    ]);

    const failure = fakeClient();
    await expect(
      withMigrationAdvisoryLock(failure.client, async () => {
        throw new Error("apply failed");
      }),
    ).rejects.toThrow("apply failed");
    expect(failure.calls).toEqual([
      ACQUIRE_MIGRATION_LOCK_SQL,
      RELEASE_MIGRATION_LOCK_SQL,
    ]);
  });

  test("production-style startup checks fail closed when the database cannot be inspected", async () => {
    await expect(reportPendingMigrations({
      connectionString: "postgres://u:p@192.0.2.1:5432/none?sslmode=disable",
      connectionTimeoutMs: 100,
      failOnIssues: true,
      log: () => undefined,
    })).rejects.toBeDefined();
  }, 20_000);
});
