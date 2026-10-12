import "./support/test-env";

// The real session wrapper and verifier run here; only the provider's network is stubbed.
// The session client never calls the provider while payments are disabled (R2-T1).
jest.mock("../config", () => {
  const actual = jest.requireActual("../config");
  return {
    ...actual,
    config: {
      ...actual.config,
      paymentMode: "uat",
      publicOrigin: "https://app.example.test",
      windcave: { ...actual.config.windcave, endpoint: actual.UAT_WINDCAVE_ENDPOINT, username: "SyntheticUser", apiKey: "synthetic-key" },
    },
  };
});

import request from "supertest";
import * as windcave from "../windcave";
import * as securityAuditLog from "../security-audit-log";
import { sseBroker } from "../sse-broker";
import * as push from "../push";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";

/**
 * Gap 11's cross-share half, closed by R2-T5 (2026-10-12): a numbered split sale keeps its
 * session bound and returns to "pending" after each share (finaliseHostedPayment), so the
 * payer re-posting the completion, or the provider's notification for that session,
 * queried the same approved session again and counted the NEXT share as paid: one
 * payment, every share. Verified against the next share's own reference, a repeat is now
 * a mismatch and counts nothing. R3 (C20) owns the single atomic finaliser that makes any
 * repeat a no-op outright (an unsplit sale is still re-settled; route-review gap 11).
 */

const S1 = "0000120000000000a1b2c3d4e5f60718";

function providerSession(reference: string) {
  return {
    id: S1,
    state: "complete",
    transactions: [{
      id: "0000000c00000001", authorised: true, type: "purchase", amount: "10.00", currency: "NZD",
      merchantReference: reference, sessionId: S1, username: "SyntheticUser",
    }],
  };
}

beforeEach(() => {
  resetTestStorage();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(sseBroker, "broadcast").mockImplementation(() => {});
  jest.spyOn(push, "sendPushToMerchant").mockResolvedValue({ eligibleSubscriptions: 0, attempted: 0, delivered: 0, failed: 0 });
});

async function settle() {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

async function splitSaleWithFirstSession() {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const sale = await storage.createTransaction({
    merchantId: owner.merchantId, itemName: "Split fixture", price: "30.00", status: "pending",
    paymentMethod: "qr_code", splitEnabled: true,
  } as any);
  expect((await request(app).post(`/api/transactions/${sale.id}/split`).send({ totalSplits: 3 })).status).toBe(200);
  const first = await storage.getNextPendingSplit(sale.id);
  jest.spyOn(windcave, "createWindcaveSession").mockResolvedValue({ success: true, sessionId: S1 } as any);
  expect((await request(app).post(`/api/transactions/${sale.id}/pay`).send({})).status).toBe(200);
  // The provider: S1 approved once, for the first share (its amount and reference).
  const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify(providerSession(`SPLIT_${first.id}_TXN_${sale.id}`)), { status: 200 }));
  const audit = jest.spyOn(securityAuditLog, "writeSecurityAuditEvent").mockImplementation(() => undefined);
  return { app, sale, fetchSpy, audit };
}

const shareStates = async (saleId: number) =>
  (await storage.getSplitPaymentsByTransaction(saleId)).map((split) => split.status);

it("the first completion counts the first share, verified", async () => {
  const { app, sale, audit } = await splitSaleWithFirstSession();

  const response = await request(app).post(`/api/transactions/${sale.id}/hosted-fields-complete`).send({ sessionId: S1 });

  expect(response.status).toBe(200);
  expect(await shareStates(sale.id)).toEqual(["completed", "pending", "pending"]);
  expect(await storage.getTransaction(sale.id)).toMatchObject({ completedSplits: 1, windcaveSessionState: "pending", windcaveSessionId: S1 });
  expect(audit).not.toHaveBeenCalled();
});

it.each([
  ["the payer re-posting the completion", (app: any, saleId: number) =>
    request(app).post(`/api/transactions/${saleId}/hosted-fields-complete`).send({ sessionId: S1 })],
  ["the provider's notification for that session", async (app: any) => {
    await request(app).get("/api/windcave/notification").query({ sessionid: S1 });
    await settle();
  }],
  ["the browser's return for that session", (app: any, saleId: number) =>
    request(app).get("/api/windcave/callback").query({ transactionId: saleId })],
])("after a share, %s does not count the next share with the same payment", async (_label, repeat) => {
  const { app, sale, fetchSpy, audit } = await splitSaleWithFirstSession();
  expect((await request(app).post(`/api/transactions/${sale.id}/hosted-fields-complete`).send({ sessionId: S1 })).status).toBe(200);

  await repeat(app, sale.id);

  expect(fetchSpy).toHaveBeenCalledTimes(2);
  expect(await shareStates(sale.id)).toEqual(["completed", "pending", "pending"]);
  expect(await storage.getTransaction(sale.id)).toMatchObject({ completedSplits: 1, windcaveSessionState: "pending" });
  expect(audit).toHaveBeenCalledWith("PROVIDER_OUTCOME_MISMATCH", { field: "reference" });
});
