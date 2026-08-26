import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TokenPaymentEntry from "@/pages/token-payment";
import PaymentReturn from "@/pages/payment-return";
import Receipt from "@/pages/receipt";
import { rememberPaymentReturnState } from "@/lib/payment-addressing";

let mockParams: Record<string, string> = {};
let mockSearch = "";
const mockSetLocation = jest.fn();

jest.mock("wouter", () => ({
  useParams: () => mockParams,
  useLocation: () => ["/", mockSetLocation],
  useSearch: () => mockSearch,
}));

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const token = "t".repeat(43);

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("token customer entry and HPP return", () => {
  beforeEach(() => {
    mockParams = {};
    mockSearch = "";
    mockSetLocation.mockReset();
    (global.fetch as jest.Mock).mockReset();
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  test("entry keeps the token when choosing split", async () => {
    mockParams = { token };
    (global.fetch as jest.Mock).mockResolvedValue(response(200, {
      itemName: "Dinner",
      price: "90.00",
      status: "pending",
      splitEnabled: true,
      isSplit: false,
      merchant: {},
    }));

    renderWithQuery(<TokenPaymentEntry />);

    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith(`/split/t/${token}`, { replace: true }));
    expect(global.fetch).toHaveBeenCalledWith(`/api/pay/t/${token}`, {
      headers: { "Cache-Control": "no-cache" },
    });
    expect(mockSetLocation.mock.calls.flat().join(" ")).not.toMatch(/\/split\/\d|\/checkout\/\d/);
  });

  test("completed entry opens the token receipt", async () => {
    mockParams = { token };
    (global.fetch as jest.Mock).mockResolvedValue(response(200, {
      itemName: "Dinner",
      price: "90.00",
      status: "completed",
      splitEnabled: false,
      merchant: {},
    }));

    renderWithQuery(<TokenPaymentEntry />);
    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith(`/receipt/t/${token}`, { replace: true }));
  });

  test("processing entry resumes only through the same token checkout", async () => {
    mockParams = { token };
    (global.fetch as jest.Mock).mockResolvedValue(response(200, {
      itemName: "Dinner",
      price: "90.00",
      status: "processing",
      splitEnabled: false,
      merchant: {},
    }));

    renderWithQuery(<TokenPaymentEntry />);
    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith(`/checkout/t/${token}`, { replace: true }));
    expect(mockSetLocation.mock.calls.flat().join(" ")).not.toMatch(/\/checkout\/\d|\/receipt\/\d/);
  });

  test("410 resolve is a closed result and never redirects to a numeric route", async () => {
    mockParams = { token };
    (global.fetch as jest.Mock).mockResolvedValue(response(410, {
      message: "Payment link is closed",
      payment: { itemName: "Dinner", price: "90.00", status: "cancelled", merchant: {} },
    }));

    renderWithQuery(<TokenPaymentEntry />);
    expect(await screen.findByText("Payment link closed")).toBeInTheDocument();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  test("approved HPP return recovers the token and local split share", async () => {
    mockParams = { state: "return-state" };
    rememberPaymentReturnState("return-state", token);
    (global.fetch as jest.Mock).mockResolvedValue(response(200, {
      outcome: "approved",
      receiptShare: 3,
    }));

    renderWithQuery(<PaymentReturn />);

    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith(`/receipt/t/${token}?share=3`, { replace: true }));
    expect(global.fetch).toHaveBeenCalledWith("/api/pay/return/return-state", {
      headers: { "Cache-Control": "no-cache" },
    });
  });

  test.each(["declined", "cancelled"] as const)("%s HPP return goes back to the original token", async (outcome) => {
    mockParams = { state: `${outcome}-state` };
    rememberPaymentReturnState(`${outcome}-state`, token);
    (global.fetch as jest.Mock).mockResolvedValue(response(200, { outcome, receiptShare: null }));

    renderWithQuery(<PaymentReturn />);
    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith(`/pay/t/${token}`, { replace: true }));
  });

  test("missing browser state shows a safe recovery result without fetching", () => {
    mockParams = { state: "unknown-state" };
    renderWithQuery(<PaymentReturn />);

    expect(screen.getByText("Reopen the original payment link")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  test("split receipt and PDF stay on token plus transaction-local share", async () => {
    mockParams = { token };
    mockSearch = "?share=2";
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response(200, {
        transaction: {
          itemName: "Dinner",
          price: "90.00",
          status: "completed",
          paymentMethod: "card",
          isSplit: true,
          totalSplits: 3,
          completedSplits: 3,
          createdAt: "2026-08-06T12:00:00.000Z",
        },
        merchant: { businessName: "Cafe", customLogoUrl: null },
        share: { index: 2, amount: "30.00", paymentMethod: "apple_pay", paidAt: "2026-08-06T12:00:00.000Z" },
      }))
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["pdf"], { type: "application/pdf" }) });

    renderWithQuery(<Receipt sourceKind="retail-token" />);
    expect(await screen.findByText("Payment Accepted!")).toBeInTheDocument();
    expect(screen.getAllByText("$30.00")).toHaveLength(3);
    expect(screen.queryByText("Reference")).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenNthCalledWith(1, `/api/pay/t/${token}/receipt?share=2`, {
      headers: { "Cache-Control": "no-cache" },
    });

    fireEvent.click(screen.getByRole("button", { name: /download pdf/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenNthCalledWith(2, `/api/pay/t/${token}/receipt-pdf?share=2`, { method: "POST" }));
    for (const call of (global.fetch as jest.Mock).mock.calls) {
      expect(call[0]).not.toMatch(/\/api\/transactions\/|\/api\/split-payments\//);
    }
  });
});
