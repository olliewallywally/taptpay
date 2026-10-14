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
    queryWindcaveSession: jest.fn(async () => ({ success: false, error: "pending" })),
  };
});

import crypto from "crypto";
import request from "supertest";
import * as windcave from "../windcave";
import type { PaymentAttempt } from "@shared/schema";
import { createOwnerPrincipal, createTestApp, mintPaymentCredential, resetTestStorage, storage } from "./support/http-harness";

/**
 * A payer's page keeps one idempotency key per share until a final outcome. When that key's attempt
 * ended before any session was served (Windcave failed, then its lease ran out), the key can never
 * open a session again. The server now says so (409 PAYMENT_ATTEMPT_EXPIRED) instead of "still being
 * reconciled" forever, and only then: an attempt that may still be paid is reconciled as before.
 */

jest.setTimeout(30_000);
const create = windcave.createWindcaveSession as jest.Mock;
const query = windcave.queryWindcaveSession as jest.Mock;

beforeEach(() => { resetTestStorage(); query.mockClear(); });

const attemptsOf = (transactionId: number): PaymentAttempt[] =>
  Array.from(((storage as any).paymentAttempts as Map<string, PaymentAttempt>).values()).filter(a => a.transactionId === transactionId);
const expireLease = (attemptId: string) => { (storage as any).paymentAttempts.get(attemptId).leaseExpiresAt = new Date(Date.now() - 1000); };

async function sale() {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const link = mintPaymentCredential();
  const made = await storage.createTransaction({
    merchantId: owner.merchantId, itemName: "Flat white", price: "5.50", status: "pending", paymentMethod: "qr_code",
    splitEnabled: false, paymentTokenHash: link.tokenHash,
  } as any);
  const open = (key: string) => request(app).post(`/api/pay/t/${link.rawToken}/session`).send({ idempotencyKey: key });
  return { made, open };
}

it("the same key after its unsent attempt expired is told to start again; a new key pays", async () => {
  const { made, open } = await sale(), key = crypto.randomUUID();
  create.mockResolvedValueOnce({ success: false, error: "PROVIDER_UNAVAILABLE" });
  expect((await open(key)).status).toBe(503);
  expireLease(attemptsOf(made.id)[0].id);
  const created = create.mock.calls.length;

  for (let i = 0; i < 2; i++) {
    const again = await open(key);
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ code: "PAYMENT_ATTEMPT_EXPIRED", message: "This payment attempt ended before any payment was taken. Please try again." });
  }
  expect(create.mock.calls.length).toBe(created);
  expect(query).not.toHaveBeenCalled();
  expect((await open(crypto.randomUUID())).status).toBe(200);
});

it("an expired attempt that holds a session is still reconciled, never reported expired", async () => {
  const { made, open } = await sale(), key = crypto.randomUUID();
  const opened = await open(key);
  expect(opened.status).toBe(200);
  expireLease(attemptsOf(made.id)[0].id);
  const again = await open(key);
  expect(again.status).toBe(503);
  expect(again.body.code).toBeUndefined();
  expect(query).toHaveBeenCalledWith(opened.body.sessionId, expect.anything());
});

it("an attempt carrying R3 send intent is never reported expired", async () => {
  const { made, open } = await sale(), key = crypto.randomUUID();
  create.mockResolvedValueOnce({ success: false, error: "PROVIDER_UNAVAILABLE" });
  await open(key);
  const [attempt] = attemptsOf(made.id);
  (storage as any).paymentAttempts.get(attempt.id).sendStartedAt = new Date();
  expireLease(attempt.id);
  const again = await open(key);
  expect(again.status).toBe(503);
  expect(attemptsOf(made.id)[0].state).toBe("claiming");
});
