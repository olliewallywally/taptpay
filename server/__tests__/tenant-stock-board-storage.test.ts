import "./support/test-env";

import { PgDialect } from "drizzle-orm/pg-core";
import { DatabaseStorage, MemStorage } from "../storage";

describe("R1-T7 S1 — stock and board storage requires the business", () => {
  test("reads only records belonging to the requested business", async () => {
    const storage = new MemStorage();
    const item = await storage.createStockItem({ merchantId: 11, name: "Coffee", cost: "4.50" });
    const board = await storage.createTaptStone({ merchantId: 11, name: "Counter", stoneNumber: 1 });
    expect(await storage.getStockItemForMerchant(item.id, 11)).toEqual(item);
    expect(await storage.getTaptStoneForMerchant(board.id, 11)).toEqual(board);
    expect(await storage.getStockItemForMerchant(item.id, 22)).toBeUndefined();
    expect(await storage.getTaptStoneForMerchant(board.id, 22)).toBeUndefined();
    expect(await storage.getStockItemForMerchant(99999, 11)).toBeUndefined();
    expect(await storage.getTaptStoneForMerchant(99999, 11)).toBeUndefined();
  });

  test("every mutation refuses the other business and changes no record", async () => {
    const storage = new MemStorage();
    const item = await storage.createStockItem({ merchantId: 22, name: "Other stock", cost: "9.00" });
    const board = await storage.createTaptStone({ merchantId: 22, name: "Other board", stoneNumber: 1 });
    const before = JSON.stringify({ item, board });
    expect(await storage.updateStockItemForMerchant(item.id, 11, { name: "Stolen" })).toBeUndefined();
    expect(await storage.deleteStockItemForMerchant(item.id, 11)).toBe(false);
    expect(await storage.updateTaptStoneForMerchant(board.id, 11, { name: "Stolen" })).toBeUndefined();
    expect(await storage.updateTaptStoneUrlsForMerchant(board.id, 11, "changed-qr", "changed-payment")).toBeUndefined();
    expect(await storage.deleteTaptStoneForMerchant(board.id, 11)).toBe(false);
    expect(JSON.stringify({
      item: await storage.getStockItemForMerchant(item.id, 22),
      board: await storage.getTaptStoneForMerchant(board.id, 22),
    })).toBe(before);
  });

  test("stock changes cannot transfer ownership or change server-owned fields", async () => {
    const storage = new MemStorage();
    const item = await storage.createStockItem({ merchantId: 11, name: "Coffee", description: "Keep this", cost: "4.50", emoji: "x" });
    const changed = await storage.updateStockItemForMerchant(item.id, 11, {
      name: "Flat white", cost: "5.00", emoji: null,
      merchantId: 22, id: 9999, isActive: false, createdAt: new Date(0),
    } as any);
    expect(changed).toMatchObject({
      id: item.id, merchantId: 11, isActive: true, createdAt: item.createdAt,
      name: "Flat white", cost: "5.00", description: "Keep this", emoji: null,
    });
    expect(await storage.getStockItemForMerchant(item.id, 22)).toBeUndefined();
  });

  test("board changes cannot transfer ownership; URLs belong to the same business", async () => {
    const storage = new MemStorage();
    const board = await storage.createTaptStone({ merchantId: 11, name: "Counter", stoneNumber: 1 });
    expect(await storage.updateTaptStoneForMerchant(board.id, 11, {
      name: "Front", merchantId: 22, id: 9999, isActive: false, stoneNumber: 9,
    } as any)).toMatchObject({ id: board.id, merchantId: 11, isActive: true, stoneNumber: 1, name: "Front" });
    expect(await storage.updateTaptStoneUrlsForMerchant(board.id, 11, "/qr", "/pay"))
      .toMatchObject({ merchantId: 11, qrCodeUrl: "/qr", paymentUrl: "/pay" });
  });

  test("soft deletion is repeatable and retains management reads and board-number reuse", async () => {
    const storage = new MemStorage();
    const item = await storage.createStockItem({ merchantId: 11, name: "Coffee", cost: "4.50" });
    const board = await storage.createTaptStone({ merchantId: 11, name: "Counter", stoneNumber: 1 });
    for (let i = 0; i < 2; i++) {
      expect(await storage.deleteStockItemForMerchant(item.id, 11)).toBe(true);
      expect(await storage.deleteTaptStoneForMerchant(board.id, 11)).toBe(true);
    }
    expect(await storage.getStockItemForMerchant(item.id, 11)).toMatchObject({ isActive: false });
    expect(await storage.getTaptStoneForMerchant(board.id, 11)).toMatchObject({ isActive: false });
    expect(await storage.getStockItemsByMerchant(11)).toEqual([]);
    expect(await storage.getTaptStonesByMerchant(11)).toEqual([]);
    expect(await storage.createNextTaptStone(11)).toMatchObject({ stoneNumber: 1 });
  });

  test.each([undefined, null, 0, -1, NaN, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1])("invalid tenant %s cannot address an orphan or a business's record", async (tenant) => {
    const storage = new MemStorage();
    const orphan = await storage.createStockItem({ merchantId: null, name: "Orphan", cost: "1.00" });
    const board = await storage.createTaptStone({ merchantId: 11, name: "Counter", stoneNumber: 1 });
    const before = JSON.stringify({ orphan, board });
    expect(await storage.getStockItemForMerchant(orphan.id, tenant as any)).toBeUndefined();
    expect(await storage.getTaptStoneForMerchant(board.id, tenant as any)).toBeUndefined();
    expect(await storage.updateStockItemForMerchant(orphan.id, tenant as any, { name: "Changed" })).toBeUndefined();
    expect(await storage.deleteStockItemForMerchant(orphan.id, tenant as any)).toBe(false);
    expect(await storage.updateTaptStoneForMerchant(board.id, tenant as any, { name: "Changed" })).toBeUndefined();
    expect(await storage.updateTaptStoneUrlsForMerchant(board.id, tenant as any, "/qr", "/pay")).toBeUndefined();
    expect(await storage.deleteTaptStoneForMerchant(board.id, tenant as any)).toBe(false);
    expect(JSON.stringify({ orphan, board })).toBe(before);
  });
});

