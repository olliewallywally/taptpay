/*
 * Owner decision 2026-09-26 (docs/decisions/2026-09-26-c10-batch-3-owner-answers.md, answer 3):
 * a customer page gets the business's details with the sale it already shows. The public
 * by-number business read (GET /api/merchants/:id) is retired: counting through business numbers
 * listed every business, unconfirmed sign-ups included. A board sale's own answer
 * (GET /api/transactions/:id) now carries them as `merchant`, as a payment link's already did.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Checkout from "@/pages/checkout";
import PaymentResult from "@/pages/payment-result";
import Receipt from "@/pages/receipt";
import SplitPayment from "@/pages/split-payment";
import { queryClient as appQueryClient } from "@/lib/queryClient";

let mockParams: Record<string, string> = {};
jest.mock("wouter", () => ({
  useParams: () => mockParams,
  useLocation: () => ["/", jest.fn()],
  useSearch: () => "",
}));

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
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

const BUSINESS = {
  businessName: "Kōwhai Café",
  businessAddress: "2 Kōwhai Lane, Auckland",
  contactPhone: "09 555 0199",
  gstNumber: "123-456-789",
  nzbn: "9429041234567",
  customLogoUrl: "/uploads/logos/kowhai.png",
  themeId: "classic",
};

const boardSale = {
  id: 5,
  merchantId: 1,
  taptStoneId: 3,
  itemName: "Coffee",
  price: "5.00",
  status: "completed",
  paymentMethod: "card",
  splitEnabled: false,
  isSplit: false,
  createdAt: "2026-09-26T01:00:00.000Z",
  merchant: BUSINESS,
};

const fetchMock = global.fetch as jest.Mock;
const requestedUrls = () => fetchMock.mock.calls.map(([input]) => String(input));
const reply = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

function serve(sale: Record<string, unknown>) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/transactions/5") return reply(sale);
    if (url === "/api/windcave/env") return reply({ env: "uat" });
    return reply({ message: "Not found" }, 404);
  });
}

/**
 * The app's own query client: the split page writes live updates into it directly
 * (`queryClient.setQueryData`), so a test must render with it, as App.tsx does.
 */
function renderWithAppClient(page: JSX.Element) {
  appQueryClient.clear();
  return render(<QueryClientProvider client={appQueryClient}>{page}</QueryClientProvider>);
}

afterEach(() => {
  appQueryClient.clear();
});

function renderPage(page: JSX.Element) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      {page}
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  listeners = {};
  mockParams = { transactionId: "5" };
});

describe("a board sale's customer pages take the business's details from the sale", () => {
  it("the receipt shows the business's tax-invoice details from the sale", async () => {
    serve(boardSale);
    renderPage(<Receipt sourceKind="retail-legacy" />);

    expect(await screen.findByText("Kōwhai Café")).toBeInTheDocument();
    expect(screen.getByText("2 Kōwhai Lane, Auckland")).toBeInTheDocument();
    expect(screen.getByText("09 555 0199")).toBeInTheDocument();
    expect(screen.getByText("GST No: 123-456-789")).toBeInTheDocument();
    expect(screen.getByText("NZBN: 9429041234567")).toBeInTheDocument();
    expect(requestedUrls()).not.toContain("/api/merchants/1");
  });

  it("the payment result shows the business's logo from the sale", async () => {
    serve({ ...boardSale, status: "declined" });
    renderPage(<PaymentResult />);

    await waitFor(() => expect(screen.getByAltText("logo")).toHaveAttribute("src", BUSINESS.customLogoUrl));
    expect(requestedUrls()).not.toContain("/api/merchants/1");
  });

  it("a board sale's checkout shows the business's logo from the sale", async () => {
    serve({ ...boardSale, status: "pending", paymentMethod: null });
    renderPage(<Checkout sourceKind="retail-legacy" />);

    await waitFor(() => expect(screen.getByAltText("Merchant logo")).toHaveAttribute("src", BUSINESS.customLogoUrl));
    expect(requestedUrls()).not.toContain("/api/merchants/1");
  });

  it("a board sale's split page shows the business's logo from the sale", async () => {
    serve({ ...boardSale, status: "pending", splitEnabled: true, isSplit: true, totalSplits: 2, completedSplits: 0 });
    renderPage(<SplitPayment sourceKind="retail-legacy" />);

    await waitFor(() => expect(screen.getAllByAltText("Merchant logo")[0]).toHaveAttribute("src", BUSINESS.customLogoUrl));
    expect(requestedUrls()).not.toContain("/api/merchants/1");
  });

  it("the split page keeps the business's logo when a live update arrives without it", async () => {
    const splitSale = { ...boardSale, status: "pending", splitEnabled: true, isSplit: true, totalSplits: 2, completedSplits: 0 };
    serve(splitSale);
    renderWithAppClient(<SplitPayment sourceKind="retail-legacy" />);
    await waitFor(() => expect(screen.getAllByAltText("Merchant logo")[0]).toHaveAttribute("src", BUSINESS.customLogoUrl));

    // The live feed sends the sale without the business's details.
    const { merchant: _dropped, ...liveCopy } = { ...splitSale, completedSplits: 1 };
    act(() => {
      for (const cb of listeners.transaction_updated || []) cb({ addressingMode: "board", stoneId: 3, transaction: liveCopy });
    });
    expect(screen.getAllByAltText("Merchant logo")[0]).toHaveAttribute("src", BUSINESS.customLogoUrl);

    // A tick later the query cache tells its readers of the write: well before the 3 s re-read.
    // (Taking the logo from the page's live copy instead would show only for a browser frame: the
    // page re-copies the read sale over it within the same update here.)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getAllByAltText("Merchant logo")[0]).toHaveAttribute("src", BUSINESS.customLogoUrl);
  });

  it.each(["payment-result.tsx", "receipt.tsx", "checkout.tsx", "split-payment.tsx", "customer-payment.tsx"])(
    "%s never builds the by-number business address",
    (page) => {
      const source = readFileSync(join(__dirname, "..", page), "utf8");
      expect(source).not.toMatch(/\/api\/merchants\/\$\{[^}]+\}`/);
    },
  );
});
