/** R1-T7 S4a: scoped trades profiles, archive cascades and current-state promotion. */
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
assert.match(decodeURIComponent(url.pathname.slice(1)), /^taptpay_s4_verify_[a-z0-9_]+$/);
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 12 });
const writerName = "taptpay-t7-s4a-writer";
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
  const a = await addMerchant("s4a-tenant-a"); const b = await addMerchant("s4a-tenant-b");
  const input = { firstName: "Synthetic", lastName: "Client", siteAddress: "Test address", email: "owned@example.test", phone: "+6421000000", notes: "Synthetic note" };
  const profile = (status: "active" | "prospect" = "active", merchant = a) => one.createClientProfileForMerchant(merchant, { ...input, status });
  const rawClient = async (id: string) => (await pool.query("SELECT * FROM client_profiles WHERE id=$1", [id])).rows[0];
  const rawSchedule = async (id: string) => (await pool.query("SELECT * FROM job_schedules WHERE id=$1", [id])).rows[0];
  const events = async (parent: string) => (await pool.query("SELECT * FROM job_events WHERE client_profile_id=$1 ORDER BY id", [parent])).rows;
  const snapshot = async (parent: string) => ({ client: await rawClient(parent),
    schedules: (await pool.query("SELECT * FROM job_schedules WHERE client_profile_id=$1 ORDER BY id", [parent])).rows,
    invoices: (await pool.query("SELECT * FROM job_invoices WHERE client_profile_id=$1 ORDER BY id", [parent])).rows,
    events: await events(parent) });
  const schedule = async (parent: string, status = "active", merchant = a) => (await pool.query(
    "INSERT INTO job_schedules(merchant_id,client_profile_id,amount_cents,frequency,start_date,next_run_date,status) VALUES ($1,$2,52000,'monthly','2026-10-10','2026-10-10',$3) RETURNING *", [merchant, parent, status],
  )).rows[0];
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
  await check("creation projects fields and forces server identity tenant and status", async () => {
    const injectedId = randomUUID();
    const saved = await one.createClientProfileForMerchant(a, { ...input, id: injectedId, merchantId: b,
      status: "archived", archivedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0) } as any);
    assert.notEqual(saved.id, injectedId); assert.equal(saved.merchantId, a); assert.equal(saved.status, "active");
    assert.equal(saved.archivedAt, null); assert.notEqual(saved.createdAt.getTime(), 0); assert.notEqual(saved.updatedAt.getTime(), 0);
    const prospect = await one.createClientProfileForMerchant(a, { firstName: "", lastName: "", siteAddress: "", email: null, phone: null, status: "prospect" });
    assert.equal(prospect.status, "prospect"); assert.equal(prospect.firstName, ""); assert.equal(prospect.email, null);
  });
  await check("foreign and missing profile operations have no effects", async () => {
    const parent = await profile("prospect"); await schedule(parent.id); const before = await snapshot(parent.id);
    for (const [id, merchant] of [[parent.id, b], [randomUUID(), a]] as const) {
      assert.equal(await one.getClientProfileForMerchant(id, merchant), undefined);
      assert.equal(await one.updateClientProfileForMerchant(id, merchant, { notes: "change" }), undefined);
      assert.equal(await one.archiveClientProfileForMerchant(id, merchant), undefined);
      assert.equal(await one.unarchiveClientProfileForMerchant(id, merchant), undefined);
      assert.deepEqual(await one.promoteClientProfileForMerchant(id, merchant), { kind: "not-found" });
      assert.deepEqual(await one.getJobEventsByClientForMerchant(id, merchant), []);
    }
    assert.deepEqual(await snapshot(parent.id), before);
  });
  await check("updates retain omitted fields clear explicit null and exclude identity lifecycle", async () => {
    const parent = await profile(); const before = await rawClient(parent.id);
    const saved = await one.updateClientProfileForMerchant(parent.id, a, { email: null, phone: null, notes: null,
      id: randomUUID(), merchantId: b, status: "archived", archivedAt: new Date(0), firstName: undefined } as any);
    assert.equal(saved?.email, null); assert.equal(saved.phone, null); assert.equal(saved.notes, null);
    const after = await rawClient(parent.id);
    assert.deepEqual({ ...after, email: before.email, phone: before.phone, notes: before.notes, updated_at: before.updated_at }, before);
  });
  await check("archive cancels owned live schedules once and preserves issued invoices", async () => {
    const parent = await profile(); const other = await profile();
    const active = await schedule(parent.id); const paused = await schedule(parent.id, "paused");
    const terminated = await schedule(parent.id, "terminated"); const foreign = await schedule(parent.id, "active", b);
    const unrelated = await schedule(other.id);
    const invoice = (await pool.query("INSERT INTO job_invoices(merchant_id,client_profile_id,schedule_id,amount_cents,token,delivery_channel,due_at,status) VALUES ($1,$2,$3,52000,$4,'email','2026-10-10','dispatched') RETURNING *", [a, parent.id, active.id, randomUUID()])).rows[0];
    const saved = await one.archiveClientProfileForMerchant(parent.id, a); assert.equal(saved.status, "archived"); assert.ok(saved.archivedAt);
    assert.equal((await rawSchedule(active.id)).status, "terminated"); assert.equal((await rawSchedule(paused.id)).status, "terminated");
    assert.deepEqual(await rawSchedule(terminated.id), terminated); assert.deepEqual(await rawSchedule(foreign.id), foreign);
    assert.deepEqual(await rawSchedule(unrelated.id), unrelated);
    assert.deepEqual((await pool.query("SELECT * FROM job_invoices WHERE id=$1", [invoice.id])).rows[0], invoice);
    const history = await events(parent.id); assert.equal(history.length, 2);
    assert.deepEqual(history.map(row => row.schedule_id).sort(), [active.id, paused.id].sort());
    assert.ok(history.every(row => row.merchant_id === a && row.event_type === "schedule_terminated" && row.payload.reason === "client_archived"));
    const children = (await snapshot(parent.id)).schedules;
    await one.archiveClientProfileForMerchant(parent.id, a);
    assert.deepEqual((await snapshot(parent.id)).schedules, children); assert.deepEqual(await events(parent.id), history);
  });
  await check("restore does not restart cancelled schedules or append history", async () => {
    const parent = await profile(); await schedule(parent.id, "paused"); await one.archiveClientProfileForMerchant(parent.id, a);
    const before = await snapshot(parent.id); const saved = await one.unarchiveClientProfileForMerchant(parent.id, a);
    assert.equal(saved.status, "active"); assert.equal(saved.archivedAt, null);
    assert.deepEqual((await snapshot(parent.id)).schedules, before.schedules); assert.deepEqual(await events(parent.id), before.events);
  });
  await check("promotion requires the current prospect state and succeeds once", async () => {
    const parent = await profile("prospect"); const result = await one.promoteClientProfileForMerchant(parent.id, a);
    assert.equal(result.kind, "ok"); assert.equal((result as any).client.status, "active");
    const before = await rawClient(parent.id);
    assert.deepEqual(await one.promoteClientProfileForMerchant(parent.id, a), { kind: "conflict" });
    assert.deepEqual(await rawClient(parent.id), before);
    await one.archiveClientProfileForMerchant(parent.id, a); const archived = await rawClient(parent.id);
    assert.deepEqual(await one.promoteClientProfileForMerchant(parent.id, a), { kind: "conflict" });
    assert.deepEqual(await rawClient(parent.id), archived);
  });
  await check("history requires event and current parent ownership with newest-first limits", async () => {
    const parent = await profile();
    for (const [merchant, eventType, createdAt] of [[a, "old", "2026-10-01"], [a, "new", "2026-10-02"], [b, "foreign", "2026-10-03"]] as const) {
      await pool.query("INSERT INTO job_events(merchant_id,client_profile_id,event_type,created_at) VALUES ($1,$2,$3,$4)", [merchant, parent.id, eventType, createdAt]);
    }
    assert.deepEqual((await one.getJobEventsByClientForMerchant(parent.id, a)).map(row => row.eventType), ["new", "old"]);
    assert.deepEqual((await one.getJobEventsByClientForMerchant(parent.id, a, 1)).map(row => row.eventType), ["new"]);
    assert.deepEqual(await one.getJobEventsByClientForMerchant(parent.id, b), []);
    await pool.query("UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id]);
    assert.deepEqual(await one.getJobEventsByClientForMerchant(parent.id, a), []);
    assert.deepEqual((await one.getJobEventsByClientForMerchant(parent.id, b)).map(row => row.eventType), ["foreign"]);
  });
  await check("a real second history failure rolls back parent all schedules and first event", async () => {
    const parent = await profile(); await schedule(parent.id); await schedule(parent.id, "paused"); const before = await snapshot(parent.id);
    await pool.query(`CREATE FUNCTION s4a_refuse_second_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS (SELECT 1 FROM job_events WHERE client_profile_id=NEW.client_profile_id AND event_type='schedule_terminated') THEN RAISE EXCEPTION 'synthetic failure'; END IF;
      RETURN NEW; END $$`);
    await pool.query("CREATE TRIGGER s4a_refuse_second_history BEFORE INSERT ON job_events FOR EACH ROW EXECUTE FUNCTION s4a_refuse_second_history()");
    try { await assert.rejects(one.archiveClientProfileForMerchant(parent.id, a)); assert.deepEqual(await snapshot(parent.id), before); }
    finally { await pool.query("DROP TRIGGER s4a_refuse_second_history ON job_events"); await pool.query("DROP FUNCTION s4a_refuse_second_history()"); }
  });
  for (const operation of ["update", "archive", "restore", "promote"] as const) {
    await check(`${operation} waits and refuses committed client ownership change`, async () => {
      const parent = await profile("prospect"); await schedule(parent.id); const before = await snapshot(parent.id);
      const run = () => operation === "update" ? two.updateClientProfileForMerchant(parent.id, a, { notes: "change" })
        : operation === "archive" ? two.archiveClientProfileForMerchant(parent.id, a)
        : operation === "restore" ? two.unarchiveClientProfileForMerchant(parent.id, a)
        : two.promoteClientProfileForMerchant(parent.id, a);
      await waited("UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id], run, async result => {
        assert.deepEqual(result, operation === "promote" ? { kind: "not-found" } : undefined);
        assert.deepEqual(await snapshot(parent.id), { ...before, client: { ...before.client, merchant_id: b } });
      });
    });
  }
  await check("promotion waits and refuses a newly archived current state", async () => {
    const parent = await profile("prospect"); const before = await rawClient(parent.id);
    await waited("UPDATE client_profiles SET status='archived' WHERE id=$1", [parent.id], () => two.promoteClientProfileForMerchant(parent.id, a), async result => {
      assert.deepEqual(result, { kind: "conflict" }); assert.deepEqual(await rawClient(parent.id), { ...before, status: "archived" });
    });
  });
  for (const change of ["ownership", "parent"] as const) {
    await check(`archive waits and leaves schedules with changed ${change} untouched`, async () => {
      const parent = await profile(); const next = await profile(); const child = await schedule(parent.id);
      const field = change === "ownership" ? "merchant_id" : "client_profile_id"; const value = change === "ownership" ? b : next.id;
      await waited(`UPDATE job_schedules SET ${field}=$1 WHERE id=$2`, [value, child.id], () => two.archiveClientProfileForMerchant(parent.id, a), async result => {
        assert.equal(result.status, "archived"); assert.deepEqual(await rawSchedule(child.id), { ...child, [field]: value });
        assert.deepEqual(await events(parent.id), []); assert.deepEqual(await events(next.id), []);
      });
    });
  }
  await check("invalid merchant scopes refuse without casts queries or mutations", async () => {
    const parent = await profile(); await schedule(parent.id); const before = await snapshot(parent.id);
    const count = (await pool.query("SELECT count(*)::int AS n FROM client_profiles")).rows[0].n;
    for (const merchant of [undefined, null, 0, -1, 1.5, NaN, 2_147_483_648]) {
      await assert.rejects(one.createClientProfileForMerchant(merchant as any, input), /Invalid tenant scope/);
      assert.equal(await one.getClientProfileForMerchant(parent.id, merchant as any), undefined);
      assert.deepEqual(await one.getClientProfilesByMerchant(merchant as any), []);
      assert.equal(await one.updateClientProfileForMerchant(parent.id, merchant as any, { notes: "change" }), undefined);
      assert.equal(await one.archiveClientProfileForMerchant(parent.id, merchant as any), undefined);
      assert.equal(await one.unarchiveClientProfileForMerchant(parent.id, merchant as any), undefined);
      assert.deepEqual(await one.promoteClientProfileForMerchant(parent.id, merchant as any), { kind: "not-found" });
      assert.deepEqual(await one.getJobEventsByClientForMerchant(parent.id, merchant as any), []);
    }
    assert.deepEqual(await snapshot(parent.id), before); assert.equal((await pool.query("SELECT count(*)::int AS n FROM client_profiles")).rows[0].n, count);
  });
} finally { await Promise.all([pool.end(), writerPool.end()]); }
console.log(`S4 TRADES CLIENT STORAGE POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