/** Capture the actual SQL expression passed to Drizzle, with no database connection. */
function queryCapture() {
  const captured: { where?: any; set?: any } = {};
  const where = (predicate: any) => {
    captured.where = predicate;
    return { limit: async () => [], returning: async () => [] };
  };
  const db = {
    select: () => ({ from: () => ({ where }) }),
    update: () => ({ set: (value: any) => { captured.set = value; return { where }; } }),
  };
  return { captured, storage: new DatabaseStorage(db as any) };
}

const SQL_CASES = [
  ["stock_items", "getStockItemForMerchant", []],
  ["stock_items", "updateStockItemForMerchant", [{ name: "Updated" }]],
  ["stock_items", "deleteStockItemForMerchant", []],
  ["tapt_stones", "getTaptStoneForMerchant", []],
  ["tapt_stones", "updateTaptStoneForMerchant", [{ name: "Updated" }]],
  ["tapt_stones", "updateTaptStoneUrlsForMerchant", ["/qr", "/pay"]],
  ["tapt_stones", "deleteTaptStoneForMerchant", []],
] as const;

describe("R1-T7 S1 — PostgreSQL predicates", () => {
  test.each(SQL_CASES)("%s %s uses id AND merchant in the query itself", async (table, method, args) => {
    const { storage, captured } = queryCapture();
    await (storage[method] as any)(71, 29, ...args);
    expect(captured.where).toBeDefined();
    const query = new PgDialect().sqlToQuery(captured.where);
    expect(query.sql).toContain(`"${table}"."id" = $1`);
    expect(query.sql).toContain(`"${table}"."merchant_id" = $2`);
    expect(query.sql).toContain(" and ");
    expect(query.params).toEqual([71, 29]);
  });

  test.each(SQL_CASES)("%s %s issues no query for an invalid tenant", async (_table, method, args) => {
    for (const invalid of [undefined, null, 0, -1, NaN, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1]) {
      const { storage, captured } = queryCapture();
      await (storage[method] as any)(71, invalid, ...args);
      expect(captured.where).toBeUndefined();
      expect(captured.set).toBeUndefined();
    }
  });

  test.each(["updateStockItemForMerchant", "updateTaptStoneForMerchant"] as const)("%s cannot persist ownership or identity from a patch", async (method) => {
    const { storage, captured } = queryCapture();
    await storage[method](71, 29, { name: "Updated", merchantId: 77, id: 99, isActive: false, createdAt: new Date(0) } as any);
    expect(captured.set).toEqual({ name: "Updated", updatedAt: expect.any(Date) });
  });
});
