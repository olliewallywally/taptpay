/**
 * T-3 review pass 2, condition C2, on actual PostgreSQL: a retail decline recorded before migration
 * 0050 (its settlement event has no provider transaction column yet) is backfilled by 0050 and can
 * then be superseded by a later verified approval in the same session. Synthetic rows only.
 * docs/decisions/2026-10-15-t3-decline-supersession.md
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-t3-supersession-upgrade-postgres.ts
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { assertSafePostgresVerifierEnvironment } from "./postgres-verifier-safety.mjs";

const { testDatabaseUrl } = assertSafePostgresVerifierEnvironment({
  testDatabaseUrl: process.env.TEST_DATABASE_URL, configuredDatabaseUrl: process.env.DATABASE_URL,
  marker: process.env.TAPTPAY_TEST_DATABASE,
});
assertSafePostgresVerifierEnvironment({ testDatabaseUrl, configuredDatabaseUrl: process.env.NEON_DATABASE_URL, marker: process.env.TAPTPAY_TEST_DATABASE });
const url = new URL(testDatabaseUrl);
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
assert.match(decodeURIComponent(url.pathname.slice(1)), /^taptpay_s\d_verify_[a-z0-9_]+$/);

const MIGRATION = "0050_decline_supersession.sql";
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 6 });
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${(error as Error).message}`); }
}

try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires a new empty disposable database");
  await import("../server/__tests__/support/test-env");
  const runner = await import("../server/migrate");
  const { DatabaseStorage } = await import("../server/storage");
  const { PaymentAttemptService } = await import("../server/payment-attempt-service");
  const { DurablePaymentStorage } = await import("../server/durable-payment-storage");
  const { PaymentReconciliationWorker } = await import("../server/payment-reconciliation");
  const { createRetailReconciliationFinalizer, createRetailSessionRecoveryAttacher } = await import("../server/retail-reconciliation-adapter");
  const schema = await import("../shared/schema");
  const storage = new DatabaseStorage(drizzle(pool, { schema }) as any);
  const now = new Date(Date.now() + 600000), clock = () => new Date(now);
  const attempts = new PaymentAttemptService(storage, clock);
  const repository = new DurablePaymentStorage(pool as any, createRetailReconciliationFinalizer(attempts), createRetailSessionRecoveryAttacher(storage));

  const client = await pool.connect();
  let fixture: { saleId: number; sessionId: string; declined: string; binding: any };
  try {
    // Every migration before 0050 through the runner; 0023-0025 take the (empty) upload inventory.
    await runner.ensureMigrationLedger(client);
    const files = runner.listMigrationFiles();
    const position = files.indexOf(MIGRATION);
    assert.ok(position >= 0, "0050 is present in the migration history");
    const before = await mkdtemp(path.join(process.env.TMPDIR ?? os.tmpdir(), "t3-migrations-"));
    for (const file of files.slice(0, position)) await copyFile(`migrations/${file}`, path.join(before, file));
    for (const file of files) {
      if (file === "0023_uploaded_files_tenant_column.sql") break;
      await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
    }
    const inventories = await import("../server/upload-ownership-inventory");
    const target = { host: url.hostname, port: Number(url.port || 5432), database: decodeURIComponent(url.pathname.slice(1)) };
    const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
    const { inventory } = inventories.buildDraftInventory(facts, { target, approvedBy: "synthetic verifier", approvedAt: "2026-10-15T00:00:00Z" });
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
    await runner.runPendingMigrations(client, { dir: before, log: () => undefined, uploadOwnershipInventory: verified });

    // A decline recorded the way R3 recorded it before 0050: attempt, binding and event in one transaction.
    const merchant = (await client.query("INSERT INTO merchants(name,business_name,email,status) VALUES ('T-3','T-3',$1,'active') RETURNING id",
      [`${randomUUID()}@synthetic.test`])).rows[0].id;
    const sale = await storage.createTransaction({ merchantId: merchant, itemName: "T-3 upgrade", price: "10.00", status: "pending", paymentMethod: "qr_code", splitEnabled: false } as any);
    const claim = await attempts.claim({ transactionId: sale.id, shareIndex: 0, idempotencyKey: randomUUID() });
    if (claim.kind !== "claimed") throw new Error("fixture_claim");
    const expected = await repository.prepareRetailExpectation({ paymentAttemptId: claim.attempt.id, merchantId: merchant, currency: "NZD", environment: "uat", providerAccount: "synthetic-account" }, now);
    assert.ok(expected);
    const sessionId = `s-${randomUUID()}`, declined = `tx-${randomUUID()}`;
    assert.equal((await attempts.attachSession({ attemptId: claim.attempt.id, processorSessionId: sessionId, processorXId: expected!.processorXId, rawReturnState: randomBytes(32).toString("base64url") })).kind, "attached");
    assert.equal(await repository.bindRetailSession({ ...expected!, paymentAttemptId: claim.attempt.id, sessionId }, now), true);
    await client.query("BEGIN");
    await client.query("UPDATE payment_attempts SET state='finalizing' WHERE id=$1", [claim.attempt.id]);
    await client.query("UPDATE payment_attempts SET state='declined',outcome='declined',provider_transaction_id=$2 WHERE id=$1", [claim.attempt.id, declined]);
    await client.query("UPDATE payment_session_bindings SET provider_transaction_id=$2 WHERE session_id=$1", [sessionId, declined]);
    await client.query("UPDATE transactions SET status='failed' WHERE id=$1", [sale.id]);
    await client.query(`INSERT INTO payment_settlement_events(session_id,merchant_id,outcome,amount_cents,created_at,previous_aggregate_status)
      VALUES ($1,$2,'declined',1000,$3,'pending')`, [sessionId, merchant, now]);
    await client.query("COMMIT");
    fixture = { saleId: sale.id, sessionId, declined, binding: await repository.resolveSession(sessionId) };

    await check("0050 applies over a pre-0050 decline and backfills its card's transaction", async () => {
      await runner.runPendingMigrations(client, { dir: "migrations", log: () => undefined, uploadOwnershipInventory: verified });
      const event = (await client.query("SELECT provider_transaction_id FROM payment_settlement_events WHERE session_id=$1", [fixture.sessionId])).rows[0];
      assert.equal(event.provider_transaction_id, fixture.declined);
      const column = (await client.query(`SELECT is_nullable FROM information_schema.columns
        WHERE table_name='payment_settlement_events' AND column_name='provider_transaction_id'`)).rows[0];
      assert.equal(column.is_nullable, "NO");
    });
    await check("0050's baseline contract finds every effect it declares", async () => {
      const { findMissingBaselineEffects } = await import("../server/migration-baseline-contract");
      assert.deepEqual(await findMissingBaselineEffects(client, [MIGRATION]), []);
    });
    await check("every earlier migration's contract still holds after 0049 and 0050 replaced some of its objects", async () => {
      const { findMissingBaselineEffects } = await import("../server/migration-baseline-contract");
      // The payment migrations (0034 on). Earlier ones include data backfills this synthetic merchant does not meet.
      assert.deepEqual(await findMissingBaselineEffects(client, runner.listMigrationFiles().filter((file: string) => file >= "0034")), []);
    });
  } finally { client.release(); }

  await check("after 0050, a later verified approval in that session supersedes the pre-0050 decline", async () => {
    const approval = `tx-${randomUUID()}`;
    await repository.receive(fixture.sessionId, "browser", now);
    await new PaymentReconciliationWorker(repository, { query: async (expected: any) => ({ ...expected, kind: "verified", outcome: "approved",
      transactionId: approval, transactionCount: 2 }) }, clock, () => 0, undefined, () => undefined).runOne(randomUUID());
    assert.equal((await storage.getTransaction(fixture.saleId))?.status, "completed");
    const events = (await pool.query("SELECT outcome,provider_transaction_id,supersedes_event_id IS NOT NULL AS supersedes FROM payment_settlement_events WHERE session_id=$1 ORDER BY outcome DESC", [fixture.sessionId])).rows;
    assert.deepEqual(events, [{ outcome: "declined", provider_transaction_id: fixture.declined, supersedes: false },
      { outcome: "approved", provider_transaction_id: approval, supersedes: true }]);
  });
} finally {
  await pool.end();
}

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
