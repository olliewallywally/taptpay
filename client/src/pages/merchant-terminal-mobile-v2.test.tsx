import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { NotificationProvider } from "@/components/notification-system";
import { BILLING_CARD_REQUIRED_EVENT } from "@/lib/queryClient";
import MerchantTerminalMobileV2 from "./merchant-terminal-mobile-v2";

/*
 * RetailTerminalView/RetailTerminalViewCore are shared with the separate
 * tablet/desktop app initiative and out of this task's scope — stubbed here
 * with a minimal component that calls the real onBoardSelect/onCreateSale
 * props verbatim, decoupled from that component's own internals.
 */
jest.mock("@/features/terminal/retail/RetailTerminalView", () => {
  const React = require("react");
  return {
    __esModule: true,
    // Named, so the hooks rule can tell this stub is a component.
    default: function RetailTerminalViewStub(props: any) {
      // Exposes a render counter so tests can confirm an actual React
      // re-render (and therefore the completion-detection effect that runs
      // after it) has happened, rather than only that the query cache holds
      // a new value synchronously.
      const renderCount = React.useRef(0);
      renderCount.current += 1;
      return React.createElement(
        "div",
        {
          "data-testid": "retail-terminal-view-stub",
          "data-render-count": renderCount.current,
          "data-live-stones-count": props.liveStones?.length ?? 0,
        },
        React.createElement(
          "button",
          { onClick: () => props.onBoardSelect?.(props.liveStones?.[0]?.id) },
          "select first board",
        ),
        React.createElement(
          "button",
          {
            onClick: () => {
              // The real view keeps the typed sale when this rejects ("draft
              // preserved"), so the outcome is recorded for the tests.
              props.onCreateSale({ name: "Coffee", amount: 500, splitEnabled: false }, {}).then(
                () => mockCreateOutcomes.push("resolved"),
                () => mockCreateOutcomes.push("rejected"),
              );
            },
          },
          "create sale",
        ),
        React.createElement(
          "button",
          {
            onClick: () => {
              props.onCreateSale({ name: "Coffee", amount: 500, splitEnabled: false }, { paywave: true, existing: true });
            },
          },
          "tap to pay the pending sale",
        ),
      );
    },
  };
});

const mockCreateOutcomes: string[] = [];

const mockToast = jest.fn();

jest.mock("@/lib/auth", () => ({ getCurrentMerchantId: () => 1 }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@/lib/sse-client", () => ({
  sseClient: {
    connectMerchant: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
  },
}));
jest.mock("wouter", () => ({ useLocation: () => ["/merchant", jest.fn()] }));

type Handler = (body: Record<string, unknown>) => Response | Promise<Response>;

const fetchMock = global.fetch as jest.Mock;
const mockWriteText = jest.fn();
let saleBodies: Record<string, unknown>[];
let saleHandler: Handler;
let tapToPayRequests: number;
let tapToPayHandler: () => Response;
let activeTransactionFixture: unknown;
let taptStonesFixture: Array<{ id: number; name: string; stoneNumber: number }>;

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

function installFetchMock() {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/merchants/1/profile") {
      return jsonResponse({ id: 1, businessName: "Test Shop" });
    }
    if (method === "GET" && url === "/api/merchants/1/active-transaction") {
      return jsonResponse(activeTransactionFixture);
    }
    if (method === "GET" && url === "/api/merchants/1/tapt-stones") {
      return jsonResponse(taptStonesFixture);
    }
    if (method === "GET" && url === "/api/merchants/1/transactions") {
      return jsonResponse([]);
    }
    if (method === "POST" && url === "/api/transactions") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      saleBodies.push(body);
      return saleHandler(body);
    }
    if (method === "POST" && url === "/api/transactions/tap-to-pay") {
      tapToPayRequests += 1;
      return tapToPayHandler();
    }
    throw new Error(`Unhandled test request: ${method} ${url}`);
  });
}

