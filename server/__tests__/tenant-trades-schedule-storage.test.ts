import "./support/test-env";
import { DatabaseStorage, MemStorage } from "../storage";
import { clientProfiles, jobEvents, jobSchedules } from "@shared/schema";
import { PgDialect } from "drizzle-orm/pg-core";
const id = "55555555-5555-4555-8555-555555555555";
const parentId = "22222222-2222-4222-8222-222222222222";
const madeId = "12121212-1212-4121-8121-121212121212";
const DAY = 86_400_000; const WEEK = 7 * DAY;
const input = { amountCents: 52_000, frequency: "weekly", deliveryChannel: "email", startDate: new Date("2026-10-10T09:00:00Z") };
const INJECTED = { id: "caller-id", merchantId: 99, clientProfileId: "foreign", status: "terminated", nextRunDate: new Date(0), lastRunDate: new Date(0),
  terminatedAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0) };
function capture(parent: Record<string, unknown> | null = {}, row: Record<string, unknown> | null = {}) {
  const calls: any[] = [];
  const schedule = { id, merchantId: 11, clientProfileId: parentId, status: "active", amountCents: 50_000, frequency: "weekly", deliveryChannel: "email",
    startDate: new Date("2026-01-05T09:00:00Z"), nextRunDate: new Date("2026-10-05T09:00:00Z"), ...row };
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    select: () => ({ from: (table: any) => {
      const call: any = { kind: "select", table, locked: false }; calls.push(call);
      const result: any = Promise.resolve(table === clientProfiles ? (parent ? [{ id: parentId, merchantId: 11, status: "active", ...parent }] : []) : (row ? [schedule] : []));
      result.where = (where: any) => { call.where = where; return result; };
      result.limit = () => result; result.orderBy = () => result;
      result.for = () => { call.locked = true; return result; };
      return result;
    } }),
    update: (table: any) => ({ set: (set: any) => ({ where: (where: any) => {
      calls.push({ kind: "update", table, where, set });
      const result: any = Promise.resolve([{ ...schedule, ...set }]); result.returning = () => result; return result;
    } }) }),
    insert: (table: any) => ({ values: (values: any) => {
      calls.push({ kind: "insert", table, values });
      const result: any = Promise.resolve([{ id: madeId, ...values }]); result.returning = () => result; return result;
    } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}
const query = (where: any) => new PgDialect().sqlToQuery(where);
const writes = (calls: any[]) => calls.filter(call => ["insert", "update"].includes(call.kind));
const event = (calls: any[]) => calls.find(call => call.kind === "insert" && call.table === jobEvents)?.values;

test("recurring-invoice reads and lists need the row and its current client to be the business's", async () => {
  const { storage, calls } = capture();
  await storage.getJobScheduleForMerchant(id, 11);
  await storage.getJobSchedulesByMerchant(11);
  expect(query(calls[0].where).params).toEqual([id, 11, 11]);
  expect(query(calls[1].where).params).toEqual([11, 11]);
  for (const call of calls) {
    expect(query(call.where).sql).toContain('"job_schedules"."merchant_id"');
    expect(query(call.where).sql).toContain('"client_profiles"."merchant_id"');
    expect(query(call.where).sql.toLowerCase()).toContain("exists");
  }
});
test("create locks the owned client and commits projected input, first run on its start date, with its history", async () => {
  const { storage, calls } = capture();
  const endDate = new Date("2027-10-10T09:00:00Z");
  const result = await storage.createJobScheduleForMerchant(parentId, 11, { ...input, endDate, ...INJECTED });
  expect(result).toMatchObject({ kind: "ok", schedule: { id: madeId } });
  expect(calls[0].kind).toBe("transaction");
  const parent = calls.find(call => call.kind === "select");
  expect(parent.table).toBe(clientProfiles); expect(parent.locked).toBe(true); expect(query(parent.where).params).toEqual([parentId, 11]);
  const made = calls.find(call => call.kind === "insert" && call.table === jobSchedules).values;
  expect(made).toEqual({ ...input, endDate, merchantId: 11, clientProfileId: parentId, status: "active", nextRunDate: input.startDate });
  expect(event(calls)).toEqual({ merchantId: 11, clientProfileId: parentId, scheduleId: madeId, eventType: "schedule_created", payload: { amountCents: 52_000, frequency: "weekly" } });
  expect(writes(calls).map(call => call.table)).toEqual([jobSchedules, jobEvents]);
});
test("create leaves out an end date that was not given", async () => {
  const { storage, calls } = capture();
  await storage.createJobScheduleForMerchant(parentId, 11, input);
  expect(calls.find(call => call.kind === "insert" && call.table === jobSchedules).values).not.toHaveProperty("endDate");
});
test.each([
  ["a missing or foreign client", null, { kind: "not-found" }],
  ["an archived client", { status: "archived" }, { kind: "conflict", reason: "archived" }],
] as const)("create refuses %s with nothing written", async (_label, parent, expected) => {
  const { storage, calls } = capture(parent);
  expect(await storage.createJobScheduleForMerchant(parentId, 11, input)).toEqual(expected);
  expect(writes(calls)).toEqual([]);
});
test("a prospect or an active client takes a recurring invoice, as before", async () => {
  for (const status of ["active", "prospect"]) expect((await capture({ status }).storage.createJobScheduleForMerchant(parentId, 11, input)).kind).toBe("ok");
});
test.each(["updateJobScheduleForMerchant", "terminateJobScheduleForMerchant"])("%s locks client then row and holds the write to both", async name => {
  const { storage, calls } = capture({ status: "archived" });
  expect((await storage[name](id, 11, { amountCents: 54_000 })).kind).toBe("ok");
  expect(calls[0].kind).toBe("transaction");
  expect(calls.filter(call => call.locked).map(call => call.table)).toEqual([clientProfiles, jobSchedules]);
  expect(query(calls.find(call => call.locked && call.table === clientProfiles).where).params).toEqual([parentId, 11]);
  const update = calls.find(call => call.kind === "update");
  expect(update.table).toBe(jobSchedules); expect(query(update.where).params).toEqual([id, 11, parentId]);
  for (const field of ["id", "merchantId", "clientProfileId", "startDate", "endDate", "lastRunDate", "createdAt"]) expect(update.set).not.toHaveProperty(field);
});
test.each([
  [{ status: "paused" }, "schedule_paused", ["status", "updatedAt"]],
  [{ status: "active" }, "schedule_resumed", ["status", "updatedAt"]],
  [{ amountCents: 54_000, frequency: "monthly", deliveryChannel: "sms" }, "schedule_updated", ["amountCents", "deliveryChannel", "frequency", "updatedAt"]],
  // Identity, dates and a status that is neither active nor paused are not the caller's to set.
  [{ amountCents: 54_000, ...INJECTED }, "schedule_updated", ["amountCents", "updatedAt"]],
] as const)("update %j sets only the editable fields and logs %s with the change", async (changes, eventType, keys) => {
  const { storage, calls } = capture();
  const asked: any = { ...changes };
  expect((await storage.updateJobScheduleForMerchant(id, 11, asked)).kind).toBe("ok");
  const update = calls.find(call => call.kind === "update");
  expect(Object.keys(update.set).sort()).toEqual([...keys]);
  const expectedPayload = Object.fromEntries(["amountCents", "frequency", "deliveryChannel", "status"].filter(key => key in asked && key in update.set).map(key => [key, asked[key]]));
  expect(event(calls)).toEqual({ merchantId: 11, clientProfileId: parentId, scheduleId: id, eventType, payload: expectedPayload });
});
describe("resuming", () => {
  const paused = { status: "paused", frequency: "weekly", startDate: new Date(Date.now() - 70 * DAY), nextRunDate: new Date(Date.now() - 35 * DAY - 3_600_000) };
  test("a paused one moves its next date to the first date on its own cycle after now, from the locked row", async () => {
    const { storage, calls } = capture({}, paused);
    const before = Date.now();
    expect((await storage.updateJobScheduleForMerchant(id, 11, { status: "active" })).kind).toBe("ok");
    const next: Date = calls.find(call => call.kind === "update").set.nextRunDate;
    expect(next.getTime()).toBeGreaterThan(before); expect(next.getTime() - before).toBeLessThanOrEqual(WEEK);
    expect((next.getTime() - paused.nextRunDate.getTime()) % WEEK).toBe(0);
  });
  test("uses the frequency asked for with the resume, and keeps a monthly one on its start date's day", async () => {
    const start = new Date(Date.UTC(2020, 0, 15, 9)); const old = new Date(Date.UTC(2020, 5, 15, 9));
    const { storage, calls } = capture({}, { status: "paused", frequency: "weekly", startDate: start, nextRunDate: old });
    await storage.updateJobScheduleForMerchant(id, 11, { status: "active", frequency: "monthly" });
    const next: Date = calls.find(call => call.kind === "update").set.nextRunDate;
    expect(next.getTime()).toBeGreaterThan(Date.now()); expect(next.getUTCDate()).toBe(15); expect(next.getUTCHours()).toBe(9);
    expect(next.getTime() - Date.now()).toBeLessThanOrEqual(32 * DAY);
  });
  test("a monthly one started on the 31st returns to the 31st, not to the day its last date was clamped to", async () => {
    // Its June date fell on the 30th. Resumed on 30 August at noon, the next is 31 August.
    jest.useFakeTimers({ now: new Date("2026-08-30T12:00:00.000Z") });
    try {
      const { storage, calls } = capture({}, { status: "paused", frequency: "monthly", startDate: new Date("2026-01-31T09:00:00.000Z"), nextRunDate: new Date("2026-06-30T09:00:00.000Z") });
      await storage.updateJobScheduleForMerchant(id, 11, { status: "active" });
      expect(calls.find(call => call.kind === "update").set.nextRunDate).toEqual(new Date("2026-08-31T09:00:00.000Z"));
    } finally { jest.useRealTimers(); }
  });
  test.each([
    ["an active one set active", { status: "active" }, { status: "active" }],
    ["a paused one left paused", { status: "paused" }, { amountCents: 54_000 }],
    ["a paused one resumed before its next date", { status: "paused", nextRunDate: new Date(Date.now() + 3 * DAY) }, { status: "active" }],
  ] as const)("%s keeps its next date", async (_label, row, changes) => {
    const { storage, calls } = capture({}, row);
    await storage.updateJobScheduleForMerchant(id, 11, changes);
    const set = calls.find(call => call.kind === "update").set;
    if ("nextRunDate" in set) expect(set.nextRunDate).toEqual((row as any).nextRunDate);
    else expect(set).not.toHaveProperty("nextRunDate");
  });
});
test.each([
  ["updateJobScheduleForMerchant", {}, null, { kind: "not-found" }],
  ["terminateJobScheduleForMerchant", {}, null, { kind: "not-found" }],
  ["updateJobScheduleForMerchant", null, {}, { kind: "not-found" }],
  ["terminateJobScheduleForMerchant", null, {}, { kind: "not-found" }],
  ["updateJobScheduleForMerchant", {}, { status: "terminated" }, { kind: "conflict", reason: "terminated" }],
] as const)("%s (client %j, row %j) refuses with nothing written", async (name, parent, row, expected) => {
  const { storage, calls } = capture(parent, row);
  expect(await storage[name](id, 11, { status: "active" })).toEqual(expected);
  expect(writes(calls)).toEqual([]);
});
test("cancelling sets its fixed fields and logs it; a cancelled one is cancelled again and logged again", async () => {
  for (const status of ["active", "paused", "terminated"]) {
    const { storage, calls } = capture({}, { status, terminatedAt: status === "terminated" ? new Date(0) : null });
    expect((await storage.terminateJobScheduleForMerchant(id, 11)).kind).toBe("ok");
    const update = calls.find(call => call.kind === "update");
    expect(update.set).toMatchObject({ status: "terminated", terminatedAt: expect.any(Date) });
    expect(Object.keys(update.set).sort()).toEqual(["status", "terminatedAt", "updatedAt"]);
    expect(update.set.terminatedAt.getTime()).toBeGreaterThan(0);
    expect(event(calls)).toEqual({ merchantId: 11, clientProfileId: parentId, scheduleId: id, eventType: "schedule_terminated" });
  }
});
test.each([undefined, null, 0, -1, 1.5, NaN, 2_147_483_648])("invalid merchant %s issues no query", async merchant => {
  const { storage, calls } = capture();
  expect(await storage.getJobScheduleForMerchant(id, merchant)).toBeUndefined();
  expect(await storage.getJobSchedulesByMerchant(merchant)).toEqual([]);
  expect(await storage.createJobScheduleForMerchant(parentId, merchant, input)).toEqual({ kind: "not-found" });
  expect(await storage.updateJobScheduleForMerchant(id, merchant, { status: "paused" })).toEqual({ kind: "not-found" });
  expect(await storage.terminateJobScheduleForMerchant(id, merchant)).toEqual({ kind: "not-found" });
  expect(calls).toEqual([]);
});
test("memory recurring-invoice management remains DB-only", async () => {
  const storage = new MemStorage() as any;
  await expect(storage.createJobScheduleForMerchant(parentId, 11, input)).rejects.toThrow("requires database");
  expect(await storage.getJobScheduleForMerchant(id, 11)).toBeUndefined();
  expect(await storage.getJobSchedulesByMerchant(11)).toEqual([]);
  expect(await storage.updateJobScheduleForMerchant(id, 11, { status: "paused" })).toEqual({ kind: "not-found" });
  expect(await storage.terminateJobScheduleForMerchant(id, 11)).toEqual({ kind: "not-found" });
});
test("the global create and read are retired; the cron keeps its own", () => {
  for (const implementation of [MemStorage.prototype, DatabaseStorage.prototype] as any[]) {
    expect(implementation.createJobSchedule).toBeUndefined(); expect(implementation.getJobSchedule).toBeUndefined();
    for (const name of ["getDueJobSchedules", "updateJobSchedule", "terminateJobSchedule"]) expect(typeof implementation[name]).toBe("function");
  }
});
