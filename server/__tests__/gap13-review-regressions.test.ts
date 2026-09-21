import "./support/test-env";
import request from "supertest";
import express from "express";
import { bearer, createAdminPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";
import * as billing from "../billing-card";
import * as delivery from "../trades-delivery";
import { DOCUMENT_READ_GLOBAL_LIMIT, DOCUMENT_READ_TOKEN_LIMIT, DOCUMENT_READ_WINDOW_MS } from "../invoice-document-security";

beforeEach(() => resetTestStorage());

it.each(["bill.", "bill.abcdefghijklmnop", "bill.p-df", "bill.PDF", "bill"])(
  "a successful PDF upload named %s remains readable and attachable", async (filename) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    jest.spyOn(billing, "billingCardIsReady").mockReturnValue(true);
    jest.spyOn(storage, "createClientProfile").mockImplementation(async (data: any) => ({ ...data, id: "client" }));
    jest.spyOn(storage, "createQuote").mockImplementation(async (data: any) => ({ ...data, id: "quote" }));
    jest.spyOn(storage, "createJobEvent").mockResolvedValue({} as any);
    jest.spyOn(delivery, "sendTradeQuote").mockResolvedValue({ sent: false, reason: "no-contact" } as any);
    const uploaded = await request(app).post("/api/property/invoices/document")
      .set(bearer(owner)).attach("document", Buffer.from("%PDF-1.4\nsynthetic"),
        { filename, contentType: "application/pdf" });
    expect(uploaded.status).toBe(200);
    const name = uploaded.body.documentUrl.split("/").pop();
    const read = await request(app).get(`/api/invoice-documents/${name}`).set(bearer(owner));
    const attach = await request(app).post("/api/trades/quotes").set(bearer(owner)).send({
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
  const response = await request(app).get(`/api/invoice-documents/${name}`).set(bearer(createAdminPrincipal()));
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
  const own = await request(app).get(`/api/invoice-documents/${name}`).set(bearer(owner));
  expect(own.status).toBe(200);
  expect(audit).not.toHaveBeenCalled();
  const send = jest.spyOn(express.response, "send");
  let responded = false;
  const admin = createAdminPrincipal();
  const pending = request(app).get(`/api/invoice-documents/${name}`).set(bearer(admin)).then(response => {
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

it("fails closed before a token lookup when the shared document limiter is unavailable", async () => {
  const { app } = await createTestApp();
  jest.spyOn(storage, "consumeInvoiceDocumentReadLimit").mockRejectedValue(new Error("synthetic limiter outage"));
  const lookup = jest.spyOn(storage, "getInvoiceRentRequestByToken");
  const response = await request(app).get("/api/checkout/document/synthetic-token");
  expect(response.status).toBe(503);
  expect(lookup).not.toHaveBeenCalled();
});

it("aggregate document throttling covers distinct tokens before lookup", async () => {
  const { app } = await createTestApp();
  jest.spyOn(storage, "consumeInvoiceDocumentReadLimit").mockResolvedValue(false);
  const lookup = jest.spyOn(storage, "getInvoiceRentRequestByToken");
  for (const token of ["first", "second"]) {
    const response = await request(app).get(`/api/checkout/document/${token}`);
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("60");
  }
  expect(lookup).not.toHaveBeenCalled();
});

it("the in-memory limiter preserves token and aggregate budgets and expires them", async () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  for (let i = 0; i < DOCUMENT_READ_TOKEN_LIMIT; i++) {
    expect(await storage.consumeInvoiceDocumentReadLimit("one-token")).toBe(true);
  }
  expect(await storage.consumeInvoiceDocumentReadLimit("one-token")).toBe(false);
  // Denied per-token attempts consume aggregate budget too.
  for (let i = DOCUMENT_READ_TOKEN_LIMIT + 1; i < DOCUMENT_READ_GLOBAL_LIMIT; i++) {
    expect(await storage.consumeInvoiceDocumentReadLimit(`different-${i}`)).toBe(true);
  }
  expect(await storage.consumeInvoiceDocumentReadLimit("new-token")).toBe(false);
  now.mockReturnValue(1_000_000 + DOCUMENT_READ_WINDOW_MS);
  expect(await storage.consumeInvoiceDocumentReadLimit("one-token")).toBe(true);
});
