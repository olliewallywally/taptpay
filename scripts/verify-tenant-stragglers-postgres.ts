/**
 * R1-T7 S5b on actual PostgreSQL: stock create names its business; a login is read through its
 * business; a property tenant's create, archive and restore commit their history line with the write
 * (and roll back with it); a device is stopped by its business and its address together.
 * TEST_DATABASE_URL=... TAPTPAY_TEST_DATABASE=1 node --import tsx scripts/verify-tenant-stragglers-postgres.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 8 });
const writerName = "taptpay-t7-s5b-writer";
const writerPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1, application_name: writerName });
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch { failures.push(name); console.error(`FAIL ${name}`); }
}
const INVALID = [undefined, null, 0, -1, 1.5, NaN, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1];

try {
  const occupied = await pool.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p')`);
  assert.equal(occupied.rows[0].n, 0, "requires a new empty disposable database");
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
    const { inventory } = inventories.buildDraftInventory(facts, { target, approvedBy: "synthetic verifier", approvedAt: "2026-10-04T00:00:00Z" });
    assert.equal(inventory.entries.length, 0);
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
    await runner.runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: verified });
    console.log("MIGRATIONS applied on the empty disposable database through the existing runner");
  } finally { client.release(); }
  const { DatabaseStorage } = await import("../server/storage"); const schema = await import("../shared/schema");
  const one = new DatabaseStorage(drizzle(pool, { schema }) as any) as any;
  const two = new DatabaseStorage(drizzle(writerPool, { schema }) as any) as any;
  await writerPool.query("SET statement_timeout='10s'");
  const addMerchant = async (label: string): Promise<number> => (await pool.query(
    "INSERT INTO merchants(name,business_name,email,status) VALUES ($1,$1,$2,'active') RETURNING id", [label, `${label}@tenant-storage.test`],
  )).rows[0].id;
  const a = await addMerchant("s5b-tenant-a"); const b = await addMerchant("s5b-tenant-b");
  const rows = async (table: string) => (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number;
  /** Runs a write on the single-connection store while another transaction holds the row, then lets it go. */
  async function waited(sql: string, args: unknown[], run: () => Promise<any>): Promise<any> {
    const locker = await pool.connect(); let open = false; let pending: Promise<any> | undefined;
    try {
      await locker.query("BEGIN"); open = true; await locker.query(sql, args);
      pending = run(); void pending.catch(() => undefined);
      let didWait = false;
      for (let i = 0; i < 200; i++) {
        const state = await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [writerName]);
        if (state.rowCount) { didWait = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.ok(didWait, "the write waited on the row");
      await locker.query("COMMIT"); open = false;
      return await pending;
    } finally {
      if (open) await locker.query("ROLLBACK");
      await pending?.catch(() => undefined);
      locker.release();
    }
  }

  // ── Stock create ──
  await check("stock create belongs to the business named, with the five stock fields only", async () => {
    const item = await one.createStockItemForMerchant(a, {
      name: "Coffee", cost: "4.50", description: "Hot", emoji: "x", variations: null,
      merchantId: b, id: 999_999, isActive: false, createdAt: new Date(0),
    });
    assert.equal(item.merchantId, a); assert.notEqual(item.id, 999_999); assert.equal(item.isActive, true);
    assert.ok(item.createdAt.getTime() > 0);
    assert.deepEqual(await one.getStockItemForMerchant(item.id, a), item);
    assert.equal(await one.getStockItemForMerchant(item.id, b), undefined);
    assert.deepEqual(await one.getStockItemsByMerchant(b), []);
  });
  await check("stock create for an invalid business makes nothing", async () => {
    const before = await rows("stock_items");
    for (const invalid of INVALID) await assert.rejects(one.createStockItemForMerchant(invalid, { name: "Orphan", cost: "1.00" }));
    assert.equal(await rows("stock_items"), before);
  });

  // ── Team read ──
  const addLogin = async (merchantId: number, label: string): Promise<number> => (await pool.query(
    "INSERT INTO users(email,password,merchant_id,role,status) VALUES ($1,'synthetic-hash',$2,'member','active') RETURNING id",
    [`${label}@tenant-storage.test`, merchantId],
  )).rows[0].id;
  await check("a login is read through its business; another business's, a missing one and an invalid business read nothing", async () => {
    const mine = await addLogin(a, "s5b-login-a"); const theirs = await addLogin(b, "s5b-login-b");
    assert.equal((await one.getTeamMemberForMerchant(mine, a))?.id, mine);
    assert.equal((await one.getTeamMemberForMerchant(mine, a))?.merchantId, a);
    assert.equal(await one.getTeamMemberForMerchant(theirs, a), undefined);
    assert.equal(await one.getTeamMemberForMerchant(mine, b), undefined);
    assert.equal(await one.getTeamMemberForMerchant(2_000_000_000, a), undefined);
    for (const invalid of INVALID) assert.equal(await one.getTeamMemberForMerchant(mine, invalid), undefined);
  });

  // ── Property tenant history ──
  const FIELDS = { firstName: "Nia", lastName: "Newcomer", propertyAddress: "2 Test Road", email: "nia@example.test" };
  const events = async (tenant: string) => (await pool.query(
    "SELECT merchant_id, tenant_profile_id, event_type, payload FROM transaction_events WHERE tenant_profile_id=$1 ORDER BY created_at, id", [tenant])).rows;
  const tenantRow = async (id: string) => (await pool.query("SELECT * FROM tenant_profiles WHERE id=$1", [id])).rows[0];
  await check("tenant create commits the row and its Tenant_Created line together", async () => {
    const tenant = await one.createTenantProfileForMerchant(a, { ...FIELDS, merchantId: b, id: "99999999-9999-4999-8999-999999999999", status: "archived" });
    assert.equal(tenant.merchantId, a); assert.equal(tenant.status, "active"); assert.notEqual(tenant.id, "99999999-9999-4999-8999-999999999999");
    assert.deepEqual(await events(tenant.id), [{
      merchant_id: a, tenant_profile_id: tenant.id, event_type: "Tenant_Created",
      payload: { firstName: "Nia", lastName: "Newcomer", propertyAddress: "2 Test Road" },
    }]);
  });
  await check("archive and restore each commit one history line, for the business's own tenant only", async () => {
    const tenant = await one.createTenantProfileForMerchant(a, FIELDS);
    assert.equal(await one.archiveTenantProfileForMerchant(tenant.id, b), undefined);
    assert.equal(await one.unarchiveTenantProfileForMerchant(tenant.id, b), undefined);
    assert.deepEqual((await events(tenant.id)).map((event) => event.event_type), ["Tenant_Created"]);
    assert.equal((await one.archiveTenantProfileForMerchant(tenant.id, a)).status, "archived");
    assert.equal((await one.unarchiveTenantProfileForMerchant(tenant.id, a)).status, "active");
    // A repeat is still taken, and logged again.
    assert.equal((await one.unarchiveTenantProfileForMerchant(tenant.id, a)).status, "active");
    const lines = await events(tenant.id);
    assert.deepEqual(lines.map((event) => event.event_type), ["Tenant_Created", "Tenant_Archived", "Tenant_Restored", "Tenant_Restored"]);
    for (const line of lines.slice(1)) { assert.equal(line.merchant_id, a); assert.deepEqual(line.payload, {}); }
    for (const missing of ["99999999-9999-4999-8999-999999999999"]) {
      assert.equal(await one.archiveTenantProfileForMerchant(missing, a), undefined);
      assert.equal(await one.unarchiveTenantProfileForMerchant(missing, a), undefined);
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM transaction_events WHERE tenant_profile_id IS NULL")).rows[0].n, 0);
  });
  await check("a history line that cannot be written rolls back the create, the archive and the restore", async () => {
    const active = await one.createTenantProfileForMerchant(a, FIELDS);
    const archived = await one.createTenantProfileForMerchant(a, FIELDS);
    await one.archiveTenantProfileForMerchant(archived.id, a);
    const schedule = (await pool.query(
      `INSERT INTO active_schedules(merchant_id,tenant_profile_id,amount_cents,frequency,delivery_channel,start_date,next_run_date,status)
       VALUES ($1,$2,50000,'weekly','email',now(),now(),'active') RETURNING id`, [a, active.id])).rows[0].id;
    const before = { tenants: await rows("tenant_profiles"), events: await rows("transaction_events"), active: await tenantRow(active.id), archived: await tenantRow(archived.id) };
    await pool.query(`CREATE FUNCTION s5b_refuse_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic history failure'; END $$`);
    await pool.query("CREATE TRIGGER s5b_refuse_history BEFORE INSERT ON transaction_events FOR EACH ROW EXECUTE FUNCTION s5b_refuse_history()");
    try {
      await assert.rejects(one.createTenantProfileForMerchant(a, FIELDS));
      await assert.rejects(one.archiveTenantProfileForMerchant(active.id, a));
      await assert.rejects(one.unarchiveTenantProfileForMerchant(archived.id, a));
    } finally {
      await pool.query("DROP TRIGGER s5b_refuse_history ON transaction_events");
      await pool.query("DROP FUNCTION s5b_refuse_history()");
    }
    assert.equal(await rows("tenant_profiles"), before.tenants);
    assert.equal(await rows("transaction_events"), before.events);
    assert.deepEqual(await tenantRow(active.id), before.active);
    assert.deepEqual(await tenantRow(archived.id), before.archived);
    assert.equal((await pool.query("SELECT status FROM active_schedules WHERE id=$1", [schedule])).rows[0].status, "active");
  });
  for (const operation of ["archive", "restore"] as const) {
    await check(`tenant ${operation} that waited for a committed ownership change writes nothing and logs nothing`, async () => {
      const tenant = await one.createTenantProfileForMerchant(a, FIELDS);
      if (operation === "restore") await one.archiveTenantProfileForMerchant(tenant.id, a);
      const before = (await events(tenant.id)).length;
      const result = await waited("UPDATE tenant_profiles SET merchant_id=$1 WHERE id=$2", [b, tenant.id],
        () => operation === "archive" ? two.archiveTenantProfileForMerchant(tenant.id, a) : two.unarchiveTenantProfileForMerchant(tenant.id, a));
      assert.equal(result, undefined);
      assert.equal((await tenantRow(tenant.id)).status, operation === "archive" ? "active" : "archived");
      assert.equal((await events(tenant.id)).length, before);
    });
  }
  await check("invalid businesses make and log nothing", async () => {
    const tenant = await one.createTenantProfileForMerchant(a, FIELDS);
    const before = { tenants: await rows("tenant_profiles"), events: await rows("transaction_events") };
    for (const invalid of INVALID) {
      await assert.rejects(one.createTenantProfileForMerchant(invalid, FIELDS));
      assert.equal(await one.archiveTenantProfileForMerchant(tenant.id, invalid), undefined);
      assert.equal(await one.unarchiveTenantProfileForMerchant(tenant.id, invalid), undefined);
    }
    assert.equal(await rows("tenant_profiles"), before.tenants);
    assert.equal(await rows("transaction_events"), before.events);
    assert.equal((await tenantRow(tenant.id)).status, "active");
  });

  // ── Push stop ──
  const web = (name: string) => `https://fcm.googleapis.com/fcm/send/s5b-${name}`;
  const register = (merchantId: number, endpoint: string) => one.createPushSubscription({ merchantId, userId: null, endpoint, p256dh: "key", auth: "auth" });
  const device = async (endpoint: string) => (await pool.query("SELECT merchant_id, is_active FROM push_subscriptions WHERE endpoint=$1", [endpoint])).rows[0];
  await check("a device is stopped only by its own business, once", async () => {
    await register(a, web("own")); await register(a, web("kept")); await register(b, web("theirs"));
    assert.equal(await one.deactivatePushSubscriptionForMerchant(a, web("theirs")), false);
    assert.equal(await one.deactivatePushSubscriptionForMerchant(a, web("unknown")), false);
    assert.deepEqual(await device(web("theirs")), { merchant_id: b, is_active: true });
    assert.equal(await one.deactivatePushSubscriptionForMerchant(a, web("own")), true);
    assert.deepEqual(await device(web("own")), { merchant_id: a, is_active: false });
    assert.deepEqual(await device(web("kept")), { merchant_id: a, is_active: true });
    assert.equal(await one.deactivatePushSubscriptionForMerchant(a, web("own")), false);
  });
  await check("an invalid business stops nothing", async () => {
    await register(a, web("guarded"));
    for (const invalid of INVALID) assert.equal(await one.deactivatePushSubscriptionForMerchant(invalid, web("guarded")), false);
    assert.deepEqual(await device(web("guarded")), { merchant_id: a, is_active: true });
  });
  await check("a stop that waited for the device's move to another business leaves it on", async () => {
    await register(a, web("moved"));
    const stopped = await waited("UPDATE push_subscriptions SET merchant_id=$1 WHERE endpoint=$2", [b, web("moved")],
      () => two.deactivatePushSubscriptionForMerchant(a, web("moved")));
    assert.equal(stopped, false);
    assert.deepEqual(await device(web("moved")), { merchant_id: b, is_active: true });
  });
  await check("a stop that waited for another stop of the same device reports nothing stopped", async () => {
    await register(a, web("twice"));
    const stopped = await waited("UPDATE push_subscriptions SET is_active=false WHERE endpoint=$1", [web("twice")],
      () => two.deactivatePushSubscriptionForMerchant(a, web("twice")));
    assert.equal(stopped, false);
    assert.deepEqual(await device(web("twice")), { merchant_id: a, is_active: false });
  });
  await check("the sender's stop by address alone is unchanged", async () => {
    await register(b, web("gone"));
    await one.deactivatePushSubscriptionByEndpoint(web("gone"));
    assert.deepEqual(await device(web("gone")), { merchant_id: b, is_active: false });
  });
} finally {
  await Promise.all([pool.end(), writerPool.end()]);
}
console.log(`TENANT STRAGGLERS POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
