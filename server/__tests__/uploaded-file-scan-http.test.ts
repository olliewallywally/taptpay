import "./support/test-env";

import crypto from "crypto";
import request from "supertest";
import {
  createAdminPrincipal, createOwnerPrincipal, createTestApp, resetTestStorage, signedIn, storage, type Principal,
} from "./support/http-harness";
import { fakeProperty, seedProperty, TENANT } from "./support/property-fake";
import * as scanning from "../malware-scanner";

beforeEach(() => resetTestStorage());
afterEach(() => jest.restoreAllMocks());

const held = storage as any;
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("synthetic invoice document")]);
const stored = () => [...held.uploadedFileBlobs.keys()] as string[];
const newName = () => `invoice-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.pdf`;
const upload = (app: any, who: Principal, bytes: Buffer, contentType = "application/pdf") =>
  request(app).post("/api/property/invoices/document").set(signedIn(who)).attach("document", bytes, { filename: "bill.pdf", contentType });
const nameOf = (documentUrl: string) => documentUrl.split("/").pop()!;
const binary = (res: any, done: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => done(null, Buffer.concat(chunks)));
};

async function seed() {
  const { app } = await createTestApp();
  const owner = await createOwnerPrincipal();
  const other = await createOwnerPrincipal();
  return { app, owner, other };
}

describe("R1-T7 S6a — the upload is scanned before anything is stored", () => {
  test("a clean document is stored with its verdict and read back by its business", async () => {
    const { app, owner, other } = await seed();
    const res = await upload(app, owner, PDF);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ documentUrl: expect.stringMatching(/^\/uploads\/invoices\/invoice-\d+-[0-9a-f]{16}\.pdf$/), documentName: "bill.pdf" });
    const name = nameOf(res.body.documentUrl);
    expect(held.uploadedFileBlobs.get(`invoices/${name}`).scan).toMatchObject({ verdict: "clean", scanner: "simulation" });
    const read = await request(app).get(`/api/invoice-documents/${name}`).set(signedIn(owner)).buffer(true).parse(binary);
    expect(read.status).toBe(200);
    expect((read.body as Buffer).equals(PDF)).toBe(true);
    expect((await request(app).get(`/api/invoice-documents/${name}`).set(signedIn(other))).status).toBe(404);
  });

  test("a document the scanner blocks is refused and never stored", async () => {
    const { app, owner } = await seed();
    const res = await upload(app, owner, Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from(scanning.EICAR_TEST_FILE)]));
    expect({ status: res.status, body: res.body }).toEqual({
      status: 400, body: { message: "This file was blocked because it may be harmful.", code: "DOCUMENT_BLOCKED" },
    });
    expect(stored()).toEqual([]);
  });

  test.each([
    ["no scanner is configured", () => jest.spyOn(scanning, "getMalwareScanner").mockReturnValue(null)],
    ["the scanner cannot be reached", () => jest.spyOn(scanning, "getMalwareScanner").mockReturnValue({
      scan: async () => { throw new scanning.ScannerUnavailableError("synthetic outage"); },
    })],
    ["the scanner fails some other way", () => jest.spyOn(scanning, "getMalwareScanner").mockReturnValue({
      scan: async () => { throw new Error("synthetic fault"); },
    })],
    ["the scanner answers something that is no verdict", () => jest.spyOn(scanning, "getMalwareScanner").mockReturnValue({
      scan: async () => ({ verdict: "probably-fine", scanner: "broken" }) as any,
    })],
  ])("when %s the upload is refused as unavailable and nothing is stored", async (_what, arrange) => {
    const { app, owner } = await seed();
    arrange();
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await upload(app, owner, PDF);
    expect({ status: res.status, body: res.body }).toEqual({
      status: 503, body: { message: "Document scanning is temporarily unavailable. Please try again.", code: "DOCUMENT_SCAN_UNAVAILABLE" },
    });
    expect(stored()).toEqual([]);
    log.mockRestore();
  });

  test("the existing refusals come first: nothing is scanned that would be refused anyway", async () => {
    const { app, owner } = await seed();
    const scan = jest.fn(async () => ({ verdict: "clean", scanner: "spy" }) as const);
    jest.spyOn(scanning, "getMalwareScanner").mockReturnValue({ scan });
    expect((await upload(app, owner, Buffer.from("not actually a pdf"))).status).toBe(400);
    expect((await request(app).post("/api/property/invoices/document").set(signedIn(owner))).status).toBe(400);
    expect((await request(app).post("/api/property/invoices/document").attach("document", PDF, { filename: "bill.pdf", contentType: "application/pdf" })).status).toBe(401);
    expect(scan).not.toHaveBeenCalled();
    expect((await upload(app, owner, PDF)).status).toBe(200);
    expect(scan).toHaveBeenCalledTimes(1);
    expect((scan.mock.calls[0] as any[])[0].equals(PDF)).toBe(true);
  });
});

