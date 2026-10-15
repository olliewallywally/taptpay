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
      if (url.startsWith("/api/merchants/1/active-transaction")) {
        return jsonResponse(410, { code: "NO_BOARD_ADDRESS_RETIRED" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  test("tells the customer to ask for their sale's own link, and asks nothing about the business", async () => {
    // Owner decision 2026-09-26: the by-number business read is retired; with no board and no
    // sale there is nothing to give the business's details with, so TaptPay's logo shows.
    renderWithQuery(<CustomerPayment />);

    expect(await screen.findByText("Ask for your payment link")).toBeInTheDocument();
    expect(
      screen.getByText("Each sale now has its own payment link. Ask the business to show you the QR code for your sale."),
    ).toBeInTheDocument();
    expect(screen.getByAltText("merchant logo")).not.toHaveAttribute("src", "/uploads/logos/shop.png");
    expect(screen.queryByText("Waiting for Payment")).not.toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(requestedUrls()).toEqual([]);
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

  test("shows the business's logo from its board, never asking for the business by number", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/merchants/1/stone/3/brand") {
        return jsonResponse(200, { businessName: "Kōwhai Café", customLogoUrl: "/uploads/logos/shop.png" });
      }
      if (url === "/api/merchants/1/active-transaction?stoneId=3") return jsonResponse(200, null);
      throw new Error(`unexpected fetch: ${url}`);
    });

    renderWithQuery(<CustomerPayment />);

    expect(await screen.findByText("Waiting for Payment")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText("merchant logo")).toHaveAttribute("src", "/uploads/logos/shop.png"));
    expect(requestedUrls()).not.toContain("/api/merchants/1");
  });

  test("waits on its board's sale, then takes the customer to checkout", async () => {
    let boardSale: unknown = null;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/merchants/1/stone/3/brand") return jsonResponse(200, { businessName: "Shop", customLogoUrl: null });
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
      if (url === "/api/merchants/1/stone/3/brand") return jsonResponse(200, { businessName: "Shop", customLogoUrl: null });
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

/**
 * R1-T10c: found by the device matrix's look at what a customer opens. The server calls a board's
 * "active" sale its newest open one, or else one completed in the last three minutes (so the
 * business's own terminal can show that it was paid). The board's page showed "Something went wrong —
 * We couldn't connect to the payment page" for any sale it was handed that was not waiting to be paid,
 * with every request answered: so for three minutes after each sale, and while someone else was
 * paying, the next customer to open the board was told of a fault that was not there.
 */
describe("customer-payment — a board whose sale is not waiting to be paid", () => {
  beforeEach(() => {
    mockParams = { merchantId: "1", stoneId: "3" };
  });

  const board = (sale: unknown) => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/merchants/1/stone/3/brand") return jsonResponse(200, { businessName: "Shop", customLogoUrl: null });
      if (url === "/api/merchants/1/active-transaction?stoneId=3") return jsonResponse(200, sale);
      throw new Error(`unexpected fetch: ${url}`);
    });
  };
  const settle = () => act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

  test.each([
    ["has just been paid", "completed"],
    ["is being paid by someone else", "processing"],
  ])("a board whose newest sale %s waits for the next one, and reports no fault", async (_what, status) => {
    board({ id: 9, status, taptStoneId: 3, splitEnabled: false, isSplit: false });

    renderWithQuery(<CustomerPayment />);
    expect(await screen.findByText("Waiting for Payment")).toBeInTheDocument();
    await settle();

    expect(screen.getByText("Waiting for Payment")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    expect(screen.queryByText("We couldn't connect to the payment page")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment Successful!")).not.toBeInTheDocument();
    // It is nobody's to pay: the customer is not moved on, to checkout or to a receipt.
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  test("on its way to checkout it shows the waiting screen, never the fault screen", async () => {
    board({ id: 42, status: "pending", taptStoneId: 3, splitEnabled: false, isSplit: false });

    renderWithQuery(<CustomerPayment />);
    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith("/checkout/42"));
    await settle();

    // Here the move is a stand-in, so the page stays up: what it shows is what a customer sees for the
    // moment before checkout opens.
    expect(screen.getByText("Waiting for Payment")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  test("a sale that fails while the page is open is still said to have failed, with a way to try again", async () => {
    board(null);
    renderWithQuery(<CustomerPayment />);
    await screen.findByText("Waiting for Payment");

    emit("transaction_updated", { addressingMode: "board", stoneId: 3, transaction: { id: 42, status: "failed", taptStoneId: 3 } });

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByTestId("button-retry")).toBeInTheDocument();
    expect(screen.queryByText("Waiting for Payment")).not.toBeInTheDocument();
  });

  test("a sale paid while the page is open is still thanked for", async () => {
    board(null);
    renderWithQuery(<CustomerPayment />);
    await screen.findByText("Waiting for Payment");

    emit("transaction_updated", { addressingMode: "board", stoneId: 3, transaction: { id: 42, status: "completed", taptStoneId: 3 } });

    expect(await screen.findByText("Payment Successful!")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });
});
