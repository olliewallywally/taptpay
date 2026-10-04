/** R1-T7 S4c: scoped trades recurring invoices: create, pause/resume/edit, cancel, and the archive race. */
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
const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 16 });
const writerName = "taptpay-t7-s4c-writer";
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
  const a = await addMerchant("s4c-tenant-a"); const b = await addMerchant("s4c-tenant-b");
  const MISSING = "99999999-9999-4999-8999-999999999999";
  const DAY = 86_400_000; const WEEK = 7 * DAY;
  const input: any = { amountCents: 52_000, frequency: "weekly", deliveryChannel: "email", startDate: new Date("2026-10-10T09:00:00Z") };
  const profile = (merchant = a) => one.createClientProfileForMerchant(merchant, { firstName: "Synthetic", lastName: "Client", siteAddress: "Test address", email: "owned@example.test" });
  const made = async (parent: string, data = input) => {
    const result = await one.createJobScheduleForMerchant(parent, a, data); assert.equal(result.kind, "ok"); return (result as any).schedule;
  };
  const raw = async (id: string) => (await pool.query("SELECT * FROM job_schedules WHERE id=$1", [id])).rows[0];
  const events = async (parent: string) => (await pool.query("SELECT * FROM job_events WHERE client_profile_id=$1 ORDER BY created_at, id", [parent])).rows;
  const snapshot = async (parent: string) => ({
    client: (await pool.query("SELECT * FROM client_profiles WHERE id=$1", [parent])).rows[0],
    schedules: (await pool.query("SELECT * FROM job_schedules WHERE client_profile_id=$1 ORDER BY id", [parent])).rows,
    events: await events(parent) });
  type Action = "update" | "terminate";
  const mutate = (store: typeof one, action: Action, id: string, merchant: number) => action === "update"
    ? store.updateJobScheduleForMerchant(id, merchant, { amountCents: 54_000 }) : store.terminateJobScheduleForMerchant(id, merchant);
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

  await check("create projects its input forces the business client and first run and logs it", async () => {
    const parent = await profile(); const endDate = new Date("2027-10-10T09:00:00Z");
    const schedule = await made(parent.id, { ...input, endDate, id: randomUUID(), merchantId: b, clientProfileId: MISSING, status: "terminated",
      nextRunDate: new Date(0), lastRunDate: new Date(0), terminatedAt: new Date(0), createdAt: new Date(0) });
    assert.equal(schedule.merchantId, a); assert.equal(schedule.clientProfileId, parent.id); assert.equal(schedule.status, "active");
    assert.equal(schedule.nextRunDate.getTime(), input.startDate.getTime()); assert.equal(schedule.startDate.getTime(), input.startDate.getTime());
    assert.equal(schedule.endDate.getTime(), endDate.getTime()); assert.equal(schedule.lastRunDate, null); assert.equal(schedule.terminatedAt, null);
    assert.notEqual(schedule.createdAt.getTime(), 0); assert.equal(schedule.amountCents, 52_000);
    const open = await made(parent.id); assert.equal(open.endDate, null);
    const history = await events(parent.id);
    assert.deepEqual(history.map(row => [row.event_type, row.schedule_id, row.merchant_id]), [["schedule_created", schedule.id, a], ["schedule_created", open.id, a]]);
    assert.deepEqual(history[0].payload, { amountCents: 52_000, frequency: "weekly" });
    assert.equal((await snapshot(parent.id)).schedules.filter(row => row.status === "active").length, 2);
  });
  await check("create refuses a foreign missing or archived client with nothing written", async () => {
    const theirs = await profile(b); const archived = await profile(); await one.archiveClientProfileForMerchant(archived.id, a);
    const before = [await snapshot(theirs.id), await snapshot(archived.id)];
    assert.deepEqual(await one.createJobScheduleForMerchant(theirs.id, a, input), { kind: "not-found" });
    assert.deepEqual(await one.createJobScheduleForMerchant(MISSING, a, input), { kind: "not-found" });
    assert.deepEqual(await one.createJobScheduleForMerchant(archived.id, a, input), { kind: "conflict", reason: "archived" });
    assert.deepEqual([await snapshot(theirs.id), await snapshot(archived.id)], before);
    const restored = await one.unarchiveClientProfileForMerchant(archived.id, a); assert.equal(restored.status, "active");
    assert.equal((await one.createJobScheduleForMerchant(archived.id, a, input)).kind, "ok");
  });
  await check("scoped reads and lists refuse foreign missing and inconsistent rows", async () => {
    const parent = await profile(); const schedule = await made(parent.id);
    assert.equal((await one.getJobScheduleForMerchant(schedule.id, a))?.id, schedule.id);
    assert.equal(await one.getJobScheduleForMerchant(schedule.id, b), undefined); assert.equal(await one.getJobScheduleForMerchant(MISSING, a), undefined);
    assert.ok((await one.getJobSchedulesByMerchant(a)).some(row => row.id === schedule.id));
    assert.ok(!(await one.getJobSchedulesByMerchant(b)).some(row => row.id === schedule.id));
    // A row stamped with another business under an owned client belongs to neither.
    const stamped = (await pool.query("INSERT INTO job_schedules(merchant_id,client_profile_id,amount_cents,frequency,start_date,next_run_date) VALUES ($1,$2,1,'weekly',now(),now()) RETURNING id", [b, parent.id])).rows[0].id;
    const before = await snapshot(parent.id);
    for (const merchant of [a, b]) {
      assert.equal(await one.getJobScheduleForMerchant(stamped, merchant), undefined);
      assert.ok(!(await one.getJobSchedulesByMerchant(merchant)).some(row => row.id === stamped));
      for (const action of ["update", "terminate"] as const) assert.deepEqual(await mutate(one, action, stamped, merchant), { kind: "not-found" });
    }
    for (const action of ["update", "terminate"] as const) {
      assert.deepEqual(await mutate(one, action, schedule.id, b), { kind: "not-found" }); assert.deepEqual(await mutate(one, action, MISSING, a), { kind: "not-found" });
    }
    assert.deepEqual(await snapshot(parent.id), before);
    await pool.query("UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id]);
    assert.equal(await one.getJobScheduleForMerchant(schedule.id, a), undefined);
    assert.ok(!(await one.getJobSchedulesByMerchant(a)).some(row => row.id === schedule.id));
    for (const action of ["update", "terminate"] as const) assert.deepEqual(await mutate(one, action, schedule.id, a), { kind: "not-found" });
  });
  await check("the list is the business's recurring invoices newest first, cancelled ones included", async () => {
    const parent = await profile(); const older = await made(parent.id); const newer = await made(parent.id);
    await pool.query("UPDATE job_schedules SET created_at = now() - interval '1 day' WHERE id=$1", [older.id]);
    await one.terminateJobScheduleForMerchant(newer.id, a);
    const mine = (await one.getJobSchedulesByMerchant(a)).filter(row => row.clientProfileId === parent.id);
    assert.deepEqual(mine.map(row => [row.id, row.status]), [[newer.id, "terminated"], [older.id, "active"]]);
  });
  await check("update sets only the editable fields and logs paused resumed or updated with the change", async () => {
    const parent = await profile(); const schedule = await made(parent.id); const before = await raw(schedule.id);
    const edited = await one.updateJobScheduleForMerchant(schedule.id, a, { amountCents: 54_000, frequency: "monthly", deliveryChannel: "sms",
      id: randomUUID(), merchantId: b, clientProfileId: MISSING, nextRunDate: new Date(0), startDate: new Date(0), terminatedAt: new Date(0), status: "terminated" } as any);
    assert.equal(edited.kind, "ok"); const after = await raw(schedule.id);
    assert.deepEqual({ ...after, amount_cents: before.amount_cents, frequency: before.frequency, delivery_channel: before.delivery_channel, updated_at: before.updated_at }, before);
    assert.equal(after.amount_cents, 54_000); assert.equal(after.frequency, "monthly"); assert.equal(after.delivery_channel, "sms");
    assert.equal((await one.updateJobScheduleForMerchant(schedule.id, a, { status: "paused" })).kind, "ok"); assert.equal((await raw(schedule.id)).status, "paused");
    assert.equal((await one.updateJobScheduleForMerchant(schedule.id, a, { status: "active" })).kind, "ok"); assert.equal((await raw(schedule.id)).status, "active");
    const history = (await events(parent.id)).slice(1);
    assert.deepEqual(history.map(row => row.event_type), ["schedule_updated", "schedule_paused", "schedule_resumed"]);
    assert.deepEqual(history[0].payload, { amountCents: 54_000, frequency: "monthly", deliveryChannel: "sms" });
    assert.deepEqual(history[1].payload, { status: "paused" }); assert.ok(history.every(row => row.merchant_id === a && row.schedule_id === schedule.id));
  });
  await check("resuming skips the paused time on the row's own cycle and leaves a future next date alone", async () => {
    const parent = await profile(); const old = new Date(Date.now() - 35 * DAY - 3_600_000);
    const stale = await made(parent.id); await pool.query("UPDATE job_schedules SET status='paused', next_run_date=$1, start_date=$2 WHERE id=$3", [old, new Date(old.getTime() - 2 * WEEK), stale.id]);
    const started = Date.now();
    assert.equal((await one.updateJobScheduleForMerchant(stale.id, a, { status: "active" })).kind, "ok");
    const next: Date = (await raw(stale.id)).next_run_date;
    assert.ok(next.getTime() > started); assert.ok(next.getTime() - started <= WEEK); assert.equal((next.getTime() - old.getTime()) % WEEK, 0);
    const soon = new Date(Date.now() + 3 * DAY); const early = await made(parent.id);
    await pool.query("UPDATE job_schedules SET status='paused', next_run_date=$1 WHERE id=$2", [soon, early.id]);
    await one.updateJobScheduleForMerchant(early.id, a, { status: "active" });
    assert.equal((await raw(early.id)).next_run_date.getTime(), soon.getTime());
    const edited = await made(parent.id); await pool.query("UPDATE job_schedules SET status='paused', next_run_date=$1 WHERE id=$2", [old, edited.id]);
    await one.updateJobScheduleForMerchant(edited.id, a, { amountCents: 60_000 });
    assert.equal((await raw(edited.id)).next_run_date.getTime(), old.getTime()); assert.equal((await raw(edited.id)).status, "paused");
    // A resume uses the frequency asked for with it and the start date's day of the month.
    const { nextJobRunDateAfter } = await import("../server/trades-schedule");
    const start = new Date(Date.UTC(new Date().getUTCFullYear() - 2, 0, 31, 9)); const clamped = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 1, 28, 9));
    const monthly = await made(parent.id);
    await pool.query("UPDATE job_schedules SET status='paused', frequency='weekly', start_date=$1, next_run_date=$2 WHERE id=$3", [start, clamped, monthly.id]);
    const before = new Date(); await one.updateJobScheduleForMerchant(monthly.id, a, { status: "active", frequency: "monthly" }); const after = new Date();
    const resumed: Date = (await raw(monthly.id)).next_run_date;
    assert.ok([before, after].some(now => nextJobRunDateAfter(clamped, "monthly", start, now).getTime() === resumed.getTime()));
    assert.equal((await raw(monthly.id)).frequency, "monthly"); assert.equal(resumed.getUTCHours(), 9);
    // Only a paused one is resumed: an active one set active again keeps its date, even a past one.
    const running = await made(parent.id); await pool.query("UPDATE job_schedules SET next_run_date=$1 WHERE id=$2", [old, running.id]);
    await one.updateJobScheduleForMerchant(running.id, a, { status: "active" });
    assert.equal((await raw(running.id)).next_run_date.getTime(), old.getTime());
  });
  await check("cancelling records when and logs it, again each time; a cancelled one is not edited", async () => {
    const parent = await profile(); const schedule = await made(parent.id);
    assert.equal((await one.terminateJobScheduleForMerchant(schedule.id, a)).kind, "ok"); const first = await raw(schedule.id);
    assert.equal(first.status, "terminated"); assert.ok(first.terminated_at);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal((await one.terminateJobScheduleForMerchant(schedule.id, a)).kind, "ok"); const second = await raw(schedule.id);
    assert.ok(second.terminated_at.getTime() > first.terminated_at.getTime());
    assert.equal((await events(parent.id)).filter(row => row.event_type === "schedule_terminated" && row.schedule_id === schedule.id).length, 2);
    const before = await snapshot(parent.id);
    for (const changes of [{ status: "active" }, { status: "paused" }, { amountCents: 1 }] as const) {
      assert.deepEqual(await one.updateJobScheduleForMerchant(schedule.id, a, changes), { kind: "conflict", reason: "terminated" });
    }
    assert.deepEqual(await snapshot(parent.id), before);
  });
  await check("an archived client's cancelled recurring invoices stay cancelled, and none is left live", async () => {
    const parent = await profile(); const schedule = await made(parent.id);
    await one.archiveClientProfileForMerchant(parent.id, a);
    assert.equal((await raw(schedule.id)).status, "terminated");
    assert.deepEqual(await one.updateJobScheduleForMerchant(schedule.id, a, { status: "active" }), { kind: "conflict", reason: "terminated" });
    assert.equal((await snapshot(parent.id)).schedules.filter(row => row.status !== "terminated").length, 0);
  });
  await check("a history failure rolls back create update and cancel", async () => {
    const parent = await profile(); const schedule = await made(parent.id); const before = await snapshot(parent.id);
    await pool.query(`CREATE FUNCTION s4c_refuse_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`);
    await pool.query("CREATE TRIGGER s4c_refuse_history BEFORE INSERT ON job_events FOR EACH ROW EXECUTE FUNCTION s4c_refuse_history()");
    try {
      await assert.rejects(one.createJobScheduleForMerchant(parent.id, a, input));
      await assert.rejects(one.updateJobScheduleForMerchant(schedule.id, a, { status: "paused" }));
      await assert.rejects(one.terminateJobScheduleForMerchant(schedule.id, a));
      assert.deepEqual(await snapshot(parent.id), before);
    } finally { await pool.query("DROP TRIGGER s4c_refuse_history ON job_events"); await pool.query("DROP FUNCTION s4c_refuse_history()"); }
  });
  await check("an archive and a create at the same moment never leave an archived client with a live recurring invoice", async () => {
    for (let round = 0; round < 12; round++) {
      const parent = await profile();
      const [created] = await Promise.all(round % 2 ? [one.createJobScheduleForMerchant(parent.id, a, input), one.archiveClientProfileForMerchant(parent.id, a)]
        : [one.createJobScheduleForMerchant(parent.id, a, input), new Promise(resolve => setImmediate(resolve)).then(() => one.archiveClientProfileForMerchant(parent.id, a))]);
      const after = await snapshot(parent.id);
      assert.equal(after.client.status, "archived");
      assert.equal(after.schedules.filter(row => row.status !== "terminated").length, 0);
      if (created.kind === "ok") {
        // The create ran first: the archive then cancelled it and logged that. A history line's
        // time is its transaction's start, so the two are compared without their order.
        assert.deepEqual(after.events.map(row => row.event_type).sort(), ["schedule_created", "schedule_terminated"]);
      } else {
        assert.deepEqual(created, { kind: "conflict", reason: "archived" }); assert.equal(after.schedules.length, 0); assert.deepEqual(after.events, []);
      }
    }
  });
  await check("create waits for a concurrent archive and is then refused", async () => {
    const parent = await profile(); const before = await snapshot(parent.id);
    await waited("UPDATE client_profiles SET status='archived', archived_at=now() WHERE id=$1", [parent.id], () => two.createJobScheduleForMerchant(parent.id, a, input), async result => {
      assert.deepEqual(result, { kind: "conflict", reason: "archived" });
      const after = await snapshot(parent.id); assert.deepEqual(after.schedules, before.schedules); assert.deepEqual(after.events, before.events);
    });
  });
  await check("create waits and refuses a committed client ownership change", async () => {
    const parent = await profile(); const before = await snapshot(parent.id);
    await waited("UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id], () => two.createJobScheduleForMerchant(parent.id, a, input), async result => {
      assert.deepEqual(result, { kind: "not-found" });
      const after = await snapshot(parent.id); assert.deepEqual(after.schedules, before.schedules); assert.deepEqual(after.events, before.events);
    });
  });
  for (const action of ["update", "terminate"] as const) {
    await check(`${action} waits and refuses committed child ownership change`, async () => {
      const parent = await profile(); const schedule = await made(parent.id); const before = await snapshot(parent.id);
      await waited("UPDATE job_schedules SET merchant_id=$1 WHERE id=$2", [b, schedule.id], () => mutate(two, action, schedule.id, a), async result => {
        assert.deepEqual(result, { kind: "not-found" });
        assert.deepEqual(await snapshot(parent.id), { ...before, schedules: [{ ...before.schedules[0], merchant_id: b }] });
      });
    });
    await check(`${action} waits and refuses committed parent ownership change`, async () => {
      const parent = await profile(); const schedule = await made(parent.id); const before = await snapshot(parent.id);
      await waited("UPDATE client_profiles SET merchant_id=$1 WHERE id=$2", [b, parent.id], () => mutate(two, action, schedule.id, a), async result => {
        assert.deepEqual(result, { kind: "not-found" });
        const after = await snapshot(parent.id); assert.deepEqual(after.schedules, before.schedules); assert.deepEqual(after.events, before.events);
      });
    });
    await check(`${action} waits and refuses a reparented recurring invoice`, async () => {
      const parent = await profile(); const next = await profile(); const schedule = await made(parent.id); const history = await events(parent.id);
      await waited("UPDATE job_schedules SET client_profile_id=$1 WHERE id=$2", [next.id, schedule.id], () => mutate(two, action, schedule.id, a), async result => {
        assert.deepEqual(result, { kind: "not-found" });
        const row = await raw(schedule.id); assert.equal(row.client_profile_id, next.id); assert.equal(row.status, "active"); assert.equal(row.amount_cents, 52_000);
        assert.deepEqual(await events(parent.id), history); assert.deepEqual(await events(next.id), []);
      });
    });
  }
  await check("update waits and refuses a newly cancelled recurring invoice", async () => {
    const parent = await profile(); const schedule = await made(parent.id); const history = await events(parent.id);
    await waited("UPDATE job_schedules SET status='terminated', terminated_at=now() WHERE id=$1", [schedule.id], () => two.updateJobScheduleForMerchant(schedule.id, a, { status: "paused" }), async result => {
      assert.deepEqual(result, { kind: "conflict", reason: "terminated" });
      assert.equal((await raw(schedule.id)).status, "terminated"); assert.deepEqual(await events(parent.id), history);
    });
  });
  await check("a resume waits for the cron's advance and is worked out from the advanced row", async () => {
    const parent = await profile(); const schedule = await made(parent.id); const old = new Date(Date.now() - 35 * DAY);
    await pool.query("UPDATE job_schedules SET status='paused', next_run_date=$1, start_date=$2 WHERE id=$3", [old, new Date(old.getTime() - WEEK), schedule.id]);
    const advanced = new Date(Date.now() + 20 * DAY);
    await waited("UPDATE job_schedules SET next_run_date=$1 WHERE id=$2", [advanced, schedule.id], () => two.updateJobScheduleForMerchant(schedule.id, a, { status: "active" }), async result => {
      assert.equal(result.kind, "ok"); assert.equal((await raw(schedule.id)).next_run_date.getTime(), advanced.getTime());
    });
  });
  await check("invalid merchants refuse before database casts or mutations", async () => {
    const parent = await profile(); const schedule = await made(parent.id); const before = await snapshot(parent.id);
    for (const merchant of [undefined, null, 0, -1, 1.5, NaN, 2_147_483_648]) {
      assert.equal(await one.getJobScheduleForMerchant(schedule.id, merchant as any), undefined);
      assert.deepEqual(await one.getJobSchedulesByMerchant(merchant as any), []);
      assert.deepEqual(await one.createJobScheduleForMerchant(parent.id, merchant as any, input), { kind: "not-found" });
      assert.deepEqual(await one.updateJobScheduleForMerchant(schedule.id, merchant as any, { status: "paused" }), { kind: "not-found" });
      assert.deepEqual(await one.terminateJobScheduleForMerchant(schedule.id, merchant as any), { kind: "not-found" });
    }
    assert.deepEqual(await snapshot(parent.id), before);
  });
} finally { await Promise.all([pool.end(), writerPool.end()]); }
console.log(`S4 TRADES RECURRING STORAGE POSTGRES: ${passed} passed, ${failures.length} failed`);
process.exitCode = failures.length ? 1 : 0;
