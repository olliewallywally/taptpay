import express from "express";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createDurablePaymentNotificationHandlers, NotificationRateLimiter } from "../durable-payment-notification";
import { PaymentReconciliationWorker } from "../payment-reconciliation";

/**
 * R3 integration (docs/evidence/remediation-v2-2/r4/R3-INTEGRATION-2026-10-14.md §5, FPRN rate limit):
 * a caller cannot make unbounded inbox rows, and a forged session ID costs a bounded number of
 * provider queries.
 */

test("one address is limited per window before anything is written; another is not", async () => {
  const receive = jest.fn(async () => "receipt");
  const limiter = new NotificationRateLimiter(60_000, 3);
  const app = express();
  app.set("trust proxy", true);
  app.use("/n", ...createDurablePaymentNotificationHandlers({ receive }, (body: any) => body?.sessionId, { limiter }));
  const send = (ip: string) => request(app).post("/n").set("X-Forwarded-For", ip).send({ sessionId: `s-${randomUUID()}` });
  for (let i = 0; i < 3; i++) expect((await send("198.51.100.1")).status).toBe(200);
  const limited = await send("198.51.100.1");
  expect(limited.status).toBe(429);
  expect(limited.headers["retry-after"]).toBe("60");
  expect(receive).toHaveBeenCalledTimes(3);
  expect((await send("198.51.100.2")).status).toBe(200);
});

test("the window resets", () => {
  const limiter = new NotificationRateLimiter(1000, 1);
  expect(limiter.allow("a", 0)).toBe(true);
  expect(limiter.allow("a", 10)).toBe(false);
  expect(limiter.allow("a", 1000)).toBe(true);
});

test("an unknown session is looked up at the provider only on its first three tries", async () => {
  const now = new Date("2026-10-15T10:00:00Z");
  const discover = jest.fn(async () => undefined);
  for (const attemptCount of [1, 2, 3, 4, 10]) {
    const claim = { id: randomUUID(), sessionId: "session-forged", owner: randomUUID(), attemptCount, firstReceivedAt: now, leaseExpiresAt: new Date(now.getTime() + 60000) };
    const repository = { claimInbox: async () => claim, resolveSession: async () => undefined, finalize: jest.fn(), finishInbox: jest.fn(async () => true),
      findUnboundSessionCandidate: jest.fn(), attachRecoveredSession: jest.fn() };
    await new PaymentReconciliationWorker(repository as any, { query: jest.fn(), discoverReference: discover } as any, () => now, () => 0, undefined, () => undefined).runOne(randomUUID());
    expect(repository.finishInbox).toHaveBeenCalledWith(claim, expect.objectContaining({ status: "retry", code: "unbound_session" }), now);
  }
  expect(discover).toHaveBeenCalledTimes(3);
});
