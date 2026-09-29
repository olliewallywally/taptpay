import "./support/test-env";

import request from "supertest";
import { bearer, createOwnerPrincipal, createTestApp, resetTestStorage } from "./support/http-harness";

/**
 * R1-T3 domain 5, finding UPL-2: POST /api/property/invoices/document's only
 * content check was multer's `fileFilter` matching the client-supplied
 * `file.mimetype` header — never re-verified against the actual bytes,
 * unlike the sibling logo route's server-side PNG magic-byte check. Fixed by
 * extending that same pattern to pdf/png/jpeg/webp (four of the five allowed
 * types); HEIC is left mimetype-only, as an explicitly documented interim
 * scope narrower than the other four (its box-based signature is
 * meaningfully fiddlier to parse correctly, and this route's real exposure
 * is already reduced by the global `nosniff` header — see finding UPL-4).
 */
describe("R1-T3 UPL-2 — invoice document upload validates content against declared type", () => {
  beforeEach(() => {
    resetTestStorage();
  });

  it("rejects a body that does not match its declared PDF content-type", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app)
      .post("/api/property/invoices/document")
      .set(bearer(owner))
      .attach("document", Buffer.from("not actually a pdf"), {
        filename: "bill.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
  });

  it("rejects a body that does not match its declared PNG content-type", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app)
      .post("/api/property/invoices/document")
      .set(bearer(owner))
      .attach("document", Buffer.from("not actually a png"), {
        filename: "bill.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(400);
  });

  it("rejects a body that does not match its declared JPEG content-type", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app)
      .post("/api/property/invoices/document")
      .set(bearer(owner))
      .attach("document", Buffer.from("not actually a jpeg"), {
        filename: "bill.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(400);
  });

  it("rejects a body that does not match its declared WEBP content-type", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app)
      .post("/api/property/invoices/document")
      .set(bearer(owner))
      .attach("document", Buffer.from("not actually a webp"), {
        filename: "bill.webp",
        contentType: "image/webp",
      });

    expect(res.status).toBe(400);
  });

  it("accepts a real PDF whose bytes match the declared content-type", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const realPdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("rest of a fake but signature-valid pdf")]);

    const res = await request(app)
      .post("/api/property/invoices/document")
      .set(bearer(owner))
      .attach("document", realPdf, { filename: "bill.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(200);
    expect(res.body.documentUrl).toMatch(/^\/uploads\/invoices\/invoice-.+\.pdf$/);
  });

  it("accepts a real PNG whose bytes match the declared content-type", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const realPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

    const res = await request(app)
      .post("/api/property/invoices/document")
      .set(bearer(owner))
      .attach("document", realPng, { filename: "bill.png", contentType: "image/png" });

    expect(res.status).toBe(200);
  });

  it("accepts a real JPEG whose bytes match the declared content-type", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const realJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    const res = await request(app)
      .post("/api/property/invoices/document")
      .set(bearer(owner))
      .attach("document", realJpeg, { filename: "bill.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
  });

  it("accepts a real WEBP whose bytes match the declared content-type", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const realWebp = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]), // file size (unchecked)
      Buffer.from("WEBP"),
    ]);

    const res = await request(app)
      .post("/api/property/invoices/document")
      .set(bearer(owner))
      .attach("document", realWebp, { filename: "bill.webp", contentType: "image/webp" });

    expect(res.status).toBe(200);
  });

  it("HEIC stays mimetype-only (documented interim scope, not magic-byte checked)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app)
      .post("/api/property/invoices/document")
      .set(bearer(owner))
      .attach("document", Buffer.from("not a real heic but declared as one"), {
        filename: "bill.heic",
        contentType: "image/heic",
      });

    expect(res.status).toBe(200);
  });

  it("still rejects a mimetype outside the allowed set entirely (400 since C10 batch 6c)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();

    const res = await request(app)
      .post("/api/property/invoices/document")
      .set(bearer(owner))
      .attach("document", Buffer.from("<script>alert(1)</script>"), {
        filename: "bill.html",
        contentType: "text/html",
      });

    // multer's own fileFilter still runs; its refusal answered 500 until C10 batch 6c
    // (receiveUpload in server/routes.ts), and is now 400 with the filter's message.
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Only PDF or image files are allowed" });
  });
});
