import "./support/test-env";

// Sales with their own payment links are off (503) unless per-payment links are on.
process.env.FEATURE_NEW_RETAIL_PAYMENTS = "true";
process.env.ENV_VALIDATION_MODE = "enforce";

jest.mock("../windcave", () => {
  const actual = jest.requireActual("../windcave");
  let sessions = 0;
  return {
    ...actual,
    isWindcaveConfigured: () => true,
    createWindcaveSession: jest.fn(async () => {
      sessions += 1;
      return { success: true, sessionId: `retail-session-${sessions}`, hppUrl: `https://uat.windcave.com/hpp/retail-${sessions}` };
    }),
    queryWindcaveSession: jest.fn(async (sessionId: string) => ({
      success: true, approved: true, windcaveTransactionId: `provider-${sessionId}`,
    })),
  };
});

import crypto from "crypto";
import request from "supertest";
import * as windcave from "../windcave";
import { createOwnerPrincipal, createTestApp, mintPaymentCredential, resetTestStorage, storage } from "./support/http-harness";

/**
 * R2-T5 (plan v2.2 §9.5) on the retail payment-attempt engine: the provider's outcome is
 * asked for with the attempt's expected values (recorded before its session opened,
 * R2-T4), and only the verified answer decides. The browser's `result` on its return
 * used to turn a provider decline into "cancelled"; it decides nothing now.
 */

jest.setTimeout(30_000);
const query = windcave.queryWindcaveSession as jest.Mock;

beforeEach(() => resetTestStorage());

async function openedAttempt() {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const link = mintPaymentCredential();
  const sale = await storage.createTransaction({
    merchantId: owner.merchantId, itemName: "Flat white", price: "5.50", status: "pending", paymentMethod: "qr_code",
    splitEnabled: false, paymentTokenHash: link.tokenHash,
  } as any);
  const opened = await request(app).post(`/api/pay/t/${link.rawToken}/session`).send({ idempotencyKey: crypto.randomUUID() });
  expect(opened.status).toBe(200);
  return { app, sale, returnState: opened.body.returnState as string, sessionId: opened.body.sessionId as string };
}

const outcomeOf = async (app: any, returnState: string) =>
  (await request(app).get(`/api/pay/return/${returnState}`)).body.outcome;

it("the return asks with the attempt's recorded expected values", async () => {
  const { app, sale, returnState, sessionId } = await openedAttempt();

  await request(app).get(`/api/pay/return/${returnState}`).query({ source: "hpp" });

  expect(query).toHaveBeenCalledWith(sessionId, {
    sessionId,
    amountCents: 550,
    currency: "NZD",
    merchantReference: expect.stringMatching(/^TAPT_/),
    providerEnvironment: windcave.currentProviderEnvironment(),
  });
  expect((await storage.getTransaction(sale.id))?.status).toBe("completed");
});

it("a provider decline stays a decline whatever the browser's result says (it used to read 'cancelled')", async () => {
  const { app, returnState } = await openedAttempt();
  query.mockResolvedValueOnce({ success: true, approved: false });

  await request(app).get(`/api/pay/return/${returnState}`).query({ source: "hpp", result: "cancelled" });

  expect(await outcomeOf(app, returnState)).toBe("declined");
});

it("an unverified outcome settles nothing, whatever the browser's result says", async () => {
  const { app, sale, returnState } = await openedAttempt();
  const before = await storage.getTransaction(sale.id);
  query.mockResolvedValueOnce({ success: false, error: "integrity_mismatch:amount" });

  await request(app).get(`/api/pay/return/${returnState}`).query({ source: "hpp", result: "approved" });

  expect(await outcomeOf(app, returnState)).toBe("pending");
  expect(await storage.getTransaction(sale.id)).toMatchObject({ status: before?.status, windcaveTransactionId: before?.windcaveTransactionId ?? null });
});

// R2-T6 (plan §9.4): each provider query leaves its sanitized outcome on the attempt.
describe("the attempt's last reconciliation", () => {
  const attemptOf = async (sessionId: string) => storage.getPaymentAttemptByProcessorSessionId(sessionId);

  it("records an unverified outcome's code and time", async () => {
    const { app, returnState, sessionId } = await openedAttempt();
    query.mockResolvedValueOnce({ success: false, error: "integrity_mismatch:amount" });

    await request(app).get(`/api/pay/return/${returnState}`).query({ source: "hpp" });

    expect(await attemptOf(sessionId)).toMatchObject({
      lastReconciliationCode: "integrity_mismatch:amount", lastReconciledAt: expect.any(Date),
    });
  });

  it("records a verified approval as approved", async () => {
    const { app, returnState, sessionId } = await openedAttempt();

    await request(app).get(`/api/pay/return/${returnState}`).query({ source: "hpp" });

    expect(await attemptOf(sessionId)).toMatchObject({ lastReconciliationCode: "approved" });
  });

  it("reduces a failure that is not already a code to one", async () => {
    const { app, returnState, sessionId } = await openedAttempt();
    query.mockResolvedValueOnce({ success: false, error: "Session still processing after max retries" });

    await request(app).get(`/api/pay/return/${returnState}`).query({ source: "hpp" });

    expect(await attemptOf(sessionId)).toMatchObject({ lastReconciliationCode: "session_still_processing_after_max_retries" });
  });
});
