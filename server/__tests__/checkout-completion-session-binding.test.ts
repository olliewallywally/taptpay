import "./support/test-env";

jest.mock("../windcave", () => {
  const actual = jest.requireActual("../windcave");
  return {
    ...actual,
    isWindcaveConfigured: () => true,
    queryWindcaveSession: jest.fn(async () => ({ success: true, approved: true, windcaveTransactionId: "provider-tx" })),
    submitGooglePayToken: jest.fn(async () => ({ approved: true, windcaveTransactionId: "provider-gpay" })),
  };
});

import crypto from "crypto";
import request from "supertest";
import * as windcave from "../windcave";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";

/**
 * C10 route review, batch 3a (2026-09-26): the invoice checkout's completions
 * (POST /api/checkout/:token/hosted-fields-complete and …/googlepay-complete)
 * compared the session the page sends with the invoice's own session only when
 * one was recorded. A single-payment invoice nobody had started paying has
 * none, so any approved session on the platform's shared provider account (a
 * $1 purchase anywhere) marked the whole invoice paid. R1-T7 (4183e241) closed
 * the same hole on the numbered sale routes by making the check unconditional;
 * these routes now do the same: no recorded session, or a different one, is
 * refused before the provider is asked anything.
 *
 * MemStorage stubs the property and trades invoice methods, so they are spied
 * on here, as checkout-document-token.test.ts does.
 */

const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

// The per-token rate limiter lives for the whole app instance, so every test
// uses a token of its own.
const newToken = () => crypto.randomBytes(20).toString("base64url");

function rentInvoice(merchantId: number, token: string, over: Record<string, unknown> = {}) {
  return {
    id: "prop-inv-1",
    merchantId,
    tenantProfileId: TENANT_ID,
    token,
    status: "sent",
    amountCents: 200_000,
    splitEnabled: false,
    splitCount: null,
    splitPaidCount: 0,
    windcaveSessionId: null,
    ...over,
  };
}

function jobInvoice(merchantId: number, token: string, over: Record<string, unknown> = {}) {
  return {
    id: "job-inv-1",
    merchantId,
    clientProfileId: CLIENT_ID,
    token,
    status: "sent",
    amountCents: 90_000,
    splitEnabled: false,
    splitCount: null,
    splitPaidCount: 0,
    windcaveSessionId: null,
    ...over,
  };
}

function stubInvoices(opts: { rent?: any; job?: any }) {
  jest.spyOn(storage, "getInvoiceRentRequestByToken").mockImplementation(async (t: string) =>
    opts.rent && t === opts.rent.token ? opts.rent : undefined);
  jest.spyOn(storage, "getJobInvoiceByToken").mockImplementation(async (t: string) =>
    opts.job && t === opts.job.token ? opts.job : undefined);
  jest.spyOn(storage, "getInvoiceRentRequest").mockImplementation(async (id: string) =>
    opts.rent && id === opts.rent.id ? opts.rent : undefined);
  jest.spyOn(storage, "getJobInvoice").mockImplementation(async (id: string) =>
    opts.job && id === opts.job.id ? opts.job : undefined);
  const rentWrites = jest.spyOn(storage, "updateInvoiceRentRequest").mockImplementation(async (_id: string, updates: any) =>
    ({ ...opts.rent, ...updates }));
  const jobWrites = jest.spyOn(storage, "updateJobInvoice").mockImplementation(async (_id: string, updates: any) =>
    ({ ...opts.job, ...updates }));
  jest.spyOn(storage, "getTenantProfile").mockResolvedValue({
    id: TENANT_ID, firstName: "Tess", lastName: "Tenant", propertyAddress: "1 Test Road", email: "tess@example.test", coTenantsText: null,
  } as any);
  jest.spyOn(storage, "getClientProfile").mockResolvedValue({
    id: CLIENT_ID, firstName: "Sam", lastName: "Smith", siteAddress: "2 Site Road", email: "sam@example.test",
  } as any);
  return { rentWrites, jobWrites };
}

