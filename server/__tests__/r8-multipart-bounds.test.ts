import "./support/test-env";

import request from "supertest";
import { signedIn, createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const routes = [
  { name: "logo", field: "logo", path: (id: number) => `/api/merchants/${id}/logo` },
  { name: "invoice document", field: "document", path: (_id: number) => "/api/property/invoices/document" },
];

// Both APIs consume one file and no multipart text fields. Reject those fields
// before append-field can construct nested or attacker-sized sparse arrays.
// Small safe names exercise the parser boundary without a crash/OOM payload.
describe.each(routes)("R8 multipart bounds: $name", (route) => {
  beforeEach(() => resetTestStorage());

  it.each([
    ["indexed field before file", "metadata[9999]", true],
    ["indexed field after file", "metadata[9999]", false],
    ["nested field before file", "metadata[a][b]", true],
    ["nested field after file", "metadata[a][b]", false],
  ] as const)("rejects %s without saving a blob", async (_label, field, before) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const save = jest.spyOn(storage, "saveUploadedFile");
    const saveScanned = jest.spyOn(storage, "saveScannedUploadedFile");
    const upload = request(app).post(route.path(owner.merchantId)).set(signedIn(owner));
    if (before) upload.field(field, "ignored");
    upload.attach(route.field, PNG, { filename: "fixture.png", contentType: "image/png" });
    if (!before) upload.field(field, "ignored");

    const response = await upload;

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: "Invalid upload" });
    expect(save).not.toHaveBeenCalled();
    expect(saveScanned).not.toHaveBeenCalled();
  });

  it("keeps accepting the existing single-file caller", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const response = await request(app).post(route.path(owner.merchantId)).set(signedIn(owner))
      .attach(route.field, PNG, { filename: "fixture.png", contentType: "image/png" });

    expect(response.status).toBe(200);
  });

  it("rejects an extra file without saving either blob", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const save = jest.spyOn(storage, "saveUploadedFile");
    const saveScanned = jest.spyOn(storage, "saveScannedUploadedFile");

    const response = await request(app).post(route.path(owner.merchantId)).set(signedIn(owner))
      .attach(route.field, PNG, { filename: "one.png", contentType: "image/png" })
      .attach(route.field, PNG, { filename: "two.png", contentType: "image/png" });

    expect(response.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
    expect(saveScanned).not.toHaveBeenCalled();
  });
});
