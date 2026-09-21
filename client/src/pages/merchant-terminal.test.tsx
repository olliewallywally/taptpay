import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { NotificationProvider } from "@/components/notification-system";
import MerchantTerminal from "./merchant-terminal";

/*
 * NOTE on interaction style: this page defines its subcomponents
 * (ActionsToolbar, ItemForm, StockTagging, ...) as function declarations
 * NESTED INSIDE MerchantTerminal's own render body, so each one is a brand
 * new function identity every render — React remounts them (fresh DOM nodes)
 * on every state update, including ones caused by this page's own concurrent
 * effects (e.g. the NFC-capabilities fetch). @testing-library/user-event's
 * click() dispatches pointerover/pointerdown/focus/click etc. as separate
 * ticks; if an unrelated state update remounts the button in the gap between
 * those ticks, the final "click" event lands on a now-detached stale node and
 * is silently lost (confirmed by isolated repro outside this suite). This is
 * a pre-existing architectural quirk of the page, out of this task's scope to
 * fix (named as an out-of-scope finding in the accompanying evidence doc) —
 * fireEvent dispatches a single synchronous "click"/"change", sidestepping
 * the race, so it is used here instead of userEvent.
 */

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

type Handler = (body: Record<string, unknown>) => Response | Promise<Response>;

const fetchMock = global.fetch as jest.Mock;
const mockWriteText = jest.fn();
let saleBodies: Record<string, unknown>[];
let saleHandler: Handler;
let activeTransactionFixture: unknown;

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
      return jsonResponse([]);
    }
    if (method === "GET" && url === "/api/merchants/1/stock-items") {
      return jsonResponse([]);
    }
    if (method === "GET" && url === "/api/nfc/capabilities") {
      return jsonResponse({ nfcSupported: false });
    }
    if (method === "POST" && url === "/api/transactions") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      saleBodies.push(body);
      return saleHandler(body);
    }
    throw new Error(`Unhandled test request: ${method} ${url}`);
  });
}

// R1-T8: the page's own start-up requests (profile, boards, NFC capabilities)
// land inside act(), before the test interacts, so React never sees an update
// outside act() (jest.setup.js fails any test in which React warns).
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});

async function renderTerminal() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mockWriteText },
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <MerchantTerminal />
      </NotificationProvider>
    </QueryClientProvider>,
  );
  await settle();
  return { ...rendered, queryClient };
}

async function createSale() {
  fireEvent.click(screen.getByTestId("button-new-payment"));
  fireEvent.change(screen.getByTestId("input-item-name"), { target: { value: "Coffee" } });
  fireEvent.change(screen.getByTestId("input-price"), { target: { value: "5.00" } });
  fireEvent.click(screen.getByTestId("button-create-transaction"));
  await Promise.resolve();
}

beforeEach(() => {
  jest.clearAllMocks();
  saleBodies = [];
  activeTransactionFixture = null;
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

describe("merchant-terminal per-payment link migration (gap 12)", () => {
  afterEach(settle);

  it("sends linkMode per_payment (and never selectedStoneId) and shows the share-link overlay after a successful create", async () => {
    await renderTerminal();

    await createSale();

    await waitFor(() => expect(saleBodies).toHaveLength(1));
    expect(saleBodies[0]).toEqual({
      merchantId: 1,
      itemName: "Coffee",
      price: "5.00",
      status: "pending",
      splitEnabled: false,
      linkMode: "per_payment",
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

  it("copy link button copies the created payment URL and shows a copied toast", async () => {
    await renderTerminal();

    await createSale();
    await screen.findByTestId("share-link-overlay");

    fireEvent.click(screen.getByTestId("copy-share-link"));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Link Copied!" }),
      ),
    );
    expect(mockWriteText).toHaveBeenCalledWith("https://private.example/sale-1");
  });

  it("clears the share-link overlay once the active transaction completes", async () => {
    const { queryClient } = await renderTerminal();

    await createSale();
    await screen.findByTestId("share-link-overlay");

    // react-query v5's setQueryData notifies observers via
    // useSyncExternalStore; the resulting re-render needs a real wait
    // (act() alone is not enough here), so drive each transition through
    // waitFor rather than assuming a synchronous flush.
    queryClient.setQueryData(["/api/merchants", 1, "active-transaction"], {
      id: 1,
      status: "pending",
      price: "5.00",
      itemName: "Coffee",
    });
    await waitFor(() =>
      expect(screen.getByTestId("active-transaction-display")).toBeInTheDocument(),
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

  it("surfaces the real 503 message instead of a generic fallback", async () => {
    saleHandler = () =>
      jsonResponse({ message: "Per-payment links are not enabled yet" }, 503);
    await renderTerminal();

    await createSale();

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
});
