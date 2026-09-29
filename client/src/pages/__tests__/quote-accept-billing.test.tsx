/*
 * R1-T9 — a billing 402 states the required action to the person who can take
 * it. A customer accepting a quote from a business whose subscription has
 * lapsed gets a 402 whose message is written for the business ("Your
 * subscription needs attention … Open Billing in Settings"). The customer can do
 * nothing about that; they are told what they can do instead, without the
 * business's billing.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import Checkout from "@/pages/checkout";

const quoteToken = "q".repeat(43);
jest.mock("wouter", () => ({
  useParams: () => ({ token: "q".repeat(43) }),
  useLocation: () => ["/", jest.fn()],
  useSearch: () => "",
}));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const QUOTE = {
  quote: {
    id: "quote-1",
    status: "sent",
    totalCents: 115_000,
    depositEnabled: false,
    lineItems: [{ description: "Rewire kitchen", qty: 1, unitPriceCents: 100_000, lineTotalCents: 100_000 }],
  },
  invoice: null,
};

beforeEach(() => {
  fetchMock.mockReset();
  Object.defineProperty(window, "open", { configurable: true, value: jest.fn() });
});

it("accepting a quote from a business whose billing lapsed tells the customer what to do, not the business's billing", async () => {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `/api/trades/quotes/token/${quoteToken}` && !init?.method) return reply(QUOTE);
    if (url === `/api/trades/quotes/token/${quoteToken}/respond`) {
      return reply({ code: "BILLING_CARD_REQUIRED", message: "Your subscription needs attention before you can send payments. Open Billing in Settings." }, 402);
    }
    return reply({});
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Checkout sourceKind="quote-token" />
    </QueryClientProvider>,
  );

  await userEvent.click(await screen.findByRole("button", { name: "view quote" }));
  await userEvent.click(screen.getByRole("button", { name: "confirm" }));

  expect(await screen.findByText("This quote can't be accepted online right now. Please contact the business to go ahead.")).toBeInTheDocument();
  expect(screen.queryByText(/subscription|Open Billing/i)).toBeNull();
});

it("other refusals still say what the server said (it writes those for the customer)", async () => {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `/api/trades/quotes/token/${quoteToken}` && !init?.method) return reply(QUOTE);
    if (url === `/api/trades/quotes/token/${quoteToken}/respond`) return reply({ message: "Quote has expired" }, 410);
    return reply({});
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Checkout sourceKind="quote-token" />
    </QueryClientProvider>,
  );

  await userEvent.click(await screen.findByRole("button", { name: "view quote" }));
  await userEvent.click(screen.getByRole("button", { name: "confirm" }));
  expect(await screen.findByText("Quote has expired")).toBeInTheDocument();
});
