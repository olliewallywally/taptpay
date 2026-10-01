import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { NotificationProvider } from "@/components/notification-system";
import { BILLING_CARD_REQUIRED_EVENT } from "@/lib/queryClient";
import MerchantTerminalMobileV2 from "./merchant-terminal-mobile-v2";

/*
 * RetailTerminalView/RetailTerminalViewCore are shared with the separate
 * tablet/desktop app initiative and out of this task's scope — stubbed here
 * with a minimal component that calls the real props verbatim and reports what
 * it was handed, decoupled from that component's own internals (its own tests:
 * retail-terminal-view-boundary and retail-terminal-share-sales).
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
      const shareSales = props.liveShareSales ?? [];
      const first = shareSales[0];
      const record = (outcomes: string[], promise: Promise<unknown> | undefined) =>
        Promise.resolve(promise).then(() => outcomes.push("resolved"), () => outcomes.push("rejected"));
      return React.createElement(
        "div",
        {
          "data-testid": "retail-terminal-view-stub",
          "data-render-count": renderCount.current,
          "data-live-stones-count": props.liveStones?.length ?? 0,
          // What the share page may offer, and the cash receipt it may show.
          "data-share-sales": JSON.stringify(shareSales.map(({ id, name, amount, payLink }: any) => ({ id, name, amount, payLink }))),
          "data-live-receipt": JSON.stringify(props.liveReceipt ?? null),
        },
        ...shareSales.map((sale: any) =>
          React.createElement("div", { key: sale.id, "data-testid": `stub-qr-${sale.id}` }, sale.qrElement ?? null)),
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
              record(mockCreateOutcomes, props.onCreateSale({ name: "Coffee", amount: 500, splitEnabled: false }, {}));
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
        React.createElement(
          "button",
          { onClick: () => record(mockCashOutcomes, props.onCashSale?.({ name: "muffin", amount: 450 })) },
          "record cash sale",
        ),
        React.createElement(
          "button",
          {
            onClick: () => props.onShare?.({ kind: "payment", channel: "copy", url: first?.payLink, amountCents: first?.amount, label: first?.name }),
          },
          "copy first sale link",
        ),
        React.createElement(
          "button",
          {
            onClick: () => props.onShare?.({ kind: "payment", channel: "download-qr", url: first?.payLink, amountCents: first?.amount, label: first?.name }),
          },
          "download first sale qr",
        ),
      );
    },
  };
});

const mockCreateOutcomes: string[] = [];
const mockCashOutcomes: string[] = [];

const mockToast = jest.fn();
const mockToDataURL = jest.fn(async (text: string, _options?: unknown) => `data:image/png;base64,QR-OF-${encodeURIComponent(text)}`);

jest.mock("qrcode", () => ({
  __esModule: true,
  default: { toDataURL: (text: string, options?: unknown) => mockToDataURL(text, options) },
}));
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
// Like the real clipboard API, which answers with a promise.
const mockWriteText = jest.fn(async (_text: string) => {});
let saleBodies: Record<string, unknown>[];
let saleHandler: Handler;
let cashBodies: Record<string, unknown>[];
let cashHandler: Handler;
let tapToPayRequests: number;
let tapToPayHandler: () => Response;
let activeTransactionFixture: unknown;
let taptStonesFixture: Array<{ id: number; name: string; stoneNumber: number }>;
let transactionsFixture: Array<Record<string, unknown>>;

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
      return jsonResponse(transactionsFixture);
    }
    if (method === "POST" && url === "/api/transactions") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      saleBodies.push(body);
      const response = await saleHandler(body);
      // The server lists what it created, as the real one does.
      if (response.ok) transactionsFixture = [await response.json(), ...transactionsFixture];
      return response;
    }
    if (method === "POST" && url === "/api/transactions/cash-sale") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      cashBodies.push(body);
      return cashHandler(body);
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

const stub = () => screen.getByTestId("retail-terminal-view-stub");
const shareSales = () => JSON.parse(stub().getAttribute("data-share-sales") ?? "[]");
const liveReceipt = () => JSON.parse(stub().getAttribute("data-live-receipt") ?? "null");
const SALE_LINKS_KEY = "taptpay:retail-sale-links:v1:1";

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  saleBodies = [];
  cashBodies = [];
  mockCreateOutcomes.length = 0;
  mockCashOutcomes.length = 0;
  tapToPayRequests = 0;
  tapToPayHandler = () => jsonResponse({ approved: true });
  activeTransactionFixture = null;
  taptStonesFixture = [];
  transactionsFixture = [];
  saleHandler = () =>
    jsonResponse({
      id: 1,
      itemName: "Coffee",
      price: "5.00",
      status: "pending",
      taptStoneId: null,
      paymentUrl: "https://private.example/sale-1",
      qrCodeUrl: "https://private.example/sale-1/qr",
    });
  cashHandler = (body) =>
    jsonResponse({
      transaction: { id: 77, itemName: body.itemName, price: body.price, status: "completed", paymentMethod: "cash", taptStoneId: null },
    });
  installFetchMock();
});

describe("sales from the phone terminal, and what its share page offers (gap 12; owner decision 2026-09-25)", () => {
  it("no board: sends linkMode per_payment, and offers the sale's own link and QR to share", async () => {
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

    await waitFor(() => expect(shareSales()).toEqual([
      { id: 1, name: "Coffee", amount: 500, payLink: "https://private.example/sale-1" },
    ]));
    expect(within(screen.getByTestId("stub-qr-1")).getByAltText("Payment QR Code")).toHaveAttribute(
      "src",
      "https://private.example/sale-1/qr",
    );
    // The September pop-up is replaced by the share page, which it would cover.
    expect(screen.queryByTestId("share-link-overlay")).not.toBeInTheDocument();
  });

  // The bug-prevention case from 8666dafc: the response STILL carries
  // paymentUrl/qrCodeUrl (as the real server does), and a board sale must be
  // offered as its board's page, never as a private link of its own.
  it("board selected: sends selectedStoneId + linkMode legacy, and shares the board's own page and QR", async () => {
    taptStonesFixture = [{ id: 42, name: "Counter", stoneNumber: 1 }];
    saleHandler = () =>
      jsonResponse({
        id: 2,
        itemName: "Coffee",
        price: "5.00",
        status: "pending",
        taptStoneId: 42,
        paymentUrl: "https://merchant.example/pay/1/stone/42",
        qrCodeUrl: "https://merchant.example/pay/1/stone/42/qr",
      });
    renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");
    await waitFor(() => expect(Number(stub().getAttribute("data-live-stones-count"))).toBeGreaterThan(0));

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
    await waitFor(() => expect(shareSales()).toEqual([
      { id: 2, name: "Coffee", amount: 500, payLink: `${window.location.origin}/pay/1/stone/42` },
    ]));
    expect(within(screen.getByTestId("stub-qr-2")).getByAltText("Payment QR Code")).toHaveAttribute(
      "src",
      "/api/merchants/1/stone/42/qr",
    );
    expect(localStorage.getItem(SALE_LINKS_KEY) ?? "").not.toContain("merchant.example");
  });

  it("surfaces the real 503 message instead of a generic fallback, and offers nothing to share", async () => {
    saleHandler = () => jsonResponse({ message: "Per-payment links are not enabled yet" }, 503);
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
    expect(shareSales()).toEqual([]);
  });

  it("copying from the share page puts exactly the sale's own link on the clipboard", async () => {
    renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");
    fireEvent.click(screen.getByText("create sale"));
    await waitFor(() => expect(shareSales()).toHaveLength(1));

    fireEvent.click(screen.getByText("copy first sale link"));

    await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith("https://private.example/sale-1"));
  });

  it("download QR saves a real, scannable picture of exactly the shared link", async () => {
    const clicked: Array<{ href: string; download: string }> = [];
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
    try {
      renderTerminal();
      await screen.findByTestId("retail-terminal-view-stub");
      fireEvent.click(screen.getByText("create sale"));
      await waitFor(() => expect(shareSales()).toHaveLength(1));

      fireEvent.click(screen.getByText("download first sale qr"));

      await waitFor(() => expect(clicked).toHaveLength(1));
      expect(mockToDataURL).toHaveBeenCalledWith("https://private.example/sale-1", expect.objectContaining({ width: 800 }));
      expect(clicked[0]).toEqual({
        href: `data:image/png;base64,QR-OF-${encodeURIComponent("https://private.example/sale-1")}`,
        download: "payment-qr.png",
      });
    } finally {
      click.mockRestore();
    }
  });

  it("a paid sale leaves the share list, and its remembered link goes with it", async () => {
    const { queryClient } = renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");
    fireEvent.click(screen.getByText("create sale"));
    await waitFor(() => expect(shareSales()).toHaveLength(1));
    expect(localStorage.getItem(SALE_LINKS_KEY)).toContain("https://private.example/sale-1");

    transactionsFixture = transactionsFixture.map((tx) => ({ ...tx, status: "completed" }));
    await queryClient.invalidateQueries({ queryKey: ["/api/merchants", 1, "transactions"] });

    await waitFor(() => expect(shareSales()).toEqual([]));
    await waitFor(() => expect(localStorage.getItem(SALE_LINKS_KEY) ?? "").not.toContain("sale-1"));
  });

  it("remembers a board-less sale's link on this phone across a reload", async () => {
    const first = renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");
    fireEvent.click(screen.getByText("create sale"));
    await waitFor(() => expect(shareSales()).toHaveLength(1));
    first.unmount();

    renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");

    await waitFor(() => expect(shareSales()).toEqual([
      { id: 1, name: "Coffee", amount: 500, payLink: "https://private.example/sale-1" },
    ]));
  });

  it("offers an open board sale made on another device, but not a board-less one (its link was never on this phone), nor a paid one", async () => {
    transactionsFixture = [
      { id: 11, itemName: "Paid board sale", price: "2.00", status: "completed", taptStoneId: 42 },
      { id: 10, itemName: "Window sale", price: "7.00", status: "pending", taptStoneId: 42 },
      { id: 9, itemName: "Desktop sale", price: "3.00", status: "pending", taptStoneId: null },
    ];
    renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");

    await waitFor(() => expect(shareSales()).toEqual([
      { id: 10, name: "Window sale", amount: 700, payLink: `${window.location.origin}/pay/1/stone/42` },
    ]));
  });

  it("reads its current sale signed in: by the session cookie, with no token and no board in the address", async () => {
    // R1-T4 phase E: the server tells a signed-in terminal from a board's page by the session cookie
    // the browser sends with a same-origin request; the address names no board.
    renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/merchants/1/active-transaction")).toBe(true),
    );
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url) === "/api/merchants/1/active-transaction")!;
    expect((init as RequestInit | undefined)?.credentials).toBe("same-origin");
    expect(new Headers((init as RequestInit | undefined)?.headers).get("Authorization")).toBeNull();
  });
});

/*
 * Owner decision 2026-09-25 ("fix them"): a cash sale on the phone was never recorded — no
 * action was wired, so "success" showed and nothing was saved, and its "receipt link" was the
 * demo address.
 */
