import "./support/test-env";
import crypto from "node:crypto";
import request from "supertest";
import express from "express";
import { signedIn, createAdminPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";
import * as billing from "../billing-card";
import * as delivery from "../trades-delivery";
import { DOCUMENT_READ_TOKEN_LIMIT, DOCUMENT_READ_WINDOW_MS } from "../invoice-document-security";

beforeEach(() => resetTestStorage());

it.each(["bill.", "bill.abcdefghijklmnop", "bill.p-df", "bill.PDF", "bill"])(
  "a successful PDF upload named %s remains readable and attachable", async (filename) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    jest.spyOn(billing, "billingCardIsReady").mockReturnValue(true);
    jest.spyOn(storage, "createClientProfileForMerchant").mockImplementation(async (merchantId, data) => ({ ...data, merchantId, id: "client" }));
    jest.spyOn(storage, "createQuote").mockImplementation(async (data: any) => ({ ...data, id: "quote" }));
    jest.spyOn(storage, "createJobEvent").mockResolvedValue({} as any);
    jest.spyOn(delivery, "sendTradeQuote").mockResolvedValue({ sent: false, reason: "no-contact" } as any);
    const uploaded = await request(app).post("/api/property/invoices/document")
      .set(signedIn(owner)).attach("document", Buffer.from("%PDF-1.4\nsynthetic"),
        { filename, contentType: "application/pdf" });
    expect(uploaded.status).toBe(200);
    const name = uploaded.body.documentUrl.split("/").pop();
    const read = await request(app).get(`/api/invoice-documents/${name}`).set(signedIn(owner));
    const attach = await request(app).post("/api/trades/quotes").set(signedIn(owner)).send({
      skipClient: true,
      lineItems: [{ description: "Repair", qty: 1, unitPriceCents: 10000, lineTotalCents: 10000 }],
      ...uploaded.body,
    });
    expect({ read: read.status, attach: attach.status }).toEqual({ read: 200, attach: 201 });
  },
);

it("does not serve an admin document when its durable audit write fails", async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const name = "invoice-1700000000000-aaaaaaaaaaaaaaaa.pdf";
  await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", Buffer.from("%PDF-secret"), owner.merchantId);
  jest.spyOn(storage, "recordInvoiceDocumentAdminRead").mockRejectedValue(new Error("synthetic audit outage"));
  const response = await request(app).get(`/api/invoice-documents/${name}`).set(signedIn(await createAdminPrincipal()));
  expect(response.status).toBe(503);
  expect(JSON.stringify(response.body)).not.toContain("secret");
});

it("awaits the admin audit commit before sending bytes and does not audit a tenant read", async () => {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const name = "invoice-1700000000000-dddddddddddddddd.pdf";
  await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", Buffer.from("%PDF-test"), owner.merchantId);
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const committed = new Promise<void>(resolve => { release = resolve; });
  const audit = jest.spyOn(storage, "recordInvoiceDocumentAdminRead").mockImplementation(async () => { entered(); await committed; });
  const own = await request(app).get(`/api/invoice-documents/${name}`).set(signedIn(owner));
  expect(own.status).toBe(200);
  expect(audit).not.toHaveBeenCalled();
  const send = jest.spyOn(express.response, "send");
  let responded = false;
  const admin = await createAdminPrincipal();
  const pending = request(app).get(`/api/invoice-documents/${name}`).set(signedIn(admin)).then(response => {
    responded = true;
    return response;
  });
  await started;
  try {
    expect(responded).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(admin.user.id, name);
  } finally { release(); }
  expect((await pending).status).toBe(200);
});

// Owner decision 2026-09-21 ("go ahead"): count only real invoices. The link is
// looked up first, so a made-up link never touches the shared budget and a flood
// of them cannot use it up for everyone else (the earlier design counted every
// request against one 600-a-minute pool before the lookup).

/** A real, unpaid property invoice carrying a document its own merchant uploaded. */
async function invoiceWithDocument() {
  const owner = await createOwnerPrincipal();
  const name = `invoice-1700000000000-${crypto.randomBytes(8).toString("hex")}.pdf`;
  await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", Buffer.from("%PDF-1.4\nsynthetic"), owner.merchantId);
  const token = crypto.randomBytes(20).toString("base64url");
  const invoice = { id: "prop-inv-budget", merchantId: owner.merchantId, token, status: "dispatched", kind: "charge",
    amountCents: 5000, documentUrl: `/uploads/invoices/${name}`, documentName: "bill.pdf" };
  jest.spyOn(storage, "getInvoiceRentRequestByToken").mockImplementation(async (t: string) => (t === token ? invoice as any : undefined));
  jest.spyOn(storage, "getJobInvoiceByToken").mockResolvedValue(undefined);
  return { token };
}

it("a made-up link is answered from the lookup alone and never touches the shared budget", async () => {
  const { app } = await createTestApp();
  await invoiceWithDocument();
  const consume = jest.spyOn(storage, "consumeInvoiceDocumentReadLimit");
  const response = await request(app).get(`/api/checkout/document/${crypto.randomBytes(20).toString("base64url")}`);
  expect(response.status).toBe(404);
  expect(consume).not.toHaveBeenCalled();
});

it("a flood of made-up links cannot switch off View invoice for a real customer", async () => {
  const { app } = await createTestApp();
  const { token } = await invoiceWithDocument();
  const junk: number[] = [];
  for (let i = 0; i <= 600; i++) junk.push((await request(app).get(`/api/checkout/document/junk-${i}`)).status);
  expect(junk.every((status) => status === 404)).toBe(true);
  expect((await request(app).get(`/api/checkout/document/${token}`)).status).toBe(200);
});

it("fails closed for a real invoice when the shared budget is unavailable, before reading the document", async () => {
  const { app } = await createTestApp();
  const { token } = await invoiceWithDocument();
  jest.spyOn(storage, "consumeInvoiceDocumentReadLimit").mockRejectedValue(new Error("synthetic limiter outage"));
  const read = jest.spyOn(storage, "getUploadedFileForMerchant");
  const response = await request(app).get(`/api/checkout/document/${token}`);
  expect(response.status).toBe(503);
  expect(read).not.toHaveBeenCalled();
});

it("a link that has used its budget answers 429 with Retry-After, without reading the document", async () => {
  const { app } = await createTestApp();
  const { token } = await invoiceWithDocument();
  jest.spyOn(storage, "consumeInvoiceDocumentReadLimit").mockResolvedValue(false);
  const read = jest.spyOn(storage, "getUploadedFileForMerchant");
  const response = await request(app).get(`/api/checkout/document/${token}`);
  expect(response.status).toBe(429);
  expect(response.headers["retry-after"]).toBe("60");
  expect(read).not.toHaveBeenCalled();
});

it("the in-memory limiter keeps a per-link budget, expires it, and has no platform-wide cap", async () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  for (let i = 0; i < DOCUMENT_READ_TOKEN_LIMIT; i++) {
    expect(await storage.consumeInvoiceDocumentReadLimit("one-token")).toBe(true);
  }
  expect(await storage.consumeInvoiceDocumentReadLimit("one-token")).toBe(false);
  const others: boolean[] = [];
  for (let i = 0; i < 1000; i++) others.push(await storage.consumeInvoiceDocumentReadLimit(`different-${i}`));
  expect(others.every(Boolean)).toBe(true);
  now.mockReturnValue(1_000_000 + DOCUMENT_READ_WINDOW_MS);
  expect(await storage.consumeInvoiceDocumentReadLimit("one-token")).toBe(true);
});
