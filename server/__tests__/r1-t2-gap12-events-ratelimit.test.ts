import "./support/test-env";
import net from "node:net";
import request from "supertest";
import { sseBroker } from "../sse-broker";
import { createOwnerPrincipal, createTestApp, resetTestStorage } from "./support/http-harness";

/**
 * R1-T2 gap 12 (docs/evidence/remediation-v2-2/CONTINUATION-2026-09-07.md item
 * 12; docs/evidence/remediation-v2-2/r1/R1-T2-classifier-extension-2026-09-12.md):
 *
 * GET /api/merchants/:id/events opens its unauthenticated "legacy-no-board"
 * branch (no Authorization header, no ?stoneId=) with no rate limiting at
 * all, unlike its REST sibling GET /api/merchants/:id/active-transaction,
 * which calls the shared `checkRateLimit(clientIp)` (routes.ts ~line 246,
 * module-level `rateLimitMap`, 100 requests/IP/minute) before answering the
 * identical no-stoneId access mode.
 *
 * This proves the gap against the *real* shared limiter (not a mock): drive
 * an IP to the limit via active-transaction, then show the events route
 * still opens the stream for that same already-limited IP.
 */
describe("R1-T2 gap 12 — legacy-no-board SSE stream must share the active-transaction rate limit", () => {
  beforeEach(() => {
    resetTestStorage();
    // Bookkeeping-only: keeps this rate-limit test from also asserting on
    // sseBroker's subscriber-set internals. Mirrors the existing
    // jest.spyOn(sseBroker, "broadcast") convention in
    // r1-t7-windcave-session-binding.test.ts.
    jest.spyOn(sseBroker, "subscribe").mockReturnValue(() => {});
  });

  /**
   * Raw bytes off the socket, bounded by a timeout. Needed because the
   * legacy-no-board branch (pre-fix) never ends its response — there is
   * nothing for a normal HTTP client promise to resolve on — matching the
   * `collectRaw` helper already used for the same reason in
   * async-route-guard.test.ts's SSE assertions.
   */
  function collectRaw(port: number, path: string, waitMs = 300): Promise<string> {
    return new Promise((resolve, reject) => {
      let raw = "";
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.write(
          `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
        );
      });
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        raw += chunk;
      });
      socket.on("error", reject);
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(raw);
      }, waitMs);
      socket.on("close", () => {
        clearTimeout(timer);
        resolve(raw);
      });
    });
  }

  test("an IP already exhausted on active-transaction can still open the unauthenticated events stream", async () => {
    const { app, httpServer } = await createTestApp();
    const { merchantId } = await createOwnerPrincipal();

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as net.AddressInfo).port;

    try {
      // Exhaust the shared per-IP limiter (routes.ts's module-level
      // rateLimitMap; MAX_REQUESTS_PER_WINDOW = 100) via the sibling route
      // that already enforces it. Every supertest call and the raw socket
      // below all reach 127.0.0.1, so they share the same rate-limit key.
      for (let i = 0; i < 100; i++) {
        await request(app).get(`/api/merchants/${merchantId}/active-transaction`);
      }
      const limitedSibling = await request(app).get(
        `/api/merchants/${merchantId}/active-transaction`,
      );
      expect(limitedSibling.status).toBe(429);
      expect(limitedSibling.body).toEqual({
        message: "Too many requests. Please try again later.",
      });

      // Same IP, same window, no Authorization header, no ?stoneId= — the
      // identical no-stoneId access mode on the SSE sibling. It must be
      // bound by the same limiter its REST sibling already enforces.
      const raw = await collectRaw(port, `/api/merchants/${merchantId}/events`);

      expect(raw).toContain("HTTP/1.1 429");
      expect(raw).toContain('"message":"Too many requests. Please try again later."');
      expect(raw).not.toContain("text/event-stream");
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });
});
