import "./support/test-env";
import { MemStorage, DatabaseStorage } from "../storage";
import { PgDialect } from "drizzle-orm/pg-core";
const id = "22222222-2222-4222-8222-222222222222";
function capture(found = true) {
  const calls: any[] = [];
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    select: () => ({ from: () => ({ where: (where: any) => {
      calls.push({ kind: "select", where });
      const result: any = Promise.resolve(found ? [{ id, merchantId: 11 }] : []);
      result.limit = () => result; result.orderBy = () => result;
      return result;
    } }) }),
    update: () => ({ set: (set: any) => ({ where: (where: any) => {
      calls.push({ kind: "update", where, set });
      const result: any = Promise.resolve(found ? [{ id, merchantId: 11, ...set }] : []);
      result.returning = () => result; return result;
    } }) }),
    insert: () => ({ values: (values: any) => { calls.push({ kind: "insert", values }); return { returning: async () => [{ id, ...values }] }; } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}

test.each(["getTenantProfile", "updateTenantProfile", "archiveTenantProfile", "unarchiveTenantProfile"])("SQL %s requires tenant in the actual predicate", async name => {
  const { storage, calls } = capture();
  await storage[name + "ForMerchant"](id, 11, { firstName: "Synthetic" });
  const parent = calls.find(call => call.kind === (name === "getTenantProfile" ? "select" : "update"));
  const query = new PgDialect().sqlToQuery(parent.where);
  expect(query.params).toEqual([id, 11]);
  expect(query.sql).toContain('"tenant_profiles"."merchant_id"');
  if (name === "archiveTenantProfile") {
    expect(calls[0].kind).toBe("transaction");
    const child = calls.filter(call => call.kind === "update")[1];
    expect(new PgDialect().sqlToQuery(child.where).params).toEqual([id, 11]);
    expect(new PgDialect().sqlToQuery(child.where).sql).toContain('"active_schedules"."merchant_id"');
  }
});

test("archive refuses absent/foreign parent without any child change", async () => {
  const { storage, calls } = capture(false);
  expect(await storage.archiveTenantProfileForMerchant(id, 11)).toBeUndefined();
  expect(calls.filter(call => call.kind === "update")).toHaveLength(1);
});

test("profile create/update project identity and metadata away", async () => {
  const { storage, calls } = capture();
  const data = { firstName: "Synthetic", lastName: "Profile", propertyAddress: "Test", email: null, merchantId: 22, id: "injected", status: "archived", createdAt: new Date(0) };
  await storage.createTenantProfileForMerchant(11, data);
  expect(calls[0].values).toEqual({ firstName: "Synthetic", lastName: "Profile", propertyAddress: "Test", email: null, merchantId: 11 });
  await storage.updateTenantProfileForMerchant(id, 11, data);
  const patch = calls.find(call => call.kind === "update").set;
  expect(patch.email).toBeNull();
  expect(patch.updatedAt).toBeInstanceOf(Date);
  for (const key of ["merchantId", "id", "status", "createdAt"]) expect(patch).not.toHaveProperty(key);
});

test("history constrains event and current parent's ownership", async () => {
  const { storage, calls } = capture();
  await storage.getTransactionEventsByTenantForMerchant(id, 11, 50);
  const query = new PgDialect().sqlToQuery(calls[0].where);
  expect(query.params).toEqual([id, 11, 11]);
  expect(query.sql).toContain('"transaction_events"."merchant_id"');
  expect(query.sql).toContain('"tenant_profiles"."merchant_id"');
  expect(query.sql.toLowerCase()).toContain("exists");
});

test.each([undefined, null, 0, -1, 1.5, NaN, 2_147_483_648])("invalid tenant %s produces no query", async merchantId => {
  const { storage, calls } = capture();
  expect(await storage.getTenantProfileForMerchant(id, merchantId)).toBeUndefined();
  expect(await storage.updateTenantProfileForMerchant(id, merchantId, {})).toBeUndefined();
  expect(await storage.archiveTenantProfileForMerchant(id, merchantId)).toBeUndefined();
  expect(await storage.unarchiveTenantProfileForMerchant(id, merchantId)).toBeUndefined();
  expect(await storage.getTransactionEventsByTenantForMerchant(id, merchantId)).toEqual([]);
  await expect(storage.createTenantProfileForMerchant(merchantId, {})).rejects.toThrow();
  expect(calls).toEqual([]);
});

test("memory property remains explicitly DB-only", async () => {
  const storage = new MemStorage() as any;
  await expect(storage.createTenantProfileForMerchant(11, {})).rejects.toThrow(/database/);
  expect(await storage.getTenantProfileForMerchant(id, 11)).toBeUndefined();
  expect(await storage.updateTenantProfileForMerchant(id, 11, {})).toBeUndefined();
  expect(await storage.archiveTenantProfileForMerchant(id, 11)).toBeUndefined();
  expect(await storage.unarchiveTenantProfileForMerchant(id, 11)).toBeUndefined();
  expect(await storage.getTransactionEventsByTenantForMerchant(id, 11)).toEqual([]);
});
