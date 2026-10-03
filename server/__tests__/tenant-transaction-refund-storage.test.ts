import "./support/test-env";

import { PgDialect } from "drizzle-orm/pg-core";
import { DatabaseStorage, MemStorage } from "../storage";

const invalidTenants = [undefined, null, 0, -1, NaN, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1];
const sale = (storage: MemStorage, merchantId: number | null, status = "pending") =>
  storage.createTransaction({ merchantId, itemName: "Synthetic sale", price: "10.00", status } as any);

describe("R1-T7 S2a — transaction/refund storage", () => {
  test("transaction reads require ownership and cannot read orphans", async () => {
    const storage = new MemStorage();
    const own = await sale(storage, 11);
    const orphan = await sale(storage, null);
    expect(await storage.getTransactionForMerchant(own.id, 11)).toEqual(own);
    expect(await storage.getTransactionForMerchant(own.id, 22)).toBeUndefined();
    expect(await storage.getTransactionForMerchant(orphan.id, 11)).toBeUndefined();
    expect(await storage.getTransactionForMerchant(99999, 11)).toBeUndefined();
  });

  test("refund reads check the refund and the current parent ownership", async () => {
    const storage = new MemStorage();
    const own = await sale(storage, 11, "completed");
    const other = await sale(storage, 22, "completed");
    const refund = await storage.createRefund({ transactionId: own.id, merchantId: 11, refundAmount: "1.00" });
    await storage.createRefund({ transactionId: own.id, merchantId: 22, refundAmount: "2.00" });
    await storage.createRefund({ transactionId: other.id, merchantId: 11, refundAmount: "3.00" });
    expect(await storage.getRefundsForTransactionForMerchant(own.id, 11)).toEqual([refund]);
    expect(await storage.getRefundsForTransactionForMerchant(own.id, 22)).toEqual([]);
    expect(await storage.getRefundsForTransactionForMerchant(other.id, 11)).toEqual([]);
    (storage as any).transactions.get(own.id).merchantId = 22;
    expect(await storage.getRefundsForTransactionForMerchant(own.id, 11)).toEqual([]);
  });

  test.each(["pending", "processing"])("cancels %s while preserving every other field", async (status) => {
    const storage = new MemStorage();
    const row = await sale(storage, 11, status);
    const result = await storage.cancelTransactionForMerchant(row.id, 11);
    expect(result).toEqual({ kind: "cancelled", transaction: { ...row, status: "cancelled" } });
    expect(await storage.getTransaction(row.id)).toEqual({ ...row, status: "cancelled" });
    expect(await storage.cancelTransactionForMerchant(row.id, 11)).toEqual({ kind: "conflict", status: "cancelled" });
  });

  test.each(["completed", "failed", "cancelled", "refunded", "partially_refunded"])("refuses %s unchanged", async (status) => {
    const storage = new MemStorage();
    const row = await sale(storage, 11, status);
    expect(await storage.cancelTransactionForMerchant(row.id, 11)).toEqual({ kind: "conflict", status });
    expect(await storage.getTransaction(row.id)).toEqual(row);
  });

  test("foreign and missing cancellations are indistinguishable and change nothing", async () => {
    const storage = new MemStorage();
    const row = await sale(storage, 22);
    expect(await storage.cancelTransactionForMerchant(row.id, 11)).toEqual({ kind: "not-found" });
    expect(await storage.cancelTransactionForMerchant(99999, 11)).toEqual({ kind: "not-found" });
    expect(await storage.getTransaction(row.id)).toEqual(row);
  });

  test.each(invalidTenants)("invalid tenant %s cannot read or cancel", async (merchantId) => {
    const storage = new MemStorage();
    const row = await sale(storage, null);
    const refund = await storage.createRefund({ transactionId: row.id, merchantId: null, refundAmount: "1.00" });
    expect(await storage.getTransactionForMerchant(row.id, merchantId as any)).toBeUndefined();
    expect(await storage.getRefundsForTransactionForMerchant(row.id, merchantId as any)).toEqual([]);
    expect(await storage.cancelTransactionForMerchant(row.id, merchantId as any)).toEqual({ kind: "not-found" });
    expect(await storage.getTransaction(row.id)).toEqual(row);
    expect(await storage.getRefund(refund.id)).toEqual(refund);
  });
});

