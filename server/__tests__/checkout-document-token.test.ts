import "./support/test-env";

import crypto from "crypto";
import request from "supertest";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";

/**
 * Gap 13, the tenant-facing half. The only reader of an attached invoice document
 * is the *unauthenticated* tenant on the public checkout page (checkout.tsx does
 * `window.open(invoiceData.documentUrl)`), authorized only by holding the
 * invoice's checkout token. Making invoice documents private (Option C) must not
 * break that: the token authorizes exactly the document attached to its own
 * invoice, and the resolve response hands the page that token-scoped URL instead
 * of the raw storage path.
 *
 * MemStorage stubs the property/trades token lookups (they return undefined), so
 * the lookups are spied on here, as mobile-quote-create.test.ts does for trades.
 */

const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("synthetic-fixture-token")]);

const binaryParser = (res: any, callback: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
};

// The per-token rate limiter lives for the whole app instance (one per test
// file), so every test uses a token of its own.
const newToken = () => crypto.randomBytes(20).toString("base64url");
const newDocName = () => `invoice-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.pdf`;

function propertyInvoice(merchantId: number, token: string, over: Record<string, unknown> = {}) {
  return {
    id: "prop-inv-1",
    merchantId,
    tenantProfileId: TENANT_ID,
    token,
    status: "pending_dispatch",
    amountCents: 5000,
    dueAt: new Date(Date.now() + 86_400_000),
    kind: "charge",
    chargeType: "utilities",
    description: "Power",
    documentUrl: null,
    documentName: null,
    splitEnabled: false,
    splitCount: null,
    splitPaidCount: 0,
    scheduleId: null,
    ...over,
  };
}

function tradesInvoice(merchantId: number, token: string, over: Record<string, unknown> = {}) {
  return {
    id: "job-inv-1",
    merchantId,
    clientProfileId: CLIENT_ID,
    token,
    status: "pending_dispatch",
    amountCents: 5000,
    dueAt: new Date(Date.now() + 86_400_000),
    kind: "full",
    jobDetails: "Fix the tap",
    quoteId: null,
    documentUrl: null,
    documentName: null,
    splitEnabled: false,
    splitCount: null,
    splitPaidCount: 0,
    ...over,
  };
}

function stubTokenLookups(opts: { property?: any; trades?: any }) {
  jest
    .spyOn(storage, "getInvoiceRentRequestByToken")
    .mockImplementation(async (t: string) => (opts.property && t === opts.property.token ? opts.property : undefined));
  jest
    .spyOn(storage, "getJobInvoiceByToken")
    .mockImplementation(async (t: string) => (opts.trades && t === opts.trades.token ? opts.trades : undefined));
  jest.spyOn(storage, "getTenantProfile").mockResolvedValue({
    id: TENANT_ID,
    firstName: "Tess",
    lastName: "Tenant",
    propertyAddress: "1 Test Road",
    email: "tess@example.test",
    coTenantsText: null,
  } as any);
  jest.spyOn(storage, "getClientProfile").mockResolvedValue({
    id: CLIENT_ID,
    firstName: "Sam",
    lastName: "Smith",
    siteAddress: "2 Site Road",
    email: "sam@example.test",
  } as any);
}

beforeEach(() => {
  resetTestStorage();
});

describe("gap 13 — GET /api/checkout/resolve/:token hands the page a token-scoped document URL", () => {
  it("returns the token route, never the raw storage path, when the document belongs to the invoice's merchant", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const name = newDocName();
    await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", PDF_BYTES, owner.merchantId);
    const token = newToken();
    stubTokenLookups({
      property: propertyInvoice(owner.merchantId, token, {
        documentUrl: `/uploads/invoices/${name}`,
        documentName: "bill.pdf",
      }),
    });

    const res = await request(app).get(`/api/checkout/resolve/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.documentUrl).toBe(`/api/checkout/document/${token}`);
    expect(res.body.documentName).toBe("bill.pdf");
    expect(JSON.stringify(res.body)).not.toContain("/uploads/");
  });

  it("returns null when the stored document belongs to a different merchant than the invoice", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const other = await createOwnerPrincipal();
    const name = newDocName();
    await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", PDF_BYTES, other.merchantId);
    const token = newToken();
    stubTokenLookups({
      property: propertyInvoice(owner.merchantId, token, {
        documentUrl: `/uploads/invoices/${name}`,
        documentName: "bill.pdf",
      }),
    });

    const res = await request(app).get(`/api/checkout/resolve/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.documentUrl).toBeNull();
    expect(res.body.documentName).toBeNull();
  });

  it.each([
    ["a file that no longer exists", `/uploads/invoices/${"invoice-1700000000000-0123456789abcdef.pdf"}`],
    ["a logo path", "/uploads/logos/merchant-1.png"],
    ["an external URL", "https://evil.example/bill.pdf"],
    ["a javascript: URI", "javascript:alert(1)"],
  ])("returns null for %s (legacy rows can hold anything)", async (_label, documentUrl) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = newToken();
    stubTokenLookups({ property: propertyInvoice(owner.merchantId, token, { documentUrl, documentName: "bill.pdf" }) });

    const res = await request(app).get(`/api/checkout/resolve/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.documentUrl).toBeNull();
    expect(res.body.documentName).toBeNull();
  });

  it("still loads the payment page — just without the document link — when the document lookup itself fails", async () => {
    // e.g. code deployed before migration 0023 (no merchant_id column): a document
    // problem must hide the link, never block a customer from paying.
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const name = newDocName();
    await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", PDF_BYTES, owner.merchantId);
    const token = newToken();
    stubTokenLookups({
      property: propertyInvoice(owner.merchantId, token, { documentUrl: `/uploads/invoices/${name}`, documentName: "bill.pdf" }),
    });
    jest.spyOn(storage, "uploadedFileOwnedByMerchant").mockRejectedValue(new Error("column merchant_id does not exist"));
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(app).get(`/api/checkout/resolve/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.amountCents).toBe(5000);
    expect(res.body.documentUrl).toBeNull();
    expect(res.body.documentName).toBeNull();
  });

  it("is unchanged for an invoice with no document", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = newToken();
    stubTokenLookups({ property: propertyInvoice(owner.merchantId, token) });

    const res = await request(app).get(`/api/checkout/resolve/${token}`);

    expect(res.status).toBe(200);
    expect(res.body.documentUrl).toBeNull();
    expect(res.body.documentName).toBeNull();
  });
});

