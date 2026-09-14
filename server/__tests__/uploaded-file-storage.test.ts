import "./support/test-env";

import request from "supertest";
import { bearer, createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";

// A minimal buffer that passes the logo route's PNG magic-byte check.
const PNG_MAGIC_ONLY = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

/**
 * R1-T7 — server/routes.ts used to query the uploaded_files table directly
 * via `db` at three sites (save, delete-on-failure, public serve), one of
 * the plan's explicitly named "bypasses IStorage" exceptions. `db` is always
 * null in MemStorage/no-database mode (see server/db.ts), so none of these
 * ever worked without a live Postgres connection. Moved behind
 * IStorage.saveUploadedFile/getUploadedFile/deleteUploadedFile (MemStorage:
 * a real in-memory Map; DatabaseStorage: the original db calls, unchanged).
 */
describe("R1-T7 uploaded file blobs go through storage, not `db` directly", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("an uploaded logo can be fetched back from the public /uploads route", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const upload = await request(app)
      .post(`/api/merchants/${owner.merchantId}/logo`)
      .set(bearer(owner))
      .attach("logo", PNG_MAGIC_ONLY, "logo.png");
    expect(upload.status).toBe(200);
    expect(upload.body.logoUrl).toMatch(/^\/uploads\/logos\/merchant-\d+\.png$/);

    const served = await request(app).get(upload.body.logoUrl);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(Buffer.from(served.body)).toEqual(PNG_MAGIC_ONLY);
  });

  /**
   * UPL-3 (R1-T3 domain 5): the public /uploads route is unauthenticated by
   * design (logos are customer-facing), but was missing `nosniff` — a
   * browser sniffing an uploaded file's bytes as `text/html` could execute
   * embedded script if the file were ever framed/loaded as a page. This is a
   * narrow, schema-free mitigation only; it does not add per-tenant download
   * authorization (see the R1-T3 domain-5 evidence file's escalation memo
   * for that open product/schema decision).
   */
  it("the public /uploads route sends X-Content-Type-Options: nosniff", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const upload = await request(app)
      .post(`/api/merchants/${owner.merchantId}/logo`)
      .set(bearer(owner))
      .attach("logo", PNG_MAGIC_ONLY, "logo.png");
    expect(upload.status).toBe(200);

    const served = await request(app).get(upload.body.logoUrl);
    expect(served.status).toBe(200);
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("deletes the logo blob so the public route no longer serves it", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const upload = await request(app)
      .post(`/api/merchants/${owner.merchantId}/logo`)
      .set(bearer(owner))
      .attach("logo", PNG_MAGIC_ONLY, "logo.png");
    expect(upload.status).toBe(200);

    const remove = await request(app).delete(`/api/merchants/${owner.merchantId}/logo`).set(bearer(owner));
    expect(remove.status).toBe(200);

    const servedAfterDelete = await request(app).get(upload.body.logoUrl);
    expect(servedAfterDelete.status).toBe(404);
  });

  it("the public /uploads route 404s for a path that was never uploaded", async () => {
    const { app } = await createTestApp();

    const response = await request(app).get("/uploads/logos/never-existed.png");

    expect(response.status).toBe(404);
  });
});

/**
 * R1-T3 domain 5, finding UPL-5: the stored logo filename was built from the
 * client-supplied `req.file.originalname`'s extension rather than being
 * hardcoded to `.png` (the route already only accepts PNG bytes, verified by
 * server-side magic-byte check, and always stores mimeType 'image/png'
 * regardless). Re-uploading under a different original filename extension
 * therefore wrote to a NEW path — `merchant.customLogoUrl` moved on, but the
 * previous path's blob stayed in `uploaded_files` forever with nothing
 * pointing at it (an orphan, still servable at its old public URL). Fixed by
 * hardcoding the stored extension to `.png`, so re-upload always overwrites
 * the same path regardless of the client's original filename.
 */
describe("R1-T3 UPL-5 — logo re-upload does not orphan a blob under a client-controlled extension", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("re-uploading under a different original filename extension overwrites the same path, leaving no orphan", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const first = await request(app)
      .post(`/api/merchants/${owner.merchantId}/logo`)
      .set(bearer(owner))
      .attach("logo", PNG_MAGIC_ONLY, "logo.png");
    expect(first.status).toBe(200);
    expect(first.body.logoUrl).toBe(`/uploads/logos/merchant-${owner.merchantId}.png`);

    // Same PNG bytes and the same image/png content-type multer's fileFilter
    // requires, but the client's original filename now claims a different
    // extension (a real client can send any originalname it likes — multer
    // trusts the multipart Content-Type header for fileFilter, not the name).
    const second = await request(app)
      .post(`/api/merchants/${owner.merchantId}/logo`)
      .set(bearer(owner))
      .attach("logo", PNG_MAGIC_ONLY, { filename: "photo.jpg", contentType: "image/png" });
    expect(second.status).toBe(200);

    // The stored URL is still the .png path — the client-supplied extension
    // never influenced where the file was written.
    expect(second.body.logoUrl).toBe(`/uploads/logos/merchant-${owner.merchantId}.png`);

    // No orphaned "merchant-<id>.jpg" blob was ever created.
    const orphan = await storage.getUploadedFile(`logos/merchant-${owner.merchantId}.jpg`);
    expect(orphan).toBeUndefined();

    // Deleting the (single) logo cleans up the one blob that exists — nothing
    // left behind under any other extension.
    const remove = await request(app).delete(`/api/merchants/${owner.merchantId}/logo`).set(bearer(owner));
    expect(remove.status).toBe(200);
    const stillServed = await request(app).get(second.body.logoUrl);
    expect(stillServed.status).toBe(404);
  });
});