const providerQueries = () => (windcave.queryWindcaveSession as jest.Mock).mock.calls.length;
const googlePaySubmits = () => (windcave.submitGooglePayToken as jest.Mock).mock.calls.length;

// The server project restores spies and clears every mock's calls before each test.
beforeEach(() => {
  resetTestStorage();
});

describe("a single-payment invoice completes only with the session opened for it", () => {
  describe.each([
    ["hosted-fields-complete", { sessionId: "someone-elses-approved-session" }],
    ["googlepay-complete", { sessionId: "someone-elses-approved-session", googlePayToken: { signature: "x" } }],
  ])("POST /api/checkout/:token/%s", (route, body) => {
    it("refuses a rent invoice nobody has started paying, before asking the provider, and writes nothing", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const token = newToken();
      const { rentWrites } = stubInvoices({ rent: rentInvoice(owner.merchantId, token) });

      const res = await request(app).post(`/api/checkout/${token}/${route}`).send(body);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: "Session ID mismatch" });
      expect(providerQueries()).toBe(0);
      expect(googlePaySubmits()).toBe(0);
      expect(rentWrites).not.toHaveBeenCalled();
    });

    it("refuses a trades invoice nobody has started paying, before asking the provider, and writes nothing", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const token = newToken();
      const { jobWrites } = stubInvoices({ job: jobInvoice(owner.merchantId, token) });

      const res = await request(app).post(`/api/checkout/${token}/${route}`).send(body);

      expect(res.status).toBe(403);
      expect(providerQueries()).toBe(0);
      expect(jobWrites).not.toHaveBeenCalled();
    });

    it("refuses a session other than the one opened for the invoice", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const token = newToken();
      const { rentWrites } = stubInvoices({ rent: rentInvoice(owner.merchantId, token, { windcaveSessionId: "session-opened" }) });

      const res = await request(app).post(`/api/checkout/${token}/${route}`).send(body);

      expect(res.status).toBe(403);
      expect(providerQueries()).toBe(0);
      expect(rentWrites).not.toHaveBeenCalled();
    });

    it("completes with the session opened for the invoice", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const token = newToken();
      const { rentWrites } = stubInvoices({ rent: rentInvoice(owner.merchantId, token, { windcaveSessionId: "session-opened" }) });

      const res = await request(app).post(`/api/checkout/${token}/${route}`).send({ ...body, sessionId: "session-opened" });

      expect(res.status).toBe(200);
      expect(res.body.approved).toBe(true);
      expect(rentWrites).toHaveBeenCalledWith("prop-inv-1", expect.objectContaining({ status: "paid" }));
    });
  });
});

describe("POST /api/checkout/:token/split takes a whole number of people from 2 to 12, nothing else", () => {
  it.each([
    ["a number in a string", { count: "3" }],
    ["a fraction", { count: 2.5 }],
    ["trailing text", { count: "3 people" }],
    ["an extra field", { count: 3, splitEnabled: true }],
    ["too many people", { count: 13 }],
    ["no count", {}],
  ])("refuses %s and changes nothing", async (_label, body) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = newToken();
    const { rentWrites } = stubInvoices({ rent: rentInvoice(owner.merchantId, token, { splitEnabled: true }) });

    const res = await request(app).post(`/api/checkout/${token}/split`).send(body);

    expect(res.status).toBe(400);
    expect(rentWrites).not.toHaveBeenCalled();
  });

  it("sets the count the page sends", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = newToken();
    const { rentWrites } = stubInvoices({ rent: rentInvoice(owner.merchantId, token, { splitEnabled: true }) });

    const res = await request(app).post(`/api/checkout/${token}/split`).send({ count: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ splitCount: 3, splitPaidCount: 0, shareCents: 66_666 });
    expect(rentWrites).toHaveBeenCalledWith("prop-inv-1", { splitCount: 3 });
  });
});
