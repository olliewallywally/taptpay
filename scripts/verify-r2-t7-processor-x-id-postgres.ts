/**
 * R2-T7 on actual PostgreSQL: migration 0035 (unique processor X-ID on payment_attempts)
 * from an empty database. It refuses duplicate X-IDs without printing them, applies on a
 * clean table, refuses an existing index of its name, refuses a duplicate write, and an
 * attach that races past the service's duplicate check meets the index and is answered
 * as a conflict, never an error.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-r2-t7-processor-x-id-postgres.ts
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync as readFileSyncFs } from "node:fs";
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

const MIGRATION = "0035_payment_attempt_processor_x_id_unique.sql";
const DUPLICATE = "dupxid0000000001";
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 8 });
const otherPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${(error as Error).message}`); }
}
async function sqlError(run: () => Promise<unknown>): Promise<{ code?: string; constraint?: string; message: string; detail?: string }> {
  try { await run(); } catch (error) { return error as { code?: string; constraint?: string; message: string; detail?: string }; }
  throw new Error("expected the statement to be refused");
}

try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires a new empty disposable database");
  await import("../server/__tests__/support/test-env");
  const runner = await import("../server/migrate");
  const { DatabaseStorage } = await import("../server/storage");
  const { PaymentAttemptService } = await import("../server/payment-attempt-service");
  const schema = await import("../shared/schema");
  const storage = new DatabaseStorage(drizzle(pool, { schema }) as any);
  const service = new PaymentAttemptService(storage);

  const client = await pool.connect();
  try {
    // Every migration before 0035 through the runner, from a copy of the folder; 0023-0025
    // take the (empty) upload-ownership inventory as in production.
    await runner.ensureMigrationLedger(client);
    const files = runner.listMigrationFiles();
    const at = files.indexOf(MIGRATION);
    assert.equal(at, files.length - 1, "0035 is the newest migration");
    const before = await mkdtemp(path.join(process.env.TMPDIR ?? os.tmpdir(), "r2t7-migrations-"));
    for (const file of files.slice(0, at)) await copyFile(`migrations/${file}`, path.join(before, file));
    for (const file of files) {
      if (file === "0023_uploaded_files_tenant_column.sql") break;
      await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
    }
    const inventories = await import("../server/upload-ownership-inventory");
    const target = { host: url.hostname, port: Number(url.port || 5432), database: decodeURIComponent(url.pathname.slice(1)) };
    const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
    const { inventory } = inventories.buildDraftInventory(facts, { target, approvedBy: "synthetic verifier", approvedAt: "2026-10-12T00:00:00Z" });
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
    await runner.runPendingMigrations(client, { dir: before, log: () => undefined, uploadOwnershipInventory: verified });

    const merchant = await client.query(
      `INSERT INTO merchants (name, business_name, email, status) VALUES ('Synthetic', 'Synthetic', $1, 'active') RETURNING id`,
      [`r2t7-${randomBytes(4).toString("hex")}@example.test`],
    );
    (globalThis as any).__merchantId = merchant.rows[0].id;
    const legacyAttempt = async (xId: string | null) => {
      const sale = await client.query(
        `INSERT INTO transactions (merchant_id, item_name, price, status) VALUES ($1, 'Legacy sale', '10.00', 'pending') RETURNING id`,
        [merchant.rows[0].id],
      );
      const row = await client.query(
        `INSERT INTO payment_attempts (transaction_id, share_index, idempotency_key, state, lease_expires_at, processor_session_id, processor_x_id, created_at, updated_at)
         VALUES ($1, 0, $2, 'ready', now() + interval '4 minutes', $3, $4, now(), now()) RETURNING id`,
        [sale.rows[0].id, randomUUID(), xId ? `session-${randomBytes(6).toString("hex")}` : null, xId],
      );
      return row.rows[0].id as string;
    };
    const first = await legacyAttempt(DUPLICATE);
    await legacyAttempt(DUPLICATE);
    await legacyAttempt(null);
    await legacyAttempt(null);

    await check("0035 refuses duplicate X-IDs with counts only, and changes nothing", async () => {
      // The runner wraps the database's refusal and withholds the driver's message; the
      // migration's own refusal is the cause.
      const wrapped = await sqlError(() => runner.applyMigration(client, MIGRATION, readFileSync(MIGRATION)));
      assert.match(wrapped.message, /MIGRATE_APPLY_STATEMENT_FAILED: migration 0035_/);
      const cause = (wrapped as { cause?: { message: string; detail?: string } }).cause;
      assert.ok(cause, "the database refusal is kept as the cause");
      assert.match(cause.message, /0035 aborted: duplicate non-null processor_x_id values exist/);
      assert.equal(cause.detail, "1 duplicated X-IDs across 2 attempts (values not shown)");
      for (const text of [wrapped.message, cause.message, cause.detail ?? ""]) {
        assert.ok(!text.includes(DUPLICATE), "the duplicate X-ID is not in the error");
      }
      const ledger = await client.query(`SELECT 1 FROM drizzle.applied_migrations WHERE filename = $1`, [MIGRATION]);
      assert.equal(ledger.rowCount, 0);
      const index = await client.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'payment_attempts_processor_x_id_uq'`);
      assert.equal(index.rowCount, 0);
    });

    // Reconciled by hand, as the migration's hint says; then it applies.
    await client.query(`UPDATE payment_attempts SET processor_x_id = 'reconciled00001' WHERE id = $1`, [first]);

    await check("0035 applies through the runner on a table with no duplicates (nulls allowed)", async () => {
      await runner.applyMigration(client, MIGRATION, readFileSync(MIGRATION));
      const ledger = await client.query(`SELECT 1 FROM drizzle.applied_migrations WHERE filename = $1`, [MIGRATION]);
      assert.equal(ledger.rowCount, 1);
      const index = await client.query(`SELECT indexdef FROM pg_indexes WHERE indexname = 'payment_attempts_processor_x_id_uq'`);
      assert.match(index.rows[0].indexdef, /UNIQUE INDEX .* \(processor_x_id\) WHERE \(processor_x_id IS NOT NULL\)/);
      const nulls = await client.query(`SELECT count(*)::int AS n FROM payment_attempts WHERE processor_x_id IS NULL`);
      assert.equal(nulls.rows[0].n, 2);
    });

    await check("0035's baseline contract finds the effect it declares", async () => {
      const { findMissingBaselineEffects } = await import("../server/migration-baseline-contract");
      assert.deepEqual(await findMissingBaselineEffects(client, [MIGRATION]), []);
    });

    await check("re-running 0035's body refuses an existing index of its name", async () => {
      const body = readFileSync(MIGRATION).replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
      await client.query("BEGIN");
      const error = await sqlError(() => client.query(body));
      await client.query("ROLLBACK");
      assert.match(error.message, /0035 aborted: an index named payment_attempts_processor_x_id_uq already exists/);
    });

    await check("the index refuses a direct duplicate write", async () => {
      const error = await sqlError(() => client.query(`UPDATE payment_attempts SET processor_x_id = $1 WHERE processor_x_id IS NULL`, [DUPLICATE]));
      assert.equal(error.code, "23505");
      assert.equal(error.constraint, "payment_attempts_processor_x_id_uq");
    });
  } finally {
    client.release();
  }

  const merchantIdValue = (globalThis as any).__merchantId as number;
  async function claimedWithExpected() {
    const sale = await pool.query(
      `INSERT INTO transactions (merchant_id, item_name, price, status) VALUES ($1, 'Synthetic sale', '10.00', 'pending') RETURNING id`,
      [merchantIdValue],
    );
    const claim = await service.claim({ transactionId: sale.rows[0].id, shareIndex: 0, idempotencyKey: randomUUID() });
    assert.equal(claim.kind, "claimed");
    const id = (claim as { attempt: { id: string } }).attempt.id;
    await service.recordExpectedValues({ attemptId: id, amountCents: 1000, currency: "NZD", merchantReference: `TAPT_${id}`, providerEnvironment: "uat" });
    return id;
  }

  await check("an attach that races past the duplicate check meets the index and is a conflict, not an error", async () => {
    const holder = await claimedWithExpected();
    const racer = await claimedWithExpected();
    const raced = "racedxid00000001";
    // Another connection writes the X-ID and has not committed: the attach's own duplicate
    // check cannot see it, so only the index can refuse the attach's write.
    const other = await otherPool.connect();
    try {
      await other.query("BEGIN");
      await other.query(`UPDATE payment_attempts SET processor_x_id = $1 WHERE id = $2`, [raced, holder]);
      const attaching = service.attachSession({ attemptId: racer, processorSessionId: `s-${racer}`, processorXId: raced, rawReturnState: randomBytes(32).toString("base64url") });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await other.query("COMMIT");
      const result = await attaching;
      assert.equal(result.kind, "conflict");
    } finally {
      other.release();
    }
    const row = await pool.query(`SELECT state, processor_x_id, processor_session_id FROM payment_attempts WHERE id = $1`, [racer]);
    assert.deepEqual(row.rows[0], { state: "claiming", processor_x_id: null, processor_session_id: null });
  });

  await check("an ordinary attach with a fresh X-ID still attaches", async () => {
    const id = await claimedWithExpected();
    const result = await service.attachSession({ attemptId: id, processorSessionId: `s-${id}`, processorXId: id.replace(/-/g, "").slice(0, 16), rawReturnState: randomBytes(32).toString("base64url") });
    assert.equal(result.kind, "attached");
  });
} finally {
  await pool.end();
  await otherPool.end();
}

function readFileSync(file: string): string {
  return readFileSyncFs(`migrations/${file}`, "utf8");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
