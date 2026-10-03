import "./support/test-env";
import { DatabaseStorage, MemStorage } from "../storage";
import { invoicesRentRequests, tenantProfiles } from "@shared/schema";
import { PgDialect } from "drizzle-orm/pg-core";
const id = "44444444-4444-4444-8444-444444444444";
const parentId = "22222222-2222-4222-8222-222222222222";
function capture(status = "dispatched", found = true) {
  const calls: any[] = [];
  const invoice = { id, merchantId: 11, tenantProfileId: parentId, status };
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    select: () => ({ from: (table: any) => ({ where: (where: any) => {
      const call = { kind: "select", table, where, locked: false }; calls.push(call);
      const result: any = Promise.resolve(found ? [table === tenantProfiles ? { id: parentId, merchantId: 11, status: "archived" } : invoice] : []);
      result.limit = () => result; result.orderBy = () => result;
      result.for = () => { call.locked = true; return result; }; return result;
    } }) }),
    update: (table: any) => ({ set: (set: any) => ({ where: (where: any) => {
      calls.push({ kind: "update", table, where, set });
      const result: any = Promise.resolve([{ ...invoice, ...set }]); result.returning = () => result; return result;
    } }) }),
    insert: (table: any) => ({ values: (values: any) => { calls.push({ kind: "insert", table, values }); return Promise.resolve(); } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}
const query = (where: any) => new PgDialect().sqlToQuery(where);
test("invoice reads and lists constrain invoice and current parent ownership", async () => {
  const { storage, calls } = capture();
  await storage.getInvoiceRentRequestForMerchant(id, 11);
  await storage.getInvoiceRentRequestsByMerchant(11);
  expect(query(calls[0].where).params).toEqual([id, 11, 11]);
  expect(query(calls[1].where).params).toEqual([11, 11]);
  for (const call of calls) {
    expect(query(call.where).sql).toContain('"invoices_rent_requests"."merchant_id"');
    expect(query(call.where).sql).toContain('"tenant_profiles"."merchant_id"');
    expect(query(call.where).sql.toLowerCase()).toContain("exists");
  }
});
test.each(["voidInvoiceRentRequestForMerchant", "markInvoiceRentRequestPaidExternalForMerchant"])("%s locks parent then child and commits scoped state with history, including an archived parent", async name => {
  const { storage, calls } = capture();
  expect((await storage[name](id, 11, "Synthetic reference")).kind).toBe("ok");
  expect(calls.filter(call => call.locked).map(call => call.table)).toEqual([tenantProfiles, invoicesRentRequests]);
  const update = calls.find(call => call.kind === "update");
  expect(query(update.where).params).toEqual([id, 11, parentId]);
  expect(update.set).not.toHaveProperty("merchantId"); expect(update.set).not.toHaveProperty("tenantProfileId");
  const event = calls.find(call => call.kind === "insert").values;
  expect(event).toMatchObject({ merchantId: 11, tenantProfileId: parentId, invoiceId: id,
    eventType: name.startsWith("void") ? "Invoice_Voided" : "Payment_External" });
});
test.each(["voidInvoiceRentRequestForMerchant", "markInvoiceRentRequestPaidExternalForMerchant"])("%s refuses missing and paid rows with no mutation or history", async name => {
  for (const [status, found, kind] of [["dispatched", false, "not-found"], ["paid", true, "conflict"], ["paid_external", true, "conflict"]] as const) {
    const { storage, calls } = capture(status, found);
    expect((await storage[name](id, 11)).kind).toBe(kind);
    expect(calls.some(call => ["update", "insert"].includes(call.kind))).toBe(false);
  }
});
test("external payment cannot resurrect a voided invoice", async () => {
  const { storage, calls } = capture("voided");
  expect(await storage.markInvoiceRentRequestPaidExternalForMerchant(id, 11)).toEqual({ kind: "conflict", reason: "voided" });
  expect(calls.some(call => ["update", "insert"].includes(call.kind))).toBe(false);
});
test.each([undefined, null, 0, -1, 1.5, NaN, 2_147_483_648])("invalid merchant %s issues no query", async merchant => {
  const { storage, calls } = capture();
  expect(await storage.getInvoiceRentRequestForMerchant(id, merchant)).toBeUndefined();
  expect(await storage.getInvoiceRentRequestsByMerchant(merchant)).toEqual([]);
  expect(await storage.voidInvoiceRentRequestForMerchant(id, merchant)).toEqual({ kind: "not-found" });
  expect(await storage.markInvoiceRentRequestPaidExternalForMerchant(id, merchant)).toEqual({ kind: "not-found" });
  expect(calls).toEqual([]);
});
test("memory invoice management remains DB-only", async () => {
  const storage = new MemStorage() as any;
  expect(await storage.getInvoiceRentRequestForMerchant(id, 11)).toBeUndefined();
  expect(await storage.voidInvoiceRentRequestForMerchant(id, 11)).toEqual({ kind: "not-found" });
  expect(await storage.markInvoiceRentRequestPaidExternalForMerchant(id, 11)).toEqual({ kind: "not-found" });
});
