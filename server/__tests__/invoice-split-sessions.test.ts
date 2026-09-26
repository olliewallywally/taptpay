import "./support/test-env";

let mockSessionCounter = 0;
jest.mock("../windcave", () => {
  const actual = jest.requireActual("../windcave");
  return {
    ...actual,
    isWindcaveConfigured: () => true,
    createWindcaveSession: jest.fn(async () => {
      mockSessionCounter += 1;
      return {
        success: true,
        sessionId: `opened-session-${mockSessionCounter}`,
        ajaxSubmitCardUrl: "https://uat.windcave.com/card",
        ajaxSubmitApplePayUrl: "https://uat.windcave.com/apple",
        ajaxSubmitGooglePayUrl: "https://uat.windcave.com/google",
      };
    }),
    queryWindcaveSession: jest.fn(async () => ({ success: true, approved: true, windcaveTransactionId: "provider-tx" })),
    submitGooglePayToken: jest.fn(async () => ({ approved: true, windcaveTransactionId: "provider-gpay" })),
  };
});

jest.mock("../gst-invoice", () => ({
  ...jest.requireActual("../gst-invoice"),
  sendGstInvoices: jest.fn(async () => true),
}));

import crypto from "crypto";
import request from "supertest";
import * as gst from "../gst-invoice";
import * as windcave from "../windcave";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage } from "./support/http-harness";

/**
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 1):
 * each share of a split invoice remembers its own payment session, and only that session can pay
 * it. Before (C10 batch 3a), a split invoice recorded none of the sessions opened for it, so its
 * completion checked only that the provider approved whatever session the page sent: any approved
 * session on the platform's shared provider account (another invoice's share, a $1 purchase
 * anywhere) marked a share paid. The count could also change until a share was paid, and every
 * address anyone typed was sent the rent's GST invoice.
 *
 * MemStorage stubs the property and trades invoice methods, so those are spied on, as in
 * checkout-completion-session-binding.test.ts; the sessions opened are real MemStorage rows.
 */
const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const newToken = () => crypto.randomBytes(20).toString("base64url");

function splitRent(merchantId: number, token: string, over: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    merchantId,
    tenantProfileId: TENANT_ID,
    token,
    status: "sent",
    amountCents: 100_000,
    splitEnabled: true,
    splitCount: 3,
    splitPaidCount: 0,
    splitPaidSessions: [],
    splitPayerEmails: [],
    windcaveSessionId: null,
    ...over,
  };
}

function splitJob(merchantId: number, token: string, over: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    merchantId,
    clientProfileId: CLIENT_ID,
    token,
    status: "sent",
    amountCents: 90_000,
    splitEnabled: true,
    splitCount: 2,
    splitPaidCount: 0,
    splitPaidSessions: [],
    splitPayerEmails: [],
    windcaveSessionId: null,
    ...over,
  };
}

/** Invoice reads and writes, spied; each split claim hands back the next share. */
function stubInvoices(opts: { rent?: any; otherRent?: any; job?: any }) {
  const rents = [opts.rent, opts.otherRent].filter(Boolean);
  jest.spyOn(storage, "getInvoiceRentRequestByToken").mockImplementation(async (t: string) => rents.find((r) => r.token === t));
  jest.spyOn(storage, "getInvoiceRentRequest").mockImplementation(async (id: string) => rents.find((r) => r.id === id));
  jest.spyOn(storage, "getJobInvoiceByToken").mockImplementation(async (t: string) =>
    opts.job && t === opts.job.token ? opts.job : undefined);
  jest.spyOn(storage, "getJobInvoice").mockImplementation(async (id: string) =>
    opts.job && id === opts.job.id ? opts.job : undefined);
  jest.spyOn(storage, "getInvoiceRentRequestByWindcaveSessionId").mockResolvedValue(undefined);
  jest.spyOn(storage, "getJobInvoiceByWindcaveSessionId").mockResolvedValue(undefined);
  const rentWrites = jest.spyOn(storage, "updateInvoiceRentRequest").mockImplementation(async (id: string, updates: any) => {
    const invoice = rents.find((r) => r.id === id);
    Object.assign(invoice, updates);
    return invoice;
  });
  const jobWrites = jest.spyOn(storage, "updateJobInvoice").mockImplementation(async (_id: string, updates: any) => {
    Object.assign(opts.job, updates);
    return opts.job;
  });
  const claim = (invoice: any, sessionId: string) => {
    if (!invoice || invoice.splitPaidSessions.includes(sessionId) || invoice.splitPaidCount >= invoice.splitCount) return null;
    invoice.splitPaidSessions = [...invoice.splitPaidSessions, sessionId];
    invoice.splitPaidCount += 1;
    return { ...invoice };
  };
  const rentClaims = jest.spyOn(storage, "atomicClaimSplitShare").mockImplementation(async (id: string, sessionId: string) =>
    claim(rents.find((r) => r.id === id), sessionId));
  const jobClaims = jest.spyOn(storage, "atomicClaimJobSplitShare").mockImplementation(async (id: string, sessionId: string) =>
    claim(opts.job?.id === id ? opts.job : undefined, sessionId));
  jest.spyOn(storage, "getTenantProfile").mockResolvedValue({
    id: TENANT_ID, firstName: "Tess", lastName: "Tenant", propertyAddress: "1 Test Road", email: "tess@example.test", coTenantsText: null,
  } as any);
  jest.spyOn(storage, "getClientProfile").mockResolvedValue({
    id: CLIENT_ID, firstName: "Sam", lastName: "Smith", siteAddress: "2 Site Road", email: "sam@example.test",
  } as any);
  jest.spyOn(storage, "logTransactionEvent").mockResolvedValue(undefined as any);
  jest.spyOn(storage, "createJobEvent").mockResolvedValue(undefined as any);
  return { rentWrites, jobWrites, rentClaims, jobClaims };
}

