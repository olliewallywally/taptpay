import "./support/test-env";

import request from "supertest";
import { bearer, createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";
import * as billing from "../billing-card";
import * as delivery from "../trades-delivery";
import * as propertyCron from "../property-cron";

/**
 * Gap 13: a tenant column on `uploaded_files` is only meaningful if the routes
 * that *reference* a stored document check it. Before this, the three create
 * routes (property invoice, trades quote, trades invoice) accepted any string up
 * to 500 characters as `documentUrl` — another merchant's document by name, an
 * external URL, even a `javascript:` URI — and the public checkout page later
 * opened it for the customer. Only the upload endpoint ever legitimately
 * produced a value.
 *
 * Route-level tests over MemStorage with the property/trades storage methods
 * stubbed (MemStorage deliberately throws "requires database" for those), the
 * same technique as mobile-quote-create.test.ts.
 */

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("synthetic-fixture-attach")]);
const dueAt = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

async function uploadDocument(app: any, principal: { token: string }) {
  const res = await request(app)
    .post("/api/property/invoices/document")
    .set(bearer(principal))
    .attach("document", PDF_BYTES, { filename: "bill.pdf", contentType: "application/pdf" });
  expect(res.status).toBe(200);
  return res.body as { documentUrl: string; documentName: string };
}

interface CreateRoute {
  label: string;
  path: string;
  body: (doc: { documentUrl?: string; documentName?: string }) => Record<string, unknown>;
  created: () => jest.Mock;
  /** Every other write the route makes; a rejected attachment must trigger none of them. */
  sideEffects: () => jest.Mock[];
}

const ROUTES: CreateRoute[] = [
  {
    label: "property invoice",
    path: "/api/property/invoices",
    body: (doc) => ({
      tenantProfileId: TENANT_ID,
      amountCents: 5000,
      deliveryChannel: "email",
      dueAt: dueAt(),
      kind: "charge",
      chargeType: "utilities",
      description: "Power",
      ...doc,
    }),
    created: () => storage.createInvoiceRentRequest as jest.Mock,
    sideEffects: () => [storage.logTransactionEvent as jest.Mock, propertyCron.resendInvoiceEmail as jest.Mock],
  },
  {
    label: "trades quote",
    path: "/api/trades/quotes",
    body: (doc) => ({
      skipClient: true,
      lineItems: [{ description: "Repair", qty: 1, unitPriceCents: 10000, lineTotalCents: 10000 }],
      ...doc,
    }),
    created: () => storage.createQuote as jest.Mock,
    sideEffects: () => [storage.createClientProfile as jest.Mock, storage.createJobEvent as jest.Mock, delivery.sendTradeQuote as jest.Mock],
  },
  {
    label: "trades invoice",
    path: "/api/trades/invoices",
    body: (doc) => ({
      recipient: { name: "Sam Smith", email: "sam@example.test", channel: "email" },
      amountCents: 5000,
      deliveryChannel: "email",
      dueAt: dueAt(),
      kind: "full",
      ...doc,
    }),
    created: () => storage.createJobInvoice as jest.Mock,
    sideEffects: () => [storage.createClientProfile as jest.Mock, storage.createJobEvent as jest.Mock, delivery.resendTradeInvoice as jest.Mock],
  },
];

