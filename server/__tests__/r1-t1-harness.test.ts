import "./support/test-env";

import request from "supertest";
import { isDatabaseConnected } from "../database";
import { sseBroker } from "../sse-broker";
import {
  bearer,
  createOwnerPrincipal,
  createTestApp,
  mintPaymentCredential,
  openEventStream,
  providerNotification,
  resetTestStorage,
  storage,
  useFakeClock,
} from "./support/http-harness";

/**
 * R1-T1 audit (plan v2.2 §8.2; source plan R1-T1): the harness builds the app
 * production serves — the same headers, the same request log — with no
 * listener, no database, no Vite, no seeding, no migrations and nothing left
 * running, and it can stand in for each outside dependency: the clock, the
 * provider's notification, a public payment link's bearer, a live event
 * stream. (No network is checked for every file: see no-network-guard.test.ts.)
 */
describe("R1-T1 — the harness is production's app, and nothing else", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("answers with production's security headers", async () => {
    const { app } = await createTestApp();

    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("compresses a large response for a client that accepts it, and leaves a small one alone", async () => {
    const { app } = await createTestApp();

    // The file is served as application/json but is not JSON: read it as text.
    const large = await request(app)
      .get("/.well-known/apple-developer-merchantid-domain-association")
      .set("Accept-Encoding", "gzip")
      .buffer(true)
      .parse((res, callback) => {
        res.on("data", () => {});
        res.on("end", () => callback(null, null));
      });
    const small = await request(app).get("/api/auth/me").set("Accept-Encoding", "gzip");

    expect(large.status).toBe(200);
    expect(large.headers["content-encoding"]).toBe("gzip");
    expect(small.headers["content-encoding"]).toBeUndefined();
  });

  it.each(["/pay/t/abc", "/split/t/abc", "/checkout/t/abc", "/receipt/t/abc", "/pay/return/abc", "/accept-invite"])(
    "keeps the bearer page %s out of shared caches and referrers",
    async (path) => {
      const { app } = await createTestApp();

      const response = await request(app).get(path);

      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
    },
  );

  it("logs each API request by its route, never by its token", async () => {
    const { app, requestLog } = await createTestApp();
    const { rawToken } = mintPaymentCredential();
    const jwtShaped = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.c2lnbmF0dXJlLXZhbHVl";

    await request(app).get(`/api/pay/t/${rawToken}`);
    await request(app).get(`/api/not-a-route/${jwtShaped}`);
    await request(app).get("/not-an-api-page");

    expect(requestLog).toEqual([
      expect.stringMatching(/^GET \/api\/pay\/t\/:token 404 in \d+ms$/),
      expect.stringMatching(/^GET \/api\/not-a-route\/\[REDACTED_JWT\] 404 in \d+ms$/),
    ]);
    expect(requestLog.join("\n")).not.toContain(rawToken);
    expect(requestLog.join("\n")).not.toContain(jwtShaped);
  });

  it("loads no Vite, seeding, migrations or port manager, does not listen, and leaves nothing running", async () => {
    const timers = () => process.getActiveResourcesInfo().filter((kind) => kind === "Timeout").length;
    const forbidden = ["../vite", "../seed", "../migrate", "../port-manager"];

    try {
      await jest.isolateModulesAsync(async () => {
        for (const name of forbidden) {
          jest.doMock(name, () => {
            throw new Error(`the harness loaded ${name}`);
          });
        }
        const before = timers();
        const harness = await import("./support/http-harness");
        const { httpServer } = await harness.createTestApp();

        expect(httpServer.listening).toBe(false);
        expect(timers()).toBe(before);
      });
    } finally {
      for (const name of forbidden) jest.dontMock(name);
    }
  });

  it("uses the in-memory store and opens no database client", async () => {
    await createTestApp();

    expect(isDatabaseConnected()).toBe(false);
    expect(storage.constructor.name).toBe("MemStorage");
  });

  it("sends a provider notification as Windcave does, with no user session", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const transaction = await storage.createTransaction({
      merchantId: owner.merchantId,
      itemName: "Notification fixture",
      price: "10.00",
      status: "pending",
      paymentMethod: "qr_code",
      splitEnabled: false,
    } as any);
    await storage.updateTransactionWindcaveSession(transaction.id, "harness-session", "pending", "harness-x-id");

    const notification = providerNotification({ sessionId: "harness-session" });
    const response = await request(app)[notification.method](notification.path);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(notification.path).toBe("/api/windcave/notification?sessionid=harness-session");
    expect(response.status).toBe(200);
    expect(response.text).toBe("OK");
    // Payments are off in the harness: nothing is reconciled, not even locked.
    expect((await storage.getTransaction(transaction.id))?.windcaveSessionState).toBe("pending");
  });

  it("resolves a public payment link by its bearer token, and only by it", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const { rawToken, tokenHash } = mintPaymentCredential();
    await storage.createTransaction({
      merchantId: owner.merchantId,
      itemName: "Link fixture",
      price: "12.50",
      status: "pending",
      paymentMethod: "qr_code",
      splitEnabled: false,
      paymentTokenHash: tokenHash,
    } as any);
    const altered = `${rawToken.slice(0, -1)}${rawToken.endsWith("A") ? "B" : "A"}`;

    const found = await request(app).get(`/api/pay/t/${rawToken}`);
    const notFound = await request(app).get(`/api/pay/t/${altered}`);

    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ itemName: "Link fixture", price: "12.50", status: "pending" });
    expect(notFound.status).toBe(404);
  });

  it("controls the clock: a session token stops working an hour after it was issued", async () => {
    const { app } = await createTestApp();
    const clock = useFakeClock(new Date("2026-09-25T00:00:00.000Z"));
    try {
      const owner = await createOwnerPrincipal();

      const fresh = await request(app).get("/api/auth/me").set(bearer(owner));
      clock.advance(61 * 60 * 1000);
      const stale = await request(app).get("/api/auth/me").set(bearer(owner));

      expect(fresh.status).toBe(200);
      expect(stale.status).toBe(401); // 401 since 2026-09-27 (R1-T3, P2.2, owner decision): a sign-in that is invalid, expired or disabled was 403.
      expect(stale.body.message).toBe("Invalid or expired token");
    } finally {
      clock.restore();
    }
  });

  it("reads a live event stream: the connection event, then a broadcast", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const stream = await openEventStream(app, `/api/merchants/${owner.merchantId}/events`, bearer(owner));
    try {
      expect(stream.status).toBe(200);
      expect(stream.headers["content-type"]).toContain("text/event-stream");
      expect(await stream.nextEvent()).toEqual({ type: "connected", audience: "merchant" });

      sseBroker.broadcast(owner.merchantId, null, { type: "transaction_updated", transactionId: 7 });

      expect(await stream.nextEvent()).toEqual({ type: "transaction_updated", transactionId: 7 });
    } finally {
      await stream.close();
    }
  });
});
