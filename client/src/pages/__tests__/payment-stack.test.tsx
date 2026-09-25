import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PaymentStack from "@/pages/payment-stack";

/**
 * The phone Payment Stack lists this business's open sales.
 * - It reads them signed in: both reads are behind authenticateToken, which reads only the
 *   Authorization header, and the page sent none (since c7220cea, 2026-05-12).
 */

jest.mock("@/components/merchant-gate", () => ({
  MerchantGate: ({ children }: { children: (merchantId: number) => React.ReactNode }) => <>{children(1)}</>,
}));

const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("wouter", () => ({ Link: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const fetchMock = global.fetch as jest.Mock;
const mockWriteText = jest.fn();

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const boardSale = { id: 11, itemName: "Counter coffee", price: "4.50", status: "pending", taptStoneId: 7, createdAt: new Date().toISOString() };
const noBoardSale = { id: 12, itemName: "Takeaway lunch", price: "18.00", status: "pending", taptStoneId: null, createdAt: new Date().toISOString() };
const boards = [{ id: 7, name: "Counter", stoneNumber: 1, paymentUrl: "https://shop.example/pay/1/stone/7" }];

function renderStack() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mockWriteText } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaymentStack />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  localStorage.setItem("authToken", "tok-1");
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const signedIn = new Headers(init?.headers).get("Authorization") === "Bearer tok-1";
    if (!signedIn) return jsonResponse({ message: "Access token required" }, 401);
    if (url === "/api/merchants/1/transactions") return jsonResponse([boardSale, noBoardSale]);
    if (url === "/api/merchants/1/tapt-stones") return jsonResponse(boards);
    throw new Error(`unexpected fetch: ${url}`);
  });
});

afterEach(() => {
  localStorage.removeItem("authToken");
});

it("loads the business's open sales signed in", async () => {
  renderStack();

  expect(await screen.findByText("Counter coffee")).toBeInTheDocument();
  expect(screen.getByText("Takeaway lunch")).toBeInTheDocument();
});

it("copies a board sale's board address", async () => {
  renderStack();
  fireEvent.click(await screen.findByText("Counter coffee"));

  fireEvent.click(await screen.findByRole("button", { name: /copy link/i }));

  await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith("https://shop.example/nfc/1/stone/7"));
});