beforeEach(() => {
  resetTestStorage();
  jest.spyOn(billing, "billingCardIsReady").mockReturnValue(true);
  jest.spyOn(delivery, "sendTradeQuote").mockResolvedValue({ sent: false, reason: "no-contact" } as any);
  jest.spyOn(delivery, "resendTradeInvoice").mockResolvedValue({ sent: false, reason: "no-contact" } as any);
  jest.spyOn(propertyCron, "resendInvoiceEmail").mockResolvedValue({ ok: false, reason: "test" });
  jest.spyOn(storage, "createClientProfile").mockImplementation(async (data: any) => ({ ...data, id: CLIENT_ID }));
  jest.spyOn(storage, "createQuote").mockImplementation(async (data: any) => ({ ...data, id: "quote-id" }));
  jest.spyOn(storage, "createJobInvoice").mockImplementation(async (data: any) => ({ ...data, id: "job-invoice-id" }));
  jest.spyOn(storage, "createJobEvent").mockResolvedValue({} as any);
  jest.spyOn(storage, "createInvoiceRentRequest").mockImplementation(async (data: any) => ({ ...data, id: "prop-invoice-id" }));
  jest.spyOn(storage, "logTransactionEvent").mockResolvedValue(undefined as any);
  jest.spyOn(storage, "getInvoiceRentRequest").mockImplementation(async (id: string) => ({ id, status: "pending_dispatch" }) as any);
});

describe.each(ROUTES)("gap 13 — $label create validates an attached document", (route) => {
  beforeEach(() => {
    // The property route resolves the tenant before anything else; scope it to
    // whichever merchant is calling.
    jest.spyOn(storage, "getTenantProfile").mockImplementation(async () => null as any);
  });

  async function callerWithTenant() {
    const owner = await createOwnerPrincipal();
    jest.spyOn(storage, "getTenantProfile").mockResolvedValue({
      id: TENANT_ID,
      merchantId: owner.merchantId,
      firstName: "Tess",
      lastName: "Tenant",
      propertyAddress: "1 Test Road",
      email: "tess@example.test",
    } as any);
    return owner;
  }

  it("accepts the caller's own uploaded document and stores the reference", async () => {
    const { app } = await createTestApp();
    const owner = await callerWithTenant();
    const doc = await uploadDocument(app, owner);

    const res = await request(app).post(route.path).set(bearer(owner)).send(route.body(doc));

    expect(res.status).toBe(201);
    expect(route.created()).toHaveBeenCalledWith(
      expect.objectContaining({ documentUrl: doc.documentUrl, documentName: doc.documentName }),
    );
  });

  it("is unchanged when no document is attached", async () => {
    const { app } = await createTestApp();
    const owner = await callerWithTenant();

    const res = await request(app).post(route.path).set(bearer(owner)).send(route.body({}));

    expect(res.status).toBe(201);
    expect(route.created()).toHaveBeenCalledTimes(1);
  });

  it("is unchanged for an empty-string document (the schema's existing 'no attachment' form)", async () => {
    const { app } = await createTestApp();
    const owner = await callerWithTenant();

    const res = await request(app)
      .post(route.path)
      .set(bearer(owner))
      .send(route.body({ documentUrl: "", documentName: "" }));

    expect(res.status).toBe(201);
  });

  it("rejects another merchant's document and writes nothing", async () => {
    const { app } = await createTestApp();
    const owner = await callerWithTenant();
    const other = await createOwnerPrincipal();
    const foreign = await uploadDocument(app, other);

    const res = await request(app).post(route.path).set(bearer(owner)).send(route.body(foreign));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid document attachment");
    expect(route.created()).not.toHaveBeenCalled();
    for (const effect of route.sideEffects()) expect(effect).not.toHaveBeenCalled();
  });

  it.each([
    ["an external URL", "https://evil.example/bill.pdf"],
    ["a javascript: URI", "javascript:alert(1)"],
    ["a logo path", "/uploads/logos/merchant-1.png"],
    ["a well-formed name that was never uploaded", "/uploads/invoices/invoice-1700000000000-0123456789abcdef.pdf"],
    ["a traversal", "/uploads/invoices/../logos/merchant-1.png"],
  ])("rejects %s and writes nothing", async (_label, documentUrl) => {
    const { app } = await createTestApp();
    const owner = await callerWithTenant();

    const res = await request(app)
      .post(route.path)
      .set(bearer(owner))
      .send(route.body({ documentUrl, documentName: "bill.pdf" }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid document attachment");
    expect(route.created()).not.toHaveBeenCalled();
    for (const effect of route.sideEffects()) expect(effect).not.toHaveBeenCalled();
  });
});
