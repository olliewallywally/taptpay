import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SplitPayment from "@/pages/split-payment";

/**
 * Owner decision 2026-09-26 (answer 1, "Exact share only"): a board sale's
 * split page offers no amount box, and shows and sends exactly the share the
 * server charges — whole cents rounded down, the remainder on the last share —
 * as the per-payment link's page already does. The server refuses any other
 * amount (server/__tests__/numbered-pay-exact-share.test.ts).
 */

let mockParams: Record<string, string> = {};
let latestView: any = null;

jest.mock("wouter", () => ({
  useParams: () => mockParams,
  useLocation: () => ["/split/5", jest.fn()],
}));

jest.mock("@/lib/sse-client", () => ({
  sseClient: {
    connectCustomer: jest.fn(),
    connectMerchant: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  },
}));

jest.mock("@/features/checkout/SplitPaymentView", () => ({
  __esModule: true,
  default: function SplitPaymentViewStub(props: any) {
    latestView = props;
    return <div data-testid="split-view">{props.model?.itemName}</div>;
  },
}));

const fetchMock = global.fetch as jest.Mock;

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function renderSplit() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SplitPayment sourceKind="retail-legacy" />
    </QueryClientProvider>,
  );
}

const boardSale = {
  id: 5,
  merchantId: 1,
  taptStoneId: 3,
  itemName: "Shared table",
  price: "100.00",
  status: "pending",
  isSplit: false,
  splitEnabled: true,
};

function serveSale(sale: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/transactions/5") return jsonResponse(sale);
    if (url === "/api/merchants/1") return jsonResponse({});
    throw new Error(`unexpected fetch: ${url}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  mockParams = { transactionId: "5" };
  latestView = null;
});

it("offers no amount box on a board sale, and splits into whole cents rounded down", async () => {
  serveSale(boardSale);
  renderSplit();
  await screen.findByText("Shared table");

  expect(latestView.model.allowCustomAmount).toBe(false);
  expect(latestView.model.truncateEqualShares).toBe(true);
});

it("shows the last share its remainder, as the server charges it", async () => {
  serveSale({ ...boardSale, isSplit: true, totalSplits: 3, completedSplits: 2, splitAmount: "33.33" });
  renderSplit();
  await screen.findByText("Shared table");

  expect(latestView.model.subsequentShare).toBe("33.34");
});

it("shows a middle share the same whole-cent share the server charges", async () => {
  serveSale({ ...boardSale, isSplit: true, totalSplits: 3, completedSplits: 1, splitAmount: "33.33" });
  renderSplit();
  await screen.findByText("Shared table");

  expect(latestView.model.subsequentShare).toBe("33.33");
});

it("sends the share it showed with the payment", async () => {
  serveSale({ ...boardSale, isSplit: true, totalSplits: 3, completedSplits: 2, splitAmount: "33.33" });
  renderSplit();
  await screen.findByText("Shared table");
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/transactions/5/pay") return jsonResponse({ hppUrl: "" });
    if (url === "/api/transactions/5") return jsonResponse({ ...boardSale, isSplit: true, totalSplits: 3, completedSplits: 2 });
    if (url === "/api/merchants/1") return jsonResponse({});
    throw new Error(`unexpected fetch: ${url}`);
  });

  await act(async () => {
    await latestView.onPay({ amount: 33.34, splitCount: 3 });
  });

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith("/api/transactions/5/pay", expect.objectContaining({ method: "POST" })),
  );
  const payCall = fetchMock.mock.calls.find(([url]) => url === "/api/transactions/5/pay");
  expect(JSON.parse(payCall![1].body)).toEqual({ merchantId: 1, amount: "33.34" });
});
