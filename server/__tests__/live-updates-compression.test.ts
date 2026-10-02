import "./support/test-env";

import request from "supertest";
import { sseBroker } from "../sse-broker";
import {
  signedIn,
  createOwnerPrincipal,
  createTestApp,
  openEventStream,
  resetTestStorage,
  storage,
} from "./support/http-harness";

/**
 * Live updates (`GET /api/merchants/:id/events`) reach a real browser. Every
 * browser asks for compressed responses, and since `7f52fe11` (2026-04-07)
 * `compression()` compressed the event stream too: each event then waited in
 * the compressor for more bytes, so a browser received nothing, and every
 * screen quietly fell back to polling. Found by the R1-T1 audit, once the
 * harness ran production's pipeline; reproduced on the dev server and in
 * Chromium (docs/evidence/remediation-v2-2/r1/R1-live-updates-compression-2026-09-25.md).
 */
const CHROME_ACCEPT_ENCODING = { "Accept-Encoding": "gzip, deflate, br, zstd" };

describe("live updates reach a browser", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("the merchant's stream (fetch, with the session) delivers each event as it happens", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const stream = await openEventStream(app, `/api/merchants/${owner.merchantId}/events`, {
      ...CHROME_ACCEPT_ENCODING,
      ...signedIn(owner),
    });
    try {
      expect(stream.status).toBe(200);
      expect(stream.headers["content-encoding"]).toBeUndefined();
      expect(await stream.nextEvent()).toEqual({ type: "connected", audience: "merchant" });

      sseBroker.broadcast(owner.merchantId, null, { type: "transaction_updated", transactionId: 7 });

      expect(await stream.nextEvent()).toEqual({ type: "transaction_updated", transactionId: 7 });
    } finally {
      await stream.close();
    }
  });

  it("the customer's stream (EventSource, on a payment board) delivers each event as it happens", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const board = await storage.createNextTaptStone(owner.merchantId);

    const stream = await openEventStream(
      app,
      `/api/merchants/${owner.merchantId}/events?stoneId=${board.id}`,
      CHROME_ACCEPT_ENCODING,
    );
    try {
      expect(stream.status).toBe(200);
      expect(stream.headers["content-encoding"]).toBeUndefined();
      expect(await stream.nextEvent()).toEqual({ type: "connected", audience: "board", stoneId: board.id });
    } finally {
      await stream.close();
    }
  });

  it("still compresses a large ordinary response for the same browser", async () => {
    const { app } = await createTestApp();

    const response = await request(app)
      .get("/.well-known/apple-developer-merchantid-domain-association")
      .set(CHROME_ACCEPT_ENCODING)
      .buffer(true)
      .parse((res, callback) => {
        res.on("data", () => {});
        res.on("end", () => callback(null, null));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBe("br");
  });
});
