import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { NotificationProvider } from "@/components/notification-system";
import MerchantTerminalMobile from "./merchant-terminal-mobile";

/*
 * The real Select is Radix-based (portal + pointer-capture machinery jsdom
 * doesn't implement); this page only needs onValueChange to fire with the
 * chosen stone id, so it is replaced with a plain native <select> that reads
 * SelectItem's `value`/children out of the JSX tree passed to SelectContent.
 * This is scoped to this test file only via jest.mock's module registry.
 */
jest.mock("@/components/ui/select", () => {
  const React = require("react");
  const SelectItemMarker = ({ children }: { value: string; children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  function collectItems(node: unknown, out: { value: string; label: unknown }[]): void {
    if (node === null || node === undefined || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((child) => collectItems(child, out));
      return;
    }
    const el = node as { type?: unknown; props?: { value?: string; children?: unknown } };
    if (el.type === SelectItemMarker && el.props) {
      out.push({ value: String(el.props.value), label: el.props.children });
      return;
    }
    if (el.props && el.props.children !== undefined) {
      collectItems(el.props.children, out);
    }
  }
  const Select = ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) => {
    const items: { value: string; label: unknown }[] = [];
    collectItems(children, items);
    return React.createElement(
      "select",
      {
        "data-testid": "mock-tapt-stone-select",
        value: value ?? "",
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange(e.target.value),
      },
      React.createElement("option", { value: "" }, "-- choose --"),
      items.map((item) =>
        React.createElement("option", { key: item.value, value: item.value }, item.label),
      ),
    );
  };
  const Passthrough = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    Select,
    SelectTrigger: Passthrough,
    SelectValue: () => null,
    SelectContent: Passthrough,
    SelectItem: SelectItemMarker,
  };
});

/*
 * NOTE on interaction style: like merchant-terminal.tsx, this page defines
 * its "edit"/"send" panels via a hand-rolled tab/action-toggle pattern whose
 * inner JSX is re-evaluated on every render together with several concurrent
 * effects (NFC capabilities fetch, active-transaction polling). Using
 * @testing-library/user-event's multi-tick click() risks the button's DOM
 * node being replaced mid-dispatch by one of those unrelated re-renders,
 * silently dropping the click (see merchant-terminal.test.tsx's note and the
 * accompanying evidence doc for the isolated repro) — fireEvent is used
 * throughout for determinism.
 *
 * jsdom's default window.innerWidth (1024) keeps this page's `isMobile`
 * state false after its mount-time resize check, so an unforced render
 * always takes the "Desktop/Non-mobile version" branch — that is the branch
 * these tests exercise directly. The `isMobile` branch renders the identical
 * share-link overlay from the same `shareLinkOverlay` variable (see the
 * source diff / evidence doc), so it is covered by code symmetry rather than
 * a second direct interaction pass.
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

function renderTerminal() {
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
        <MerchantTerminalMobile />
      </NotificationProvider>
    </QueryClientProvider>,
  );
  return { ...rendered, queryClient };
}

/** Opens the "Edit" action panel (desktop/non-mobile branch's second copy). */
function openEditPanel() {
  fireEvent.click(screen.getByText("Edit"));
}

/**
 * Fills and submits via the always-visible "no active transaction" inline
 * create form (top of the desktop/non-mobile branch) — unique in the DOM as
 * long as the "Edit" action panel is never opened, so no ambiguity with its
 * near-duplicate copy of the same fields.
 */
async function fillAndSubmit(itemName: string, price: string) {
  fireEvent.change(screen.getByPlaceholderText("Item name"), {
    target: { value: itemName },
  });
  fireEvent.change(screen.getByPlaceholderText("0.00"), {
    target: { value: price },
  });
  fireEvent.click(screen.getByRole("button", { name: /Create Transaction/i }));
  await Promise.resolve();
}

beforeEach(() => {
  jest.clearAllMocks();
  saleBodies = [];
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

describe("merchant-terminal-mobile per-payment link migration (gap 12)", () => {
  it("no stone selected: sends linkMode per_payment and shows the share-link overlay", async () => {
    renderTerminal();
    await screen.findByText("Edit");

    await fillAndSubmit("Coffee", "5.00");

    await waitFor(() => expect(saleBodies).toHaveLength(1));
    expect(saleBodies[0]).toEqual({
      merchantId: 1,
      itemName: "Coffee",
      price: "5.00",
      status: "pending",
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

  // THE bug-prevention test: this is the exact case the prior pass's plan
  // got wrong. The mocked response STILL carries paymentUrl/qrCodeUrl (as
  // the real server always does — see server/routes.ts's unconditional
  // transactionWithUrls), so a naive "gate on response.paymentUrl presence"
  // implementation would show the share UI here too. It must not: a board
  // was selected, so this is a legacy/standing-address sale.
  it("stone selected: sends selectedStoneId+linkMode legacy and does NOT show the share-link overlay even though the response carries paymentUrl/qrCodeUrl", async () => {
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
    await screen.findByText("Edit");

    openEditPanel();
    fireEvent.change(screen.getByPlaceholderText("Enter item name"), {
      target: { value: "Coffee" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter price"), {
      target: { value: "5.00" },
    });
    fireEvent.change(screen.getByTestId("mock-tapt-stone-select"), {
      target: { value: "42" },
    });
    // Two near-identical "Create Transaction" submit buttons exist while the
    // Edit panel is open (the always-visible inline form, plus this panel's
    // own copy) — submit via this panel's, the one wired to the stone select.
    const submitButtons = screen.getAllByRole("button", { name: /Create Transaction/i });
    fireEvent.click(submitButtons[submitButtons.length - 1]);
    await Promise.resolve();

    await waitFor(() => expect(saleBodies).toHaveLength(1));
    expect(saleBodies[0]).toEqual({
      merchantId: 1,
      itemName: "Coffee",
      price: "5.00",
      status: "pending",
      selectedStoneId: 42,
      linkMode: "legacy",
    });

    // Give the (absent) overlay a chance to appear before asserting it didn't.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("share-link-overlay")).not.toBeInTheDocument();
  });

  it("surfaces the real 503 message instead of a generic fallback", async () => {
    saleHandler = () =>
      jsonResponse({ message: "Per-payment links are not enabled yet" }, 503);
    renderTerminal();
    await screen.findByText("Edit");

        await fillAndSubmit("Coffee", "5.00");

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
    await screen.findByText("Edit");

        await fillAndSubmit("Coffee", "5.00");
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
    const { queryClient } = renderTerminal();
    await screen.findByText("Edit");

        await fillAndSubmit("Coffee", "5.00");
    await screen.findByTestId("share-link-overlay");

    queryClient.setQueryData(["/api/merchants", 1, "active-transaction"], {
      id: 1,
      status: "pending",
      price: "5.00",
      itemName: "Coffee",
    });
    await waitFor(() =>
      expect(screen.getByText("Coffee")).toBeInTheDocument(),
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
