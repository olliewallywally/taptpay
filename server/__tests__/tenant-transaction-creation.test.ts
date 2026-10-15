import "./support/test-env";
import { MemStorage, DatabaseStorage } from "../storage";
import { PgDialect } from "drizzle-orm/pg-core";
const data = { merchantId: 22, itemName: "Synthetic", price: "10.00", status: "pending" };

test("scope controls sale identity and supports the no-board path", async () => {
  const storage = new MemStorage() as any;
  const row = await storage.createTransactionForMerchant(11, { ...data, id: 999, createdAt: new Date(0) });
  expect(row.merchantId).toBe(11);
  expect(row.id).not.toBe(999);
  expect(row.createdAt).not.toEqual(new Date(0));
});

test.each(["foreign", "inactive", "missing", "alias"])("%s board refuses creation without a sale", async (kind) => {
  const storage = new MemStorage() as any;
  const board = await storage.createNextTaptStone(kind === "foreign" || kind === "alias" ? 22 : 11);
  if (kind === "inactive") await storage.deleteTaptStoneForMerchant(board.id, 11);
  const input = kind === "alias" ? { ...data, selectedStoneId: board.id } : { ...data, taptStoneId: kind === "missing" ? 99999 : board.id };
  await expect(storage.createTransactionForMerchant(11, input)).rejects.toThrow();
  expect(await storage.getTransactionsByMerchant(11)).toEqual([]);
  expect(await storage.getTransactionsByMerchant(22)).toEqual([]);
});

test("valid board and cash completion retain defaults", async () => {
  const storage = new MemStorage() as any;
  const board = await storage.createNextTaptStone(11);
  const row = await storage.createTransactionForMerchant(11, { ...data, taptStoneId: board.id, status: "completed", paymentMethod: "cash" });
  expect(row).toMatchObject({ merchantId: 11, taptStoneId: board.id, status: "completed", paymentMethod: "cash", merchantNet: "10.00" });
  expect(row.completedAt).toBeInstanceOf(Date);
});

test.each([undefined, null, 0, -1, 1.5, NaN, 2_147_483_648])("invalid tenant %s never creates or queries", async merchantId => {
  for (const storage of [new MemStorage(), new DatabaseStorage(undefined)] as any[]) {
    await expect(storage.createTransactionForMerchant(merchantId, data)).rejects.toThrow();
  }
});

test("native outcome writes require tenant scope and preserve foreign rows", async () => {
  const storage = new MemStorage() as any;
  const row = await storage.createTransaction({ ...data, merchantId: 11 });
  expect(await storage.updateTransactionStatusForMerchant(row.id, 22, "completed", "synthetic")).toBeUndefined();
  expect(await storage.updateTransactionPaymentMethodForMerchant(row.id, 22, "tap_to_pay")).toBeUndefined();
  expect(await storage.getTransaction(row.id)).toEqual(row);
  expect(await storage.updateTransactionStatusForMerchant(row.id, 11, "completed", "synthetic")).toMatchObject({ merchantId: 11, status: "completed" });
  expect(await storage.updateTransactionPaymentMethodForMerchant(row.id, 11, "tap_to_pay")).toMatchObject({ paymentMethod: "tap_to_pay" });
});

test("SQL creation locks board tenant/activity and inserts inside that transaction", async () => {
  const calls: any[] = [];
  const db: any = {
    transaction: async (run: any) => { calls.push("transaction"); return run(db); },
    select: () => ({ from: () => ({ where: (where: any) => {
      calls.push(new PgDialect().sqlToQuery(where));
      const result: any = Promise.resolve([{ id: 71, merchantId: 11, isActive: true }]);
      result.limit = () => result;
      result.for = (lock: string) => { calls.push(lock); return result; };
      return result;
    } }) }),
    insert: () => ({ values: (values: any) => { calls.push(values); return { returning: async () => [{ ...values, id: 1 }] }; } }),
  };
  const row = await (new DatabaseStorage(db) as any).createTransactionForMerchant(11, { ...data, taptStoneId: 71 });
  expect(calls[0]).toBe("transaction");
  expect(calls[1].params).toEqual([71, 11, true]);
  expect(calls[2]).toBe("update");
  expect(row).toMatchObject({ merchantId: 11, taptStoneId: 71 });
});
