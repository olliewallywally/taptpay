import "./support/test-env";

import fs from "fs";
import path from "path";
import request from "supertest";
import {
  bearer,
  createAdminPrincipal,
  createMemberPrincipal,
  createOwnerPrincipal,
  createTestApp,
  resetTestStorage,
  storage,
} from "./support/http-harness";

/**
 * Gap 13 (R1-T7 / plan §8.5 "uploads", §22.8 "authenticate and tenant-authorize
 * before streaming"), Oliver's decision of 2026-09-14: Option C — a tenant column
 * on `uploaded_files` plus an authenticated, ownership-checked download route for
 * invoice documents; logos stay public.
 *
 * Fixtures are synthetic bytes only. No document content is ever read.
 */

const PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("synthetic-fixture-a")]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

const binaryParser = (res: any, callback: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
};

async function uploadInvoiceDocument(app: any, principal: { token: string }, bytes: Buffer = PDF_BYTES) {
  const res = await request(app)
    .post("/api/property/invoices/document")
    .set(bearer(principal))
    .attach("document", bytes, { filename: "bill.pdf", contentType: "application/pdf" });
  expect(res.status).toBe(200);
  const documentUrl = res.body.documentUrl as string;
  const relPath = documentUrl.replace(/^\/uploads\//, "");
  return { documentUrl, relPath, name: relPath.replace(/^invoices\//, "") };
}

beforeEach(() => {
  resetTestStorage();
});

describe("gap 13 — uploaded files carry their tenant", () => {
  it("an invoice document is stamped with the merchant that uploaded it", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const b = await createOwnerPrincipal();

    const { relPath } = await uploadInvoiceDocument(app, a);

    expect((await storage.getUploadedFileForMerchant(relPath, a.merchantId))?.data.equals(PDF_BYTES)).toBe(true);
    expect(await storage.getUploadedFileForMerchant(relPath, b.merchantId)).toBeUndefined();
    expect(await storage.uploadedFileOwnedByMerchant(relPath, a.merchantId)).toBe(true);
    expect(await storage.uploadedFileOwnedByMerchant(relPath, b.merchantId)).toBe(false);
  });

  it("a logo upload is stamped with its merchant", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();

    const upload = await request(app)
      .post(`/api/merchants/${a.merchantId}/logo`)
      .set(bearer(a))
      .attach("logo", PNG_BYTES, "logo.png");
    expect(upload.status).toBe(200);

    expect(await storage.uploadedFileOwnedByMerchant(`logos/merchant-${a.merchantId}.png`, a.merchantId)).toBe(true);
  });

  it("tenant-scoped reads reject a non-positive or non-integer tenant instead of matching anything", async () => {
    const a = await createOwnerPrincipal();
    await storage.saveUploadedFile("invoices/invoice-1700000000000-aaaaaaaaaaaaaaaa.pdf", "application/pdf", PDF_BYTES, a.merchantId);

    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(await storage.getUploadedFileForMerchant("invoices/invoice-1700000000000-aaaaaaaaaaaaaaaa.pdf", bad)).toBeUndefined();
      expect(await storage.uploadedFileOwnedByMerchant("invoices/invoice-1700000000000-aaaaaaaaaaaaaaaa.pdf", bad)).toBe(false);
    }
  });

  it("saving to a path owned by a different merchant is refused and leaves the original bytes intact", async () => {
    const a = await createOwnerPrincipal();
    const b = await createOwnerPrincipal();
    const samePath = "invoices/invoice-1700000000000-bbbbbbbbbbbbbbbb.pdf";
    await storage.saveUploadedFile(samePath, "application/pdf", PDF_BYTES, a.merchantId);

    await expect(
      storage.saveUploadedFile(samePath, "application/pdf", Buffer.from("%PDF-1.4\nattacker"), b.merchantId),
    ).rejects.toThrow();

    expect((await storage.getUploadedFileForMerchant(samePath, a.merchantId))?.data.equals(PDF_BYTES)).toBe(true);
    expect(await storage.getUploadedFileForMerchant(samePath, b.merchantId)).toBeUndefined();

    // The owner may still overwrite their own path (logo re-upload relies on this).
    const v2 = Buffer.from("%PDF-1.4\nowner-v2");
    await storage.saveUploadedFile(samePath, "application/pdf", v2, a.merchantId);
    expect((await storage.getUploadedFileForMerchant(samePath, a.merchantId))?.data.equals(v2)).toBe(true);
  });

  it("deleting is tenant-scoped: another merchant's delete removes nothing", async () => {
    const a = await createOwnerPrincipal();
    const b = await createOwnerPrincipal();
    const rel = "invoices/invoice-1700000000000-cccccccccccccccc.pdf";
    await storage.saveUploadedFile(rel, "application/pdf", PDF_BYTES, a.merchantId);

    await storage.deleteUploadedFile(rel, b.merchantId);
    expect(await storage.uploadedFileOwnedByMerchant(rel, a.merchantId)).toBe(true);

    await storage.deleteUploadedFile(rel, a.merchantId);
    expect(await storage.uploadedFileOwnedByMerchant(rel, a.merchantId)).toBe(false);
  });

  it("logo delete cannot remove another merchant's blob even if this merchant's customLogoUrl points at it", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const b = await createOwnerPrincipal();
    const bUpload = await request(app)
      .post(`/api/merchants/${b.merchantId}/logo`)
      .set(bearer(b))
      .attach("logo", PNG_BYTES, "logo.png");
    expect(bUpload.status).toBe(200);

    // Not reachable through PUT /api/merchants/:id today (strict schema rejects
    // customLogoUrl), so this is defense in depth: the storage contract must not
    // depend on every caller having sanitised the URL.
    await storage.updateMerchantLogoUrl(a.merchantId, `/uploads/logos/merchant-${b.merchantId}.png`);

    const del = await request(app).delete(`/api/merchants/${a.merchantId}/logo`).set(bearer(a));
    expect(del.status).toBe(200);

    const stillServed = await request(app).get(`/uploads/logos/merchant-${b.merchantId}.png`);
    expect(stillServed.status).toBe(200);
  });
});

