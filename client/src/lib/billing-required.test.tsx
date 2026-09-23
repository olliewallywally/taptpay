/*
 * R1-T9 — billing 402s state the required action once. The server answers a
 * payment action with 402 when the merchant's subscription has no paid access
 * (server/billing-card.ts: "Your subscription needs attention before you can
 * send payments"), whether or not a card is stored. The app raised a banner
 * saying "Credit or debit card required" (the rule before 2026-08-10) and the
 * action then showed its own failure with the server's different wording. Now
 * every fetch helper turns a 402 into one BillingCardRequiredError after raising
 * the banner, so an action can tell it apart and say nothing more, and the
 * banner says what the server means, with the way to Billing.
 */
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { NotificationProvider } from "@/components/notification-system";
import {
  BILLING_CARD_REQUIRED_EVENT,
  BillingCardRequiredError,
  apiRequest,
  isBillingCardRequired,
} from "./queryClient";
import { tradesFetch } from "./trades-api";
import { propFetch } from "./property-api";

const fetchMock = global.fetch as jest.Mock;
const answer = (status: number, body: unknown) =>
  ({ ok: status < 400, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const BILLING_402 = { code: "BILLING_CARD_REQUIRED", message: "Your subscription needs attention before you can send payments. Open Billing in Settings." };

let events: number;
const count = () => { events += 1; };
beforeEach(() => {
  fetchMock.mockReset();
  events = 0;
  window.addEventListener(BILLING_CARD_REQUIRED_EVENT, count);
});
afterEach(() => window.removeEventListener(BILLING_CARD_REQUIRED_EVENT, count));

describe("a 402 from a payment action", () => {
  it.each([
    ["apiRequest", () => apiRequest("POST", "/api/transactions", { price: "5.00" })],
    ["tradesFetch", () => tradesFetch("/api/trades/invoices", { method: "POST" })],
    ["propFetch", () => propFetch("/api/property/invoices", { method: "POST" })],
  ])("%s raises the banner once and throws the one billing error", async (_helper, call) => {
    fetchMock.mockResolvedValue(answer(402, BILLING_402));
    const error = await call().then(() => null, (thrown: unknown) => thrown);
    expect(isBillingCardRequired(error)).toBe(true);
    expect(error).toBeInstanceOf(BillingCardRequiredError);
    expect(events).toBe(1);
  });

  it("other failures are not billing errors and raise no banner", async () => {
    fetchMock.mockResolvedValue(answer(500, { message: "boom" }));
    const error = await apiRequest("POST", "/api/transactions", {}).then(() => null, (thrown: unknown) => thrown);
    expect(isBillingCardRequired(error)).toBe(false);
    expect(events).toBe(0);
    const response = await tradesFetch("/api/trades/invoices", { method: "POST" });
    expect(response.status).toBe(500); // the trades helper still returns other failures to its caller
    expect(events).toBe(0);
  });
});

describe("the billing banner", () => {
  it("says what the server means, once however many 402s arrive, with the way to Billing", async () => {
    render(<NotificationProvider><div /></NotificationProvider>);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(BILLING_CARD_REQUIRED_EVENT));
      window.dispatchEvent(new CustomEvent(BILLING_CARD_REQUIRED_EVENT));
    });

    expect(screen.getAllByText("Subscription needs attention")).toHaveLength(1);
    expect(screen.getByText("You can't send payments until it's sorted in Billing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Billing" })).toBeInTheDocument();
    expect(screen.queryByText(/card required/i)).toBeNull();
  });
});
