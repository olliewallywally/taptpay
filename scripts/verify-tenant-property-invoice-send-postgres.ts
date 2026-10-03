/** R1-T7 S3c2: real scoped creation/reuse, attachments and delivery records. */
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
assert.match(decodeURIComponent(url.pathname.slice(1)), /^taptpay_s3_verify_[a-z0-9_]+$/);
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 12 });
const writerName = "taptpay-t7-s3c2-writer";
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
  const a = await addMerchant("s3c2-tenant-a"); const b = await addMerchant("s3c2-tenant-b");
  const input = { amountCents: 52000, deliveryChannel: "email", dueAt: new Date("2026-10-10T00:00:00Z") };
  const profile = () => one.createTenantProfileForMerchant(a, { firstName: "Synthetic", lastName: "Profile", email: "owned@example.test", propertyAddress: "Test address" });
  const create = (store: typeof one, parent: string, data = input, merchant = a) => store.createOrReuseInvoiceRentRequestForMerchant(parent, merchant, data);
  const make = async (parent: string, data: any = input) => {
    const result = await create(one, parent, data); assert.equal(result.kind, "ok"); return (result as any).invoice;
  };
  const record = (store: typeof one, id: string, parent: string, data: any = { channel: "email" }, merchant = a) => store.recordInvoiceRentRequestDeliveryForMerchant(id, merchant, parent, data);
  const raw = async (id: string) => (await pool.query("SELECT * FROM invoices_rent_requests WHERE id=$1", [id])).rows[0];
  const rows = async (parent: string) => (await pool.query("SELECT * FROM invoices_rent_requests WHERE tenant_profile_id=$1 ORDER BY id", [parent])).rows;
  const events = async (parent: string) => (await pool.query("SELECT * FROM transaction_events WHERE tenant_profile_id=$1 ORDER BY id", [parent])).rows;
  const snapshot = async (parent: string) => ({ invoices: await rows(parent), events: await events(parent) });
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
  await check("foreign missing and inconsistent parent scope refuses all management operations", async () => {
    const parent = await profile(); const invoice = await make(parent.id); const before = await snapshot(parent.id);
    assert.deepEqual(await create(one, parent.id, input, b), { kind: "not-found" });
    assert.deepEqual(await create(one, "99999999-9999-4999-8999-999999999999"), { kind: "not-found" });
    assert.equal(await one.getInvoiceRentRequestDeliveryForMerchant(invoice.id, b), undefined);
    assert.deepEqual(await record(one, invoice.id, parent.id, {}, b), { kind: "not-found" });
    await pool.query("UPDATE tenant_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id]);
    assert.equal(await one.getInvoiceRentRequestDeliveryForMerchant(invoice.id, a), undefined);
    assert.deepEqual(await record(one, invoice.id, parent.id), { kind: "not-found" });
    assert.deepEqual(await snapshot(parent.id), before);
  });
  await check("runtime projection forces identity tenant token and lifecycle metadata", async () => {
    const parent = await profile(); const invoice = await make(parent.id, { ...input, merchantId: b, tenantProfileId: "foreign", id: "99999999-9999-4999-8999-999999999999", token: "caller-token", status: "paid", paidAt: new Date(0), scheduleId: "99999999-9999-4999-8999-999999999999", splitPaidCount: 22 });
    assert.equal(invoice.merchantId, a); assert.equal(invoice.tenantProfileId, parent.id); assert.equal(invoice.status, "pending_dispatch");
    assert.notEqual(invoice.token, "caller-token"); assert.equal(invoice.paidAt, null); assert.equal(invoice.scheduleId, null); assert.equal(invoice.splitPaidCount, 0);
  });
  await check("rent reuse changes only amount and preserves payment and delivery context", async () => {
    const parent = await profile(); const invoice = await make(parent.id); const before = await raw(invoice.id); const history = await events(parent.id);
    const result = await create(one, parent.id, { ...input, amountCents: 54000, deliveryChannel: "sms", dueAt: new Date(0), kind: "rent", splitEnabled: true } as any);
    assert.equal(result.kind, "ok"); assert.equal((result as any).reused, true); assert.equal((result as any).invoice.id, invoice.id);
    const after = await raw(invoice.id);
    assert.deepEqual({ ...after, amount_cents: before.amount_cents, updated_at: before.updated_at }, before);
    assert.equal(after.amount_cents, 54000); assert.deepEqual(await events(parent.id), history);
  });
  await check("charges coexist and a latest charge preserves the existing new-rent rule", async () => {
    const parent = await profile(); const rent = await make(parent.id);
    await pool.query("UPDATE invoices_rent_requests SET created_at=now()-interval '1 day' WHERE id=$1", [rent.id]);
    const charge = await make(parent.id, { ...input, kind: "charge", chargeType: "utilities" });
    const next = await create(one, parent.id); assert.equal(next.kind, "ok"); assert.equal((next as any).reused, false);
    assert.equal((await rows(parent.id)).length, 3); assert.notEqual((next as any).invoice.id, charge.id);
    assert.deepEqual((await events(parent.id)).map(row => row.event_type).sort(), ["Charge_Created", "Invoice_Generated", "Invoice_Generated"]);
  });
  await check("eight concurrent authenticated rent creations produce one invoice and one creation event", async () => {
    const parent = await profile(); const results = await Promise.all(Array.from({ length: 8 }, (_, i) => create(one, parent.id, { ...input, amountCents: 52000 + i })));
    assert.ok(results.every(result => result.kind === "ok")); assert.equal(results.filter(result => result.kind === "ok" && !result.reused).length, 1);
    assert.equal(new Set(results.map(result => (result as any).invoice.id)).size, 1);
    assert.equal((await rows(parent.id)).length, 1); assert.equal((await events(parent.id)).length, 1);
  });
  await check("concurrent charges remain separate with unique tokens and complete history", async () => {
    const parent = await profile(); await Promise.all(Array.from({ length: 3 }, () => make(parent.id, { ...input, kind: "charge" })));
    const children = await rows(parent.id); assert.equal(children.length, 3); assert.equal(new Set(children.map(row => row.token)).size, 3);
    assert.equal((await events(parent.id)).filter(row => row.event_type === "Charge_Created").length, 3);
  });
  await check("archived profile behavior is preserved for creation snapshot and delivery record", async () => {
    const parent = await profile(); await one.archiveTenantProfileForMerchant(parent.id, a); const invoice = await make(parent.id);
    const captured = await one.getInvoiceRentRequestDeliveryForMerchant(invoice.id, a);
    assert.equal(captured?.tenant.status, "archived"); assert.equal(captured?.tenant.email, "owned@example.test");
    assert.equal((await record(one, invoice.id, parent.id)).kind, "ok"); assert.equal((await raw(invoice.id)).status, "dispatched");
  });
  await check("attachment references require current owned documents through the write", async () => {
    const parent = await profile(); const path = "invoices/invoice-1700000000000-0123456789abcdef.pdf";
    await pool.query("INSERT INTO uploaded_files(path,mime_type,data,merchant_id) VALUES ($1,'application/pdf',$2,$3)", [path, Buffer.from("%PDF-synthetic"), a]);
    const invoice = await make(parent.id, { ...input, kind: "charge", documentUrl: `/uploads/${path}`, documentName: "synthetic.pdf" });
    assert.equal(invoice.documentUrl, `/uploads/${path}`); const before = await snapshot(parent.id);
    await pool.query("UPDATE uploaded_files SET merchant_id=$1 WHERE path=$2", [b, path]);
    assert.deepEqual(await create(one, parent.id, { ...input, documentUrl: `/uploads/${path}` } as any), { kind: "invalid-document" });
    assert.deepEqual(await create(one, parent.id, { ...input, documentUrl: "https://foreign.example/doc" } as any), { kind: "invalid-document" });
    assert.deepEqual(await snapshot(parent.id), before);
  });
  await check("real history failures roll back invoice creation and delivery metadata", async () => {
    const parent = await profile(); const invoice = await make(parent.id); const before = await snapshot(parent.id);
    await pool.query(`CREATE FUNCTION s3c2_refuse_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`);
    await pool.query("CREATE TRIGGER s3c2_refuse_history BEFORE INSERT ON transaction_events FOR EACH ROW EXECUTE FUNCTION s3c2_refuse_history()");
    try {
      await assert.rejects(create(one, parent.id, { ...input, kind: "charge" } as any)); assert.deepEqual(await snapshot(parent.id), before);
      await assert.rejects(record(one, invoice.id, parent.id)); assert.deepEqual(await snapshot(parent.id), before);
    } finally { await pool.query("DROP TRIGGER s3c2_refuse_history ON transaction_events"); await pool.query("DROP FUNCTION s3c2_refuse_history()"); }
  });
  await check("delivery records project metadata and preserve current overdue status", async () => {
    const parent = await profile(); const invoice = await make(parent.id);
    await pool.query("UPDATE invoices_rent_requests SET status='overdue' WHERE id=$1", [invoice.id]);
    const result = await record(one, invoice.id, parent.id, { channel: "whatsapp", messageId: "synthetic-message", merchantId: b, tenantProfileId: "foreign", status: "paid", amountCents: 1, paidAt: new Date(0) });
    assert.equal(result.kind, "ok"); const after = await raw(invoice.id);
    assert.equal(after.status, "overdue"); assert.equal(after.merchant_id, a); assert.equal(after.tenant_profile_id, parent.id); assert.equal(after.amount_cents, input.amountCents);
    assert.equal(after.paid_at, null); assert.equal(after.whatsapp_message_id, "synthetic-message"); assert.ok(after.sent_at); assert.ok(after.dispatched_at);
    assert.equal((await events(parent.id)).find(row => row.event_type === "Invoice_Resent").payload.status, "overdue");
  });
  await check("delivery records cannot silently adopt a different captured parent", async () => {
    const parent = await profile(); const next = await profile(); const invoice = await make(parent.id); const before = await snapshot(parent.id);
    assert.deepEqual(await record(one, invoice.id, next.id), { kind: "not-found" }); assert.deepEqual(await snapshot(parent.id), before);
  });
  await check("create waits and refuses committed parent ownership change", async () => {
    const parent = await profile(); const before = await snapshot(parent.id);
    await waited("UPDATE tenant_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id], () => create(two, parent.id), async result => {
      assert.deepEqual(result, { kind: "not-found" }); assert.deepEqual(await snapshot(parent.id), before);
    });
  });
  await check("create waits and refuses committed document reassignment", async () => {
    const parent = await profile(); const path = "invoices/invoice-1700000000001-0123456789abcdef.pdf"; const before = await snapshot(parent.id);
    await pool.query("INSERT INTO uploaded_files(path,mime_type,data,merchant_id) VALUES ($1,'application/pdf',$2,$3)", [path, Buffer.from("%PDF-synthetic"), a]);
    await waited("UPDATE uploaded_files SET merchant_id=$1 WHERE path=$2", [b, path], () => create(two, parent.id, { ...input, documentUrl: `/uploads/${path}` } as any), async result => {
      assert.deepEqual(result, { kind: "invalid-document" }); assert.deepEqual(await snapshot(parent.id), before);
    });
  });
  for (const change of ["ownership", "paid", "parent"] as const) {
    await check(`reuse waits and never modifies a child after ${change} changes`, async () => {
      const parent = await profile(); const next = await profile(); const invoice = await make(parent.id); const before = await raw(invoice.id);
      const sql = change === "ownership" ? "UPDATE invoices_rent_requests SET merchant_id=$1 WHERE id=$2"
        : change === "paid" ? "UPDATE invoices_rent_requests SET status=$1 WHERE id=$2" : "UPDATE invoices_rent_requests SET tenant_profile_id=$1 WHERE id=$2";
      const value = change === "ownership" ? b : change === "paid" ? "paid" : next.id;
      await waited(sql, [value, invoice.id], () => create(two, parent.id, { ...input, amountCents: 1 }), async result => {
        assert.equal(result.kind, "ok"); assert.equal(result.reused, false); assert.notEqual(result.invoice.id, invoice.id);
        const key = change === "ownership" ? "merchant_id" : change === "paid" ? "status" : "tenant_profile_id";
        assert.deepEqual(await raw(invoice.id), { ...before, [key]: value });
        assert.deepEqual(await events(next.id), []);
      });
    });
  }
  for (const change of ["ownership", "parent-ownership", "parent", "paid", "paid_external", "voided"] as const) {
    await check(`delivery record waits and refuses ${change} change`, async () => {
      const parent = await profile(); const next = await profile(); const invoice = await make(parent.id); const history = await events(parent.id);
      const sql = change === "ownership" ? "UPDATE invoices_rent_requests SET merchant_id=$1 WHERE id=$2"
        : change === "parent-ownership" ? "UPDATE tenant_profiles SET merchant_id=$1 WHERE id=$2"
        : change === "parent" ? "UPDATE invoices_rent_requests SET tenant_profile_id=$1 WHERE id=$2"
        : "UPDATE invoices_rent_requests SET status=$1 WHERE id=$2";
      const value = change === "ownership" || change === "parent-ownership" ? b : change === "parent" ? next.id : change;
      await waited(sql, [value, change === "parent-ownership" ? parent.id : invoice.id], () => record(two, invoice.id, parent.id), async result => {
        assert.deepEqual(result, ["paid", "paid_external", "voided"].includes(change) ? { kind: "conflict", reason: change === "voided" ? "voided" : "paid" } : { kind: "not-found" });
        const after = await raw(invoice.id); assert.equal(after.sent_at, null); assert.equal(after.dispatched_at, null);
        assert.deepEqual(await events(parent.id), history); assert.deepEqual(await events(next.id), []);
      });
    });
  }
  await check("delivery record derives status from the current row committed while waiting", async () => {
    const parent = await profile(); const invoice = await make(parent.id);
    await waited("UPDATE invoices_rent_requests SET status='overdue' WHERE id=$1", [invoice.id], () => record(two, invoice.id, parent.id), async result => {
      assert.equal(result.kind, "ok"); assert.equal(result.invoice.status, "overdue"); assert.equal((await raw(invoice.id)).status, "overdue");
    });
  });
  await check("invalid merchants refuse without casts or mutations", async () => {
    const parent = await profile(); const invoice = await make(parent.id); const before = await snapshot(parent.id);
    for (const merchant of [undefined, null, 0, -1, 1.5, NaN, 2_147_483_648]) {
      assert.deepEqual(await one.createOrReuseInvoiceRentRequestForMerchant(parent.id, merchant as any, input), { kind: "not-found" });
      assert.equal(await one.getInvoiceRentRequestDeliveryForMerchant(invoice.id, merchant as any), undefined);
      assert.deepEqual(await one.recordInvoiceRentRequestDeliveryForMerchant(invoice.id, merchant as any, parent.id, {}), { kind: "not-found" });
    }
    assert.deepEqual(await snapshot(parent.id), before);
  });
} finally { await Promise.all([pool.end(), writerPool.end()]); }
console.log(`S3 INVOICE SEND STORAGE POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
