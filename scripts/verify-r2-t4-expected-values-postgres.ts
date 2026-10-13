/**
 * R2-T4 on actual PostgreSQL: migration 0034 (expected provider values on payment_attempts)
 * from an empty database, its constraints, the service's write order through DatabaseStorage,
 * the provider-transaction uniqueness (sequential and concurrent), and the deploy overlap: an
 * attempt attached by the old code before 0034 still finalizes afterwards.
 * R2-T6 adds the last reconciliation code (0034's two reconciliation columns), written
 * through DatabaseStorage without touching the attempt's state, lease or updated_at.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-r2-t4-expected-values-postgres.ts
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

const MIGRATION = "0034_payment_attempt_expected_values.sql";
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 8 });
const otherPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${(error as Error).message}`); }
}
async function sqlError(run: () => Promise<unknown>): Promise<{ code?: string; constraint?: string; message: string }> {
  try { await run(); } catch (error) { return error as { code?: string; constraint?: string; message: string }; }
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
  const otherStorage = new DatabaseStorage(drizzle(otherPool, { schema }) as any);
  const service = new PaymentAttemptService(storage);
  const otherService = new PaymentAttemptService(otherStorage);

  // 1. Every migration before 0034, then an attempt the old code attached (deploy overlap).
  const client = await pool.connect();
  let legacy: { attemptId: string; transactionId: number };
  try {
    await runner.ensureMigrationLedger(client);
    const files = runner.listMigrationFiles();
    // 0034 and everything before it; later migrations (0035, R2-T7) have their own verifier.
    const at = files.indexOf(MIGRATION);
    assert.ok(at > 0, "0034 is in the migration list");
    // Everything before 0034 through the runner's own path, from a copy of the folder that
    // stops at 0033; 0023-0025 take the (empty) upload-ownership inventory as in production.
    const before = await mkdtemp(path.join(process.env.TMPDIR ?? os.tmpdir(), "r2t4-migrations-"));
    for (const file of files.slice(0, at)) await copyFile(`migrations/${file}`, path.join(before, file));
    for (const file of files) {
      if (file === "0023_uploaded_files_tenant_column.sql") break;
      await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
    }
    const inventories = await import("../server/upload-ownership-inventory");
    const target = { host: url.hostname, port: Number(url.port || 5432), database: decodeURIComponent(url.pathname.slice(1)) };
    const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
    const { inventory } = inventories.buildDraftInventory(facts, { target, approvedBy: "synthetic verifier", approvedAt: "2026-10-12T00:00:00Z" });
    assert.equal(inventory.entries.length, 0);
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
    await runner.runPendingMigrations(client, { dir: before, log: () => undefined, uploadOwnershipInventory: verified });
    const merchant = await client.query(
      `INSERT INTO merchants (name, business_name, email, status) VALUES ('Synthetic', 'Synthetic', $1, 'active') RETURNING id`,
      [`r2t4-${randomBytes(4).toString("hex")}@example.test`],
    );
    (globalThis as any).__merchantId = merchant.rows[0].id;
    const legacyTransaction = await client.query(
      `INSERT INTO transactions (merchant_id, item_name, price, status) VALUES ($1, 'Legacy in-flight sale', '10.00', 'pending') RETURNING id`,
      [merchant.rows[0].id],
    );
    const legacyAttempt = await client.query(
      `INSERT INTO payment_attempts (transaction_id, share_index, idempotency_key, state, lease_expires_at, processor_session_id, processor_x_id, created_at, updated_at)
       VALUES ($1, 0, $2, 'ready', now() + interval '4 minutes', 'legacy-session-0001', 'legacyxid0001', now(), now()) RETURNING id`,
      [legacyTransaction.rows[0].id, randomUUID()],
    );
    legacy = { attemptId: legacyAttempt.rows[0].id, transactionId: legacyTransaction.rows[0].id };

    await check("0034 applies through the runner over an in-flight legacy attempt", async () => {
      await runner.applyMigration(client, MIGRATION, await readFile(`migrations/${MIGRATION}`, "utf8"));
      const ledger = await client.query(`SELECT filename FROM drizzle.applied_migrations WHERE filename = $1`, [MIGRATION]);
      assert.equal(ledger.rowCount, 1);
      const row = await client.query(`SELECT expected_amount_cents, provider_transaction_id, state FROM payment_attempts WHERE id = $1`, [legacy.attemptId]);
      assert.deepEqual(row.rows[0], { expected_amount_cents: null, provider_transaction_id: null, state: "ready" });
    });

    await check("its shape matches the schema: seven nullable columns, five checks, one partial unique index", async () => {
      const columns = await client.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_name = 'payment_attempts' AND column_name IN ('expected_amount_cents','expected_currency','expected_merchant_reference',
        'provider_environment','provider_transaction_id','last_reconciliation_code','last_reconciled_at') ORDER BY column_name`);
      assert.deepEqual(columns.rows.map((c) => [c.column_name, c.data_type, c.is_nullable]), [
        ["expected_amount_cents", "bigint", "YES"],
        ["expected_currency", "text", "YES"],
        ["expected_merchant_reference", "text", "YES"],
        ["last_reconciled_at", "timestamp without time zone", "YES"],
        ["last_reconciliation_code", "text", "YES"],
        ["provider_environment", "text", "YES"],
        ["provider_transaction_id", "text", "YES"],
      ]);
      const checks = await client.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'payment_attempts'::regclass AND contype = 'c'
        AND conname IN ('payment_attempts_expected_pair_check','payment_attempts_expected_amount_check','payment_attempts_expected_currency_check',
        'payment_attempts_expected_reference_check','payment_attempts_provider_environment_check')`);
      assert.equal(checks.rowCount, 5);
      const index = await client.query(`SELECT indexdef FROM pg_indexes WHERE indexname = 'payment_attempts_provider_transaction_id_uq'`);
      assert.match(index.rows[0].indexdef, /UNIQUE INDEX .* \(provider_transaction_id\) WHERE \(provider_transaction_id IS NOT NULL\)/);
    });

    await check("0034's baseline contract finds every effect it declares", async () => {
      const { findMissingBaselineEffects } = await import("../server/migration-baseline-contract");
      assert.deepEqual(await findMissingBaselineEffects(client, [MIGRATION]), []);
    });

    await check("re-running 0034's body refuses to guess an existing shape", async () => {
      const body = (await readFile(`migrations/${MIGRATION}`, "utf8")).replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
      await client.query("BEGIN");
      const error = await sqlError(() => client.query(body));
      await client.query("ROLLBACK");
      assert.match(error.message, /0034: payment_attempts already has an R2-T4 column/);
    });
  } finally {
    client.release();
  }

  // The current DatabaseStorage selects the complete integrated model. Keep
  // the preceding 0034-specific assertions, then apply forward migrations
  // before exercising current runtime methods against that legacy fixture.
  const forward=await pool.connect();
  try {
    for(const file of runner.listMigrationFiles().filter(file=>file>MIGRATION))
      await runner.applyMigration(forward,file,await readFile(`migrations/${file}`,'utf8'));
  } finally {forward.release();}
  const merchantIdValue = (globalThis as any).__merchantId as number;
  async function sale(price = "10.00") {
    const row = await pool.query(
      `INSERT INTO transactions (merchant_id, item_name, price, status) VALUES ($1, 'Synthetic sale', $2, 'pending') RETURNING id`,
      [merchantIdValue, price],
    );
    return row.rows[0].id as number;
  }
  async function claimed(svc = service) {
    const result = await svc.claim({ transactionId: await sale(), shareIndex: 0, idempotencyKey: randomUUID() });
    assert.equal(result.kind, "claimed");
    return (result as { attempt: { id: string } }).attempt.id;
  }
  const expected = (attemptId: string, overrides = {}) => ({
    attemptId, amountCents: 1000, currency: "NZD", merchantReference: `TAPT_${attemptId}`, providerEnvironment: "uat" as const, ...overrides,
  });

  await check("the database refuses a partial, malformed or out-of-range expected record", async () => {
    const id = await claimed();
    for (const [assignment, constraint] of [
      ["expected_amount_cents = 1000", "payment_attempts_expected_pair_check"],
      ["expected_amount_cents = -1, expected_currency = 'NZD', expected_merchant_reference = 'r', provider_environment = 'uat'", "payment_attempts_expected_amount_check"],
      ["expected_amount_cents = 10000000000, expected_currency = 'NZD', expected_merchant_reference = 'r', provider_environment = 'uat'", "payment_attempts_expected_amount_check"],
      ["expected_amount_cents = 1, expected_currency = 'nzd', expected_merchant_reference = 'r', provider_environment = 'uat'", "payment_attempts_expected_currency_check"],
      [`expected_amount_cents = 1, expected_currency = 'NZD', expected_merchant_reference = '${"x".repeat(65)}', provider_environment = 'uat'`, "payment_attempts_expected_reference_check"],
      ["expected_amount_cents = 1, expected_currency = 'NZD', expected_merchant_reference = 'r', provider_environment = 'simulation'", "payment_attempts_provider_environment_check"],
    ] as const) {
      const error = await sqlError(() => pool.query(`UPDATE payment_attempts SET ${assignment} WHERE id = $1`, [id]));
      assert.equal(error.code, "23514", assignment);
      assert.equal(error.constraint, constraint, assignment);
    }
  });

  await check("the service records once, reuses the same values and refuses different ones", async () => {
    const id = await claimed();
    assert.equal((await service.recordExpectedValues(expected(id))).kind, "recorded");
    assert.equal((await service.recordExpectedValues(expected(id))).kind, "reused");
    assert.equal((await service.recordExpectedValues(expected(id, { amountCents: 1001 }))).kind, "conflict");
    const row = await pool.query(`SELECT expected_amount_cents, expected_currency, provider_environment FROM payment_attempts WHERE id = $1`, [id]);
    assert.deepEqual(row.rows[0], { expected_amount_cents: "1000", expected_currency: "NZD", provider_environment: "uat" });
  });

  await check("a session cannot be attached before them, and they cannot change after it", async () => {
    const id = await claimed();
    const early = await service.attachSession({ attemptId: id, processorSessionId: `s-${id}`, processorXId: `x${id.slice(0, 15)}`, rawReturnState: randomBytes(32).toString("base64url") });
    assert.equal(early.kind, "expected-values-missing");
    await service.recordExpectedValues(expected(id));
    const attached = await service.attachSession({ attemptId: id, processorSessionId: `s-${id}`, processorXId: `x${id.slice(0, 15)}`, rawReturnState: randomBytes(32).toString("base64url") });
    assert.equal(attached.kind, "attached");
    assert.equal((await service.recordExpectedValues(expected(id, { amountCents: 5 }))).kind, "conflict");
    assert.equal((await service.recordExpectedValues(expected(id))).kind, "reused");
  });

  await check("the legacy attempt is refused new expected values but still finalizes and records its provider transaction", async () => {
    assert.equal((await service.recordExpectedValues(expected(legacy.attemptId))).kind, "conflict");
    assert.equal((await service.claimFinalization(legacy.attemptId, "legacy-session-0001")).kind, "claimed");
    const finalized = await service.finalize({
      attemptId: legacy.attemptId, processorSessionId: "legacy-session-0001", processorTransactionId: "0000000c0000L001",
      paymentMethod: "card", outcome: "approved", receiptShare: null,
    });
    assert.equal(finalized.kind, "finalized");
    const row = await pool.query(`SELECT provider_transaction_id, expected_amount_cents FROM payment_attempts WHERE id = $1`, [legacy.attemptId]);
    assert.deepEqual(row.rows[0], { provider_transaction_id: "0000000c0000L001", expected_amount_cents: null });
  });

  async function ready(svc = service) {
    const id = await claimed(svc);
    await svc.recordExpectedValues(expected(id));
    const session = `s-${id}`;
    await svc.attachSession({ attemptId: id, processorSessionId: session, processorXId: `x${id.slice(0, 15)}`, rawReturnState: randomBytes(32).toString("base64url") });
    assert.equal((await svc.claimFinalization(id, session)).kind, "claimed");
    return { id, session };
  }

  await check("a second attempt cannot record a provider transaction already recorded, and nothing of its sale changes", async () => {
    const first = await ready();
    await service.finalize({ attemptId: first.id, processorSessionId: first.session, processorTransactionId: "0000000c00000D01", paymentMethod: "card", outcome: "approved", receiptShare: null });
    const second = await ready();
    const result = await service.finalize({ attemptId: second.id, processorSessionId: second.session, processorTransactionId: "0000000c00000D01", paymentMethod: "card", outcome: "approved", receiptShare: null });
    assert.equal(result.kind, "conflict");
    const row = await pool.query(`SELECT a.state, a.provider_transaction_id, t.status FROM payment_attempts a JOIN transactions t ON t.id = a.transaction_id WHERE a.id = $1`, [second.id]);
    assert.deepEqual(row.rows[0], { state: "finalizing", provider_transaction_id: null, status: "pending" });
  });

  await check("two concurrent finalizations naming one provider transaction: one finalizes, one conflicts, no error escapes", async () => {
    const one = await ready();
    const two = await ready(otherService);
    const results = await Promise.all([
      service.finalize({ attemptId: one.id, processorSessionId: one.session, processorTransactionId: "0000000c00000C01", paymentMethod: "card", outcome: "approved", receiptShare: null }),
      otherService.finalize({ attemptId: two.id, processorSessionId: two.session, processorTransactionId: "0000000c00000C01", paymentMethod: "card", outcome: "approved", receiptShare: null }),
    ]);
    assert.deepEqual(results.map((r) => r.kind).sort(), ["conflict", "finalized"]);
    const count = await pool.query(`SELECT count(*)::int AS n FROM payment_attempts WHERE provider_transaction_id = '0000000c00000C01'`);
    assert.equal(count.rows[0].n, 1);
  });

  await check("the unique index refuses a direct duplicate write", async () => {
    const one = await ready();
    await service.finalize({ attemptId: one.id, processorSessionId: one.session, processorTransactionId: "0000000c00000U01", paymentMethod: "card", outcome: "approved", receiptShare: null });
    const two = await ready();
    const error = await sqlError(() => pool.query(`UPDATE payment_attempts SET provider_transaction_id = '0000000c00000U01' WHERE id = $1`, [two.id]));
    assert.equal(error.code, "23505");
    assert.equal(error.constraint, "payment_attempts_provider_transaction_id_uq");
  });
  await check("R2-T6: the last reconciliation code and time are written alone, and an unknown attempt is not found", async () => {
    const id = await claimed();
    const before = await pool.query(`SELECT state, lease_expires_at, updated_at, processor_session_id FROM payment_attempts WHERE id = $1`, [id]);
    const first = await service.recordReconciliation({ attemptId: id, code: "integrity_mismatch:amount" });
    assert.equal(first.kind, "recorded");
    const second = await service.recordReconciliation({ attemptId: id, code: "approved" });
    assert.equal(second.kind, "recorded");
    const after = await pool.query(
      `SELECT state, lease_expires_at, updated_at, processor_session_id, last_reconciliation_code, last_reconciled_at IS NOT NULL AS stamped
       FROM payment_attempts WHERE id = $1`, [id]);
    const { last_reconciliation_code, stamped, ...rest } = after.rows[0];
    assert.deepEqual(rest, before.rows[0]);
    assert.equal(last_reconciliation_code, "approved");
    assert.equal(stamped, true);
    assert.equal((await service.recordReconciliation({ attemptId: randomUUID(), code: "pending" })).kind, "not-found");
  });
} finally {
  await pool.end();
  await otherPool.end();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