describe("gap 13 — the public /uploads route serves logos only", () => {
  it("no longer serves an invoice document by its (formerly bearer-capability) URL", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const { documentUrl } = await uploadInvoiceDocument(app, a);

    const res = await request(app).get(documentUrl);

    expect(res.status).toBe(404);
  });

  it("still serves a logo without authentication, with its existing public caching (regression guard)", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const upload = await request(app)
      .post(`/api/merchants/${a.merchantId}/logo`)
      .set(bearer(a))
      .attach("logo", PNG_BYTES, "logo.png");
    expect(upload.status).toBe(200);

    const res = await request(app).get(upload.body.logoUrl);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("serves no folder other than logos, even for a row that exists", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    await storage.saveUploadedFile("misc/note.png", "image/png", PNG_BYTES, a.merchantId);

    const res = await request(app).get("/uploads/misc/note.png");

    expect(res.status).toBe(404);
  });

  it("does not serve a legacy on-disk invoice document from the disk fallback either", async () => {
    const { app } = await createTestApp();
    const uploadsDir = path.join(process.cwd(), "uploads");
    const invoicesDir = path.join(uploadsDir, "invoices");
    const createdUploads = !fs.existsSync(uploadsDir);
    const createdInvoices = !fs.existsSync(invoicesDir);
    const probe = path.join(invoicesDir, "invoice-1700000000000-dddddddddddddddd.pdf");
    fs.mkdirSync(invoicesDir, { recursive: true });
    fs.writeFileSync(probe, PDF_BYTES);
    try {
      const res = await request(app).get("/uploads/invoices/invoice-1700000000000-dddddddddddddddd.pdf");
      expect(res.status).toBe(404);
    } finally {
      fs.rmSync(probe, { force: true });
      if (createdInvoices) fs.rmdirSync(invoicesDir);
      if (createdUploads) fs.rmdirSync(uploadsDir);
    }
  });
});

describe("gap 13 — GET /api/invoice-documents/:name is authenticated and ownership-checked", () => {
  it("lets the owning merchant read its own document, privately and without sniffing", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const { name } = await uploadInvoiceDocument(app, a);

    const res = await request(app)
      .get(`/api/invoice-documents/${name}`)
      .set(bearer(a))
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect((res.body as Buffer).equals(PDF_BYTES)).toBe(true);
  });

  it("lets a teammate of the owning merchant read it", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const member = await createMemberPrincipal(a.merchantId);
    const { name } = await uploadInvoiceDocument(app, a);

    const res = await request(app).get(`/api/invoice-documents/${name}`).set(bearer(member));

    expect(res.status).toBe(200);
  });

  it("gives another merchant a 404 — indistinguishable from a document that does not exist", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const b = await createOwnerPrincipal();
    const { name } = await uploadInvoiceDocument(app, a);

    const foreign = await request(app).get(`/api/invoice-documents/${name}`).set(bearer(b));
    const missing = await request(app)
      .get("/api/invoice-documents/invoice-1700000000000-eeeeeeeeeeeeeeee.pdf")
      .set(bearer(b));

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it("requires authentication", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const { name } = await uploadInvoiceDocument(app, a);

    const res = await request(app).get(`/api/invoice-documents/${name}`);

    expect(res.status).toBe(401);
  });

  it("does not let the platform admin bypass tenant scoping (default S1 — fail closed)", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const admin = createAdminPrincipal();
    const { name } = await uploadInvoiceDocument(app, a);

    const res = await request(app)
      .get(`/api/invoice-documents/${name}`)
      .set(bearer(admin))
      .buffer(true)
      .parse(binaryParser);

    // The admin principal has merchantId 0, which every tenant-bound route
    // already answers with its `!merchantId` guard (401); what matters here is
    // that the document is not served, whatever the refusal's status.
    expect([401, 403, 404]).toContain(res.status);
    expect((res.body as Buffer).equals(PDF_BYTES)).toBe(false);
  });

  it("only ever reads from the invoices folder: a logo cannot be fetched through it", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const upload = await request(app)
      .post(`/api/merchants/${a.merchantId}/logo`)
      .set(bearer(a))
      .attach("logo", PNG_BYTES, "logo.png");
    expect(upload.status).toBe(200);

    const res = await request(app)
      .get(`/api/invoice-documents/merchant-${a.merchantId}.png`)
      .set(bearer(a));

    expect(res.status).toBe(404);
  });

  it.each([
    ["path traversal", "..%2F..%2Fetc%2Fpasswd"],
    ["a name that is not generator-shaped", "bill.pdf"],
    ["an over-long extension", "invoice-1700000000000-ffffffffffffffff.abcdefghijklmnop"],
    ["a non-hex suffix", "invoice-1700000000000-gggggggggggggggg.pdf"],
  ])("answers a malformed name (%s) with 404, never 500", async (_label, name) => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();

    const res = await request(app).get(`/api/invoice-documents/${name}`).set(bearer(a));

    expect(res.status).toBe(404);
  });
});
