/** R1-T7 S3c1: real invoice ownership/state races and transactional history rollback. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
assert.match(decodeURIComponent(url.pathname.slice(1)), /^taptpay_s3_verify_[a-z0-9_]+$/);
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 12 });
const writerName = "taptpay-t7-s3c1-writer";
const writerPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1, application_name: writerName });
let passed = 0; const failures: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch { failures.push(name); console.error(`FAIL ${name}`); }
}

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
    const { inventory } = inventories.buildDraftInventory(facts, { target, approvedBy: "synthetic verifier", approvedAt: "2026-10-03T00:00:00Z" });
    assert.equal(inventory.entries.length, 0);
    const source = JSON.stringify(inventory);
    const verified = inventories.parseUploadOwnershipInventory(source, createHash("sha256").update(source).digest("hex"), target);
    await runner.runPendingMigrations(client, { log: () => undefined, uploadOwnershipInventory: verified });
    console.log("MIGRATIONS applied on the empty disposable database through the existing runner");
  } finally { client.release(); }
  const { DatabaseStorage } = await import("../server/storage"); const schema = await import("../shared/schema");
  const one = new DatabaseStorage(drizzle(pool, { schema }) as any);
  const two = new DatabaseStorage(drizzle(writerPool, { schema }) as any);
  await writerPool.query("SET statement_timeout='10s'");
  const addMerchant = async (label: string): Promise<number> => (await pool.query(
    "INSERT INTO merchants(name,business_name,email,status) VALUES ($1,$1,$2,'active') RETURNING id", [label, `${label}@tenant-storage.test`],
  )).rows[0].id;
  const a = await addMerchant("s3c1-tenant-a"); const b = await addMerchant("s3c1-tenant-b");
  const profile = () => one.createTenantProfileForMerchant(a, { firstName: "Synthetic", lastName: "Profile", propertyAddress: "Test address" });
  const make = async (parent: string, status = "dispatched", merchant = a) => (await pool.query(
    "INSERT INTO invoices_rent_requests(merchant_id,tenant_profile_id,amount_cents,token,delivery_channel,due_at,status) VALUES ($1,$2,52000,$3,'email',now(),$4) RETURNING id",
    [merchant, parent, `synthetic-${randomUUID()}`, status],
  )).rows[0].id as string;
  const rawInvoice = async (id: string) => (await pool.query("SELECT * FROM invoices_rent_requests WHERE id=$1", [id])).rows[0];
  const events = async (parent: string) => (await pool.query("SELECT * FROM transaction_events WHERE tenant_profile_id=$1 ORDER BY id", [parent])).rows;
  const snapshot = async (id: string, parent: string) => ({ invoice: await rawInvoice(id), events: await events(parent) });
  const mutate = (store: typeof one, action: "void" | "paid-external", id: string, merchant = a) => action === "void"
    ? store.voidInvoiceRentRequestForMerchant(id, merchant)
    : store.markInvoiceRentRequestPaidExternalForMerchant(id, merchant, "Synthetic reference");
  async function waited(sql: string, args: any[], run: () => Promise<any>, accept: (result: any) => Promise<void>) {
    const locker = await pool.connect(); let open = false; let pending: Promise<any> | undefined;
    try {
      await locker.query("BEGIN"); open = true; await locker.query(sql, args);
      pending = run(); void pending.catch(() => undefined);
      let didWait = false;
      for (let i = 0; i < 200; i++) {
        const result = await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [writerName]);
        if (result.rowCount) { didWait = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(didWait, "must actually wait on the concurrent write");
      await locker.query("COMMIT"); open = false; await accept(await pending);
    } finally { if (open) await locker.query("ROLLBACK"); await pending?.catch(() => undefined); locker.release(); }
  }
  await check("scoped reads and writes refuse foreign missing and inconsistent-parent invoices", async () => {
    const parent = await profile(); const id = await make(parent.id); const before = await snapshot(id, parent.id);
    assert.equal(await one.getInvoiceRentRequestForMerchant(id, b), undefined);
    for (const action of ["void", "paid-external"] as const) {
      assert.deepEqual(await mutate(one, action, id, b), { kind: "not-found" });
      assert.deepEqual(await mutate(one, action, "99999999-9999-4999-8999-999999999999"), { kind: "not-found" });
    }
    assert.deepEqual(await snapshot(id, parent.id), before);
    await pool.query("UPDATE tenant_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id]);
    assert.equal(await one.getInvoiceRentRequestForMerchant(id, a), undefined);
    assert.ok(!(await one.getInvoiceRentRequestsByMerchant(a)).some(row => row.id === id));
    for (const action of ["void", "paid-external"] as const) assert.deepEqual(await mutate(one, action, id), { kind: "not-found" });
    assert.deepEqual(await snapshot(id, parent.id), before);
  });
  await check("invoice lists retain status and parent filters and omit foreign children", async () => {
    const parent = await profile(); const other = await profile();
    const included = await make(parent.id, "overdue"); await make(parent.id, "paid");
    await make(other.id, "overdue"); await make(parent.id, "overdue", b);
    const rows = await one.getInvoiceRentRequestsByMerchant(a, { tenantProfileId: parent.id, status: "overdue" });
    assert.deepEqual(rows.map(row => row.id), [included]);
  });
  await check("archived profiles retain issued invoices and both management operations", async () => {
    const parent = await profile(); const voidId = await make(parent.id); const paidId = await make(parent.id);
    await one.archiveTenantProfileForMerchant(parent.id, a);
    assert.ok(await one.getInvoiceRentRequestForMerchant(voidId, a));
    assert.equal((await one.getInvoiceRentRequestsByMerchant(a, { tenantProfileId: parent.id })).length, 2);
    const voided = await one.voidInvoiceRentRequestForMerchant(voidId, a);
    const paid = await one.markInvoiceRentRequestPaidExternalForMerchant(paidId, a);
    assert.equal(voided.kind, "ok"); assert.equal(paid.kind, "ok");
    assert.equal((await rawInvoice(voidId)).status, "voided");
    assert.equal((await rawInvoice(paidId)).status, "paid_external");
    assert.equal((await rawInvoice(paidId)).external_payment_reference, null);
    assert.deepEqual((await events(parent.id)).map(row => row.event_type).sort(), ["Invoice_Voided", "Payment_External"]);
  });
  await check("paid invoices and voided external-payment requests preserve state and history", async () => {
    const parent = await profile();
    for (const status of ["paid", "paid_external", "voided"]) {
      const id = await make(parent.id, status); const before = await snapshot(id, parent.id);
      assert.deepEqual(await one.markInvoiceRentRequestPaidExternalForMerchant(id, a), { kind: "conflict", reason: status === "voided" ? "voided" : "paid" });
      if (status !== "voided") assert.deepEqual(await one.voidInvoiceRentRequestForMerchant(id, a), { kind: "conflict", reason: "paid" });
      assert.deepEqual(await snapshot(id, parent.id), before);
    }
  });
  await check("history failures roll back both invoice mutations completely", async () => {
    const parent = await profile(); const id = await make(parent.id); const before = await snapshot(id, parent.id);
    await pool.query(`CREATE FUNCTION s3c1_refuse_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`);
    await pool.query("CREATE TRIGGER s3c1_refuse_history BEFORE INSERT ON transaction_events FOR EACH ROW EXECUTE FUNCTION s3c1_refuse_history()");
    try {
      for (const action of ["void", "paid-external"] as const) {
        await assert.rejects(mutate(one, action, id)); assert.deepEqual(await snapshot(id, parent.id), before);
      }
    } finally { await pool.query("DROP TRIGGER s3c1_refuse_history ON transaction_events"); await pool.query("DROP FUNCTION s3c1_refuse_history()"); }
  });
  await check("concurrent void and external payment serialize to one state and one event", async () => {
    const parent = await profile(); const id = await make(parent.id);
    const results = await Promise.all([one.voidInvoiceRentRequestForMerchant(id, a), one.markInvoiceRentRequestPaidExternalForMerchant(id, a)]);
    assert.equal(results.filter(result => result.kind === "ok").length, 1);
    assert.equal(results.filter(result => result.kind === "conflict").length, 1);
    const invoice = await rawInvoice(id); const history = await events(parent.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].event_type, invoice.status === "voided" ? "Invoice_Voided" : "Payment_External");
  });
  for (const action of ["void", "paid-external"] as const) {
    await check(`${action} waits and refuses committed child ownership change`, async () => {
      const parent = await profile(); const id = await make(parent.id); const before = await snapshot(id, parent.id);
      await waited("UPDATE invoices_rent_requests SET merchant_id=$1 WHERE id=$2", [b, id], () => mutate(two, action, id), async result => {
        assert.deepEqual(result, { kind: "not-found" });
        assert.deepEqual(await snapshot(id, parent.id), { ...before, invoice: { ...before.invoice, merchant_id: b } });
      });
    });
    await check(`${action} waits and refuses committed parent ownership change`, async () => {
      const parent = await profile(); const id = await make(parent.id); const before = await snapshot(id, parent.id);
      await waited("UPDATE tenant_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id], () => mutate(two, action, id), async result => {
        assert.deepEqual(result, { kind: "not-found" }); assert.deepEqual(await snapshot(id, parent.id), before);
      });
    });
    await check(`${action} waits and refuses a reparented invoice`, async () => {
      const parent = await profile(); const next = await profile(); const id = await make(parent.id); const before = await snapshot(id, parent.id);
      await waited("UPDATE invoices_rent_requests SET tenant_profile_id=$1 WHERE id=$2", [next.id, id], () => mutate(two, action, id), async result => {
        assert.deepEqual(result, { kind: "not-found" });
        assert.deepEqual(await snapshot(id, parent.id), { ...before, invoice: { ...before.invoice, tenant_profile_id: next.id } });
        assert.deepEqual(await events(next.id), []);
      });
    });
    for (const status of ["paid", "paid_external"]) {
      await check(`${action} waits and refuses newly ${status} invoice`, async () => {
        const parent = await profile(); const id = await make(parent.id); const before = await snapshot(id, parent.id);
        await waited("UPDATE invoices_rent_requests SET status=$1 WHERE id=$2", [status, id], () => mutate(two, action, id), async result => {
          assert.deepEqual(result, { kind: "conflict", reason: "paid" });
          assert.deepEqual(await snapshot(id, parent.id), { ...before, invoice: { ...before.invoice, status } });
        });
      });
    }
  }
  await check("external payment waits and refuses a newly voided invoice", async () => {
    const parent = await profile(); const id = await make(parent.id); const before = await snapshot(id, parent.id);
    await waited("UPDATE invoices_rent_requests SET status='voided' WHERE id=$1", [id], () => mutate(two, "paid-external", id), async result => {
      assert.deepEqual(result, { kind: "conflict", reason: "voided" });
      assert.deepEqual(await snapshot(id, parent.id), { ...before, invoice: { ...before.invoice, status: "voided" } });
    });
  });
  await check("invalid merchants refuse before database casts or mutations", async () => {
    const parent = await profile(); const id = await make(parent.id); const before = await snapshot(id, parent.id);
    for (const merchant of [undefined, null, 0, -1, 1.5, NaN, 2_147_483_648]) {
      assert.equal(await one.getInvoiceRentRequestForMerchant(id, merchant as any), undefined);
      assert.deepEqual(await one.getInvoiceRentRequestsByMerchant(merchant as any), []);
      assert.deepEqual(await one.voidInvoiceRentRequestForMerchant(id, merchant as any), { kind: "not-found" });
      assert.deepEqual(await one.markInvoiceRentRequestPaidExternalForMerchant(id, merchant as any), { kind: "not-found" });
    }
    assert.deepEqual(await snapshot(id, parent.id), before);
  });
} finally { await Promise.all([pool.end(), writerPool.end()]); }
console.log(`S3 INVOICE STORAGE POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
