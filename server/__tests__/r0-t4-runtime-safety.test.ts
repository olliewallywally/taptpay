import "./support/test-env";
import request from "supertest";
import * as database from "../database";
import * as push from "../push";
import { seedDatabase } from "../seed";
import { sseBroker } from "../sse-broker";
import {
  bearer, createAdminPrincipal, createMemberPrincipal, createOwnerPrincipal,
  createTestApp, resetTestStorage, storage,
} from "./support/http-harness";

function snapshot() {
  return JSON.stringify(storage, (_key, value) => value instanceof Map ? [...value] : value);
}

describe("R0-T4 runtime clearing and direct-seed safety", () => {
  beforeEach(() => resetTestStorage());

  test("clearing enforces the principal matrix without data or notification effects", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const other = await createOwnerPrincipal();
    const member = await createMemberPrincipal(owner.merchantId);
    const admin = createAdminPrincipal();
    const before = snapshot();
    const transport = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected transport"));
    const broadcast = jest.spyOn(sseBroker, "broadcast").mockImplementation(() => {});
    const notification = jest.spyOn(push, "sendPushToMerchant").mockResolvedValue({
      eligibleSubscriptions: 0, attempted: 0, delivered: 0, failed: 0,
    });
    const cases = [
      { principal: undefined, id: String(owner.merchantId), status: 401 },
      { principal: owner, id: "1abc", status: 400 },
      { principal: owner, id: "0", status: 400 },
      { principal: owner, id: "-1", status: 400 },
      { principal: owner, id: "1.5", status: 400 },
      { principal: owner, id: String(other.merchantId), status: 403 },
      { principal: member, id: String(owner.merchantId), status: 403 },
      { principal: admin, id: String(owner.merchantId), status: 403 },
      { principal: owner, id: String(owner.merchantId), status: 410 },
    ];
    for (let retry = 0; retry < 2; retry++) {
      await Promise.all(cases.map(async ({ principal, id, status }) => {
        const response = await request(app).post(`/api/merchants/${id}/clear-transactions`)
          .set(principal ? bearer(principal) : {});
        expect(response.status).toBe(status);
        if (status === 410) expect(response.body.code).toBe("TRANSACTION_CLEARING_RETIRED");
      }));
    }
    expect(snapshot()).toBe(before);
    expect(transport).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
  });

  test.each(["production", "staging"] as const)("direct seed in %s never obtains a database under either flag", async (appEnv) => {
    const getDb = jest.spyOn(database, "getDb");
    for (const seedDemoData of [false, true]) {
      await expect(seedDatabase({ appEnv, seedDemoData })).rejects.toThrow();
    }
    expect(getDb).not.toHaveBeenCalled();
  });

  test("local seed preserves an already-populated database", async () => {
    const insert = jest.fn();
    const limit = jest.fn().mockResolvedValue([{ id: 1 }]);
    jest.spyOn(database, "getDb").mockReturnValue({
      select: () => ({ from: () => ({ limit }) }), insert,
    } as any);
    await seedDatabase({ appEnv: "test", seedDemoData: true });
    expect(limit).toHaveBeenCalledWith(1);
    expect(insert).not.toHaveBeenCalled();
  });
});
