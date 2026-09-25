import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CustomerPayment from "@/pages/customer-payment";
import { sseClient } from "@/lib/sse-client";

/**
 * Owner decision 2026-09-25 (docs/decisions/2026-09-25-no-board-rework-402-and-batch-owner-answers.md):
 * with a payment board, the board's own page, unchanged; without one, every sale has its own
 * private link. The business-wide no-board page (`/pay/:merchantId`) no longer waits for "the
 * business's current sale" (gap 12's leak, and Option C's "can't tell which sale is yours"
 * state with it): it tells the customer to ask for their sale's link, and reads no sale at all.
 */

let mockParams: Record<string, string> = {};
const mockSetLocation = jest.fn();

jest.mock("wouter", () => ({
  useParams: () => mockParams,
  useLocation: () => ["/pay/1", mockSetLocation],
}));

type Listener = (message: any) => void;
let listeners: Record<string, Listener[]> = {};

jest.mock("@/lib/sse-client", () => ({
  sseClient: {
    connectCustomer: jest.fn(),
    connectMerchant: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn((type: string, cb: (message: any) => void) => {
      (listeners[type] ||= []).push(cb);
    }),
    unsubscribe: jest.fn((type: string, cb: (message: any) => void) => {
      listeners[type] = (listeners[type] || []).filter((l) => l !== cb);
    }),
  },
}));

function emit(type: string, message: any) {
  act(() => {
    for (const cb of listeners[type] || []) cb(message);
  });
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const fetchMock = global.fetch as jest.Mock;
const requestedUrls = () => fetchMock.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  mockSetLocation.mockReset();
  listeners = {};
  jest.clearAllMocks();
  fetchMock.mockReset();
});

describe("customer-payment — the business-wide no-board page is retired", () => {
  beforeEach(() => {
    mockParams = { merchantId: "1" };
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/merchants/1") return jsonResponse(200, { customLogoUrl: "/uploads/logos/shop.png" });
      if (url.startsWith("/api/merchants/1/active-transaction")) {
        return jsonResponse(410, { code: "NO_BOARD_ADDRESS_RETIRED" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  test("tells the customer to ask for their sale's own link, with the business's logo", async () => {
    renderWithQuery(<CustomerPayment />);

    expect(await screen.findByText("Ask for your payment link")).toBeInTheDocument();
    expect(
      screen.getByText("Each sale now has its own payment link. Ask the business to show you the QR code for your sale."),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText("merchant logo")).toHaveAttribute("src", "/uploads/logos/shop.png"));
    expect(screen.queryByText("Waiting for Payment")).not.toBeInTheDocument();
  });

  test("reads no sale and opens no live feed, and never moves the customer on", async () => {
    renderWithQuery(<CustomerPayment />);
    await screen.findByText("Ask for your payment link");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(requestedUrls().filter((url) => url.includes("active-transaction"))).toEqual([]);
    expect(sseClient.connectCustomer).not.toHaveBeenCalled();
    expect(sseClient.subscribe).not.toHaveBeenCalled();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });
});

describe("customer-payment — a board's page is unchanged", () => {
  beforeEach(() => {
    mockParams = { merchantId: "1", stoneId: "3" };
  });

  test("waits on its board's sale, then takes the customer to checkout", async () => {
    let boardSale: unknown = null;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/merchants/1") return jsonResponse(200, {});
      if (url === "/api/merchants/1/active-transaction?stoneId=3") return jsonResponse(200, boardSale);
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderWithQuery(<CustomerPayment />);
    expect(await screen.findByText("Waiting for Payment")).toBeInTheDocument();
    expect(sseClient.connectCustomer).toHaveBeenCalledWith(1, 3);

    boardSale = { id: 42, status: "pending", taptStoneId: 3, splitEnabled: false, isSplit: false };
    emit("transaction_updated", { addressingMode: "board", stoneId: 3, transaction: boardSale });

    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith("/checkout/42"));
  });

  test("ignores an update that isn't for its board", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/merchants/1") return jsonResponse(200, {});
      if (url === "/api/merchants/1/active-transaction?stoneId=3") return jsonResponse(200, null);
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderWithQuery(<CustomerPayment />);
    await screen.findByText("Waiting for Payment");

    emit("transaction_updated", {
      addressingMode: "board",
      stoneId: 4,
      transaction: { id: 7, status: "pending", taptStoneId: 4, splitEnabled: false, isSplit: false },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mockSetLocation).not.toHaveBeenCalled();
    expect(screen.getByText("Waiting for Payment")).toBeInTheDocument();
  });
});
