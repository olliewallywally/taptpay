import "./support/test-env";
import { DatabaseStorage, MemStorage } from "../storage";
import { invoicesRentRequests, tenantProfiles, transactionEvents, uploadedFiles } from "@shared/schema";
import { PgDialect } from "drizzle-orm/pg-core";
const id = "44444444-4444-4444-8444-444444444444";
const parentId = "22222222-2222-4222-8222-222222222222";
const input = { amountCents: 5000, deliveryChannel: "email", dueAt: new Date("2026-10-10T00:00:00Z") };
function capture(live?: any, parentFound = true, attachmentFound = true) {
  const calls: any[] = [];
  const parent = { id: parentId, merchantId: 11, status: "archived" };
  const db: any = {
    transaction: async (run: any) => { calls.push({ kind: "transaction" }); return run(db); },
    select: () => {
      let table: any;
      const builder: any = { from: (value: any) => { table = value; return builder; },
        innerJoin: (join: any, where: any) => { calls.push({ kind: "join", table: join, where }); return builder; },
        where: (where: any) => {
          const call = { kind: "select", table, where, locked: false }; calls.push(call);
          const rows = table === tenantProfiles ? parentFound ? [parent] : []
            : table === uploadedFiles ? attachmentFound ? [{ id: 1 }] : [] : live ? [live] : [];
          const result: any = Promise.resolve(rows); result.limit = () => result; result.orderBy = () => result;
          result.for = () => { call.locked = true; return result; }; return result;
        } };
      return builder;
    },
    update: (table: any) => ({ set: (set: any) => ({ where: (where: any) => {
      calls.push({ kind: "update", table, set, where }); const result: any = Promise.resolve([{ ...live, ...set }]); result.returning = () => result; return result;
    } }) }),
    insert: (table: any) => ({ values: (values: any) => {
      calls.push({ kind: "insert", table, values }); const result: any = Promise.resolve([{ id, ...values }]); result.returning = () => result; return result;
    } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}
const query = (where: any) => new PgDialect().sqlToQuery(where);
test("creation locks the owned archived parent and commits projected invoice input and history together", async () => {
  const { storage, calls } = capture();
  const result = await storage.createOrReuseInvoiceRentRequestForMerchant(parentId, 11, {
    ...input, merchantId: 99, tenantProfileId: "foreign", id: "caller-id", token: "caller-token", status: "paid", splitPaidCount: 42,
  });
  expect(result).toMatchObject({ kind: "ok", reused: false });
  const parent = calls.find(call => call.table === tenantProfiles);
  expect(parent.locked).toBe(true); expect(query(parent.where).params).toEqual([parentId, 11]);
  const invoice = calls.find(call => call.kind === "insert" && call.table === invoicesRentRequests).values;
  expect(invoice).toMatchObject({ merchantId: 11, tenantProfileId: parentId, status: "pending_dispatch", ...input });
  expect(invoice).not.toHaveProperty("id"); expect(invoice).not.toHaveProperty("splitPaidCount");
  expect(invoice.token).not.toBe("caller-token"); expect(invoice.token).toMatch(/^[A-Za-z0-9_-]{27}$/);
  expect(calls.find(call => call.table === transactionEvents).values).toMatchObject({ merchantId: 11, tenantProfileId: parentId, invoiceId: id, eventType: "Invoice_Generated" });
});
test("rent reuse locks only scoped live children, changes only amount, and creates no invoice/history", async () => {
  const live = { id, merchantId: 11, tenantProfileId: parentId, status: "overdue", kind: "rent", amountCents: 4000 };
  const { storage, calls } = capture(live);
  expect(await storage.createOrReuseInvoiceRentRequestForMerchant(parentId, 11, input)).toMatchObject({ kind: "ok", reused: true, invoice: { amountCents: 5000, status: "overdue" } });
  const select = calls.find(call => call.table === invoicesRentRequests);
  expect(select.locked).toBe(true); expect(query(select.where).params).toEqual([parentId, 11, "pending_dispatch", "dispatched", "overdue", "dispatch_failed"]);
  const update = calls.find(call => call.kind === "update");
  expect(query(update.where).params).toEqual([id, 11, parentId]);
  expect(Object.keys(update.set).sort()).toEqual(["amountCents", "updatedAt"]);
  expect(calls.some(call => call.kind === "insert")).toBe(false);
});
test.each(["charge-request", "latest-charge"])("%s creates a separate invoice", async scenario => {
  const { storage, calls } = capture({ id, merchantId: 11, tenantProfileId: parentId, status: "dispatched", kind: scenario === "latest-charge" ? "charge" : "rent" });
  const result = await storage.createOrReuseInvoiceRentRequestForMerchant(parentId, 11, { ...input, kind: scenario === "charge-request" ? "charge" : "rent" });
  expect(result).toMatchObject({ kind: "ok", reused: false });
  expect(calls.some(call => call.kind === "update")).toBe(false);
});
test("missing/foreign parent changes nothing", async () => {
  const { storage, calls } = capture(undefined, false);
  expect(await storage.createOrReuseInvoiceRentRequestForMerchant(parentId, 11, input)).toEqual({ kind: "not-found" });
  expect(calls.some(call => ["insert", "update"].includes(call.kind))).toBe(false);
});
test("attachment ownership is locked and rechecked through insertion", async () => {
  const documentUrl = "/uploads/invoices/invoice-1700000000000-0123456789abcdef.pdf";
  const { storage, calls } = capture();
  expect((await storage.createOrReuseInvoiceRentRequestForMerchant(parentId, 11, { ...input, documentUrl })).kind).toBe("ok");
  const file = calls.find(call => call.table === uploadedFiles);
  expect(file.locked).toBe(true); expect(query(file.where).params).toEqual([documentUrl.slice("/uploads/".length), 11]);
  const missing = capture(undefined, true, false);
  expect(await missing.storage.createOrReuseInvoiceRentRequestForMerchant(parentId, 11, { ...input, documentUrl })).toEqual({ kind: "invalid-document" });
  expect(missing.calls.some(call => ["insert", "update"].includes(call.kind))).toBe(false);
});
test.each([undefined, null, 0, -1, 1.5, NaN, 2_147_483_648])("invalid merchant %s issues no query", async merchant => {
  const { storage, calls } = capture();
  expect(await storage.createOrReuseInvoiceRentRequestForMerchant(parentId, merchant, input)).toEqual({ kind: "not-found" });
  expect(await storage.getInvoiceRentRequestDeliveryForMerchant(id, merchant)).toBeUndefined();
  expect(await storage.recordInvoiceRentRequestDeliveryForMerchant(id, merchant, parentId, {})).toEqual({ kind: "not-found" });
  expect(calls).toEqual([]);
});
test("memory invoice creation/delivery remains DB-only", async () => {
  const storage = new MemStorage() as any;
  await expect(storage.createOrReuseInvoiceRentRequestForMerchant(parentId, 11, input)).rejects.toThrow("requires database");
  expect(await storage.getInvoiceRentRequestDeliveryForMerchant(id, 11)).toBeUndefined();
  expect(await storage.recordInvoiceRentRequestDeliveryForMerchant(id, 11, parentId, {})).toEqual({ kind: "not-found" });
});