describe("gap 13 — GET /api/checkout/document/:token", () => {
  it("serves the invoice's own document to an unauthenticated token holder, privately", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const name = newDocName();
    await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", PDF_BYTES, owner.merchantId);
    const token = newToken();
    stubTokenLookups({
      property: propertyInvoice(owner.merchantId, token, { documentUrl: `/uploads/invoices/${name}`, documentName: "bill.pdf" }),
    });

    const res = await request(app).get(`/api/checkout/document/${token}`).buffer(true).parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect((res.body as Buffer).equals(PDF_BYTES)).toBe(true);
  });

  it("serves a trades job invoice's document the same way", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const name = newDocName();
    await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", PDF_BYTES, owner.merchantId);
    const token = newToken();
    stubTokenLookups({
      trades: tradesInvoice(owner.merchantId, token, { documentUrl: `/uploads/invoices/${name}`, documentName: "quote.pdf" }),
    });

    const res = await request(app).get(`/api/checkout/document/${token}`).buffer(true).parse(binaryParser);

    expect(res.status).toBe(200);
    expect((res.body as Buffer).equals(PDF_BYTES)).toBe(true);
  });

  it("answers an unknown token with 404", async () => {
    const { app } = await createTestApp();
    stubTokenLookups({});

    const res = await request(app).get(`/api/checkout/document/${newToken()}`);

    expect(res.status).toBe(404);
  });

  it("answers a voided invoice with 410, as resolve does", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const name = newDocName();
    await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", PDF_BYTES, owner.merchantId);
    const token = newToken();
    stubTokenLookups({
      property: propertyInvoice(owner.merchantId, token, { status: "voided", documentUrl: `/uploads/invoices/${name}` }),
    });

    const res = await request(app).get(`/api/checkout/document/${token}`);

    expect(res.status).toBe(410);
  });

  it.each(["paid", "paid_external"])("exposes nothing for a %s invoice (resolve shows no document there either)", async (status) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const name = newDocName();
    await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", PDF_BYTES, owner.merchantId);
    const token = newToken();
    stubTokenLookups({
      property: propertyInvoice(owner.merchantId, token, { status, documentUrl: `/uploads/invoices/${name}` }),
    });

    const res = await request(app).get(`/api/checkout/document/${token}`);

    expect(res.status).toBe(404);
  });

  it("answers 404 when the invoice has no document", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = newToken();
    stubTokenLookups({ property: propertyInvoice(owner.merchantId, token) });

    const res = await request(app).get(`/api/checkout/document/${token}`);

    expect(res.status).toBe(404);
  });

  it("refuses a document that belongs to a different merchant than the invoice (cross-tenant reference)", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const other = await createOwnerPrincipal();
    const name = newDocName();
    await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", PDF_BYTES, other.merchantId);
    const token = newToken();
    stubTokenLookups({
      property: propertyInvoice(owner.merchantId, token, { documentUrl: `/uploads/invoices/${name}`, documentName: "bill.pdf" }),
    });

    const res = await request(app).get(`/api/checkout/document/${token}`).buffer(true).parse(binaryParser);

    expect(res.status).toBe(404);
    expect((res.body as Buffer).equals(PDF_BYTES)).toBe(false);
  });

  it("never serves a logo, whatever a legacy row's documentUrl says", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    await storage.saveUploadedFile(`logos/merchant-${owner.merchantId}.png`, "image/png", Buffer.from([0x89, 0x50]), owner.merchantId);
    const token = newToken();
    stubTokenLookups({
      property: propertyInvoice(owner.merchantId, token, { documentUrl: `/uploads/logos/merchant-${owner.merchantId}.png` }),
    });

    const res = await request(app).get(`/api/checkout/document/${token}`);

    expect(res.status).toBe(404);
  });

  it("is rate limited per token under its own budget, leaving the page's own requests unaffected", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const name = newDocName();
    await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", PDF_BYTES, owner.merchantId);
    const token = newToken();
    stubTokenLookups({
      property: propertyInvoice(owner.merchantId, token, { documentUrl: `/uploads/invoices/${name}`, documentName: "bill.pdf" }),
    });

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await request(app).get(`/api/checkout/document/${token}`)).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);

    const resolve = await request(app).get(`/api/checkout/resolve/${token}`);
    expect(resolve.status).toBe(200);
  });
});
