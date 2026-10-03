import "./support/test-env";
import { MemStorage, DatabaseStorage } from "../storage";
import { PgDialect } from "drizzle-orm/pg-core";

const invalid = [undefined, null, 0, -1, 1.5, NaN, 2_147_483_648];
async function fixture() {
  const storage = new MemStorage() as any;
  const row = await storage.createTransaction({ merchantId: 11, itemName: "Synthetic", price: "10.00", status: "completed" });
  const refund = await storage.createRefund({ transactionId: row.id, merchantId: 11, refundAmount: "2.00" });
  return { storage, row, refund };
}
const data = { refundAmount: "2.00", refundReason: "Synthetic return", refundMethod: "original_payment_method" };

test("foreign writes and missing parents/refunds have no effect", async () => {
  const { storage, row, refund } = await fixture();
  const before = JSON.stringify([await storage.getTransaction(row.id), await storage.getRefund(refund.id)]);
  expect(await storage.reserveRefundAmountForMerchant(row.id, 22, 2)).toBeNull();
  expect(await storage.releaseRefundAmountForMerchant(row.id, 22, 2)).toBe(false);
  expect(await storage.createRefundForMerchant(row.id, 22, data)).toBeUndefined();
  expect(await storage.createRefundForMerchant(99999, 11, data)).toBeUndefined();
  expect(await storage.updateRefundStatusForMerchant(refund.id, 22, "completed", "synthetic-provider")).toBeUndefined();
  expect(await storage.updateRefundStatusForMerchant(99999, 11, "failed")).toBeUndefined();
  expect(JSON.stringify([await storage.getTransaction(row.id), await storage.getRefund(refund.id)])).toBe(before);
});

test("reservation retains balance cap and release restores the balance", async () => {
  const { storage, row } = await fixture();
  const first = await storage.reserveRefundAmountForMerchant(row.id, 11, 6);
  expect(first).toMatchObject({ totalRefunded: "6.00", refundableAmount: "4.00", status: "partially_refunded" });
  expect(await storage.reserveRefundAmountForMerchant(row.id, 11, 5)).toBeNull();
  expect(await storage.releaseRefundAmountForMerchant(row.id, 11, 6)).toBe(true);
  expect(await storage.getTransaction(row.id)).toMatchObject({ totalRefunded: "0.00", refundableAmount: "10.00", status: "completed" });
  expect(await storage.reserveRefundAmountForMerchant(row.id, 11, 10)).toMatchObject({ status: "refunded" });
  expect(await storage.reserveRefundAmountForMerchant(row.id, 11, 1)).toBeNull();
});

test("creation takes identity from scope and permits no injected fields", async () => {
  const { storage, row } = await fixture();
  const refund = await storage.createRefundForMerchant(row.id, 11, {
    ...data, merchantId: 22, transactionId: 99999, id: 777, status: "completed", windcaveRefundId: "injected", completedAt: new Date(0),
  });
  expect(refund).toMatchObject({ merchantId: 11, transactionId: row.id, status: "pending", windcaveRefundId: null, completedAt: null });
  expect(refund.id).not.toBe(777);
  expect(await storage.updateRefundStatusForMerchant(refund.id, 11, "completed", "synthetic-provider")).toMatchObject({ status: "completed", windcaveRefundId: "synthetic-provider" });
});

test("status requires ownership of both refund and current parent", async () => {
  const { storage, row, refund } = await fixture();
  storage.transactions.get(row.id).merchantId = 22;
  expect(await storage.updateRefundStatusForMerchant(refund.id, 11, "completed")).toBeUndefined();
  expect(await storage.updateRefundStatusForMerchant(refund.id, 22, "completed")).toBeUndefined();
  expect((await storage.getRefund(refund.id)).status).toBe("pending");
});

test.each(invalid)("invalid tenant %s has no effects or SQL", async (merchantId) => {
  const { storage, row, refund } = await fixture();
  for (const target of [storage, new DatabaseStorage(undefined) as any]) {
    expect(await target.reserveRefundAmountForMerchant(row.id, merchantId, 2)).toBeNull();
    expect(await target.releaseRefundAmountForMerchant(row.id, merchantId, 2)).toBe(false);
    expect(await target.createRefundForMerchant(row.id, merchantId, data)).toBeUndefined();
    expect(await target.updateRefundStatusForMerchant(refund.id, merchantId, "failed")).toBeUndefined();
  }
  expect(await storage.getTransaction(row.id)).toEqual(row);
  expect(await storage.getRefund(refund.id)).toEqual(refund);
});

function capture() {
  const calls: any[] = [];
  const parent = { id: 71, merchantId: 11, status: "completed" };
  const refund = { id: 81, merchantId: 11, transactionId: 71 };
  const db: any = {
    transaction: async (run: any) => run(db),
    select: () => ({ from: (table: any) => ({ where: (where: any) => {
      calls.push({ kind: "select", where });
      const result: any = Promise.resolve([new PgDialect().sqlToQuery(where).sql.includes('"refunds"') ? refund : parent]);
      result.limit = () => result;
      result.for = (lock: string) => { calls[calls.length - 1].lock = lock; return result; };
      return result;
    } }) }),
    update: () => ({ set: (set: any) => ({ where: (where: any) => {
      calls.push({ kind: "update", where, set });
      return { returning: async () => [{ ...parent, ...set }] };
    } }) }),
    insert: () => ({ values: (values: any) => { calls.push({ kind: "insert", values }); return { returning: async () => [{ ...refund, ...values }] }; } }),
  };
  return { storage: new DatabaseStorage(db) as any, calls };
}

test.each(["reserve", "release"])("SQL %s scopes the actual UPDATE", async (operation) => {
  const { storage, calls } = capture();
  if (operation === "reserve") await storage.reserveRefundAmountForMerchant(71, 11, 2);
  else await storage.releaseRefundAmountForMerchant(71, 11, 2);
  const query = new PgDialect().sqlToQuery(calls.find(c => c.kind === "update").where);
  expect(query.sql).toContain('"transactions"."merchant_id"');
  expect(query.params).toContain(11);
  expect(query.sql).toContain('"transactions"."id"');
  if (operation === "reserve") {
    expect(query.sql).toContain('"transactions"."status"');
    expect(query.sql).toContain(">=");
  }
});

test("SQL creation locks scoped parent and inserts projected identity", async () => {
  const { storage, calls } = capture();
  await storage.createRefundForMerchant(71, 11, { ...data, merchantId: 22, transactionId: 999 });
  const locked = calls.find(c => c.lock === "update");
  const query = new PgDialect().sqlToQuery(locked.where);
  expect(query.params).toEqual([71, 11]);
  expect(calls.find(c => c.kind === "insert").values).toEqual({ ...data, merchantId: 11, transactionId: 71, status: "pending" });
});

test("SQL status locks scoped parent and constrains refund identity/ownership", async () => {
  const { storage, calls } = capture();
  await storage.updateRefundStatusForMerchant(81, 11, "failed");
  const parent = calls.find(c => c.lock === "update");
  expect(new PgDialect().sqlToQuery(parent.where).params).toEqual([71, 11]);
  const query = new PgDialect().sqlToQuery(calls.find(c => c.kind === "update").where);
  expect(query.params).toEqual([81, 11, 71]);
  expect(query.sql).toContain('"refunds"."merchant_id"');
});