async function openSession(app: any, token: string, payerEmail?: string) {
  const res = await request(app).post(`/api/checkout/${token}/session`).send(payerEmail ? { payerEmail } : {});
  expect(res.status).toBe(200);
  return res.body.sessionId as string;
}

const providerQueries = () => (windcave.queryWindcaveSession as jest.Mock).mock.calls.length;

beforeEach(() => {
  resetTestStorage();
});

describe("a split invoice's share is paid only by a session opened for it", () => {
  describe.each([
    ["hosted-fields-complete", {}],
    ["googlepay-complete", { googlePayToken: { signature: "x" } }],
  ])("POST /api/checkout/:token/%s", (route, extra) => {
    it("refuses a session nobody opened for this invoice, before asking the provider", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const token = newToken();
      const { rentClaims } = stubInvoices({ rent: splitRent(owner.merchantId, token) });
      await openSession(app, token);

      const res = await request(app).post(`/api/checkout/${token}/${route}`).send({ sessionId: "someone-elses-approved-session", ...extra });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: "Session ID mismatch" });
      expect(providerQueries()).toBe(0);
      expect(rentClaims).not.toHaveBeenCalled();
    });

    it("refuses a session opened for another invoice", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const token = newToken();
      const otherToken = newToken();
      const { rentClaims } = stubInvoices({
        rent: splitRent(owner.merchantId, token),
        otherRent: splitRent(owner.merchantId, otherToken, { id: "55555555-5555-4555-8555-555555555555" }),
      });
      const theirs = await openSession(app, otherToken);

      const res = await request(app).post(`/api/checkout/${token}/${route}`).send({ sessionId: theirs, ...extra });

      expect(res.status).toBe(403);
      expect(rentClaims).not.toHaveBeenCalled();
    });

    it("pays one share with a session opened for it, once", async () => {
      const { app } = await createTestApp();
      const owner = await createOwnerPrincipal();
      const token = newToken();
      const invoice = splitRent(owner.merchantId, token);
      stubInvoices({ rent: invoice });
      const mine = await openSession(app, token, "flatmate@example.test");

      const paid = await request(app).post(`/api/checkout/${token}/${route}`).send({ sessionId: mine, ...extra });
      const again = await request(app).post(`/api/checkout/${token}/${route}`).send({ sessionId: mine, ...extra });

      expect(paid.status).toBe(200);
      expect(paid.body).toMatchObject({ approved: true, splitPaidCount: 1 });
      expect(again.body.splitPaidCount).toBe(1);
      expect(invoice.splitPaidSessions).toEqual([mine]);
      expect((await storage.getInvoiceSplitSession(mine))?.paidAt).toBeInstanceOf(Date);
    });
  });

  it("holds a trades invoice's shares to the sessions opened for it, too", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = newToken();
    const { jobClaims } = stubInvoices({ job: splitJob(owner.merchantId, token) });
    const mine = await openSession(app, token);

    const foreign = await request(app).post(`/api/checkout/${token}/hosted-fields-complete`).send({ sessionId: "someone-elses-approved-session" });
    const paid = await request(app).post(`/api/checkout/${token}/hosted-fields-complete`).send({ sessionId: mine });

    expect(foreign.status).toBe(403);
    expect(paid.status).toBe(200);
    expect(jobClaims.mock.calls.map((call) => call[1])).toEqual([mine]);
  });
});

