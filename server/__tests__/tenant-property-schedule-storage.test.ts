import "./support/test-env";
import { MemStorage, DatabaseStorage } from "../storage";
import { activeSchedules, tenantProfiles } from "@shared/schema";
import { PgDialect } from "drizzle-orm/pg-core";

const id = "33333333-3333-4333-8333-333333333333";
const parentId = "22222222-2222-4222-8222-222222222222";
const input = { amountCents: 52000, frequency: "weekly", deliveryChannel: "email", startDate: new Date("2026-10-10T00:00:00Z") };
function capture(parentStatus = "active", scheduleStatus = "active", found = true) {
  const calls: any[] = [];
  const schedule = { id, merchantId: 11, tenantProfileId: parentId, status: scheduleStatus, nextRunDate: new Date("2026-10-01T00:00:00Z"), frequency: "weekly" };
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    select: () => ({ from: (table: any) => ({ where: (where: any) => {
      const call = { kind: "select", table, where, locked: false }; calls.push(call);
      const result: any = Promise.resolve(found ? [table === tenantProfiles ? { id: parentId, merchantId: 11, status: parentStatus } : schedule] : []);
      result.limit = () => result; result.orderBy = () => result;
      result.for = () => { call.locked = true; return result; }; return result;
    } }) }),
    update: (table: any) => ({ set: (set: any) => ({ where: (where: any) => {
      calls.push({ kind: "update", table, where, set });
      const result: any = Promise.resolve(found ? [{ ...schedule, ...set }] : []);
      result.returning = () => result; return result;
    } }) }),
    insert: (table: any) => ({ values: (values: any) => {
      calls.push({ kind: "insert", table, values });
      const result: any = Promise.resolve([{ id, ...values }]); result.returning = () => result; return result;
    } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}
const query = (where: any) => new PgDialect().sqlToQuery(where);

test("schedule reads and merchant lists require schedule and current parent ownership", async () => {
  const { storage, calls } = capture();
  await storage.getActiveScheduleForMerchant(id, 11);
  await storage.getActiveSchedulesByMerchant(11);
  for (const call of calls) {
    const sql = query(call.where);
    expect(sql.sql).toContain('"active_schedules"."merchant_id"');
    expect(sql.sql).toContain('"tenant_profiles"."merchant_id"');
    expect(sql.sql.toLowerCase()).toContain("exists");
  }
  expect(query(calls[0].where).params).toEqual([id, 11, 11]);
  expect(query(calls[1].where).params).toEqual([11, 11]);
});

test("replacement locks the parent then scopes old schedules and commits history with the insert", async () => {
  const { storage, calls } = capture();
  const result = await storage.createActiveScheduleForMerchant(parentId, 11, input);
  expect(result.kind).toBe("ok");
  expect(calls[0].kind).toBe("transaction");
  const parent = calls.find(call => call.kind === "select");
  expect(parent.table).toBe(tenantProfiles); expect(parent.locked).toBe(true);
  expect(query(parent.where).params).toEqual([parentId, 11]);
  const old = calls.find(call => call.kind === "update");
  expect(query(old.where).params).toEqual([parentId, 11]);
  expect(query(old.where).sql).toContain('"active_schedules"."merchant_id"');
  const inserts = calls.filter(call => call.kind === "insert");
  expect(inserts.find(call => call.table === activeSchedules).values).toMatchObject({ merchantId: 11, tenantProfileId: parentId, status: "active", nextRunDate: input.startDate });
  const events = inserts.flatMap(call => Array.isArray(call.values) ? call.values : [call.values]).filter(row => row.eventType);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ eventType: "Schedule_Created", merchantId: 11, tenantProfileId: parentId }),
    expect.objectContaining({ eventType: "Schedule_Terminated", merchantId: 11, payload: { replacedBy: result.schedule.id } }),
  ]));
});