function renderTerminal(seed?: (queryClient: QueryClient) => void) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  seed?.(queryClient);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mockWriteText },
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <MerchantTerminalMobileV2 />
      </NotificationProvider>
    </QueryClientProvider>,
  );
  return { ...rendered, queryClient };
}

beforeEach(() => {
  jest.clearAllMocks();
  saleBodies = [];
  mockCreateOutcomes.length = 0;
  tapToPayRequests = 0;
  tapToPayHandler = () => jsonResponse({ approved: true });
  activeTransactionFixture = null;
  taptStonesFixture = [];
  saleHandler = () =>
    jsonResponse({
      id: 1,
      itemName: "Coffee",
      price: "5.00",
      taptStoneId: null,
      paymentUrl: "https://private.example/sale-1",
      qrCodeUrl: "https://private.example/sale-1/qr",
    });
  installFetchMock();
});

describe("merchant-terminal-mobile-v2 per-payment link migration (gap 12)", () => {
  it("no board selected: sends linkMode per_payment and shows the sibling share overlay", async () => {
    renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");

    fireEvent.click(screen.getByText("create sale"));

    await waitFor(() => expect(saleBodies).toHaveLength(1));
    expect(saleBodies[0]).toEqual({
      merchantId: 1,
      itemName: "Coffee",
      price: "5.00",
      status: "pending",
      linkMode: "per_payment",
      splitEnabled: false,
    });
    expect(saleBodies[0]).not.toHaveProperty("selectedStoneId");

    expect(await screen.findByTestId("share-link-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("share-link-url")).toHaveTextContent(
      "https://private.example/sale-1",
    );
    expect(screen.getByAltText("Payment QR Code")).toHaveAttribute(
      "src",
      "https://private.example/sale-1/qr",
    );
  });

  // THE bug-prevention test, mirroring file 2's: the mocked response STILL
  // carries paymentUrl/qrCodeUrl (as the real server always does), so a
  // naive "gate on response.paymentUrl presence" implementation would show
  // the share overlay here too. It must not: a board was selected.
  it("board selected: sends selectedStoneId+linkMode legacy and does NOT show the share overlay even though the response carries paymentUrl/qrCodeUrl", async () => {
    taptStonesFixture = [{ id: 42, name: "Counter", stoneNumber: 1 }];
    saleHandler = () =>
      jsonResponse({
        id: 2,
        itemName: "Coffee",
        price: "5.00",
        taptStoneId: 42,
        paymentUrl: "https://merchant.example/pay/1/stone/42",
        qrCodeUrl: "https://merchant.example/pay/1/stone/42/qr",
      });
    renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");
    await waitFor(() =>
      expect(
        Number(screen.getByTestId("retail-terminal-view-stub").getAttribute("data-live-stones-count")),
      ).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByText("select first board"));
    fireEvent.click(screen.getByText("create sale"));

    await waitFor(() => expect(saleBodies).toHaveLength(1));
    expect(saleBodies[0]).toEqual({
      merchantId: 1,
      itemName: "Coffee",
      price: "5.00",
      status: "pending",
      selectedStoneId: 42,
      linkMode: "legacy",
      splitEnabled: false,
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("share-link-overlay")).not.toBeInTheDocument();
  });

  it("surfaces the real 503 message instead of a generic fallback", async () => {
    saleHandler = () =>
      jsonResponse({ message: "Per-payment links are not enabled yet" }, 503);
    renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");

    fireEvent.click(screen.getByText("create sale"));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Error",
          description: "Per-payment links are not enabled yet",
          variant: "destructive",
        }),
      ),
    );
    expect(screen.queryByTestId("share-link-overlay")).not.toBeInTheDocument();
  });

  it("copy link button copies the created payment URL and shows a copied toast", async () => {
    renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");

    fireEvent.click(screen.getByText("create sale"));
    await screen.findByTestId("share-link-overlay");

    fireEvent.click(screen.getByTestId("copy-share-link"));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Link Copied!" }),
      ),
    );
    expect(mockWriteText).toHaveBeenCalledWith("https://private.example/sale-1");
  });

  it("clears the share overlay once the active transaction completes", async () => {
    const { queryClient } = renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");

    fireEvent.click(screen.getByText("create sale"));
    await screen.findByTestId("share-link-overlay");

    const renderCountBefore = Number(
      screen.getByTestId("retail-terminal-view-stub").getAttribute("data-render-count"),
    );
    queryClient.setQueryData(["/api/merchants", 1, "active-transaction"], {
      id: 1,
      status: "pending",
      price: "5.00",
      itemName: "Coffee",
    });
    // Wait for an actual re-render (not just the cache write) so the
    // completion-detection effect has a truthy, non-"completed" `prev`
    // status recorded before the next transition below.
    await waitFor(() =>
      expect(
        Number(screen.getByTestId("retail-terminal-view-stub").getAttribute("data-render-count")),
      ).toBeGreaterThan(renderCountBefore),
    );

    queryClient.setQueryData(["/api/merchants", 1, "active-transaction"], {
      id: 1,
      status: "completed",
      price: "5.00",
      itemName: "Coffee",
    });

    await waitFor(() =>
      expect(screen.queryByTestId("share-link-overlay")).not.toBeInTheDocument(),
    );
  });
});

