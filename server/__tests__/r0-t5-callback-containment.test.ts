import "./support/test-env";
import request from "supertest";
import * as windcave from "../windcave";
import * as push from "../push";
import { sseBroker } from "../sse-broker";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";

describe("R0-T5 callback containment", () => {
  beforeEach(() => {
    resetTestStorage();
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected provider transport"));
    jest.spyOn(windcave, "queryWindcaveSession").mockResolvedValue({ success: true, approved: true });
    jest.spyOn(sseBroker, "broadcast").mockImplementation(() => {});
    jest.spyOn(push, "sendPushToMerchant").mockResolvedValue({ eligibleSubscriptions: 0, attempted: 0, delivered: 0, failed: 0 });
  });

  async function fixture(withSession = true) {
    const owner = await createOwnerPrincipal();
    const transaction = await storage.createTransaction({ merchantId: owner.merchantId, itemName: "Containment fixture", price: "10.00", status: "pending", paymentMethod: "qr_code", splitEnabled: false } as any);
    if (withSession) await storage.updateTransactionWindcaveSession(transaction.id, "synthetic-persisted-session", "pending", "synthetic-x-id");
    const writes = ["updateTransactionSessionState", "updateTransactionStatus", "updateSplitPaymentStatus", "incrementTransactionCount"] as const;
    const spies = writes.map(name => jest.spyOn(storage, name));
    return { transaction, spies };
  }

  function expectNoEffects(spies: jest.SpyInstance[]) {
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(windcave.queryWindcaveSession).not.toHaveBeenCalled();
    expect(sseBroker.broadcast).not.toHaveBeenCalled();
    expect(push.sendPushToMerchant).not.toHaveBeenCalled();
  }

  test.each(["1", "0", "", "true"])("callback rejects sim=%s before cancellation or reconciliation", async sim => {
    const { app } = await createTestApp();
    const { transaction, spies } = await fixture();
    const responses = await Promise.all(Array.from({ length: 4 }, () => request(app).get("/api/windcave/callback").query({ transactionId: transaction.id, sessionid: "synthetic-persisted-session", result: "cancelled", sim })));
    expect(responses.map(response => response.status)).toEqual([400, 400, 400, 400]);
    expectNoEffects(spies);
  });

  test.each(["get", "post", "put", "patch", "delete", "head", "options"] as const)("disabled-provider notification %s never performs even temporary writes", async method => {
    const { app } = await createTestApp();
    const { spies } = await fixture();
    for (let retry = 0; retry < 2; retry++) {
      const responses = await Promise.all(Array.from({ length: 3 }, () => request(app)[method]("/api/windcave/notification").query({ sessionid: "synthetic-persisted-session" })));
      expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
      // The notification acknowledges before its async work; allow that work to finish.
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    expectNoEffects(spies);
  });

  test("callback never queries an unpersisted session supplied by the browser", async () => {
    const { app } = await createTestApp();
    const { transaction, spies } = await fixture(false);
    jest.spyOn(windcave, "isWindcaveConfigured").mockReturnValue(true);
    const response = await request(app).get("/api/windcave/callback").query({ transactionId: transaction.id, sessionid: "unpersisted-browser-session", result: "approved" });
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`/payment/result/${transaction.id}?status=pending`);
    expectNoEffects(spies);
  });

  test("disabled provider status is truthful", async () => {
    const { app } = await createTestApp();
    const response = await request(app).get("/api/windcave/status");
    expect(response.status).toBe(200);
    expect(response.body.configured).toBe(false);
    expect(response.body.mode).toBe("disabled");
    expect(response.body.message).not.toMatch(/simulation|ready/i);
  });

  test("browser cancellation does not mutate a pending payment while provider is disabled", async () => {
    const { app } = await createTestApp();
    const { transaction, spies } = await fixture();
    const response = await request(app).get("/api/windcave/callback").query({ transactionId: transaction.id, sessionid: "synthetic-persisted-session", result: "cancelled" });
    expect(response.headers.location).toBe(`/payment/result/${transaction.id}?status=pending`);
    expectNoEffects(spies);
  });

  test("provider query failure never finalizes payment as declined", async () => {
    const { app } = await createTestApp();
    const { transaction, spies } = await fixture();
    jest.spyOn(windcave, "isWindcaveConfigured").mockReturnValue(true);
    jest.mocked(windcave.queryWindcaveSession).mockResolvedValue({ success: false, error: "Synthetic transport failure" });
    const response = await request(app).get("/api/windcave/callback").query({ transactionId: transaction.id });
    expect(response.headers.location).toBe(`/payment/result/${transaction.id}?status=pending`);
    expect(spies[1]).not.toHaveBeenCalled();
    expect(spies[2]).not.toHaveBeenCalled();
    expect(spies[3]).not.toHaveBeenCalled();
    expect((await storage.getTransaction(transaction.id))?.windcaveSessionState).toBe("pending");
    expect(sseBroker.broadcast).not.toHaveBeenCalled();
    expect(push.sendPushToMerchant).not.toHaveBeenCalled();
  });

  test("credential storage creation discards caller supplied Windcave secrets", async () => {
    const merchant = await storage.createMerchantWithPassword({ name: "Synthetic", businessName: "Synthetic", email: "credential@harness.test", windcaveApiKey: "synthetic-rejected-secret" }, "synthetic-password-hash");
    expect(merchant.windcaveApiKey).toBeNull();
    expect((await storage.getMerchant(merchant.id))?.windcaveApiKey).toBeNull();
  });
});