describe("a cash sale on the phone", () => {
  let banners: number;
  const countBanner = () => { banners += 1; };
  beforeEach(() => {
    banners = 0;
    window.addEventListener(BILLING_CARD_REQUIRED_EVENT, countBanner);
  });
  afterEach(() => {
    window.removeEventListener(BILLING_CARD_REQUIRED_EVENT, countBanner);
  });

  it("is recorded, listed, and its own receipt link handed to the success screen", async () => {
    const { queryClient } = renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");

    fireEvent.click(screen.getByText("record cash sale"));

    await waitFor(() => expect(mockCashOutcomes).toEqual(["resolved"]));
    expect(cashBodies).toEqual([{ merchantId: 1, itemName: "muffin", price: "4.50" }]);
    expect(liveReceipt()).toEqual({ name: "muffin", amount: 450, url: `${window.location.origin}/receipt/77` });
    expect(queryClient.getQueryData<any[]>(["/api/merchants", 1, "transactions"])?.[0]).toMatchObject({ id: 77, paymentMethod: "cash" });
    expect(banners).toBe(0);
  });

  it("refused for billing: the banner alone says so, and the success screen is not shown", async () => {
    cashHandler = () => jsonResponse({
      code: "BILLING_CARD_REQUIRED",
      message: "Your subscription needs attention before you can send payments. Open Billing in Settings.",
    }, 402);
    renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");

    fireEvent.click(screen.getByText("record cash sale"));

    await waitFor(() => expect(mockCashOutcomes).toEqual(["rejected"]));
    expect(banners).toBe(1);
    expect(mockToast).not.toHaveBeenCalled();
    expect(liveReceipt()).toBeNull();
  });

  it("failing otherwise says why, and the success screen is not shown", async () => {
    cashHandler = () => jsonResponse({ message: "Failed to record cash sale" }, 500);
    renderTerminal();
    await screen.findByTestId("retail-terminal-view-stub");

    fireEvent.click(screen.getByText("record cash sale"));

    await waitFor(() => expect(mockCashOutcomes).toEqual(["rejected"]));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Error", description: "Failed to record cash sale", variant: "destructive",
    }));
    expect(liveReceipt()).toBeNull();
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
    expect(shareSales()).toEqual([]);
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