function queryCapture(status = "pending") {
  const calls: Array<{ kind: string; where: any; set?: any; locked?: string }> = [];
  const row = { id: 71, merchantId: 29, status };
  const db: any = {
    select: () => ({ from: () => ({ where: (predicate: any) => {
      const call = { kind: "select", where: predicate, locked: undefined as string | undefined };
      calls.push(call);
      const chain: any = Promise.resolve([row]);
      chain.limit = () => chain;
      chain.for = (lock: string) => { call.locked = lock; return chain; };
      return chain;
    } }) }),
    update: () => ({ set: (set: any) => ({ where: (predicate: any) => {
      calls.push({ kind: "update", where: predicate, set });
      return { returning: async () => [{ ...row, ...set }] };
    } }) }),
  };
  db.transaction = jest.fn(async (run: any) => run(db));
  return { storage: new DatabaseStorage(db), calls, db };
}

describe("R1-T7 S2a — SQL boundaries", () => {
  test("transaction lookup puts id and merchant in the SQL predicate", async () => {
    const { storage, calls } = queryCapture();
    await storage.getTransactionForMerchant(71, 29);
    const query = new PgDialect().sqlToQuery(calls[0].where);
    expect(query.sql).toContain('"transactions"."id" = $1');
    expect(query.sql).toContain('"transactions"."merchant_id" = $2');
    expect(query.params).toEqual([71, 29]);
  });

  test("refund lookup constrains both the row and its parent in one query", async () => {
    const { storage, calls } = queryCapture();
    await storage.getRefundsForTransactionForMerchant(71, 29);
    expect(calls).toHaveLength(1);
    const query = new PgDialect().sqlToQuery(calls[0].where);
    expect(query.sql).toContain('"refunds"."transaction_id" = $1');
    expect(query.sql).toContain('"refunds"."merchant_id" = $2');
    expect(query.sql.toLowerCase()).toContain("exists");
    expect(query.sql).toContain('"transactions"."id" = "refunds"."transaction_id"');
    expect(query.sql).toContain('"transactions"."merchant_id" = $3');
    expect(query.params).toEqual([71, 29, 29]);
  });

  test("cancellation locks the scoped parent and also scopes the write and state", async () => {
    const { storage, calls, db } = queryCapture();
    expect(await storage.cancelTransactionForMerchant(71, 29)).toMatchObject({ kind: "cancelled" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(calls[0].locked).toBe("update");
    for (const call of calls) {
      const query = new PgDialect().sqlToQuery(call.where);
      expect(query.sql).toContain('"transactions"."id" = $1');
      expect(query.sql).toContain('"transactions"."merchant_id" = $2');
      expect(query.params.slice(0, 2)).toEqual([71, 29]);
    }
    expect(new PgDialect().sqlToQuery(calls[1].where).params).toEqual([71, 29, "pending", "processing"]);
    expect(calls[1].set).toEqual({ status: "cancelled" });
  });

  test("a completed locked row is never updated", async () => {
    const { storage, calls } = queryCapture("completed");
    expect(await storage.cancelTransactionForMerchant(71, 29)).toEqual({ kind: "conflict", status: "completed" });
    expect(calls.map((call) => call.kind)).toEqual(["select"]);
  });

  test.each(invalidTenants)("invalid tenant %s issues no SQL", async (merchantId) => {
    const { storage, calls, db } = queryCapture();
    expect(await storage.getTransactionForMerchant(71, merchantId as any)).toBeUndefined();
    expect(await storage.getRefundsForTransactionForMerchant(71, merchantId as any)).toEqual([]);
    expect(await storage.cancelTransactionForMerchant(71, merchantId as any)).toEqual({ kind: "not-found" });
    expect(calls).toEqual([]);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
