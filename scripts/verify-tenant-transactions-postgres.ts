/** R1-T7 S2a: actual storage, migrations and row-lock races on a new disposable loopback DB. */
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
assertSafePostgresVerifierEnvironment({ testDatabaseUrl, configuredDatabaseUrl: process.env.NEON_DATABASE_URL, marker: process.env.TAPTPAY_TEST_DATABASE });
const url = new URL(testDatabaseUrl);
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "requires disposable loopback PostgreSQL");
assert.match(decodeURIComponent(url.pathname.slice(1)), /^taptpay_s2_verify_[a-z0-9_]+$/, "requires a named S2 test database");
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
const writerPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1, application_name: "taptpay-t7-s2-writer" });
let passed = 0;
const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch { failures.push(name); console.error(`FAIL ${name}`); }
}

try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires a new empty disposable database");
  // These clear ambient application/provider credentials before any server module loads.
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
    const target = { host: url.hostname, port: Number(url.port || 5432), database: decodeURIComponent(url.pathname.slice(1)) };
    const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
    const { inventory } = inventories.buildDraftInventory(facts, { target, approvedBy: "synthetic verifier", approvedAt: "2026-10-03T00:00:00Z" });
    assert.equal(inventory.entries.length, 0);
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
    await runner.runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: verified });
    console.log("MIGRATIONS applied on the empty disposable database through the existing runner");
  } finally { client.release(); }

  const { DatabaseStorage } = await import("../server/storage");
  const schema = await import("../shared/schema");
  const one = new DatabaseStorage(drizzle(pool, { schema }) as any);
  const two = new DatabaseStorage(drizzle(writerPool, { schema }) as any);
  await writerPool.query("SET statement_timeout='10s'");
  const addMerchant = async (label: string): Promise<number> => (await pool.query(
    "INSERT INTO merchants(name,business_name,email,status) VALUES ($1,$1,$2,'active') RETURNING id", [label, `${label}@tenant-storage.test`],
  )).rows[0].id;
  const a = await addMerchant("s2-tenant-a");
  const b = await addMerchant("s2-tenant-b");
  const sale = (merchantId: number, status = "pending") => one.createTransaction({ merchantId, itemName: "Synthetic sale", price: "10.00", status } as any);

  await check("scoped transaction reads refuse the other tenant and missing rows", async () => {
    const row = await sale(b);
    assert.equal(await one.getTransactionForMerchant(row.id, a), undefined);
    assert.equal(await one.getTransactionForMerchant(999999, a), undefined);
    assert.deepEqual(await two.getTransactionForMerchant(row.id, b), row);
  });
  await check("refund reads require matching refund and parent ownership", async () => {
    const own = await sale(a, "completed");
    const other = await sale(b, "completed");
    const refund = await one.createRefund({ transactionId: own.id, merchantId: a, refundAmount: "1.00" });
    await one.createRefund({ transactionId: own.id, merchantId: b, refundAmount: "2.00" });
    await one.createRefund({ transactionId: other.id, merchantId: a, refundAmount: "3.00" });
    assert.deepEqual(await two.getRefundsForTransactionForMerchant(own.id, a), [refund]);
    assert.deepEqual(await two.getRefundsForTransactionForMerchant(own.id, b), []);
    assert.deepEqual(await two.getRefundsForTransactionForMerchant(other.id, a), []);
    await pool.query("UPDATE transactions SET merchant_id=$1 WHERE id=$2", [b, own.id]);
    assert.deepEqual(await two.getRefundsForTransactionForMerchant(own.id, a), []);
  });
  await check("foreign and missing cancellations have no mutation", async () => {
    const row = await sale(b);
    assert.deepEqual(await two.cancelTransactionForMerchant(row.id, a), { kind: "not-found" });
    assert.deepEqual(await two.cancelTransactionForMerchant(999999, a), { kind: "not-found" });
    assert.deepEqual(await one.getTransaction(row.id), row);
  });
  for (const status of ["pending", "processing", "completed", "cancelled", "failed", "refunded", "partially_refunded"]) {
    await check(`cancellation preserves the ${status} state rule and financial fields`, async () => {
      const row = await sale(a, status);
      const allowed = status === "pending" || status === "processing";
      const result = await two.cancelTransactionForMerchant(row.id, a);
      assert.deepEqual(result, allowed ? { kind: "cancelled", transaction: { ...row, status: "cancelled" } } : { kind: "conflict", status });
      assert.deepEqual(await one.getTransaction(row.id), allowed ? { ...row, status: "cancelled" } : row);
    });
  }
  await check("invalid tenants issue no query or mutation", async () => {
    const row = await sale(a);
    for (const invalid of [undefined, null, 0, -1, NaN, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(await two.getTransactionForMerchant(row.id, invalid as any), undefined);
      assert.deepEqual(await two.getRefundsForTransactionForMerchant(row.id, invalid as any), []);
      assert.deepEqual(await two.cancelTransactionForMerchant(row.id, invalid as any), { kind: "not-found" });
    }
    assert.deepEqual(await one.getTransaction(row.id), row);
  });

  await check("refund writes refuse foreign scope and enforce refund/parent ownership", async () => {
    const row = await sale(a, "completed");
    const refund = await one.createRefund({ transactionId: row.id, merchantId: a, refundAmount: "2.00" });
    assert.equal(await one.reserveRefundAmountForMerchant(row.id, b, 2), null);
    assert.equal(await one.releaseRefundAmountForMerchant(row.id, b, 2), false);
    assert.equal(await one.createRefundForMerchant(row.id, b, { refundAmount: "2.00" }), undefined);
    assert.equal(await one.updateRefundStatusForMerchant(refund.id, b, "completed"), undefined);
    assert.deepEqual(await one.getTransaction(row.id), row);
    await pool.query("UPDATE transactions SET merchant_id=$1 WHERE id=$2", [b, row.id]);
    assert.equal(await one.updateRefundStatusForMerchant(refund.id, a, "completed"), undefined);
    assert.equal(await one.updateRefundStatusForMerchant(refund.id, b, "completed"), undefined);
    assert.deepEqual(await one.getRefund(refund.id), refund);
  });
  await check("refund reservation preserves cap under simultaneous writes", async () => {
    const row = await sale(a, "completed");
    const result = await Promise.all([one.reserveRefundAmountForMerchant(row.id, a, 6), two.reserveRefundAmountForMerchant(row.id, a, 6)]);
    assert.equal(result.filter(Boolean).length, 1);
    assert.equal((await one.getTransaction(row.id))!.totalRefunded, "6.00");
    assert.equal(await one.releaseRefundAmountForMerchant(row.id, a, 6), true);
    assert.equal((await one.getTransaction(row.id))!.totalRefunded, "0.00");
  });
  await check("scoped refund creation projects fields and status update preserves bindings", async () => {
    const row = await sale(a, "completed");
    const refund = await one.createRefundForMerchant(row.id, a, { refundAmount: "2.00", merchantId: b, transactionId: 99999, status: "completed" } as any);
    assert.ok(refund);
    assert.equal(refund.merchantId, a);
    assert.equal(refund.transactionId, row.id);
    assert.equal(refund.status, "pending");
    assert.equal((await one.updateRefundStatusForMerchant(refund.id, a, "completed", "synthetic-refund"))!.status, "completed");
  });
  for (const operation of ["reserve", "release", "create", "status"] as const) {
    await check(`refund ${operation} waits and refuses committed ownership change`, async () => {
      const row = await sale(a, "completed");
      const refund = await one.createRefund({ transactionId: row.id, merchantId: a, refundAmount: "2.00" });
      const locker = await pool.connect();
      let pending: Promise<unknown> | undefined;
      let open = false;
      try {
        await locker.query("BEGIN"); open = true;
        await locker.query("UPDATE transactions SET merchant_id=$1 WHERE id=$2", [b, row.id]);
        pending = operation === "reserve" ? two.reserveRefundAmountForMerchant(row.id, a, 2)
          : operation === "release" ? two.releaseRefundAmountForMerchant(row.id, a, 2)
          : operation === "create" ? two.createRefundForMerchant(row.id, a, { refundAmount: "2.00" })
          : two.updateRefundStatusForMerchant(refund.id, a, "completed");
        void pending.catch(() => undefined);
        let waited = false;
        for (let i = 0; i < 200; i++) {
          const wait = await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", ["taptpay-t7-s2-writer"]);
          if (wait.rowCount) { waited = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(waited, "refund write must actually wait for the parent lock");
        await locker.query("COMMIT"); open = false;
        assert.equal(await pending, operation === "reserve" ? null : operation === "release" ? false : undefined);
        assert.deepEqual(await one.getTransaction(row.id), { ...row, merchantId: b });
        assert.deepEqual(await one.getRefund(refund.id), refund);
        assert.equal((await pool.query("SELECT count(*)::int n FROM refunds WHERE transaction_id=$1", [row.id])).rows[0].n, 1);
      } finally {
        if (open) await locker.query("ROLLBACK");
        await pending?.catch(() => undefined);
        locker.release();
      }
    });
  }

  for (const change of ["ownership", "completed"] as const) {
    await check(`cancellation waits and refuses a committed concurrent ${change} change`, async () => {
      const row = await sale(a);
      const locker = await pool.connect();
      let pending: ReturnType<typeof two.cancelTransactionForMerchant> | undefined;
      let transactionOpen = false;
      try {
        await locker.query("BEGIN"); transactionOpen = true;
        if (change === "ownership") await locker.query("UPDATE transactions SET merchant_id=$1 WHERE id=$2", [b, row.id]);
        else await locker.query("UPDATE transactions SET status='completed',completed_at=$1 WHERE id=$2", [new Date(0), row.id]);
        pending = two.cancelTransactionForMerchant(row.id, a);
        void pending.catch(() => undefined);
        let waited = false;
        for (let i = 0; i < 200; i++) {
          const wait = await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", ["taptpay-t7-s2-writer"]);
          if (wait.rowCount) { waited = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(waited, "the cancellation must actually wait for the other connection's row lock");
        await locker.query("COMMIT"); transactionOpen = false;
        assert.deepEqual(await pending, change === "ownership" ? { kind: "not-found" } : { kind: "conflict", status: "completed" });
        assert.deepEqual(await one.getTransaction(row.id), change === "ownership"
          ? { ...row, merchantId: b } : { ...row, status: "completed", completedAt: new Date(0) });
      } finally {
        if (transactionOpen) await locker.query("ROLLBACK");
        await pending?.catch(() => undefined);
        locker.release();
      }
    });
  }
  await check("two simultaneous cancellations produce one success", async () => {
    const row = await sale(a);
    const results = await Promise.all([one.cancelTransactionForMerchant(row.id, a), two.cancelTransactionForMerchant(row.id, a)]);
    assert.equal(results.filter(result => result.kind === "cancelled").length, 1);
    assert.deepEqual(results.find(result => result.kind === "conflict"), { kind: "conflict", status: "cancelled" });
    assert.deepEqual(await one.getTransaction(row.id), { ...row, status: "cancelled" });
  });
} finally { await Promise.all([pool.end(), writerPool.end()]); }
console.log(`S2 TRANSACTION STORAGE POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
