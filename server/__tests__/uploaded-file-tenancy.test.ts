import "./support/test-env";

import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import request from "supertest";
import * as auth from "../auth";
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

/**
 * S1 (Oliver, 2026-09-19: "i want to see merchant documents"). The first
 * implementation kept the platform admin out by default; the owner overrode it.
 * The admin is the *validated* admin principal that authenticateToken already
 * insists on (dedicated principal + configured email + merchantId 0) — a bare
 * `role: "admin"` claim is not authority — and each read is written to the
 * security audit log, because these are tenants' financial documents.
 */
describe("gap 13 (S1) — the platform admin may open any merchant's invoice document, audited", () => {
  it("lets the validated platform admin read another merchant's document, privately", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const admin = createAdminPrincipal();
    const { name } = await uploadInvoiceDocument(app, a);

    const res = await request(app)
      .get(`/api/invoice-documents/${name}`)
      .set(bearer(admin))
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect((res.body as Buffer).equals(PDF_BYTES)).toBe(true);
  });

  it("reads the documents of every merchant, not one in particular", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const b = await createOwnerPrincipal();
    const admin = createAdminPrincipal();
    const docA = await uploadInvoiceDocument(app, a, Buffer.concat([PDF_BYTES, Buffer.from("-a")]));
    const docB = await uploadInvoiceDocument(app, b, Buffer.concat([PDF_BYTES, Buffer.from("-b")]));

    for (const doc of [docA, docB]) {
      const res = await request(app).get(`/api/invoice-documents/${doc.name}`).set(bearer(admin));
      expect(res.status).toBe(200);
    }
  });

  it("writes an audit event for an admin read — and none for a merchant reading its own document", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const admin = createAdminPrincipal();
    const { name } = await uploadInvoiceDocument(app, a);
    const log = jest.spyOn(auth, "logSecurityEvent").mockImplementation(() => undefined);

    const own = await request(app).get(`/api/invoice-documents/${name}`).set(bearer(a));
    expect(own.status).toBe(200);
    expect(log).not.toHaveBeenCalledWith("ADMIN_INVOICE_DOCUMENT_READ", expect.anything());

    const adminRead = await request(app).get(`/api/invoice-documents/${name}`).set(bearer(admin));
    expect(adminRead.status).toBe(200);
    expect(log).toHaveBeenCalledWith(
      "ADMIN_INVOICE_DOCUMENT_READ",
      expect.objectContaining({ adminUserId: admin.user.id, document: name }),
    );
    // Identifies who and which document; never what the document contains.
    const details = JSON.stringify(log.mock.calls.find(([event]) => event === "ADMIN_INVOICE_DOCUMENT_READ")?.[1]);
    expect(details).not.toContain("synthetic-fixture-a");
  });

  it("does not log an access when there was nothing to read", async () => {
    const { app } = await createTestApp();
    const admin = createAdminPrincipal();
    const log = jest.spyOn(auth, "logSecurityEvent").mockImplementation(() => undefined);

    const res = await request(app)
      .get("/api/invoice-documents/invoice-1700000000000-eeeeeeeeeeeeeeee.pdf")
      .set(bearer(admin));

    expect(res.status).toBe(404);
    expect(log).not.toHaveBeenCalledWith("ADMIN_INVOICE_DOCUMENT_READ", expect.anything());
  });

  it("gives the admin no wider reach through this route: malformed names and other folders stay 404", async () => {
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const admin = createAdminPrincipal();
    const upload = await request(app)
      .post(`/api/merchants/${a.merchantId}/logo`)
      .set(bearer(a))
      .attach("logo", PNG_BYTES, "logo.png");
    expect(upload.status).toBe(200);

    for (const name of [
      "..%2F..%2Fetc%2Fpasswd",
      "bill.pdf",
      `merchant-${a.merchantId}.png`, // a logo, not an invoice document
      "invoice-1700000000000-gggggggggggggggg.pdf",
    ]) {
      const res = await request(app).get(`/api/invoice-documents/${name}`).set(bearer(admin));
      expect(res.status).toBe(404);
    }
  });

  it("is still not reachable by a token that merely CLAIMS the admin role", async () => {
    // The unlock is the validated principal, not the word "admin": these are
    // rejected by authenticateToken before the route runs (JWT-signed with the
    // harness secret so they are genuine tokens carrying unvalidated claims).
    const { app } = await createTestApp();
    const a = await createOwnerPrincipal();
    const { name } = await uploadInvoiceDocument(app, a);
    const secret = process.env.JWT_SECRET as string;
    const adminEmail = createAdminPrincipal().user.email;
    const forged = [
      // a merchant-principal token that says role: admin
      { principal: "user", userId: a.user.id, email: a.user.email, merchantId: a.merchantId, role: "admin" },
      // the admin principal, but not the configured admin email
      { principal: "admin", userId: 1, email: "someone-else@harness.test", merchantId: 0, role: "admin" },
      // the admin principal and email, but scoped to a merchant
      { principal: "admin", userId: 1, email: adminEmail, merchantId: a.merchantId, role: "admin" },
    ];

    for (const claims of forged) {
      const res = await request(app)
        .get(`/api/invoice-documents/${name}`)
        .set({ Authorization: `Bearer ${jwt.sign(claims, secret, { expiresIn: "1h" })}` })
        .buffer(true)
        .parse(binaryParser);
      expect(res.status).toBe(401); // 401 since 2026-09-27 (R1-T3, P2.2, owner decision): a sign-in that is invalid, expired or disabled was 403.
      expect((res.body as Buffer).equals(PDF_BYTES)).toBe(false);
    }
  });
});

/**
 * Tripwire, not behaviour: the document route decides "is this the platform
 * admin?" with isValidatedPlatformAdmin(), while authenticateAdmin (whose exact
 * shape subscription-route-security.test.ts pins) decides it inline. They are the
 * same predicate written twice on purpose; if someone tightens or loosens one,
 * this fails and says the other must move with it.
 */
describe("gap 13 (S1) — the document route's admin predicate is authenticateAdmin's predicate", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
  const between = (from: string, to: string) => {
    const start = source.indexOf(from);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(to, start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  };

  it("checks exactly the same four things, in the same words", () => {
    const helper = between("function isValidatedPlatformAdmin", "\n  }\n");
    const guard = between("const authenticateAdmin", "\n  };");

    const helperClauses = helper
      .slice(helper.indexOf("return (") + "return (".length, helper.lastIndexOf(");"))
      .split("&&")
      .map((clause) => clause.trim());
    // The admin condition is the `if (` that follows `const adminEmail = ...` (an
    // earlier `if (!authenticated)` belongs to the token step, not the predicate).
    const afterEmail = guard.slice(guard.indexOf("const adminEmail = config.admin.email;"));
    const guardClauses = afterEmail
      .slice(afterEmail.indexOf("if (") + "if (".length, afterEmail.indexOf(") {\n      logSecurityEvent"))
      .split("||")
      .map((clause) => clause.trim());

    expect(helperClauses).toEqual([
      "!!user",
      'user.role === "admin"',
      "user.merchantId === 0",
      "!!adminEmail",
      "user.email.toLowerCase() === adminEmail.toLowerCase()",
    ]);
    expect(guardClauses).toEqual([
      'req.user?.role !== "admin"',
      "req.user.merchantId !== 0",
      "!adminEmail",
      "req.user.email.toLowerCase() !== adminEmail.toLowerCase()",
    ]);
  });
});
