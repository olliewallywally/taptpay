import "./support/test-env";

import request from "supertest";
import { bearer, createOwnerPrincipal, createTestApp, resetTestStorage } from "./support/http-harness";

/**
 * R1-T6 — NFC + tapt-stone identifier batch (2026-09-06). Proves, through the
 * real app, that:
 *  - the two unauthenticated /nfc/* physical-tag redirect routes now 400 on a
 *    garbage merchantId/stoneId instead of building a payment URL containing
 *    the literal string "NaN";
 *  - GET /api/tapt-stones/:id now 400s on a garbage id instead of querying
 *    storage with NaN;
 *  - GET /api/merchants/:id/active-transaction's optional ?stoneId query
 *    param stays optional (omitted entirely: still works) but now 400s on a
 *    present-but-garbage value instead of silently becoming NaN and falling
 *    through to a confusing 403 further down;
 *  - the /revenue-over-time `days` upper-bound clamp added alongside this
 *    batch (see the evidence doc for why: the size params already degraded
 *    safely and were left alone, but `days` fed an unbounded, synchronous
 *    per-day loop with no cap at all).
 */
describe("R1-T6 — /nfc, /api/tapt-stones, active-transaction stoneId", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  async function createStoneFor(merchantId: number, token: string): Promise<number> {
    const { app } = await createTestApp();
    const response = await request(app)
      .post(`/api/merchants/${merchantId}/tapt-stones`)
      .set({ Authorization: `Bearer ${token}` })
      .send({});
    expect(response.status).toBe(200);
    return response.body.id;
  }

  describe("GET /nfc/:merchantId/stone/:stoneId", () => {
    it.each(["abc", "1.5", "-1", "0", "1e3"])(
      "merchantId=%s returns 400, not a redirect to a NaN payment URL",
      async (garbage) => {
        const { app } = await createTestApp();
        const response = await request(app).get(`/nfc/${encodeURIComponent(garbage)}/stone/5`);
        expect(response.status).toBe(400);
      },
    );

    it.each(["abc", "1.5", "-1", "0"])("stoneId=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const response = await request(app).get(
        `/nfc/${owner.merchantId}/stone/${encodeURIComponent(garbage)}`,
      );
      expect(response.status).toBe(400);
    });

    it("real merchantId/stoneId still redirects (200, no-store, html)", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const stoneId = await createStoneFor(owner.merchantId, owner.token);

      const response = await request(app).get(`/nfc/${owner.merchantId}/stone/${stoneId}`);
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.text).not.toContain("NaN");
    });
  });

  describe("GET /nfc/:merchantId", () => {
    it.each(["abc", "1.5", "-1", "0", " 1"])("merchantId=%s returns 400", async (garbage) => {
      const { app } = await createTestApp();
      const response = await request(app).get(`/nfc/${encodeURIComponent(garbage)}`);
      expect(response.status).toBe(400);
    });

    it("a real merchantId still redirects", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const response = await request(app).get(`/nfc/${owner.merchantId}`);
      expect(response.status).toBe(200);
      expect(response.text).not.toContain("NaN");
    });
  });

  describe("GET /api/tapt-stones/:id", () => {
    it.each(["abc", "1abc", "1.5", "-1", "0", "+1", "1e3"])(
      "id=%s returns 400, not a lookup with NaN",
      async (garbage) => {
        const { app } = await createTestApp();
        const response = await request(app).get(`/api/tapt-stones/${encodeURIComponent(garbage)}`);
        expect(response.status).toBe(400);
      },
    );

    it("a real, active stone id returns 200", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const stoneId = await createStoneFor(owner.merchantId, owner.token);

      const response = await request(app).get(`/api/tapt-stones/${stoneId}`);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(stoneId);
    });

    it("an unknown-but-well-formed id 404s rather than 400", async () => {
      const { app } = await createTestApp();
      const response = await request(app).get("/api/tapt-stones/999999");
      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/merchants/:id/active-transaction — optional ?stoneId", () => {
    // With no stoneId, only the business's own signed-in terminal is answered: the
    // anonymous no-board read was retired on 2026-09-25 (no-board-address-retired.test.ts).
    it("still works with no stoneId at all when signed in (stays optional)", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .get(`/api/merchants/${owner.merchantId}/active-transaction`)
        .set(bearer(owner));
      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
    });

    it("a present-but-garbage stoneId 400s instead of silently becoming NaN", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app).get(
        `/api/merchants/${owner.merchantId}/active-transaction?stoneId=abc`,
      );
      expect(response.status).toBe(400);
    });

    it("a well-formed but unrelated stoneId is a 403 (cross-tenant/nonexistent-stone check), not a 400 — parsing and ownership are distinct stages", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app).get(
        `/api/merchants/${owner.merchantId}/active-transaction?stoneId=999999`,
      );
      expect(response.status).toBe(403);
    });

    it("a garbage merchantId path param still 400s before the query param is even looked at", async () => {
      const { app } = await createTestApp();
      const response = await request(app).get("/api/merchants/abc/active-transaction?stoneId=1");
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/merchants/:id/revenue-over-time — days clamp (judgment call, see evidence doc)", () => {
    it("defaults to a 30-day (31-bucket) window when no days param is given", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .get(`/api/merchants/${owner.merchantId}/revenue-over-time`)
        .set(bearer(owner));
      expect(response.status).toBe(200);
      expect(response.body.length).toBe(31);
    });

    it("clamps an absurd days value to the 365-day cap instead of building an unbounded date-bucket map", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app)
        .get(`/api/merchants/${owner.merchantId}/revenue-over-time?days=999999999`)
        .set(bearer(owner));
      expect(response.status).toBe(200);
      expect(response.body.length).toBe(366);
    });
  });

  // SUPERSEDED 2026-09-11. This block previously asserted that a negative size
  // "does not crash the handler — the qrcode library silently ignores a
  // non-positive width", the deliberate exemption for bounded tuning values.
  // The tracker's gap 6 reverses it: present-but-invalid is refused, not
  // silently defaulted. Old assertions quoted in
  // docs/evidence/remediation-v2-2/r1/R1-T6-bounded-query-values-2026-09-11.md.
  describe("GET /api/merchants/:id/qr — size", () => {
    it("a negative size is refused rather than relying on the qrcode library to ignore it", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();

      const response = await request(app).get(`/api/merchants/${owner.merchantId}/qr?size=-100`);
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid size");
    });
  });
});
