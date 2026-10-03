/** R1-T7 S3b: real schedule replacement, history rollback and ownership/state races. */
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
const writerPool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1, application_name: "taptpay-t7-s3b-writer" });
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
  const a = await addMerchant("s3b-tenant-a"); const b = await addMerchant("s3b-tenant-b");
  const input = { amountCents: 52000, frequency: "weekly", deliveryChannel: "email", startDate: new Date("2026-10-10T00:00:00Z") };
  const profile = () => one.createTenantProfileForMerchant(a, { firstName: "Synthetic", lastName: "Profile", propertyAddress: "Test address" });
  const make = async (parent: string, scope = a) => {
    const result = await one.createActiveScheduleForMerchant(parent, scope, input);
    assert.equal(result.kind, "ok"); return (result as any).schedule;
  };
  const rawSchedule = async (id: string) => (await pool.query("SELECT * FROM active_schedules WHERE id=$1", [id])).rows[0];
  const rows = async (parent: string) => (await pool.query("SELECT * FROM active_schedules WHERE tenant_profile_id=$1 ORDER BY id", [parent])).rows;
  const events = async (parent: string) => (await pool.query("SELECT * FROM transaction_events WHERE tenant_profile_id=$1 ORDER BY id", [parent])).rows;
  const snapshot = async (parent: string) => ({ schedules: await rows(parent), events: await events(parent) });
  async function waited(sql: string, args: any[], run: () => Promise<any>, accept: (result: any) => Promise<void>) {
    const locker = await pool.connect(); let open = false; let pending: Promise<any> | undefined;
    try {
      await locker.query("BEGIN"); open = true; await locker.query(sql, args);
      pending = run(); void pending.catch(() => undefined);
      let didWait = false;
      for (let i = 0; i < 200; i++) {
        const result = await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", ["taptpay-t7-s3b-writer"]);
        if (result.rowCount) { didWait = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(didWait, "must actually wait on the concurrent write");
      await locker.query("COMMIT"); open = false; await accept(await pending);
    } finally { if (open) await locker.query("ROLLBACK"); await pending?.catch(() => undefined); locker.release(); }
  }
  await check("schedule reads and writes refuse foreign missing and inconsistent-parent rows", async () => {
    const parent = await profile(); const row = await make(parent.id); const before = await snapshot(parent.id);
    assert.equal(await one.getActiveScheduleForMerchant(row.id, b), undefined);
    assert.deepEqual(await one.updateActiveScheduleForMerchant(row.id, b, { amountCents: 1 }), { kind: "not-found" });
    assert.deepEqual(await one.terminateActiveScheduleForMerchant(row.id, b), { kind: "not-found" });
    assert.deepEqual(await one.createActiveScheduleForMerchant(parent.id, b, input), { kind: "not-found" });
    assert.deepEqual(await one.updateActiveScheduleForMerchant("99999999-9999-4999-8999-999999999999", a, {}), { kind: "not-found" });
    assert.deepEqual(await snapshot(parent.id), before);
    await pool.query("UPDATE tenant_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id]);
    assert.equal(await one.getActiveScheduleForMerchant(row.id, a), undefined);
    assert.ok(!(await one.getActiveSchedulesByMerchant(a)).some(candidate => candidate.id === row.id));
    assert.deepEqual(await one.updateActiveScheduleForMerchant(row.id, a, { status: "paused" }), { kind: "not-found" });
    assert.deepEqual(await one.terminateActiveScheduleForMerchant(row.id, a), { kind: "not-found" });
    assert.deepEqual(await snapshot(parent.id), before);
  });
  await check("replacement cancels only owned live schedules and preserves cancelled history", async () => {
    const parent = await profile(); const initial = await make(parent.id);
    await one.updateActiveScheduleForMerchant(initial.id, a, { status: "paused" });
    const foreign = (await pool.query("INSERT INTO active_schedules(merchant_id,tenant_profile_id,amount_cents,frequency,start_date,next_run_date) VALUES ($1,$2,1,'weekly',now(),now()) RETURNING id", [b,parent.id])).rows[0].id;
    const next = await make(parent.id);
    assert.equal((await rawSchedule(initial.id)).status, "terminated");
    assert.equal((await rawSchedule(foreign)).status, "active");
    const terminated = await rawSchedule(initial.id); const after = await make(parent.id);
    assert.deepEqual(await rawSchedule(initial.id), terminated);
    assert.equal((await rawSchedule(next.id)).status, "terminated"); assert.equal(after.status, "active");
    assert.equal((await events(parent.id)).filter(event => event.event_type === "Schedule_Terminated").length, 2);
  });
  await check("runtime projection cannot reassign schedules or inject cancellation and cron metadata", async () => {
    const parent = await profile();
    const created = await one.createActiveScheduleForMerchant(parent.id, a, { ...input, merchantId: b, tenantProfileId: "99999999-9999-4999-8999-999999999999", id: "99999999-9999-4999-8999-999999999999", status: "terminated", nextRunDate: new Date(0) } as any);
    assert.equal(created.kind, "ok"); const row = (created as any).schedule;
    assert.equal(row.merchantId, a); assert.equal(row.tenantProfileId, parent.id); assert.equal(row.status, "active"); assert.deepEqual(row.nextRunDate, input.startDate);
    const updated = await one.updateActiveScheduleForMerchant(row.id, a, { amountCents: 54000, id: "99999999-9999-4999-8999-999999999999", merchantId: b, tenantProfileId: "99999999-9999-4999-8999-999999999999", status: "terminated", nextRunDate: new Date(0), startDate: new Date(0), pauseNextCycle: true } as any);
    assert.equal(updated.kind, "ok"); const next = (updated as any).schedule;
    assert.equal(next.id, row.id); assert.equal(next.merchantId, a); assert.equal(next.tenantProfileId, parent.id);
    assert.equal(next.status, "active"); assert.equal(next.amountCents, 54000); assert.deepEqual(next.nextRunDate, row.nextRunDate); assert.equal(next.pauseNextCycle, false);
  });
  await check("eight concurrent replacements leave one active schedule and complete history", async () => {
    const parent = await profile();
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => one.createActiveScheduleForMerchant(parent.id, a, { ...input, amountCents: 52000 + i })));
    assert.ok(results.every(result => result.kind === "ok"));
    const children = await rows(parent.id); assert.equal(children.length, 8); assert.equal(children.filter(row => row.status === "active").length, 1);
    const history = await events(parent.id); assert.equal(history.length, 15);
    assert.equal(history.filter(event => event.event_type === "Schedule_Created").length, 8);
    const replacements = history.filter(event => event.event_type === "Schedule_Terminated"); assert.equal(replacements.length, 7);
    assert.equal(new Set(replacements.map(event => event.schedule_id)).size, 7);
    assert.ok(replacements.every(event => children.some(row => row.id === event.payload.replacedBy)));
  });
  await check("archive competing with replacement uses the same lock order and leaves no live child", async () => {
    const parent = await profile(); await make(parent.id);
    const [created, archived] = await Promise.all([one.createActiveScheduleForMerchant(parent.id, a, input), one.archiveTenantProfileForMerchant(parent.id, a)]);
    assert.ok(created.kind === "ok" || (created.kind === "conflict" && created.reason === "archived"));
    assert.equal(archived.status, "archived"); assert.ok((await rows(parent.id)).every(row => row.status === "terminated"));
  });
  await check("history failures roll back replacement pause and cancellation completely", async () => {
    const parent = await profile(); const row = await make(parent.id); const before = await snapshot(parent.id);
    await pool.query(`CREATE FUNCTION s3b_refuse_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`);
    await pool.query("CREATE TRIGGER s3b_refuse_history BEFORE INSERT ON transaction_events FOR EACH ROW EXECUTE FUNCTION s3b_refuse_history()");
    try {
      await assert.rejects(one.createActiveScheduleForMerchant(parent.id, a, input)); assert.deepEqual(await snapshot(parent.id), before);
      await assert.rejects(one.updateActiveScheduleForMerchant(row.id, a, { status: "paused" })); assert.deepEqual(await snapshot(parent.id), before);
      await assert.rejects(one.terminateActiveScheduleForMerchant(row.id, a)); assert.deepEqual(await snapshot(parent.id), before);
    } finally { await pool.query("DROP TRIGGER s3b_refuse_history ON transaction_events"); await pool.query("DROP FUNCTION s3b_refuse_history()"); }
  });
  for (const action of ["update", "terminate"] as const) {
    await check(`${action} waits and refuses committed child ownership change`, async () => {
      const parent = await profile(); const row = await make(parent.id); const history = await events(parent.id);
      await waited("UPDATE active_schedules SET merchant_id=$1 WHERE id=$2", [b,row.id],
        () => action === "update" ? two.updateActiveScheduleForMerchant(row.id,a,{ amountCents: 1 }) : two.terminateActiveScheduleForMerchant(row.id,a),
        async result => { assert.deepEqual(result,{kind:"not-found"}); assert.equal((await rawSchedule(row.id)).amount_cents,input.amountCents); assert.deepEqual(await events(parent.id),history); });
    });
  }
  for (const action of ["create", "update", "terminate"] as const) {
    await check(`${action} waits and refuses committed parent ownership change`, async () => {
      const parent = await profile(); const row = await make(parent.id); const before = await snapshot(parent.id);
      await waited("UPDATE tenant_profiles SET merchant_id=$1 WHERE id=$2", [b,parent.id],
        () => action === "create" ? two.createActiveScheduleForMerchant(parent.id,a,input) : action === "update" ? two.updateActiveScheduleForMerchant(row.id,a,{ status:"paused" }) : two.terminateActiveScheduleForMerchant(row.id,a),
        async result => { assert.deepEqual(result,{kind:"not-found"}); assert.deepEqual(await snapshot(parent.id),before); });
    });
  }
  await check("create waits and refuses a newly archived profile without cancelling the old child", async () => {
    const parent = await profile(); await make(parent.id); const before = await snapshot(parent.id);
    await waited("UPDATE tenant_profiles SET status='archived' WHERE id=$1", [parent.id], () => two.createActiveScheduleForMerchant(parent.id,a,input),
      async result => { assert.deepEqual(result,{kind:"conflict",reason:"archived"}); assert.deepEqual(await snapshot(parent.id),before); });
  });
  await check("edit waits and refuses cancellation without resurrecting a schedule", async () => {
    const parent = await profile(); const row = await make(parent.id); const history = await events(parent.id);
    await waited("UPDATE active_schedules SET status='terminated' WHERE id=$1", [row.id], () => two.updateActiveScheduleForMerchant(row.id,a,{status:"active"}),
      async result => { assert.deepEqual(result,{kind:"conflict",reason:"terminated"}); assert.equal((await rawSchedule(row.id)).status,"terminated"); assert.deepEqual(await events(parent.id),history); });
  });
  await check("edit refuses a reparented schedule after waiting on its child lock", async () => {
    const parent = await profile(); const newParent = await profile(); const row = await make(parent.id); const history = await events(parent.id);
    await waited("UPDATE active_schedules SET tenant_profile_id=$1 WHERE id=$2", [newParent.id,row.id], () => two.updateActiveScheduleForMerchant(row.id,a,{amountCents:1}),
      async result => { assert.deepEqual(result,{kind:"not-found"}); assert.equal((await rawSchedule(row.id)).amount_cents,input.amountCents); assert.deepEqual(await events(parent.id),history); });
  });
  await check("resume uses the latest cycle committed while it waits", async () => {
    const parent = await profile(); const row = await make(parent.id); const next = new Date(Date.now()+20*86400000);
    await pool.query("UPDATE active_schedules SET status='paused',next_run_date='2020-01-01' WHERE id=$1",[row.id]);
    await waited("UPDATE active_schedules SET frequency='monthly',next_run_date=$1 WHERE id=$2",[next,row.id],()=>two.updateActiveScheduleForMerchant(row.id,a,{status:"active"}),
      async result=>{assert.equal(result.kind,"ok");assert.deepEqual(result.schedule.nextRunDate,next);assert.equal(result.schedule.frequency,"monthly");});
  });
  await check("paused cycles are skipped and terminated schedules cannot resume", async () => {
    const parent=await profile();const row=await make(parent.id);
    await pool.query("UPDATE active_schedules SET status='paused',next_run_date=now()-interval '5 weeks' WHERE id=$1",[row.id]);
    const before=new Date();const resumed=await one.updateActiveScheduleForMerchant(row.id,a,{status:"active"});
    assert.equal(resumed.kind,"ok");assert.ok((resumed as any).schedule.nextRunDate>before);
    assert.equal((await one.terminateActiveScheduleForMerchant(row.id,a)).kind,"ok");
    assert.deepEqual(await one.updateActiveScheduleForMerchant(row.id,a,{status:"active"}),{kind:"conflict",reason:"terminated"});
  });
  await check("invalid merchants refuse before database casts or mutations",async()=>{
    const parent=await profile();const row=await make(parent.id);const before=await snapshot(parent.id);
    for(const merchant of [undefined,null,0,-1,1.5,NaN,2_147_483_648]){
      assert.equal(await one.getActiveScheduleForMerchant(row.id,merchant as any),undefined);
      assert.deepEqual(await one.getActiveSchedulesByMerchant(merchant as any),[]);
      assert.deepEqual(await one.createActiveScheduleForMerchant(parent.id,merchant as any,input),{kind:"not-found"});
      assert.deepEqual(await one.updateActiveScheduleForMerchant(row.id,merchant as any,{}),{kind:"not-found"});
      assert.deepEqual(await one.terminateActiveScheduleForMerchant(row.id,merchant as any),{kind:"not-found"});
    }
    assert.deepEqual(await snapshot(parent.id),before);
  });
} finally { await Promise.all([pool.end(), writerPool.end()]); }
console.log(`S3 SCHEDULE STORAGE POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
