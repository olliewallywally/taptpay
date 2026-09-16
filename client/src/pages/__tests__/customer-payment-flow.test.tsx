import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CustomerPayment from "@/pages/customer-payment";

/**
 * Gap 12 Option C — customer-payment.tsx must never auto-navigate into a
 * checkout it isn't sure belongs to this customer.
 *
 * docs/decisions/2026-09-13-gap12-anonymous-sse-addressing-options.md,
 * "Option C — Keep merchant-wide, but fail closed on ambiguity and narrow
 * the payload".
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

/** Fires several SSE messages inside a single React commit — models the
 * guard's actual target: an `ambiguous` transition landing in the same
 * update as a `currentTransaction` change, so the redirect effect must see
 * both together rather than acting on one before the other is applied. */
function emitBatch(...events: Array<[string, any]>) {
  act(() => {
    for (const [type, message] of events) {
      for (const cb of listeners[type] || []) cb(message);
    }
  });
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null },
    json: async () => body,
  };
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("customer-payment — gap 12 Option C ambiguity handling", () => {
  beforeEach(() => {
    mockParams = { merchantId: "1" };
    mockSetLocation.mockReset();
    listeners = {};
    (global.fetch as jest.Mock).mockReset();
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/merchants/1/active-transaction")) {
        return jsonResponse(200, null);
      }
      if (url === "/api/merchants/1") {
        return jsonResponse(200, {});
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  test("REST: X-Legacy-No-Board-Ambiguous header shows the ask-staff state and never redirects", async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/merchants/1/active-transaction")) {
        return jsonResponse(200, null, { "x-legacy-no-board-ambiguous": "true" });
      }
      return jsonResponse(200, {});
    });

    renderWithQuery(<CustomerPayment />);

    expect(await screen.findByText("We can't tell which sale is yours")).toBeInTheDocument();
    expect(screen.getByText("Please ask a staff member for help")).toBeInTheDocument();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  test("REST: no ambiguous header behaves exactly as before — a pending transaction still redirects", async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/merchants/1/active-transaction")) {
        return jsonResponse(200, {
          id: 42,
          status: "pending",
          taptStoneId: null,
          splitEnabled: false,
          isSplit: false,
        });
      }
      return jsonResponse(200, {});
    });

    renderWithQuery(<CustomerPayment />);

    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith("/checkout/42"));
    expect(screen.queryByText("We can't tell which sale is yours")).not.toBeInTheDocument();
  });

  test("SSE: a legacy_no_board_ambiguous message shows the ask-staff state and blocks a pending redirect already in flight", async () => {
    renderWithQuery(<CustomerPayment />);

    // Let the initial (unambiguous, null-body) poll settle into the waiting state.
    await screen.findByText("Waiting for Payment");

    // A transaction and an ambiguity signal land in the same update — the
    // redirect effect must see `ambiguous` before it ever acts on
    // `currentTransaction`, not the other way around.
    emitBatch(
      ["transaction_updated", {
        addressingMode: "legacy-no-board",
        transaction: { id: 7, status: "pending", taptStoneId: null, splitEnabled: false, isSplit: false },
      }],
      ["legacy_no_board_ambiguous", {}],
    );

    await screen.findByText("We can't tell which sale is yours");
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  test("SSE: a normal transaction_updated event after an ambiguous signal clears ambiguity and redirects normally", async () => {
    renderWithQuery(<CustomerPayment />);
    await screen.findByText("Waiting for Payment");

    emit("legacy_no_board_ambiguous", {});
    await screen.findByText("We can't tell which sale is yours");

    emit("transaction_updated", {
      addressingMode: "legacy-no-board",
      transaction: { id: 9, status: "pending", taptStoneId: null, splitEnabled: false, isSplit: false },
    });

    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith("/checkout/9"));
    expect(screen.queryByText("We can't tell which sale is yours")).not.toBeInTheDocument();
  });

  test("a board-scoped customer never enters the ambiguous state, even if an ambiguous SSE message is (defensively) received", async () => {
    mockParams = { merchantId: "1", stoneId: "3" };
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/merchants/1/active-transaction")) {
        expect(url).toContain("stoneId=3");
        return jsonResponse(200, null, { "x-legacy-no-board-ambiguous": "true" }); // server would never send this for a board request; defensive check
      }
      return jsonResponse(200, {});
    });

    renderWithQuery(<CustomerPayment />);
    await screen.findByText("Waiting for Payment");

    emit("legacy_no_board_ambiguous", {});

    expect(screen.queryByText("We can't tell which sale is yours")).not.toBeInTheDocument();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });
});
