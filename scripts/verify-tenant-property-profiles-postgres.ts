/** R1-T7 S3a: profile storage, archive and row-lock races on a new disposable loopback DB. */
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
assert.match(decodeURIComponent(url.pathname.slice(1)), /^taptpay_s3_verify_[a-z0-9_]+$/, "requires a named S3 test database");
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
const writerPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1, application_name: "taptpay-t7-s3-writer" });
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
  const a = await addMerchant("s3-tenant-a");
  const b = await addMerchant("s3-tenant-b");
  await writerPool.query("SET statement_timeout='10s'");
  const profile = (merchantId: number) => one.createTenantProfileForMerchant(merchantId, { firstName: "Synthetic", lastName: "Profile", propertyAddress: "Test address" });
  const schedule = async (profileId: string, merchantId: number, amount = 100) => (await pool.query(
    "INSERT INTO active_schedules(merchant_id,tenant_profile_id,amount_cents,frequency,start_date,next_run_date) VALUES ($1,$2,$3,'weekly',now(),now()) RETURNING *", [merchantId, profileId, amount],
  )).rows[0];
  await check("profile reads and edits refuse foreign and missing rows", async () => {
    const row = await profile(a);
    assert.equal(await one.getTenantProfileForMerchant(row.id, b), undefined);
    assert.equal(await one.getTenantProfileForMerchant("99999999-9999-4999-8999-999999999999", a), undefined);
    assert.equal(await one.updateTenantProfileForMerchant(row.id, b, { firstName: "Other" }), undefined);
    assert.deepEqual(await one.getTenantProfileForMerchant(row.id, a), row);
  });
  await check("create and update project ownership identity and lifecycle away", async () => {
    const row = await one.createTenantProfileForMerchant(a, { firstName: "Synthetic", lastName: "Profile", propertyAddress: "Test", id: "99999999-9999-4999-8999-999999999999", merchantId: b, status: "archived" } as any);
    assert.equal(row.merchantId, a); assert.equal(row.status, "active");
    assert.notEqual(row.id, "99999999-9999-4999-8999-999999999999");
    const updated = await one.updateTenantProfileForMerchant(row.id, a, { firstName: "Changed", merchantId: b, id: "99999999-9999-4999-8999-999999999999", status: "archived", email: null } as any);
    assert.equal(updated.merchantId, a); assert.equal(updated.id, row.id); assert.equal(updated.status, "active");
    assert.equal(updated.firstName, "Changed"); assert.equal(updated.email, null);
  });
  await check("archive scopes parent and cascade and restore never resumes schedules", async () => {
    const row = await profile(a);
    const own = await schedule(row.id, a);
    const inconsistent = await schedule(row.id, b);
    assert.equal(await one.archiveTenantProfileForMerchant(row.id, b), undefined);
    assert.equal((await pool.query("SELECT status FROM active_schedules WHERE id=$1", [own.id])).rows[0].status, "active");
    assert.equal((await one.archiveTenantProfileForMerchant(row.id, a)).status, "archived");
    assert.equal((await pool.query("SELECT status FROM active_schedules WHERE id=$1", [own.id])).rows[0].status, "terminated");
    assert.equal((await pool.query("SELECT status FROM active_schedules WHERE id=$1", [inconsistent.id])).rows[0].status, "active");
    assert.equal((await one.unarchiveTenantProfileForMerchant(row.id, a)).status, "active");
    assert.equal((await pool.query("SELECT status FROM active_schedules WHERE id=$1", [own.id])).rows[0].status, "terminated");
  });
  await check("history requires event and current parent ownership", async () => {
    const row = await profile(a);
    await pool.query("INSERT INTO transaction_events(merchant_id,tenant_profile_id,event_type) VALUES ($1,$3,'Synthetic A'),($2,$3,'Synthetic B')", [a,b,row.id]);
    assert.equal((await one.getTransactionEventsByTenantForMerchant(row.id, a)).length, 1);
    assert.equal((await one.getTransactionEventsByTenantForMerchant(row.id, b)).length, 0);
    await pool.query("UPDATE tenant_profiles SET merchant_id=$1 WHERE id=$2", [b,row.id]);
    assert.equal((await one.getTransactionEventsByTenantForMerchant(row.id, a)).length, 0);
    assert.equal((await one.getTransactionEventsByTenantForMerchant(row.id, b)).length, 1);
  });
  await check("archive transaction rolls back its parent when child persistence fails", async () => {
    const row = await profile(a); const child = await schedule(row.id,a,777);
    await pool.query(`CREATE FUNCTION s3_refuse_termination() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.amount_cents=777 THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$`);
    await pool.query("CREATE TRIGGER s3_refuse_termination BEFORE UPDATE ON active_schedules FOR EACH ROW EXECUTE FUNCTION s3_refuse_termination()");
    try {
      await assert.rejects(one.archiveTenantProfileForMerchant(row.id,a));
      assert.deepEqual(await one.getTenantProfileForMerchant(row.id,a), row);
      assert.equal((await pool.query("SELECT status FROM active_schedules WHERE id=$1", [child.id])).rows[0].status,"active");
    } finally {
      await pool.query("DROP TRIGGER s3_refuse_termination ON active_schedules");
      await pool.query("DROP FUNCTION s3_refuse_termination()");
    }
  });
  for (const operation of ["edit", "archive", "restore"] as const) {
    await check(`profile ${operation} waits and refuses committed ownership change`, async () => {
      const row = await profile(a); const child = await schedule(row.id,a);
      const locker = await pool.connect(); let open = false; let pending: Promise<unknown> | undefined;
      try {
        await locker.query("BEGIN"); open = true;
        await locker.query("UPDATE tenant_profiles SET merchant_id=$1 WHERE id=$2", [b,row.id]);
        pending = operation === "edit" ? two.updateTenantProfileForMerchant(row.id,a,{firstName:"Changed"})
          : operation === "archive" ? two.archiveTenantProfileForMerchant(row.id,a)
          : two.unarchiveTenantProfileForMerchant(row.id,a);
        void pending.catch(() => undefined);
        let waited = false;
        for (let i=0;i<200;i++) {
          const lock=await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",["taptpay-t7-s3-writer"]);
          if(lock.rowCount) {waited=true;break;}
          await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert.ok(waited);
        await locker.query("COMMIT");open=false;
        assert.equal(await pending,undefined);
        assert.equal((await one.getTenantProfileForMerchant(row.id,b)).firstName,row.firstName);
        assert.equal((await pool.query("SELECT status FROM active_schedules WHERE id=$1",[child.id])).rows[0].status,"active");
      } finally {
        if(open) await locker.query("ROLLBACK");
        await pending?.catch(()=>undefined);locker.release();
      }
    });
  }
  await check("invalid tenants fail closed without database casts or mutations", async () => {
    const row=await profile(a);
    for(const scope of [undefined,null,0,-1,1.5,NaN,2_147_483_648]) {
      assert.equal(await one.getTenantProfileForMerchant(row.id,scope as any),undefined);
      assert.equal(await one.updateTenantProfileForMerchant(row.id,scope as any,{}),undefined);
      assert.equal(await one.archiveTenantProfileForMerchant(row.id,scope as any),undefined);
      assert.equal(await one.unarchiveTenantProfileForMerchant(row.id,scope as any),undefined);
      assert.deepEqual(await one.getTransactionEventsByTenantForMerchant(row.id,scope as any),[]);
      await assert.rejects(one.createTenantProfileForMerchant(scope as any,{}));
    }
    assert.deepEqual(await one.getTenantProfileForMerchant(row.id,a),row);
  });
} finally { await Promise.all([pool.end(), writerPool.end()]); }
console.log(`S3 PROFILE STORAGE POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
