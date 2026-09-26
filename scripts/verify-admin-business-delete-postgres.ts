/** The admin's business delete (DELETE /api/admin/merchants/:id → storage.deleteMerchant) against
 * real PostgreSQL, for the C10 batch 4 review (2026-09-26). deleteMerchant removes a business's
 * sales and then the business, in one transaction, and answers false when the database refuses.
 * Every business the app makes also gets a subscription row, and an owner login once it has a
 * password; neither key cascades. This shows what the route can and cannot delete.
 * Run only against an EMPTY, explicitly marked disposable database:
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-admin-business-delete-postgres.ts
 * The URL must carry a user and a password: the migration runner validates its target.
 * Applies the real migration chain through the project runner (0025 with the inventory drafted
 * from this empty database, which has nothing to own), then exercises actual DatabaseStorage.
 * Synthetic rows are retained.
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
// Check BOTH ambient targets before loading config or application modules.
assertSafePostgresVerifierEnvironment({ testDatabaseUrl,
  configuredDatabaseUrl: process.env.NEON_DATABASE_URL, marker: process.env.TAPTPAY_TEST_DATABASE });
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 5 });
const failures: string[] = [];
async function check(name: string, test: () => Promise<void>) {
  try { await test(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}`, error); }
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const REPAIR = "0025_verified_upload_ownership.sql";
const testUrl = new URL(testDatabaseUrl);
const pgTarget = { host: testUrl.hostname, port: Number(testUrl.port || 5432),
  database: decodeURIComponent(testUrl.pathname.slice(1)) };
const count = async (table: string, column: string, id: number) =>
  (await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`, [id])).rows[0].n as number;
const sale = async (merchantId: number) =>
  (await pool.query(`INSERT INTO transactions(merchant_id,item_name,price,status)
    VALUES ($1,'Synthetic','1.00','completed') RETURNING id`, [merchantId])).rows[0].id as number;
const application = {
  businessType: "retail", phone: "0210000000", address: "1 Test Road",
  password: "Synthetic-pass-2026", confirmPassword: "Synthetic-pass-2026",
};
try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires an empty disposable database; no cleanup is automatic");
  await import("../server/__tests__/support/test-env");
  const runner = await import("../server/migrate");
  const inventories = await import("../server/upload-ownership-inventory");
  const client = await pool.connect();
  try {
    await runner.ensureMigrationLedger(client);
    for (const file of runner.listMigrationFiles()) {
      if (file === REPAIR) break; // The rest go through the runner with a verified inventory.
      await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
    }
    const facts = await inventories.readInvoiceDocumentFacts(client, { withContent: true });
    const { inventory } = inventories.buildDraftInventory(facts,
      { target: pgTarget, approvedBy: "synthetic verifier", approvedAt: "2026-09-26T00:00:00Z" });
    assert.equal(inventory.entries.length, 0, "an empty database has no invoice documents to own");
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, sha(source), pgTarget);
    const { appliedNow } = await runner.runPendingMigrations(client,
      { log: () => undefined, uploadOwnershipInventory: verified });
    console.log(`MIGRATIONS applied through the runner: ${appliedNow.join(", ")}`);
  } finally { client.release(); }

  const { DatabaseStorage } = await import("../server/storage");
  const schema = await import("../shared/schema");
  const storage = new DatabaseStorage(drizzle(pool, { schema }) as any);

  await check("a waiting application, as the public sign-up makes it, is refused and kept", async () => {
    const pending = await storage.createMerchantWithSignup({
      ...application, name: "Pending", businessName: "Pending Ltd", email: "pending@c10.test",
      verificationToken: "synthetic-sign-up-token",
    });
    assert.equal(pending.status, "pending");
    assert.equal(await count("merchant_subscriptions", "merchant_id", pending.id), 1);
    assert.equal(await storage.deleteMerchant(pending.id), false);
    assert.equal(await count("merchants", "id", pending.id), 1);
    assert.equal(await count("merchant_subscriptions", "merchant_id", pending.id), 1);
  });

  await check("a business the admin's sign-up makes, with a sale, is refused and nothing is lost", async () => {
    const made = await storage.createMerchantWithPassword({
      name: "Made", businessName: "Made Ltd", email: "made@c10.test",
      businessType: application.businessType, phone: application.phone, address: application.address,
    }, "synthetic-password-hash");
    const saleId = await sale(made.id);
    assert.equal(await count("users", "merchant_id", made.id), 1, "the owner login exists");
    assert.equal(await storage.deleteMerchant(made.id), false);
    assert.equal(await count("merchants", "id", made.id), 1);
    assert.equal(await count("transactions", "id", saleId), 1, "the sale's delete was rolled back");
    assert.equal(await count("users", "merchant_id", made.id), 1);
    assert.equal(await count("merchant_subscriptions", "merchant_id", made.id), 1);
  });

  await check("control: a bare business row with only a sale is deleted, sale and all", async () => {
    const bare = (await pool.query(`INSERT INTO merchants(name,business_name,email,status)
      VALUES ('Bare','Bare Ltd','bare@c10.test','active') RETURNING id`)).rows[0].id as number;
    const saleId = await sale(bare);
    assert.equal(await storage.deleteMerchant(bare), true);
    assert.equal(await count("merchants", "id", bare), 0);
    assert.equal(await count("transactions", "id", saleId), 0);
  });

  assert.deepEqual(failures, [], "admin business delete PostgreSQL verification failed");
  console.log("Admin business delete PostgreSQL verification passed");
} finally {
  await pool.end();
}
