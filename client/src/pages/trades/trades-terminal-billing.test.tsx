/*
 * R1-T9: a billing 402 states the required action once, in the banner the fetch
 * layer raises (lib/queryClient.ts). The phone trades screens' actions add no
 * message of their own, and what was typed stays to send again.
 *
 * The terminal and quote views are stubbed with buttons that call the pages'
 * real callbacks and show the pages' own error, toast and banner lines, so the
 * pages' handling is what is tested. The recurring page renders for real. The
 * last block: any other failed action says so.
 */
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { BILLING_CARD_REQUIRED_EVENT } from "@/lib/queryClient";
import TradesTerminal, { QuoteScreen } from "./trades-terminal";
import RecurringSchedules from "./recurring-schedules";

jest.mock("@/features/terminal/trades/TradesTerminalView", () => {
  const React = require("react");
  const button = (label: string, onClick: () => void) => React.createElement("button", { onClick }, label);
  const client = { id: "client-1", firstName: "Sam", lastName: "Tui", preferredChannel: "email", email: "sam@example.test" };
  function QuoteViewStub(props: any) {
    return React.createElement(
      "div",
      {
        "data-testid": "quote",
        "data-recipient": props.recipient.name,
        "data-lines": JSON.stringify(props.lines.map((line: any) => [line.description, line.qty, line.unitPrice])),
        "data-created": props.created ? "yes" : "no",
      },
      button("fill quote", () => {
        props.onRecipientChange({ name: "Sam Tui", email: "", address: "" });
        props.onLineChange(1, "description", "Rewire kitchen");
        props.onLineChange(1, "unitPrice", "1000");
      }),
      button("create quote", () => props.onCreate()),
      React.createElement("output", { "data-testid": "quote-error" }, props.error),
    );
  }
  return {
    __esModule: true,
    QuoteView: QuoteViewStub,
    TradesTerminalView: function TradesTerminalViewStub(props: any) {
      return React.createElement(
        "div",
        {
          "data-testid": "view",
          "data-screen": props.screen,
          "data-client": props.selectedClient?.id ?? "",
          "data-amount": String(props.amount),
          "data-invoices": String(props.invoices.length),
          "data-row": props.rowAction?.id ?? "",
        },
        button("pick client", () => props.onClientSelect(client)),
        button("enter amount", () => props.onAmountCommit(50000)),
        button("send invoice", () => props.onSendInvoice()),
        button("open deposit row", () => props.onRowTap(props.invoices.find((invoice: any) => invoice.id === "inv-dep"))),
        button("send balance", () => props.onSendBalance(false)),
        button("mark received", () => props.onMarkExternal("inv-dep", "ANZ 4471")),
        React.createElement("output", { "data-testid": "toast" }, props.toastMessage ?? ""),
        React.createElement("output", { "data-testid": "page-banner" }, props.banner ?? ""),
      );
    },
  };
});
jest.mock("@/features/terminal/trades/MobileQuoteView", () => ({
  __esModule: true,
  MobileQuoteView: jest.requireMock("@/features/terminal/trades/TradesTerminalView").QuoteView,
}));
jest.mock("@/hooks/use-device-class", () => ({ useDeviceClass: () => "mobile" }));
jest.mock("@/pages/trades/client-profile", () => ({ __esModule: true, default: () => null }));
jest.mock("wouter", () => ({ useLocation: () => ["/trades/recurring", jest.fn()] }));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const BILLING_402 = {
  code: "BILLING_CARD_REQUIRED",
  message: "Your subscription needs attention before you can send payments. Open Billing in Settings.",
};
const CLIENT = { id: "client-1", firstName: "Sam", lastName: "Tui", status: "active", siteAddress: "4 Kea St", preferredChannel: "email", email: "sam@example.test" };
const DEPOSIT_INVOICE = {
  id: "inv-dep", kind: "deposit", status: "deposit_paid", quoteId: "quote-1", clientProfileId: "client-1",
  amountCents: 20000, createdAt: "2026-09-01T00:00:00Z",
};
const GATED = ["POST /api/trades/quotes", "POST /api/trades/invoices", "POST /api/trades/invoices/inv-dep/send-balance", "POST /api/trades/schedules"];

let writes: string[];
let banners: number;
const countBanner = () => { banners += 1; };

beforeEach(() => {
  writes = [];
  banners = 0;
  window.addEventListener(BILLING_CARD_REQUIRED_EVENT, countBanner);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "GET" && url === "/api/trades/clients") return reply([CLIENT]);
    if (method === "GET" && url === "/api/trades/invoices") return reply([DEPOSIT_INVOICE]);
    if (method === "GET" && url === "/api/trades/quotes") return reply([]);
    if (method === "GET" && url === "/api/trades/schedules") return reply([]);
    if (method === "GET" && url === "/api/trades/reminder-settings") return reply({ tradeRemindersEnabled: true });
    if (method === "GET" && url === "/api/auth/me") return reply({ user: { gstRegistered: false } });
    writes.push(`${method} ${url}`);
    if (GATED.includes(`${method} ${url}`)) return reply(BILLING_402, 402);
    if (method === "POST" && url === "/api/trades/invoices/inv-dep/mark-paid-external") return reply({ message: "nope" }, 500);
    throw new Error(`Unhandled test request: ${method} ${url}`);
  });
});
afterEach(() => window.removeEventListener(BILLING_CARD_REQUIRED_EVENT, countBanner));

