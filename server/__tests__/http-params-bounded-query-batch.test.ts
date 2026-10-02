import "./support/test-env";

import request from "supertest";
import { strictBoundedIntegerQueryParam } from "../http-params";
import {
  signedIn,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  storage,
} from "./support/http-harness";

/**
 * R1-T6 final batch — the bounded free-form query values (QR pixel `size`,
 * reporting window `days`, page `limit`) that earlier batches deliberately
 * exempted. The tracker's gap 6 reverses that exemption: "Keep optional
 * defaults only for absent inputs and preserve intended size/day bounds using
 * a reviewed typed schema; reject repeated/array/object/garbage inputs."
 *
 * Judgment call recorded here rather than buried: these values are read AFTER
 * the route's 404/ownership checks, unlike identifier params which are parsed
 * first. That is deliberate and departs from the team-batch ordering
 * precedent — moving the parse earlier would let an unauthenticated caller
 * distinguish "bad size" from "no such transaction" and so enumerate rows.
 */

const GARBAGE = ["abc", "", "0", "-1", "1.5", "1e3", " 7", "7 ", "01", "+7", "9007199254740993"];

describe("R1-T6 — bounded query values reject garbage and default only when absent", () => {
  beforeEach(() => resetTestStorage());

  describe("the helper itself", () => {
    test.each(GARBAGE)("rejects %p rather than silently defaulting", (raw) => {
      expect(strictBoundedIntegerQueryParam(raw, { fallback: 400, max: 1000 })).toBeNull();
    });

    test("rejects a repeated key (array) and a bracketed key (object)", () => {
      expect(strictBoundedIntegerQueryParam(["1", "2"], { fallback: 400, max: 1000 })).toBeNull();
      expect(strictBoundedIntegerQueryParam({ a: "1" }, { fallback: 400, max: 1000 })).toBeNull();
    });

    test("applies the default only when the value is absent", () => {
      expect(strictBoundedIntegerQueryParam(undefined, { fallback: 400, max: 1000 })).toBe(400);
    });

    test("preserves the previous clamping for values that were already valid", () => {
      expect(strictBoundedIntegerQueryParam("5000", { fallback: 400, max: 1000 })).toBe(1000);
      expect(strictBoundedIntegerQueryParam("50", { fallback: 300, min: 100, max: 800 })).toBe(100);
      expect(strictBoundedIntegerQueryParam("640", { fallback: 300, min: 100, max: 800 })).toBe(640);
    });
  });

  // The business-wide /api/merchants/:id/qr was retired on 2026-09-25 (410; see
  // no-board-standing-links-retired.test.ts). A board's QR parses `size` the same way.
  describe("GET /api/merchants/:id/stone/:stoneId/qr — size", () => {
    test("absent size still renders, garbage size is refused", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const board = await storage.createNextTaptStone(owner.merchantId);
      const path = `/api/merchants/${owner.merchantId}/stone/${board.id}/qr`;

      const ok = await request(app).get(path).set(signedIn(owner));
      expect(ok.status).toBe(200);

      for (const raw of ["abc", "0", "-1", "1.5"]) {
        const bad = await request(app).get(path).query({ size: raw }).set(signedIn(owner));
        expect({ raw, status: bad.status }).toEqual({ raw, status: 400 });
        expect(bad.body.message).toBe("Invalid size");
      }

      const repeated = await request(app).get(`${path}?size=200&size=300`).set(signedIn(owner));
      expect(repeated.status).toBe(400);
    });
  });

  // GET /api/merchants/:id/revenue-over-time was removed on 2026-09-27 (owner decision, C10 batch 6b).
});
