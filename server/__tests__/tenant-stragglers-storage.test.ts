import "./support/test-env";

import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { DatabaseStorage, MemStorage } from "../storage";

const INVALID_TENANTS = [undefined, null, 0, -1, NaN, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1];
const TENANT = "22222222-2222-4222-8222-222222222222";
const WEB = "https://fcm.googleapis.com/fcm/send/stragglers";
const device = (merchantId: number, endpoint = WEB) => ({ merchantId, userId: null, endpoint, p256dh: "key", auth: "auth" });

/** Every statement DatabaseStorage issues, in order, with the table it names; no database connection. */
function capture(found = true) {
  const calls: any[] = [];
  const answer = (rows: any[]) => {
    const result: any = Promise.resolve(rows);
    result.limit = () => result; result.orderBy = () => result; result.returning = () => result; result.for = () => result;
    return result;
  };
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    select: () => ({ from: (table: any) => ({ where: (where: any) => {
      calls.push({ kind: "select", table: getTableName(table), where });
      return answer(found ? [{ id: TENANT, merchantId: 29 }] : []);
    } }) }),
    update: (table: any) => ({ set: (set: any) => ({ where: (where: any) => {
      calls.push({ kind: "update", table: getTableName(table), where, set });
      return answer(found ? [{ id: TENANT, merchantId: 29, firstName: "Tess", lastName: "Tenant", propertyAddress: "1 Test Road", ...set }] : []);
    } }) }),
    insert: (table: any) => ({ values: (values: any) => {
      calls.push({ kind: "insert", table: getTableName(table), values });
      return answer([{ id: TENANT, ...values }]);
    } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}
const sqlOf = (where: any) => new PgDialect().sqlToQuery(where);

describe("R1-T7 S5b — stock create names its business", () => {
  const INPUT = { name: "Coffee", cost: "4.50", description: "Hot", emoji: "x", variations: null };
  const STRAYS = { merchantId: 22, id: 9999, isActive: false, createdAt: new Date(0), updatedAt: new Date(0) };

  test("the item belongs to the business named, whatever the data says", async () => {
    const storage = new MemStorage() as any;
    const item = await storage.createStockItemForMerchant(11, { ...STRAYS, ...INPUT });
    expect(item).toMatchObject({ ...INPUT, merchantId: 11, isActive: true });
    expect(item.id).not.toBe(9999);
    expect(item.createdAt.getTime()).toBeGreaterThan(0);
    expect(await storage.getStockItemForMerchant(item.id, 11)).toEqual(item);
    expect(await storage.getStockItemForMerchant(item.id, 22)).toBeUndefined();
    expect(await storage.getStockItemsByMerchant(22)).toEqual([]);
  });

  test("the database insert carries the five stock fields and the business named, nothing else", async () => {
    const { storage, calls } = capture();
    await storage.createStockItemForMerchant(29, { ...STRAYS, ...INPUT });
    expect(calls).toEqual([{ kind: "insert", table: "stock_items", values: { ...INPUT, merchantId: 29 } }]);
  });

  test.each(INVALID_TENANTS)("invalid business %s makes nothing", async (tenant) => {
    const memory = new MemStorage() as any;
    await expect(memory.createStockItemForMerchant(tenant, INPUT)).rejects.toThrow();
    expect(memory.stockItems.size).toBe(0);
    const { storage, calls } = capture();
    await expect(storage.createStockItemForMerchant(tenant, INPUT)).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  test("the create that took its business inside the data is retired", () => {
    expect((MemStorage.prototype as any).createStockItem).toBeUndefined();
    expect((DatabaseStorage.prototype as any).createStockItem).toBeUndefined();
  });
});

describe("R1-T7 S5b — a login is read through its business", () => {
  test("the database read holds the login to the business in the query itself", async () => {
    const { storage, calls } = capture();
    await storage.getTeamMemberForMerchant(71, 29);
    expect(calls.map((call) => [call.kind, call.table])).toEqual([["select", "users"]]);
    const query = sqlOf(calls[0].where);
    expect(query.sql).toContain('"users"."id" = $1');
    expect(query.sql).toContain('"users"."merchant_id" = $2');
    expect(query.sql).toContain(" and ");
    expect(query.params).toEqual([71, 29]);
  });

  test.each(INVALID_TENANTS)("invalid business %s issues no query", async (tenant) => {
    const { storage, calls } = capture();
    expect(await storage.getTeamMemberForMerchant(71, tenant)).toBeUndefined();
    expect(calls).toEqual([]);
    expect(await (new MemStorage() as any).getTeamMemberForMerchant(71, tenant)).toBeUndefined();
  });
});

describe("R1-T7 S5b — a device is stopped by its business and its address together", () => {
  test("only the business's own active device is stopped", async () => {
    const storage = new MemStorage() as any;
    await storage.createPushSubscription(device(11));
    await storage.createPushSubscription(device(11, `${WEB}-second`));
    expect(await storage.deactivatePushSubscriptionForMerchant(22, WEB)).toBe(false);
    expect((await storage.getPushSubscriptionsByMerchant(11)).map((sub: any) => sub.endpoint).sort()).toEqual([WEB, `${WEB}-second`]);
    expect(await storage.deactivatePushSubscriptionForMerchant(11, WEB)).toBe(true);
    expect((await storage.getPushSubscriptionsByMerchant(11)).map((sub: any) => sub.endpoint)).toEqual([`${WEB}-second`]);
    // Already off, or an address nobody registered: nothing was stopped.
    expect(await storage.deactivatePushSubscriptionForMerchant(11, WEB)).toBe(false);
    expect(await storage.deactivatePushSubscriptionForMerchant(11, `${WEB}-unknown`)).toBe(false);
  });

  test("a device another business has since registered is left on", async () => {
    const storage = new MemStorage() as any;
    await storage.createPushSubscription(device(11));
    await storage.createPushSubscription(device(22));
    expect(await storage.deactivatePushSubscriptionForMerchant(11, WEB)).toBe(false);
    expect((await storage.getPushSubscriptionsByMerchant(22)).map((sub: any) => sub.endpoint)).toEqual([WEB]);
  });

  test("the database statement names the business, the address and the active state", async () => {
    const { storage, calls } = capture();
    expect(await storage.deactivatePushSubscriptionForMerchant(29, WEB)).toBe(true);
    expect(calls.map((call) => [call.kind, call.table])).toEqual([["update", "push_subscriptions"]]);
    expect(calls[0].set).toEqual({ isActive: false });
    const query = sqlOf(calls[0].where);
    expect(query.sql).toContain('"push_subscriptions"."merchant_id" = $1');
    expect(query.sql).toContain('"push_subscriptions"."endpoint" = $2');
    expect(query.sql).toContain('"push_subscriptions"."is_active" = $3');
    expect(query.params).toEqual([29, WEB, true]);
    expect(await capture(false).storage.deactivatePushSubscriptionForMerchant(29, WEB)).toBe(false);
  });

  test.each(INVALID_TENANTS)("invalid business %s stops nothing and issues no statement", async (tenant) => {
    const memory = new MemStorage() as any;
    await memory.createPushSubscription(device(11));
    expect(await memory.deactivatePushSubscriptionForMerchant(tenant, WEB)).toBe(false);
    expect(await memory.getPushSubscriptionsByMerchant(11)).toHaveLength(1);
    const { storage, calls } = capture();
    expect(await storage.deactivatePushSubscriptionForMerchant(tenant, WEB)).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("R1-T7 S5b — a property tenant's write commits its history with it", () => {
  const FIELDS = { firstName: "Nia", lastName: "Newcomer", propertyAddress: "2 Test Road", email: "nia@example.test" };

  test("create inserts the tenant and its Tenant_Created line in one transaction", async () => {
    const { storage, calls } = capture();
    const tenant = await storage.createTenantProfileForMerchant(29, { ...FIELDS, merchantId: 22, id: "injected", status: "archived" });
    expect(tenant).toMatchObject({ id: TENANT, merchantId: 29, firstName: "Nia" });
    expect(calls.map((call) => [call.kind, call.table])).toEqual([["transaction", undefined], ["insert", "tenant_profiles"], ["insert", "transaction_events"]]);
    expect(calls[1].values).toEqual({ ...FIELDS, merchantId: 29 });
    expect(calls[2].values).toEqual({
      merchantId: 29, tenantProfileId: TENANT, eventType: "Tenant_Created",
      payload: { firstName: "Nia", lastName: "Newcomer", propertyAddress: "2 Test Road" },
    });
  });

  test.each([
    ["archiveTenantProfileForMerchant", "Tenant_Archived"],
    ["unarchiveTenantProfileForMerchant", "Tenant_Restored"],
  ])("%s writes %s in the same transaction, for the business's own tenant only", async (method, eventType) => {
    const { storage, calls } = capture();
    expect(await storage[method](TENANT, 29)).toMatchObject({ id: TENANT, merchantId: 29 });
    expect(calls[0]).toEqual({ kind: "transaction" });
    const first = calls[1];
    expect([first.kind, first.table]).toEqual(["update", "tenant_profiles"]);
    expect(sqlOf(first.where).params).toEqual([TENANT, 29]);
    const inserts = calls.filter((call) => call.kind === "insert");
    expect(inserts).toEqual([{ kind: "insert", table: "transaction_events", values: { merchantId: 29, tenantProfileId: TENANT, eventType, payload: {} } }]);
    // The history line is the transaction's last statement: after the tenant and any automation it ends.
    expect(calls[calls.length - 1]).toBe(inserts[0]);

    const missing = capture(false);
    expect(await missing.storage[method](TENANT, 29)).toBeUndefined();
    expect(missing.calls.filter((call) => call.kind === "insert")).toEqual([]);
  });
});