/*
 * R1-T9: a billing 402 states the required action once, in the banner the fetch
 * layer raises (lib/queryClient.ts). The action adds no message of its own, and
 * what was typed stays to send again.
 */
describe("a billing 402 on the phone retail terminal (R1-T9)", () => {
  const BILLING_402 = {
    code: "BILLING_CARD_REQUIRED",
    message: "Your subscription needs attention before you can send payments. Open Billing in Settings.",
  };
  let banners: number;
  const countBanner = () => { banners += 1; };
  beforeEach(() => {
    banners = 0;
    window.addEventListener(BILLING_CARD_REQUIRED_EVENT, countBanner);
  });
  afterEach(() => {
    window.removeEventListener(BILLING_CARD_REQUIRED_EVENT, countBanner);
    delete (window as any).Capacitor;
    delete (window as any).TaptPay;
  });

  it("a sale: the banner alone says so, and the sale stays to send again", async () => {
    saleHandler = () => jsonResponse(BILLING_402, 402);
    renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");

    fireEvent.click(screen.getByText("create sale"));

    await waitFor(() => expect(mockCreateOutcomes).toEqual(["rejected"]));
    expect(banners).toBe(1);
    expect(screen.getAllByText("Subscription needs attention")).toHaveLength(1);
    expect(mockToast).not.toHaveBeenCalled();
    expect(screen.queryByTestId("share-link-overlay")).not.toBeInTheDocument();
  });

  it("Tap to Pay on a pending sale: the banner alone says why, with no \"Payment Declined\" (no card was declined)", async () => {
    const pendingSale = { id: 7, status: "pending", price: "5.00", itemName: "Coffee" };
    activeTransactionFixture = pendingSale;
    tapToPayHandler = () => jsonResponse(BILLING_402, 402);
    const startTapToPay = jest.fn(async () => ({ approved: true, token: "card-token" }));
    (window as any).Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" };
    (window as any).TaptPay = { startTapToPay };
    renderTerminal((queryClient) => {
      queryClient.setQueryData(["/api/merchants", 1, "active-transaction"], pendingSale);
    });
    await screen.findByTestId("retail-terminal-view-stub");

    fireEvent.click(screen.getByText("tap to pay the pending sale"));
    expect(screen.getByTestId("tap-to-pay-overlay")).toBeInTheDocument();

    await waitFor(() => expect(tapToPayRequests).toBe(1));
    await waitFor(() => expect(screen.queryByTestId("tap-to-pay-overlay")).not.toBeInTheDocument());
    expect(startTapToPay).toHaveBeenCalledTimes(1);
    expect(banners).toBe(1);
    expect(screen.queryByText("Payment Declined")).not.toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });
});
