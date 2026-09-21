/** Run only against an EMPTY, explicitly marked disposable database.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 npx tsx scripts/verify-gap13-postgres.ts
 * Applies the real migration chain through the project runner, then exercises
 * actual DatabaseStorage. Synthetic rows are retained for inspection; nothing
 * is dropped. Refuses a populated database and the ambient application target.
 */
import assert from "node:assert/strict";
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
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 12 });
const failures: string[] = [];
async function check(name: string, test: () => Promise<void>) {
  try { await test(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}`, error); }
}
const doc = "invoices/invoice-1700000000000-aaaaaaaaaaaaaaaa.pdf";
const bytes = Buffer.from("%PDF-1.4 synthetic owner A");
try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires an empty disposable database; no cleanup is automatic");
  await import("../server/__tests__/support/test-env");
  const runner = await import("../server/migrate");
  const client = await pool.connect();
  let a = 0, b = 0;
  try {
    await runner.ensureMigrationLedger(client);
    for (const file of runner.listMigrationFiles()) {
      if (file === "0023_uploaded_files_tenant_column.sql") {
        const merchants = await client.query(`INSERT INTO merchants(name,business_name,email,status)
          VALUES ('A','A','a@gap13.test','active'),('B','B','b@gap13.test','active') RETURNING id`);
        [a,b] = merchants.rows.map((r: any) => r.id);
        const clientRow = await client.query(`INSERT INTO client_profiles(merchant_id,first_name,last_name,site_address)
          VALUES ($1,'Synthetic','B','Test') RETURNING id`, [b]);
        await client.query(`INSERT INTO uploaded_files(path,mime_type,data) VALUES
          ($1,'application/pdf',$2),($3,'image/png',$2)`, [doc, bytes, `logos/merchant-${a}.png`]);
        await client.query(`INSERT INTO quotes(merchant_id,client_profile_id,token,line_items,subtotal_cents,total_cents,document_url)
          VALUES ($1,$2,'legacy-foreign-reference','[]',100,100,$3)`, [b, clientRow.rows[0].id, `/uploads/${doc}`]);
      }
      const result = await runner.applyMigration(client, file, await readFile(`migrations/${file}`, "utf8"));
      console.log(`MIGRATION ${file} ${result.durationMs}ms`);
    }
    const repeated = await runner.runPendingMigrations(client);
    assert.equal(repeated.appliedNow.length, 0, "runner rerun must be a no-op");
  } finally { client.release(); }
  const { DatabaseStorage, UploadPathOwnershipError } = await import("../server/storage");
  const schema = await import("../shared/schema");
  const db = drizzle(pool, { schema });
  const storage = new DatabaseStorage(db as any);
  const otherInstance = new DatabaseStorage(db as any);

  await check("untrusted legacy references confer no tenant authority; bytes retained", async () => {
    assert.equal(await storage.getUploadedFileForMerchant(doc, b), undefined);
    assert.equal(await storage.uploadedFileOwnedByMerchant(doc, b), false);
    assert.deepEqual((await storage.getUploadedFile(doc))?.data, bytes);
  });
  await check("logo remains public and can be overwritten by its owner", async () => {
    await storage.saveUploadedFile(`logos/merchant-${a}.png`, "image/png", bytes, a);
    assert.deepEqual((await storage.getUploadedFile(`logos/merchant-${a}.png`))?.data, bytes);
  });
  await check("production upsert: one winner, no foreign overwrite/delete or NULL adoption", async () => {
    const path = "invoices/invoice-1700000000000-bbbbbbbbbbbbbbbb.pdf";
    const raced = await Promise.allSettled([storage.saveUploadedFile(path,"application/pdf",bytes,a),
      otherInstance.saveUploadedFile(path,"application/pdf",bytes,b)]);
    assert.equal(raced.filter(r => r.status === "fulfilled").length,1);
    const owner = await storage.uploadedFileOwnedByMerchant(path,a) ? a : b;
    const foreign = owner === a ? b : a;
    await assert.rejects(storage.saveUploadedFile(path,"application/pdf",bytes,foreign), UploadPathOwnershipError);
    await storage.deleteUploadedFile(path,foreign);
    assert.ok(await storage.getUploadedFileForMerchant(path,owner));
    assert.equal(await storage.getUploadedFileForMerchant(path,foreign),undefined);
    await storage.saveUploadedFile(path,"application/pdf",Buffer.from("new"),owner);
    assert.equal((await storage.getUploadedFileForMerchant(path,owner))?.data.toString(),"new");
    await assert.rejects(storage.saveUploadedFile(doc,"application/pdf",bytes,b), UploadPathOwnershipError);
    await storage.deleteUploadedFile(path,owner);
    assert.equal(await storage.getUploadedFile(path),undefined);
  });
  await check("a refused merchant deletion preserves transactions", async () => {
    const transaction = await pool.query(`INSERT INTO transactions(merchant_id,item_name,price,status)
      VALUES ($1,'Synthetic','1.00','pending') RETURNING id`, [a]);
    assert.equal(await storage.deleteMerchant(a),false);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM transactions WHERE id=$1",[transaction.rows[0].id])).rows[0].n,1);
  });
  await check("admin audit survives a new connection and has no contents or token", async () => {
    await storage.recordInvoiceDocumentAdminRead(17,doc.slice("invoices/".length));
    const reader = new pg.Client({ connectionString: testDatabaseUrl });
    await reader.connect();
    try {
      const rows = (await reader.query("SELECT admin_user_id,document_name,created_at FROM invoice_document_access_audit")).rows;
      assert.equal(rows.length,1);
      assert.equal(rows[0].admin_user_id,17);
      assert.equal(rows[0].document_name,doc.slice("invoices/".length));
      assert.ok(rows[0].created_at);
    } finally { await reader.end(); }
  });
  await check("two instances enforce one 10-read token budget atomically", async () => {
    const results = await Promise.all(Array.from({length:30},(_,i) =>
      (i%2 ? storage : otherInstance).consumeInvoiceDocumentReadLimit("shared-synthetic-token")));
    assert.equal(results.filter(Boolean).length,10);
    const keys = (await pool.query("SELECT key FROM invoice_document_read_limits")).rows;
    assert.ok(keys.every((r:any) => !r.key.includes("shared-synthetic-token")));
  });
  await check("distinct tokens have a bounded shared budget; expired rows are reclaimed", async () => {
    await pool.query("DELETE FROM invoice_document_read_limits");
    let allowed=0;
    for(let i=0;i<610;i++) if(await (i%2 ? storage:otherInstance).consumeInvoiceDocumentReadLimit(`token-${i}`)) allowed++;
    assert.equal(allowed,600);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM invoice_document_read_limits")).rows[0].n,601);
    await pool.query("UPDATE invoice_document_read_limits SET expires_at=now()-interval '1 second'");
    assert.equal(await otherInstance.consumeInvoiceDocumentReadLimit("after-window"),true);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM invoice_document_read_limits")).rows[0].n,2);
  });
  assert.deepEqual(failures,[],"gap 13 PostgreSQL verification failed");
} finally {
  await pool.end();
}
