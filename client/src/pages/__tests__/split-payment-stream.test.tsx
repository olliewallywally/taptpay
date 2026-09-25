import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SplitPayment from "@/pages/split-payment";
import { sseClient } from "@/lib/sse-client";

/**
 * Owner decision 2026-09-25 (server/no-board-address.ts): the business-wide no-board live feed
 * is retired, so a numbered split page for a sale without a board opens no feed (it answers
 * 410); it follows the split through its existing 3-second read. A board's split page still
 * listens to its board's feed.
 */

let mockParams: Record<string, string> = {};

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
});

const baseSale = {
  id: 5,
  merchantId: 1,
  itemName: "Shared table",
  price: "40.00",
  status: "pending",
  isSplit: false,
  splitEnabled: true,
};

it("opens no live feed for a sale without a board", async () => {
  serveSale({ ...baseSale, taptStoneId: null });

  renderSplit();
  await screen.findByTestId("split-view");
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/merchants/1"));

  expect(sseClient.connectCustomer).not.toHaveBeenCalled();
});

it("listens to its board's feed for a board sale", async () => {
  serveSale({ ...baseSale, taptStoneId: 3 });

  renderSplit();
  await screen.findByTestId("split-view");

  await waitFor(() => expect(sseClient.connectCustomer).toHaveBeenCalledWith(1, 3));
});
