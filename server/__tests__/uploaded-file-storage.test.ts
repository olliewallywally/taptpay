import "./support/test-env";

import request from "supertest";
import { bearer, createOwnerPrincipal, createTestApp, resetTestStorage } from "./support/http-harness";

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
