import "./support/test-env";

import request from "supertest";
import * as database from "../database";
import * as push from "../push";
import { sseBroker } from "../sse-broker";
import {
  apiKeyHeader,
  bearer,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  storage,
  storageSnapshot,
} from "./support/http-harness";

/**
 * R0-T5 requires, per disabled route: the correct status code and **zero** row
 * changes, provider transport, success SSE, push, event, usage increment or
 * notification outbox entry — and that retried and concurrent requests stay
 * side-effect free.
 *
 * The existing R0-T5 tests read the source. These drive real requests through
 * the real router and compare a complete snapshot of storage before and after,
 * so a write nobody thought to assert on is still caught.
 */

/**
 * Requests that must never succeed and must never change anything.
 *
 * Bodies and paths are built from the caller's OWN merchant so each request
 * passes authentication, validation and the ownership check and actually
 * reaches the feature gate. A 400 from a missing field would prove nothing
 * about containment - it would only prove the body was malformed.
 */
const DISABLED_ROUTES = [
  { name: "tap-to-pay", method: "post", status: 503,
    path: () => "/api/transactions/tap-to-pay",
    body: (merchantId: number) => ({ merchantId, amount: "1.00" }) },
  // nfc-pay and the two wallet routes were removed on 2026-09-27 (owner decision, C10 batch 6b):
  // unknown addresses now, still never a success and never a change.
  { name: "nfc-pay", method: "post", status: 404,
    path: (merchantId: number) => `/api/merchants/${merchantId}/nfc-pay`,
    body: () => ({ amount: "1.00" }) },
  { name: "nfc-session complete", method: "post", status: 404,
    path: () => "/api/nfc-sessions/abc/complete", body: () => ({}) },
  { name: "windcave sim-submit", method: "post", status: 404,
    path: () => "/api/windcave/sim-submit", body: () => ({}) },
  { name: "apple-pay process", method: "post", status: 404,
    path: () => "/api/payments/apple-pay/process",
    body: () => ({ token: "x", amount: "1.00" }) },
  { name: "google-pay process", method: "post", status: 404,
    path: () => "/api/payments/google-pay/process",
    body: () => ({ token: "x", amount: "1.00" }) },
  { name: "refund initiation", method: "post", status: 503,
    path: () => "/api/transactions/1/refunds",
    body: () => ({ refundAmount: "1.00", reason: "Synthetic test" }) },
] as const;

/**
 * Issues one request. The principal is created by the caller, once, because
 * creating one is itself a write - doing it per request would change the
 * snapshot this suite exists to compare.
 */
async function fire(route: (typeof DISABLED_ROUTES)[number], principal: { token: string; merchantId: number }) {
  const { app } = await createTestApp();
  return (request(app) as any)
    [route.method](route.path(principal.merchantId))
    .set(bearer({ token: principal.token }))
    .send(route.body(principal.merchantId));
}

describe("R0-T5 — disabled surfaces refuse and change nothing", () => {
  beforeEach(() => {
    resetTestStorage();
    jest.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("Unexpected outbound transport in disabled-route test");
    });
    jest.spyOn(sseBroker, "broadcast").mockImplementation(() => {});
    jest.spyOn(push, "sendPushToMerchant").mockResolvedValue({
      eligibleSubscriptions: 0, attempted: 0, delivered: 0, failed: 0,
    });
    // MemStorage's logTransactionEvent is a no-op, so an event write is
    // invisible to storageSnapshot(). It needs its own spy or "zero event"
    // is asserted by nothing at all.
    jest.spyOn(storage, "logTransactionEvent");
    // The disabled routes must not reach a database either. MemStorage is
    // selected in tests, so this proves no DatabaseStorage path was taken.
    jest.spyOn(database, "getDb");
  });

  afterEach(() => {
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(sseBroker.broadcast).not.toHaveBeenCalled();
    expect(push.sendPushToMerchant).not.toHaveBeenCalled();
    expect(storage.logTransactionEvent).not.toHaveBeenCalled();
    expect(database.getDb).not.toHaveBeenCalled();
  });

  test.each(DISABLED_ROUTES.map((r) => [r.name, r] as const))(
    "%s never returns success and leaves storage untouched",
    async (_name, route) => {
      const owner = await createOwnerPrincipal(); // realistic populated state, not an empty map
      const before = storageSnapshot();

      const response = await fire(route, owner);

      expect(response.status).toBe(route.status);
      expect(response.body?.success).not.toBe(true);
      expect(storageSnapshot()).toBe(before);
    },
  );

  test("retrying a disabled route ten times changes nothing", async () => {
    const owner = await createOwnerPrincipal();
    const before = storageSnapshot();

    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await fire(DISABLED_ROUTES[attempt % DISABLED_ROUTES.length], owner);
      expect(response.status).toBe(DISABLED_ROUTES[attempt % DISABLED_ROUTES.length].status);
    }

    expect(storageSnapshot()).toBe(before);
  });

  test("twenty concurrent disabled requests change nothing", async () => {
    const owner = await createOwnerPrincipal();
    const before = storageSnapshot();

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        fire(DISABLED_ROUTES[i % DISABLED_ROUTES.length], owner)),
    );

    responses.forEach((response, i) => expect(response.status).toBe(DISABLED_ROUTES[i % DISABLED_ROUTES.length].status));
    expect(storageSnapshot()).toBe(before);
  });

  // A snapshot comparison that cannot fail proves nothing, so this asserts the
  // detector notices a write the disabled routes are being held to not making.
  test("control — a route that does write is detected by the same snapshot", async () => {
    const before = storageSnapshot();
    await createOwnerPrincipal();
    expect(storageSnapshot()).not.toBe(before);
  });

  // The five admin API-key and usage stubs were removed on 2026-09-26 (owner decision, C10
  // batch 4): c10-batch-4-retired-routes.test.ts holds them to "registered nowhere".

  test("the e-commerce API surface is closed to a presented key", async () => {
    const { app } = await createTestApp();
    await createOwnerPrincipal();
    const before = storageSnapshot();

    const responses = await Promise.all([
      request(app).post("/api/v1/transactions").set(apiKeyHeader()).send({ amount: "1.00" }),
      request(app).get("/api/v1/transactions/1").set(apiKeyHeader()),
    ]);

    for (const response of responses) expect(response.status).toBe(404);
    expect(storageSnapshot()).toBe(before);
  });
});