describe("what a split invoice's sessions change", () => {
  it("locks the split count once a session has been opened", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = newToken();
    stubInvoices({ rent: splitRent(owner.merchantId, token) });

    expect((await request(app).post(`/api/checkout/${token}/split`).send({ count: 4 })).status).toBe(200);
    await openSession(app, token);
    const changed = await request(app).post(`/api/checkout/${token}/split`).send({ count: 2 });

    expect(changed.status).toBe(409);
    expect(changed.body.message).toMatch(/started paying/i);
  });

  it("keeps each payer's email with their own session, not on a list for the invoice", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = newToken();
    const { rentWrites } = stubInvoices({ rent: splitRent(owner.merchantId, token) });

    const session = await openSession(app, token, "Flatmate@Example.test");

    expect(rentWrites.mock.calls.some(([, updates]: any[]) => "splitPayerEmails" in updates)).toBe(false);
    expect(await storage.getInvoiceSplitSession(session)).toMatchObject({
      payerEmail: "flatmate@example.test",
      amountCents: 33_333,
      paidAt: null,
    });
  });

  it("sends the rent's GST invoice to the tenant and the payers who paid, not to every address typed", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = newToken();
    const invoice = splitRent(owner.merchantId, token, { splitCount: 2, splitPayerEmails: ["stranger@example.test"] });
    stubInvoices({ rent: invoice });

    const first = await openSession(app, token, "first@example.test");
    await openSession(app, token, "abandoned@example.test");
    const second = await openSession(app, token, "second@example.test");
    for (const sessionId of [first, second]) {
      expect((await request(app).post(`/api/checkout/${token}/hosted-fields-complete`).send({ sessionId })).status).toBe(200);
    }

    const sends = (gst.sendGstInvoices as jest.Mock).mock.calls;
    expect(sends).toHaveLength(1);
    expect([...sends[0][0].recipients].sort()).toEqual(["first@example.test", "second@example.test", "tess@example.test"]);
    expect(invoice.status).toBe("paid");
  });

  it("records a share paid after the shares were all paid, for a refund, and changes nothing else", async () => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = newToken();
    const invoice = splitRent(owner.merchantId, token, { splitCount: 2 });
    stubInvoices({ rent: invoice });
    const sessions = [await openSession(app, token), await openSession(app, token), await openSession(app, token)];

    for (const sessionId of sessions) {
      await request(app).post(`/api/checkout/${token}/hosted-fields-complete`).send({ sessionId });
    }

    expect(invoice).toMatchObject({ status: "paid", splitPaidCount: 2, splitPaidSessions: sessions.slice(0, 2) });
    const events = (storage.logTransactionEvent as jest.Mock).mock.calls.map(([event]) => event.eventType);
    expect(events.filter((type) => type === "Split_Share_Unrecorded")).toHaveLength(1);
    expect((await storage.getInvoiceSplitSession(sessions[2]))?.paidAt).toBeNull();
  });

  it.each([
    ["rent", "/api/windcave/rent-notification"],
    ["trades", "/api/windcave/trades-notification"],
  ])("lets the provider's %s notification settle a share by its session", async (vertical, notification) => {
    const { app } = await createTestApp();
    const owner = await createOwnerPrincipal();
    const token = newToken();
    const stubs = vertical === "rent"
      ? stubInvoices({ rent: splitRent(owner.merchantId, token) })
      : stubInvoices({ job: splitJob(owner.merchantId, token) });
    const mine = await openSession(app, token);

    await request(app).post(`${notification}?sessionId=${mine}`).send({});
    await request(app).post(`${notification}?sessionId=someone-elses-approved-session`).send({});
    await new Promise((resolve) => setTimeout(resolve, 50));

    const claims = vertical === "rent" ? stubs.rentClaims : stubs.jobClaims;
    expect(claims.mock.calls.map((call) => call[1])).toEqual([mine]);
  });
});