describe("R1-T7 S6a — a stored document with no clean scan is kept from every reader", () => {
  /** A document as one uploaded before scanning was: stored for its business, with no verdict. */
  async function unscanned(owner: Principal) {
    const name = newName();
    await storage.saveUploadedFile(`invoices/${name}`, "application/pdf", PDF, owner.merchantId);
    return name;
  }
  const blocked = (name: string) => {
    held.uploadedFileBlobs.get(`invoices/${name}`).scan = { verdict: "infected", scanner: "clamav", signature: "Synthetic.Test", scannedAt: new Date() };
  };
  const STATES = [
    ["never scanned", async (owner: Principal) => unscanned(owner)],
    ["scanned and blocked", async (owner: Principal) => { const name = await unscanned(owner); blocked(name); return name; }],
  ] as const;

  test.each(STATES)("%s: its own business and the platform admin are answered not found", async (_state, make) => {
    const { app, owner } = await seed();
    const admin = await createAdminPrincipal();
    const name = await make(owner);
    for (const who of [owner, admin]) {
      const res = await request(app).get(`/api/invoice-documents/${name}`).set(signedIn(who));
      expect({ status: res.status, body: res.body }).toEqual({ status: 404, body: { message: "Document not found" } });
    }
    // No bytes left the server, so no admin read was recorded.
    expect(held.documentAccessAudit).toEqual([]);
  });

  test.each(STATES)("%s: the payer's link shows no document and serves none", async (_state, make) => {
    const { app, owner } = await seed();
    const name = await make(owner);
    const token = crypto.randomBytes(20).toString("base64url");
    jest.spyOn(storage, "getInvoiceRentRequestByToken").mockImplementation(async (asked: string) => asked !== token ? undefined : {
      id: "prop-inv-1", merchantId: owner.merchantId, tenantProfileId: TENANT, token, status: "pending_dispatch", amountCents: 5000,
      dueAt: new Date(Date.now() + 86_400_000), kind: "charge", chargeType: "utilities", description: "Power",
      documentUrl: `/uploads/invoices/${name}`, documentName: "bill.pdf", splitEnabled: false, splitCount: null, splitPaidCount: 0, scheduleId: null,
    } as any);
    jest.spyOn(storage, "getJobInvoiceByToken").mockResolvedValue(undefined);
    jest.spyOn(storage, "getTenantProfile").mockResolvedValue({ id: TENANT, firstName: "Tess", lastName: "Tenant", propertyAddress: "1 Test Road", email: "tess@example.test", coTenantsText: null } as any);
    const page = await request(app).get(`/api/checkout/resolve/${token}`);
    expect(page.status).toBe(200);
    expect(page.body.documentUrl).toBeNull();
    const res = await request(app).get(`/api/checkout/document/${token}`);
    expect({ status: res.status, body: res.body }).toEqual({ status: 404, body: { message: "Document not found" } });
  });

  test.each(STATES)("%s: it cannot be attached to a property invoice or a trades quote", async (_state, make) => {
    const { app, owner } = await seed();
    const fake = fakeProperty();
    seedProperty(fake, owner.merchantId);
    const name = await make(owner);
    const documentUrl = `/uploads/invoices/${name}`;
    const invoice = await request(app).post("/api/property/invoices").set(signedIn(owner)).set("Idempotency-Key",crypto.randomUUID())
      .send({ tenantProfileId: TENANT, amountCents: 5000, deliveryChannel: "email", dueAt: new Date(Date.now() + 86_400_000).toISOString(), kind: "charge", chargeType: "utilities", description: "Power", documentUrl, documentName: "bill.pdf" });
    expect({ status: invoice.status, body: invoice.body }).toEqual({ status: 400, body: { message: "Invalid document attachment" } });
    const quote = await request(app).post("/api/trades/quotes").set(signedIn(owner))
      .send({ recipient: { name: "Sam Smith" }, lineItems: [{ description: "Tap", qty: 1, unitPriceCents: 5000, lineTotalCents: 5000 }], depositEnabled: false, deliveryChannel: "email", documentUrl, documentName: "bill.pdf" });
    expect({ status: quote.status, body: quote.body }).toEqual({ status: 400, body: { message: "Invalid document attachment" } });
    expect(fake.writes).toEqual([]);
  });

  test("a scanned document is attachable and served, as before", async () => {
    const { app, owner } = await seed();
    const name = nameOf((await upload(app, owner, PDF)).body.documentUrl);
    expect(await held.cleanUploadedFileOwnedByMerchant(`invoices/${name}`, owner.merchantId)).toBe(true);
    const admin = await createAdminPrincipal();
    const res = await request(app).get(`/api/invoice-documents/${name}`).set(signedIn(admin)).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect((res.body as Buffer).equals(PDF)).toBe(true);
    expect(held.documentAccessAudit).toHaveLength(1);
  });
});
