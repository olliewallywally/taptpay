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
    // logTransactionEvent is a MemStorage no-op, so an event write would be
    // invisible to any state comparison; it needs an explicit spy.
    const writes = ["updateTransactionSessionState", "updateTransactionStatus", "updateSplitPaymentStatus", "incrementTransactionCount", "logTransactionEvent"] as const;
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

  test("capability reporting never advertises a surface whose route refuses", async () => {
    const { app } = await createTestApp();
    // The old handler derived every field from the User-Agent, so a phone was
    // told NFC/Apple Pay/contactless were available while the routes refused.
    const response = await request(app).get("/api/nfc/capabilities")
      .set("user-agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    expect(response.status).toBe(200);
    for (const field of ["nfcSupported", "applePay", "googlePay", "samsungPay", "contactlessCard", "webNFC"]) {
      expect({ field, value: response.body[field] }).toEqual({ field, value: false });
    }
    expect(JSON.stringify(response.body)).not.toMatch(/Apple Pay|Google Pay|tap your card/i);
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

  test("a provider client that throws leaves the session reconcilable, not stranded in processing", async () => {
    const { app } = await createTestApp();
    const { transaction, spies } = await fixture();
    jest.spyOn(windcave, "isWindcaveConfigured").mockReturnValue(true);
    jest.mocked(windcave.queryWindcaveSession).mockRejectedValue(new Error("Unreadable provider response body"));

    const response = await request(app).get("/api/windcave/callback").query({ transactionId: transaction.id });

    expect(response.headers.location).toBe(`/payment/result/${transaction.id}?status=pending`);
    // 'processing' would be terminal: the notification handler refuses anything
    // that is not 'pending', so the session could never be resolved again.
    expect((await storage.getTransaction(transaction.id))?.windcaveSessionState).toBe("pending");
    for (const spy of spies.slice(1)) expect(spy).not.toHaveBeenCalled();
  });

  test("an approval carrying no processor transaction id is not recorded as settled", async () => {
    const { app } = await createTestApp();
    const { transaction, spies } = await fixture();
    jest.spyOn(windcave, "isWindcaveConfigured").mockReturnValue(true);
    jest.mocked(windcave.queryWindcaveSession).mockResolvedValue({ success: true, approved: true });

    const response = await request(app).get("/api/windcave/callback").query({ transactionId: transaction.id });

    expect(response.headers.location).toBe(`/payment/result/${transaction.id}?status=pending`);
    expect((await storage.getTransaction(transaction.id))?.windcaveSessionState).toBe("pending");
    for (const spy of spies.slice(1)) expect(spy).not.toHaveBeenCalled();
  });

  test("an outcome the provider already settled is still readable while the provider is disabled", async () => {
    const { app } = await createTestApp();
    const { transaction, spies } = await fixture();
    await storage.updateTransactionSessionState(transaction.id, "approved");
    spies.forEach((spy) => spy.mockClear());

    const response = await request(app).get("/api/windcave/callback").query({ transactionId: transaction.id });

    // Persisted provider truth, not a browser claim — a customer who genuinely
    // paid must not be parked on "pending" because the gate is off.
    expect(response.headers.location).toBe(`/receipt/${transaction.id}`);
    expectNoEffects(spies);
  });

  test("sim is rejected even when the provider is fully configured", async () => {
    const { app } = await createTestApp();
    const { transaction, spies } = await fixture();
    jest.spyOn(windcave, "isWindcaveConfigured").mockReturnValue(true);

    // Without this the sim assertions would pass merely because the disabled
    // gate short-circuits first, proving nothing about sim itself.
    const response = await request(app).get("/api/windcave/callback")
      .query({ transactionId: transaction.id, sessionid: "synthetic-persisted-session", sim: "1" });

    expect(response.status).toBe(400);
    expectNoEffects(spies);
  });

  test("credential storage creation discards caller supplied Windcave secrets", async () => {
    const merchant = await storage.createMerchantWithPassword({ name: "Synthetic", businessName: "Synthetic", email: "credential@harness.test", windcaveApiKey: "synthetic-rejected-secret" }, "synthetic-password-hash");
    expect(merchant.windcaveApiKey).toBeNull();
    expect((await storage.getMerchant(merchant.id))?.windcaveApiKey).toBeNull();
  });

  test("the general merchant update path cannot write a Windcave credential either", async () => {
    const merchant = await storage.createMerchantWithPassword(
      { name: "Synthetic", businessName: "Synthetic", email: "update@harness.test" }, "synthetic-password-hash");

    const updated = await storage.updateMerchant(merchant.id, {
      businessName: "Renamed", windcaveApiKey: "synthetic-rejected-secret",
    } as any);

    expect(updated?.businessName).toBe("Renamed");
    expect(updated?.windcaveApiKey).toBeNull();
    expect((await storage.getMerchant(merchant.id))?.windcaveApiKey).toBeNull();
  });
});