test.each(["updateActiveScheduleForMerchant", "terminateActiveScheduleForMerchant"])("%s locks parent before child and scopes the final write", async name => {
  const { storage, calls } = capture();
  expect((await storage[name](id, 11, { amountCents: 54000 })).kind).toBe("ok");
  const locks = calls.filter(call => call.locked);
  expect(locks.map(call => call.table)).toEqual([tenantProfiles, activeSchedules]);
  const update = calls.find(call => call.kind === "update");
  expect(query(update.where).params).toEqual([id, 11, parentId]);
  expect(query(update.where).sql).toContain('"active_schedules"."merchant_id"');
});

test.each(["create", "update", "terminate"])("%s refuses a missing parent or child without any mutation or event", async action => {
  const { storage, calls } = capture("active", "active", false);
  const result = action === "create" ? await storage.createActiveScheduleForMerchant(parentId, 11, input)
    : action === "update" ? await storage.updateActiveScheduleForMerchant(id, 11, {})
    : await storage.terminateActiveScheduleForMerchant(id, 11);
  expect(result).toEqual({ kind: "not-found" });
  expect(calls.some(call => call.kind === "update" || call.kind === "insert")).toBe(false);
});

test("archive and cancellation are rechecked under the locks", async () => {
  const archived = capture("archived");
  expect(await archived.storage.createActiveScheduleForMerchant(parentId, 11, input)).toEqual({ kind: "conflict", reason: "archived" });
  expect(archived.calls.some(call => ["update", "insert"].includes(call.kind))).toBe(false);
  const cancelled = capture("active", "terminated");
  expect(await cancelled.storage.updateActiveScheduleForMerchant(id, 11, { status: "active" })).toEqual({ kind: "conflict", reason: "terminated" });
  expect(cancelled.calls.some(call => ["update", "insert"].includes(call.kind))).toBe(false);
});

test("schedule input projects away ownership identity lifecycle and cron fields", async () => {
  const { storage, calls } = capture();
  const hostile = { ...input, id: "injected", merchantId: 22, tenantProfileId: "injected", status: "terminated", nextRunDate: new Date(0), lastRunDate: new Date(0), pauseNextCycle: true, terminatedAt: new Date(0) };
  await storage.createActiveScheduleForMerchant(parentId, 11, hostile);
  const values = calls.find(call => call.kind === "insert" && call.table === activeSchedules).values;
  expect(values).toEqual({ ...input, merchantId: 11, tenantProfileId: parentId, status: "active", nextRunDate: input.startDate });
  calls.length = 0;
  await storage.updateActiveScheduleForMerchant(id, 11, hostile);
  const patch = calls.find(call => call.kind === "update").set;
  expect(patch).toEqual({ amountCents: 52000, frequency: "weekly", deliveryChannel: "email", updatedAt: expect.any(Date) });
});

test.each([undefined, null, 0, -1, 1.5, NaN, 2_147_483_648])("invalid tenant %s issues no query", async merchantId => {
  const { storage, calls } = capture();
  expect(await storage.getActiveScheduleForMerchant(id, merchantId)).toBeUndefined();
  expect(await storage.getActiveSchedulesByMerchant(merchantId)).toEqual([]);
  expect(await storage.createActiveScheduleForMerchant(parentId, merchantId, input)).toEqual({ kind: "not-found" });
  expect(await storage.updateActiveScheduleForMerchant(id, merchantId, {})).toEqual({ kind: "not-found" });
  expect(await storage.terminateActiveScheduleForMerchant(id, merchantId)).toEqual({ kind: "not-found" });
  expect(calls).toEqual([]);
});

test("memory property remains DB-only", async () => {
  const storage = new MemStorage() as any;
  await expect(storage.createActiveScheduleForMerchant(parentId, 11, input)).rejects.toThrow(/database/);
  expect(await storage.getActiveScheduleForMerchant(id, 11)).toBeUndefined();
  expect(await storage.getActiveSchedulesByMerchant(11)).toEqual([]);
  expect(await storage.updateActiveScheduleForMerchant(id, 11, {})).toEqual({ kind: "not-found" });
  expect(await storage.terminateActiveScheduleForMerchant(id, 11)).toEqual({ kind: "not-found" });
});
