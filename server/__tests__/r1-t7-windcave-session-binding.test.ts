import "./support/test-env";
import request from "supertest";
import * as windcave from "../windcave";
import { sseBroker } from "../sse-broker";
import * as push from "../push";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";

// R1-T7 continuation: the R1-T7 cross-tenant audit found that
// POST /api/transactions/:id/hosted-fields-complete and
// POST /api/transactions/:id/googlepay-complete only compare the
// client-supplied sessionId against transaction.windcaveSessionId when that
// field is already truthy — a transaction that has never had /pay called on
// it (windcaveSessionId still null, its state from creation) skips the check
// entirely, so ANY client-supplied sessionId is accepted and queried against
// Windcave. A previously-approved session obtained elsewhere on the shared
// platform Windcave account can then finalise an unrelated victim
// transaction for free.
describe("R1-T7 continuation — Windcave session binding on the legacy transaction payment routes", () => {
  beforeEach(() => {
    resetTestStorage();
    jest.spyOn(windcave, "isWindcaveConfigured").mockReturnValue(true);
    jest.spyOn(windcave, "queryWindcaveSession").mockResolvedValue({ success: true, approved: true, windcaveTransactionId: "wcx_foreign" });
    jest.spyOn(sseBroker, "broadcast").mockImplementation(() => {});
    jest.spyOn(push, "sendPushToMerchant").mockResolvedValue({ eligibleSubscriptions: 0, attempted: 0, delivered: 0, failed: 0 });
  });

  async function freshTransaction() {
    const owner = await createOwnerPrincipal();
    const transaction = await storage.createTransaction({
      merchantId: owner.merchantId,
      itemName: "Session-binding fixture",
      price: "10.00",
      status: "pending",
      paymentMethod: "qr_code",
      splitEnabled: false,
    } as any);
    return { owner, transaction };
  }

  test("hosted-fields-complete rejects a foreign session on a transaction that never bound one", async () => {
    const { app } = await createTestApp();
    const { transaction } = await freshTransaction();
    expect(transaction.windcaveSessionId).toBeNull();

    const response = await request(app)
      .post(`/api/transactions/${transaction.id}/hosted-fields-complete`)
      .send({ sessionId: "attacker-foreign-session" });

    expect(response.status).toBe(403);
    expect(windcave.queryWindcaveSession).not.toHaveBeenCalled();
    const stored = await storage.getTransaction(transaction.id);
    expect(stored?.status).toBe("pending");
  });

  test("googlepay-complete rejects a foreign session on a transaction that never bound one", async () => {
    const { app } = await createTestApp();
    const { transaction } = await freshTransaction();
    expect(transaction.windcaveSessionId).toBeNull();

    const response = await request(app)
      .post(`/api/transactions/${transaction.id}/googlepay-complete`)
      .send({ sessionId: "attacker-foreign-session" });

    expect(response.status).toBe(403);
    expect(windcave.queryWindcaveSession).not.toHaveBeenCalled();
    const stored = await storage.getTransaction(transaction.id);
    expect(stored?.status).toBe("pending");
  });

  test("the legitimate flow is unaffected: a session bound by /pay is accepted by hosted-fields-complete", async () => {
    const { app } = await createTestApp();
    const { transaction } = await freshTransaction();
    await storage.updateTransactionWindcaveSession(transaction.id, "legit-session", "pending", "legit-x-id");

    const response = await request(app)
      .post(`/api/transactions/${transaction.id}/hosted-fields-complete`)
      .send({ sessionId: "legit-session" });

    expect(response.status).toBe(200);
    expect(response.body.approved).toBe(true);
    const stored = await storage.getTransaction(transaction.id);
    expect(stored?.status).toBe("completed");
  });

  test("the legitimate flow is unaffected: a session bound by /pay is accepted by googlepay-complete", async () => {
    const { app } = await createTestApp();
    const { transaction } = await freshTransaction();
    await storage.updateTransactionWindcaveSession(transaction.id, "legit-session", "pending", "legit-x-id");

    const response = await request(app)
      .post(`/api/transactions/${transaction.id}/googlepay-complete`)
      .send({ sessionId: "legit-session" });

    expect(response.status).toBe(200);
    expect(response.body.approved).toBe(true);
    const stored = await storage.getTransaction(transaction.id);
    expect(stored?.status).toBe("completed");
  });
});
