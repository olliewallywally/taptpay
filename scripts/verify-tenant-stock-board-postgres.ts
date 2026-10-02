/**
 * R1-T7 S1: actual DatabaseStorage on an empty, explicitly disposable PostgreSQL database.
 * Applies the real migration chain. Synthetic rows are retained; no automatic database deletion.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-tenant-stock-board-postgres.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { assertSafePostgresVerifierEnvironment } from "./postgres-verifier-safety.mjs";

const { testDatabaseUrl } = assertSafePostgresVerifierEnvironment({
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  configuredDatabaseUrl: process.env.DATABASE_URL,
  marker: process.env.TAPTPAY_TEST_DATABASE,
});
assertSafePostgresVerifierEnvironment({
  testDatabaseUrl, configuredDatabaseUrl: process.env.NEON_DATABASE_URL, marker: process.env.TAPTPAY_TEST_DATABASE,
});
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
const writerPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1, application_name: "taptpay-t7-s1-writer" });
const failures: string[] = [];
let passes = 0;
async function check(name: string, test: () => Promise<void>) {
  try { await test(); passes++; console.log(`PASS ${name}`); }
  catch (error) {
    failures.push(name);
    // All fixture values are synthetic, but keep diagnostics out of the durable count-only report.
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : "unknown failure"}`);
  }
}

try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires an empty disposable database");
  await import("../server/__tests__/support/test-env");
  const runner = await import("../server/migrate");
  const inventories = await import("../server/upload-ownership-inventory");
  const client = await pool.connect();
  try {
    await runner.ensureMigrationLedger(client);
    for (const file of runner.listMigrationFiles()) {
      if (file === "0025_verified_upload_ownership.sql") break;
      await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
    }
    const url = new URL(testDatabaseUrl);
    const target = { host: url.hostname, port: Number(url.port || 5432), database: decodeURIComponent(url.pathname.slice(1)) };
    const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
    const { inventory } = inventories.buildDraftInventory(facts, {
      target, approvedBy: "synthetic verifier", approvedAt: "2026-10-02T00:00:00Z",
    });
    assert.equal(inventory.entries.length, 0, "empty database has no documents to assign");
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
    await runner.runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: verified });
    console.log("MIGRATIONS applied through the existing runner on the empty disposable database");
  } finally { client.release(); }

  const { DatabaseStorage } = await import("../server/storage");
  const schema = await import("../shared/schema");
  const one = new DatabaseStorage(drizzle(pool, { schema }) as any);
  const two = new DatabaseStorage(drizzle(writerPool, { schema }) as any);
  await writerPool.query("SET statement_timeout='10s'");
  const addMerchant = async (label: string) => (await pool.query(
    "INSERT INTO merchants(name,business_name,email,status) VALUES ($1,$1,$2,'active') RETURNING id",
    [label, `${label}@tenant-storage.test`],
  )).rows[0].id as number;
  const a = await addMerchant("tenant-a");
  const b = await addMerchant("tenant-b");

  await check("stock reads and every mutation refuse the other tenant with identical stored rows", async () => {
    const item = await one.createStockItem({ merchantId: b, name: "Other stock", cost: "9.00" });
    assert.equal(await one.getStockItemForMerchant(item.id, a), undefined);
    assert.equal(await one.updateStockItemForMerchant(item.id, a, { name: "Changed" }), undefined);
    assert.equal(await one.deleteStockItemForMerchant(item.id, a), false);
    assert.deepEqual(await two.getStockItemForMerchant(item.id, b), item);
  });

  await check("board reads, rename, URLs and deletion refuse the other tenant with identical stored rows", async () => {
    const board = await one.createTaptStone({ merchantId: b, name: "Other board", stoneNumber: 1 });
    assert.equal(await one.getTaptStoneForMerchant(board.id, a), undefined);
    assert.equal(await one.updateTaptStoneForMerchant(board.id, a, { name: "Changed" }), undefined);
    assert.equal(await one.updateTaptStoneUrlsForMerchant(board.id, a, "/wrong-qr", "/wrong-pay"), undefined);
    assert.equal(await one.deleteTaptStoneForMerchant(board.id, a), false);
    assert.deepEqual(await two.getTaptStoneForMerchant(board.id, b), board);
  });

  await check("authorized stock changes preserve omitted/null fields, ownership and soft-delete behavior", async () => {
    const item = await one.createStockItem({ merchantId: a, name: "Stock", cost: "1.00", description: "Keep", emoji: "x" });
    const updated = await two.updateStockItemForMerchant(item.id, a, {
      name: "New", emoji: null, merchantId: b, id: 99999, isActive: false, createdAt: new Date(0),
    } as any);
    assert.ok(updated);
    assert.equal(updated.merchantId, a);
    assert.equal(updated.id, item.id);
    assert.equal(updated.description, "Keep");
    assert.equal(updated.cost, "1.00");
    assert.equal(updated.emoji, null);
    assert.equal(updated.isActive, true);
    assert.deepEqual(updated.createdAt, item.createdAt);
    assert.equal(await one.deleteStockItemForMerchant(item.id, a), true);
    assert.equal(await two.deleteStockItemForMerchant(item.id, a), true);
    assert.equal((await one.getStockItemForMerchant(item.id, a))?.isActive, false);
    assert.equal((await one.getStockItemsByMerchant(a)).some((row) => row.id === item.id), false);
  });

  await check("authorized board changes preserve identity, URLs, soft deletion and number reuse", async () => {
    const board = await one.createNextTaptStone(a, "Counter");
    const changed = await two.updateTaptStoneForMerchant(board.id, a, {
      name: "Front", merchantId: b, id: 99999, isActive: false, stoneNumber: 9,
    } as any);
    assert.ok(changed);
    assert.equal(changed.merchantId, a);
    assert.equal(changed.id, board.id);
    assert.equal(changed.stoneNumber, board.stoneNumber);
    assert.equal(changed.isActive, true);
    const urls = await one.updateTaptStoneUrlsForMerchant(board.id, a, "/qr", "/pay");
    assert.equal(urls?.qrCodeUrl, "/qr");
    assert.equal(urls?.paymentUrl, "/pay");
    assert.equal(await one.deleteTaptStoneForMerchant(board.id, a), true);
    assert.equal(await two.deleteTaptStoneForMerchant(board.id, a), true);
    assert.equal((await one.getTaptStoneForMerchant(board.id, a))?.isActive, false);
    assert.equal((await one.createNextTaptStone(a)).stoneNumber, board.stoneNumber);
  });

  await check("invalid tenant arguments neither read nor change rows", async () => {
    const item = await one.createStockItem({ merchantId: a, name: "Guarded", cost: "1.00" });
    const board = await one.createNextTaptStone(a);
    for (const invalid of [undefined, null, 0, -1, 1.5, NaN, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(await one.getStockItemForMerchant(item.id, invalid as any), undefined);
      assert.equal(await one.updateStockItemForMerchant(item.id, invalid as any, { name: "Changed" }), undefined);
      assert.equal(await one.deleteStockItemForMerchant(item.id, invalid as any), false);
      assert.equal(await one.getTaptStoneForMerchant(board.id, invalid as any), undefined);
      assert.equal(await one.updateTaptStoneForMerchant(board.id, invalid as any, { name: "Changed" }), undefined);
      assert.equal(await one.updateTaptStoneUrlsForMerchant(board.id, invalid as any, "/qr", "/pay"), undefined);
      assert.equal(await one.deleteTaptStoneForMerchant(board.id, invalid as any), false);
    }
    assert.deepEqual(await two.getStockItemForMerchant(item.id, a), item);
    assert.deepEqual(await two.getTaptStoneForMerchant(board.id, a), board);
  });

  // Force the write to wait on a concurrent ownership update, then commit that update. PostgreSQL
  // must re-evaluate the tenant predicate before applying the management change.
  for (const kind of ["stock", "board"] as const) {
    for (const operation of kind === "stock" ? ["rename", "delete"] : ["rename", "urls", "delete"]) {
      await check(`${kind} ${operation} refuses after a concurrent committed ownership change`, async () => {
        const row = kind === "stock"
          ? await one.createStockItem({ merchantId: a, name: "Race stock", cost: "1.00" })
          : await one.createTaptStone({ merchantId: a, name: "Race board", stoneNumber: 7 });
        const table = kind === "stock" ? "stock_items" : "tapt_stones";
        const locker = await pool.connect();
        let pending: Promise<unknown> | undefined;
        let transactionOpen = false;
        try {
          await locker.query("BEGIN");
          transactionOpen = true;
          await locker.query(`UPDATE ${table} SET merchant_id=$1 WHERE id=$2`, [b, row.id]);
          pending = kind === "stock"
            ? operation === "delete" ? two.deleteStockItemForMerchant(row.id, a)
              : two.updateStockItemForMerchant(row.id, a, { name: "Must not land" })
            : operation === "delete" ? two.deleteTaptStoneForMerchant(row.id, a)
              : operation === "urls" ? two.updateTaptStoneUrlsForMerchant(row.id, a, "/must-not-land", "/must-not-land")
                : two.updateTaptStoneForMerchant(row.id, a, { name: "Must not land" });
          // Attach rejection handling while polling; still rethrow through the original promise below.
          void pending.catch(() => undefined);
          let waited = false;
          for (let i = 0; i < 200; i++) {
            const state = await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", ["taptpay-t7-s1-writer"]);
            if (state.rowCount) { waited = true; break; }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          assert.ok(waited, "the mutation actually waited on the concurrent row lock");
          await locker.query("COMMIT");
          transactionOpen = false;
          assert.equal(await pending, operation === "delete" ? false : undefined);
          const actual = kind === "stock" ? await one.getStockItemForMerchant(row.id, b) : await one.getTaptStoneForMerchant(row.id, b);
          assert.deepEqual(actual, { ...row, merchantId: b });
          // Release the board number so the next race can start from the same approved fixture.
          if (kind === "board") await one.deleteTaptStoneForMerchant(row.id, b);
        } finally {
          if (transactionOpen) await locker.query("ROLLBACK");
          await pending?.catch(() => undefined);
          locker.release();
        }
      });
    }
  }
} finally {
  await Promise.all([pool.end(), writerPool.end()]);
}
console.log(`TENANT STORAGE POSTGRES: ${passes} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
