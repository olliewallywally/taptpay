import "./support/test-env";
import "./support/resend-capture-env";

import crypto from "crypto";
import request from "supertest";
import * as tradesDelivery from "../trades-delivery";
import { createOwnerPrincipal, createTestApp, resetTestStorage, storage, useFakeClock } from "./support/http-harness";

/**
 * Owner decision 2026-09-25, answers 2a and 2b
 * (docs/decisions/2026-09-25-no-board-rework-402-and-batch-owner-answers.md).
 *
 * A customer accepting a quote while the business's subscription needs attention is
 * turned away. Before: the public route's 402 carried the business's own billing
 * message ("Your subscription needs attention… Open Billing in Settings."), and the
 * business was never told a ready customer had been turned away. Now the customer's
 * answer is in the customer's words, and the business is told by email, at most once
 * per quote per day.
 *
 * The in-memory store keeps no trades data, so the quote is stubbed; the route, the
 * billing check and the email run for real (the email through a captured `resend`).
 */

jest.setTimeout(30_000);

type Sent = { to: string | string[]; subject: string; html?: string; text?: string };
const mockSent: Sent[] = [];
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn(async (message: Sent) => {
        mockSent.push(message);
        return { data: { id: "captured" }, error: null };
      }),
    },
  })),
}));

const CUSTOMER_REFUSAL = {
  code: "QUOTE_ACCEPTANCE_UNAVAILABLE",
  message: "This quote can't be accepted online right now. Please contact the business to go ahead.",
};
const DAY_MS = 24 * 60 * 60 * 1000;

async function fixture(options: { billingInOrder?: boolean; firstName?: string } = {}) {
  const owner = await createOwnerPrincipal({ businessName: "Wallace Electrical", email: `owner.${crypto.randomUUID()}@wallace.test` });
  const quote = {
    id: crypto.randomUUID(),
    merchantId: owner.merchantId,
    clientProfileId: "client-1",
    token: `quote-${crypto.randomUUID()}`,
    status: "sent",
    totalCents: 115_000,
    depositEnabled: false,
    depositCents: null,
    deliveryChannel: "email",
    validUntil: new Date(Date.now() + 7 * DAY_MS),
  };
  jest.spyOn(storage, "getQuoteByToken").mockImplementation(async (token: string) =>
    token === quote.token ? { ...quote } : undefined,
  );
  jest.spyOn(storage, "getClientProfile").mockResolvedValue({
    id: "client-1", merchantId: owner.merchantId, firstName: options.firstName ?? "Jamie", lastName: "Smith",
  });
  const updateQuote = jest.spyOn(storage, "updateQuote").mockImplementation(async (_id: string, patch: any) => ({ ...quote, ...patch }));
  const createJobEvent = jest.spyOn(storage, "createJobEvent").mockResolvedValue({} as any);
  if (options.billingInOrder) {
    jest.spyOn(storage, "getOrCreateSubscription").mockResolvedValue({
      status: "active",
      lastBillingDate: new Date(Date.now() - DAY_MS),
      currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS),
    } as any);
    jest.spyOn(storage, "createJobInvoice").mockImplementation(async (data: any) => ({ id: "invoice-1", ...data }));
    jest.spyOn(tradesDelivery, "resendTradeInvoice").mockResolvedValue({ invoice: { id: "invoice-1" }, sent: false } as any);
  }
  const merchant = await storage.getMerchant(owner.merchantId);
  return { owner, merchant: merchant!, quote, updateQuote, createJobEvent };
}

async function respond(quote: { token: string }, accept: boolean) {
  const { app } = await createTestApp();
  return request(app).post(`/api/trades/quotes/token/${quote.token}/respond`).send({ accept });
}

describe("a customer accepting a quote while the business's subscription needs attention", () => {
  beforeEach(() => {
    resetTestStorage();
    mockSent.length = 0;
  });

  it("is turned away in the customer's words, with nothing about the business's billing", async () => {
    const { quote, updateQuote, createJobEvent } = await fixture();

    const response = await respond(quote, true);

    expect(response.status).toBe(402);
    expect(response.body).toEqual(CUSTOMER_REFUSAL);
    expect(JSON.stringify(response.body)).not.toMatch(/subscription|billing/i);
    expect(updateQuote).not.toHaveBeenCalled();
    expect(createJobEvent).not.toHaveBeenCalled();
  });

  it("tells the business by email: who tried, which quote, and where to sort it out", async () => {
    const { merchant, quote } = await fixture();

    await respond(quote, true);

    expect(mockSent).toHaveLength(1);
    const [email] = mockSent;
    expect(email.to).toBe(merchant.email);
    expect(email.subject).toBe("A customer tried to accept your quote");
    for (const part of [email.text!, email.html!]) {
      expect(part).toContain("Jamie Smith");
      expect(part).toContain("$1,150.00");
      expect(part).toContain("https://harness.test/settings?section=billing");
    }
  });

  it("emails the business at most once per quote per day", async () => {
    const clock = useFakeClock(new Date("2026-09-25T00:00:00.000Z"));
    try {
      const { quote } = await fixture();

      await respond(quote, true);
      await respond(quote, true);
      expect(mockSent).toHaveLength(1);

      clock.advance(DAY_MS + 1_000);
      await respond(quote, true);
      expect(mockSent).toHaveLength(2);
    } finally {
      clock.restore();
    }
  });

  it("keeps the client's name from adding markup to the email", async () => {
    const { quote } = await fixture({ firstName: "<b>Jamie</b>" });

    await respond(quote, true);

    expect(mockSent[0].html).toContain("&lt;b&gt;Jamie&lt;/b&gt; Smith");
    expect(mockSent[0].html).not.toContain("<b>Jamie</b>");
  });

  it("gives the customer the same answer when telling the business fails, and tries again next time", async () => {
    const { quote } = await fixture();
    const getMerchant = jest.spyOn(storage, "getMerchant").mockRejectedValueOnce(new Error("storage unavailable"));

    const response = await respond(quote, true);

    expect(response.status).toBe(402);
    expect(response.body).toEqual(CUSTOMER_REFUSAL);
    expect(mockSent).toHaveLength(0);

    // A notice that did not go out is not counted against the day.
    getMerchant.mockRestore();
    await respond(quote, true);
    expect(mockSent).toHaveLength(1);
  });

  it("lets a customer decline, and tells the business nothing new", async () => {
    const { quote, updateQuote } = await fixture();

    const response = await respond(quote, false);

    expect(response.status).toBe(200);
    expect(updateQuote).toHaveBeenCalledWith(quote.id, expect.objectContaining({ status: "declined" }));
    expect(mockSent).toHaveLength(0);
  });

  it("with the business's subscription in order, accepts the quote and sends no such email", async () => {
    const { quote, updateQuote } = await fixture({ billingInOrder: true });

    const response = await respond(quote, true);

    expect(response.status).toBe(200);
    expect(updateQuote).toHaveBeenCalledWith(quote.id, expect.objectContaining({ status: "accepted" }));
    expect(mockSent.filter((email) => email.subject === "A customer tried to accept your quote")).toHaveLength(0);
  });
});
