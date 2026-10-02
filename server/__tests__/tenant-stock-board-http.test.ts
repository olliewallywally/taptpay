import "./support/test-env";

import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, signedIn, storage, storageSnapshot } from "./support/http-harness";
import { observeRefusalEffects } from "./support/refusal-effects";

beforeEach(() => resetTestStorage());

const FAMILIES = [
  { kind: "stock", segment: "stock-items", map: "stockItems", read: "getStockItemForMerchant", oldRead: "getStockItem", body: { name: "Changed", cost: "2.00" } },
  { kind: "board", segment: "tapt-stones", map: "taptStones", read: "getTaptStoneForMerchant", oldRead: "getTaptStone", body: { name: "Changed" } },
] as const;

async function seed(kind: "stock" | "board") {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const other = await createOwnerPrincipal();
  const row = kind === "stock"
    ? await storage.createStockItem({ merchantId: owner.merchantId, name: "Original", cost: "1.00" })
    : await storage.createTaptStone({ merchantId: owner.merchantId, name: "Original", stoneNumber: 1 });
  return { app, owner, other, row };
}

describe.each(FAMILIES)("R1-T7 S1 — $kind mutations", (family) => {
  test.each(["put", "delete"] as const)("%s refuses a foreign record under the caller's own path without effects", async (method) => {
    const { app, other, row } = await seed(family.kind);
    const before = storageSnapshot();
    const effects = observeRefusalEffects();
    try {
      const res = await request(app)[method](`/api/merchants/${other.merchantId}/${family.segment}/${row.id}`)
        .set(signedIn(other)).send(family.body);
      const missing = await request(app)[method](`/api/merchants/${other.merchantId}/${family.segment}/999999`)
        .set(signedIn(other)).send(family.body);
      expect(res.status).toBe(404);
      expect({ status: res.status, body: res.body }).toEqual({ status: missing.status, body: missing.body });
      expect(storageSnapshot()).toBe(before);
      effects.assertNone();
    } finally { effects.restore(); }
  });

  test.each(["put", "delete"] as const)("%s rechecks the tenant at the write if ownership changes after the read", async (method) => {
    const { app, owner, other, row } = await seed(family.kind);
    // The legacy reader fallback lets this regression demonstrate the pre-change race too.
    // The source/contract guard separately forbids reverting to that legacy mutation API.
    const held = storage as any;
    const reader = typeof held[family.read] === "function" ? family.read : family.oldRead;
    const original = held[reader].bind(storage);
    let afterMove: string | undefined;
    jest.spyOn(held, reader).mockImplementation(async (...args: any[]) => {
      const found = await original(...args);
      if (!found || found.id !== row.id) return found;
      const priorAnswer = { ...found };
      held[family.map].get(row.id).merchantId = other.merchantId;
      afterMove = storageSnapshot();
      return priorAnswer;
    });
    const effects = observeRefusalEffects();
    try {
      const res = await request(app)[method](`/api/merchants/${owner.merchantId}/${family.segment}/${row.id}`)
        .set(signedIn(owner)).send(family.body);
      expect(afterMove).toBeDefined();
      expect(res.status).toBe(404);
      expect(storageSnapshot()).toBe(afterMove);
      effects.assertNone();
    } finally { effects.restore(); }
  });
});