function renderPage(page: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
  return queryClient;
}

/* The action has finished: its mutation is marked done only after the page's own
   onError/onSuccess has run; the short wait then lets React draw what it set. */
async function settled(queryClient: QueryClient) {
  await waitFor(() =>
    expect(queryClient.getMutationCache().getAll().map((m) => m.state.status)).toEqual([
      expect.stringMatching(/^(error|success)$/),
    ]),
  );
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
}

describe("a billing 402 on the phone trades screens (R1-T9)", () => {
  it("a quote (terminal and quote builder): the banner alone says so; the quote stays to create again", async () => {
    const queryClient = renderPage(<QuoteScreen onCancel={jest.fn()} onExit={jest.fn()} />);
    fireEvent.click(screen.getByText("fill quote"));
    fireEvent.click(screen.getByText("create quote"));

    await settled(queryClient);
    expect(writes).toEqual(["POST /api/trades/quotes"]);
    expect(banners).toBe(1);
    expect(screen.getByTestId("quote-error")).toBeEmptyDOMElement();
    const quote = screen.getByTestId("quote");
    expect(quote).toHaveAttribute("data-created", "no");
    expect(quote).toHaveAttribute("data-recipient", "Sam Tui");
    expect(quote).toHaveAttribute("data-lines", JSON.stringify([["Rewire kitchen", "1", "1000"]]));
  });

  it("an invoice: the banner alone says so; the client and amount stay to send again", async () => {
    const queryClient = renderPage(<TradesTerminal />);
    const view = screen.getByTestId("view");
    fireEvent.click(screen.getByText("pick client"));
    fireEvent.click(screen.getByText("enter amount"));
    expect(view).toHaveAttribute("data-screen", "invoice");
    fireEvent.click(screen.getByText("send invoice"));

    await settled(queryClient);
    expect(writes).toEqual(["POST /api/trades/invoices"]);
    expect(banners).toBe(1);
    expect(screen.getByTestId("toast")).toBeEmptyDOMElement();
    expect(view).toHaveAttribute("data-screen", "invoice");
    expect(view).toHaveAttribute("data-client", "client-1");
    expect(view).toHaveAttribute("data-amount", "50000");
  });

  it("sending a balance: the banner says why it was not sent, and nothing else does", async () => {
    const queryClient = renderPage(<TradesTerminal />);
    const view = screen.getByTestId("view");
    await waitFor(() => expect(view).toHaveAttribute("data-invoices", "1"));
    fireEvent.click(screen.getByText("open deposit row"));
    fireEvent.click(screen.getByText("send balance"));

    await settled(queryClient);
    expect(writes).toEqual(["POST /api/trades/invoices/inv-dep/send-balance"]);
    expect(banners).toBe(1);
    expect(screen.getByTestId("toast")).toBeEmptyDOMElement();
    expect(screen.getByTestId("page-banner")).toBeEmptyDOMElement();
    expect(view).toHaveAttribute("data-row", "inv-dep");
  });

  it("a recurring invoice: the banner alone says so; the form stays to create again", async () => {
    const queryClient = renderPage(<RecurringSchedules />);
    await screen.findByRole("option", { name: /Sam Tui/ });
    const [clientSelect] = screen.getAllByRole("combobox"); // the form's first field
    fireEvent.change(clientSelect, { target: { value: "client-1" } });
    fireEvent.change(screen.getByPlaceholderText("Amount"), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "Create recurring Invoice" }));

    await settled(queryClient);
    expect(writes).toEqual(["POST /api/trades/schedules"]);
    expect(banners).toBe(1);
    expect(screen.queryByText(/subscription|Open Billing|Action failed/i)).toBeNull();
    expect(clientSelect).toHaveValue("client-1");
    expect(screen.getByPlaceholderText("Amount")).toHaveValue("1200");
  });
});

/* R1-T9: a failed action says so. Marking a job payment received showed nothing
   when it failed; the merchant could not tell it had not been recorded. */
describe("a failed action on the phone trades terminal says so (R1-T9)", () => {
  it("marking a payment received: a failure is reported", async () => {
    const queryClient = renderPage(<TradesTerminal />);
    fireEvent.click(screen.getByText("mark received"));

    await settled(queryClient);
    expect(writes).toEqual(["POST /api/trades/invoices/inv-dep/mark-paid-external"]);
    expect(screen.getByTestId("toast")).toHaveTextContent("Could not mark as received");
    expect(banners).toBe(0);
  });
});
