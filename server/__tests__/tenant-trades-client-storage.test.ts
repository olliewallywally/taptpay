import "./support/test-env";
import { DatabaseStorage, MemStorage } from "../storage";
import { clientProfiles, jobSchedules, jobEvents } from "@shared/schema";
import { PgDialect } from "drizzle-orm/pg-core";
const id = "22222222-2222-4222-8222-222222222222";
const scheduleId = "55555555-5555-4555-8555-555555555555";
const input = { firstName: "Synthetic", lastName: "Client", siteAddress: "Test address", email: "owned@example.test" };
function capture(status = "prospect", found = true) {
  const calls: any[] = [];
  const client = { id, merchantId: 11, status };
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    select: () => ({ from: (table: any) => ({ where: (where: any) => {
      const call = { kind: "select", table, where, locked: false }; calls.push(call);
      const result: any = Promise.resolve(found ? [client] : []);
      result.limit = () => result; result.orderBy = () => result; result.for = () => { call.locked = true; return result; }; return result;
    } }) }),
    update: (table: any) => ({ set: (set: any) => ({ where: (where: any) => {
      calls.push({ kind: "update", table, where, set });
      const result: any = Promise.resolve(found ? [table === jobSchedules
        ? { id: scheduleId, merchantId: 11, clientProfileId: id, ...set } : { ...client, ...set }] : []);
      result.returning = () => result; return result;
    } }) }),
    insert: (table: any) => ({ values: (values: any) => {
      calls.push({ kind: "insert", table, values }); const result: any = Promise.resolve([{ id, ...values }]); result.returning = () => result; return result;
    } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}
const query = (where: any) => new PgDialect().sqlToQuery(where);
test.each(["active", "prospect", "archived"])("creation projects identity/lifecycle and allows only server active/prospect status: %s", async status => {
  const { storage, calls } = capture();
  await storage.createClientProfileForMerchant(11, { ...input, id: "caller", merchantId: 99, status, archivedAt: new Date(0), createdAt: new Date(0) });
  const values = calls[0].values;
  expect(values).toMatchObject({ ...input, merchantId: 11, status: status === "prospect" ? "prospect" : "active" });
  expect(values).not.toHaveProperty("id"); expect(values).not.toHaveProperty("archivedAt"); expect(values).not.toHaveProperty("createdAt");
});
test("scoped profile read/update constrain id and merchant and protect status/identity while clearing explicit nulls", async () => {
  const { storage, calls } = capture();
  await storage.getClientProfileForMerchant(id, 11);
  await storage.updateClientProfileForMerchant(id, 11, { firstName: "Changed", email: null, notes: undefined, merchantId: 99, id: "foreign", status: "archived", archivedAt: new Date(0) });
  expect(query(calls[0].where).params).toEqual([id, 11]); expect(query(calls[1].where).params).toEqual([id, 11]);
  expect(calls[1].set).toMatchObject({ firstName: "Changed", email: null, updatedAt: expect.any(Date) });
  expect(Object.keys(calls[1].set).sort()).toEqual(["email", "firstName", "updatedAt"]);
});
test("archive updates parent first and commits only same-merchant live schedule cancellation/history", async () => {
  const { storage, calls } = capture();
  expect(await storage.archiveClientProfileForMerchant(id, 11)).toMatchObject({ status: "archived" });
  const updates = calls.filter(call => call.kind === "update");
  expect(updates.map(call => call.table)).toEqual([clientProfiles, jobSchedules]);
  expect(query(updates[0].where).params).toEqual([id, 11]);
  expect(query(updates[1].where).params).toEqual([11, id, "terminated"]);
  expect(calls.find(call => call.kind === "insert").values).toMatchObject({ merchantId: 11, clientProfileId: id, scheduleId, eventType: "schedule_terminated", payload: { reason: "client_archived" } });
});
test("missing archive/restore refuse without cancellation or history", async () => {
  const { storage, calls } = capture("active", false);
  expect(await storage.archiveClientProfileForMerchant(id, 11)).toBeUndefined();
  expect(await storage.unarchiveClientProfileForMerchant(id, 11)).toBeUndefined();
  expect(calls.some(call => call.table === jobSchedules || call.table === jobEvents)).toBe(false);
});
test("restore only changes the scoped client and never restarts recurring schedules", async () => {
  const { storage, calls } = capture("archived");
  expect(await storage.unarchiveClientProfileForMerchant(id, 11)).toMatchObject({ status: "active", archivedAt: null });
  expect(calls).toHaveLength(1); expect(query(calls[0].where).params).toEqual([id, 11]);
});
test("promotion checks current owned prospect status under lock", async () => {
  const { storage, calls } = capture();
  expect(await storage.promoteClientProfileForMerchant(id, 11)).toMatchObject({ kind: "ok", client: { status: "active" } });
  const select = calls.find(call => call.kind === "select");
  expect(select.locked).toBe(true); expect(query(select.where).params).toEqual([id, 11]);
  const conflict = capture("archived"); expect(await conflict.storage.promoteClientProfileForMerchant(id, 11)).toEqual({ kind: "conflict" });
  expect(conflict.calls.some(call => call.kind === "update")).toBe(false);
});
test("history requires event and current client ownership in one query", async () => {
  const { storage, calls } = capture();
  await storage.getJobEventsByClientForMerchant(id, 11);
  expect(query(calls[0].where).params).toEqual([id, 11, 11]);
  expect(query(calls[0].where).sql).toContain('"job_events"."merchant_id"');
  expect(query(calls[0].where).sql).toContain('"client_profiles"."merchant_id"');
  expect(query(calls[0].where).sql.toLowerCase()).toContain("exists");
});
test.each([undefined, null, 0, -1, 1.5, NaN, 2_147_483_648])("invalid merchant %s issues no query", async merchant => {
  const { storage, calls } = capture();
  await expect(storage.createClientProfileForMerchant(merchant, input)).rejects.toThrow("Invalid tenant scope");
  expect(await storage.getClientProfileForMerchant(id, merchant)).toBeUndefined();
  expect(await storage.getClientProfilesByMerchant(merchant)).toEqual([]);
  expect(await storage.updateClientProfileForMerchant(id, merchant, {})).toBeUndefined();
  expect(await storage.archiveClientProfileForMerchant(id, merchant)).toBeUndefined();
  expect(await storage.unarchiveClientProfileForMerchant(id, merchant)).toBeUndefined();
  expect(await storage.promoteClientProfileForMerchant(id, merchant)).toEqual({ kind: "not-found" });
  expect(await storage.getJobEventsByClientForMerchant(id, merchant)).toEqual([]); expect(calls).toEqual([]);
});
test("memory client management remains DB-only", async () => {
  const storage = new MemStorage() as any;
  await expect(storage.createClientProfileForMerchant(11, input)).rejects.toThrow("requires database");
  expect(await storage.getClientProfileForMerchant(id, 11)).toBeUndefined();
  expect(await storage.archiveClientProfileForMerchant(id, 11)).toBeUndefined();
  expect(await storage.promoteClientProfileForMerchant(id, 11)).toEqual({ kind: "not-found" });
});
