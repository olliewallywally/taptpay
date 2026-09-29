/*
 * R1-T9 — a failed load must never look like a quiet day, and must not leave a
 * money button live. Retail terminal used to turn a failed sales request into
 * "$0" revenue today, "0" transactions and "no sales yet", with "send payment"
 * still live, although the sales list is where a merchant sees a payment land.
 * A failed products request read "no products yet — add them on the Stock page".
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import DesktopRetailTerminal from "./pages/retail-terminal";

jest.mock("@/lib/auth", () => ({ getCurrentMerchantId: () => 77 }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, statusText: status < 400 ? "OK" : "Error", json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const outage = () => reply({ message: "unavailable" }, 500);
const now = new Date().toISOString();
const SALES = [
  { id: 1, itemName: "flat white", price: "5.50", status: "completed", createdAt: now },
  { id: 2, itemName: "latte", price: "6.50", status: "completed", createdAt: now },
];
const PRODUCTS = [{ id: 1, name: "scone", cost: "4.00", emoji: "" }];

type Answer = () => Response | Promise<Response>;
/** Answers the sales and products requests as given; the rest as a working day would. */
function serve({ sales = () => reply(SALES), products = () => reply(PRODUCTS) }: { sales?: Answer; products?: Answer }) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/merchants/77/transactions") return sales();
    if (url === "/api/merchants/77/stock-items") return products();
    if (url === "/api/merchants/77/profile") return reply({ id: 77, businessName: "Test Shop" });
    return reply([]);
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DesktopRetailTerminal deviceClass="desktop" />
    </QueryClientProvider>,
  );
  return client;
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.setItem("authToken", "h.e30.s");
});

describe("retail terminal when sales fail to load (R1-T9)", () => {
  it("says so in the frame, shows no $0 and no 'no sales yet', and keeps the payment button off", async () => {
    serve({ sales: outage });
    renderPage();
    await settle();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Sales didn't load");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(document.querySelector(".rt-hero")).toBeNull(); // no "$0" today, no "0" transactions
    expect(screen.queryByText(/no sales yet/i)).toBeNull();
    expect(screen.getByText("sales didn't load")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "send payment" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "split bill" }));
    await settle();
    expect(screen.getByRole("button", { name: "send split payment" })).toBeDisabled();
  });

  it("Try again reloads the sales, shows today's figures and turns the payment button back on", async () => {
    let calls = 0;
    serve({ sales: () => (calls++ === 0 ? outage() : reply(SALES)) });
    renderPage();
    await settle();

    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await settle();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("$12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "send payment" })).toBeEnabled();
  });

  it("a failed background refresh keeps today's figures and the payment button", async () => {
    let calls = 0;
    serve({ sales: () => (calls++ === 0 ? reply(SALES) : outage()) });
    const client = renderPage();
    await settle();

    await act(async () => {
      await client.refetchQueries({ queryKey: ["/api/merchants", 77, "transactions"] });
    });
    await settle();

    expect(calls).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("$12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "send payment" })).toBeEnabled();
  });

  it("while loading shows neither a figure nor a failure", async () => {
    serve({ sales: () => new Promise<Response>(() => undefined) }); // never answers
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("$0")).toBeNull();
    expect(screen.getByText("loading…")).toBeInTheDocument();
  });

  it("with sales loaded, shows today's figures and the list exactly as before", async () => {
    serve({});
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("$12")).toBeInTheDocument();
    expect(screen.getByText("latte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "send payment" })).toBeEnabled();
  });
});

describe("retail terminal when products fail to load (R1-T9)", () => {
  it("the stock tiles say so with a Try again, not 'no products yet'; a keyed-in sale still works", async () => {
    let calls = 0;
    serve({ products: () => (calls++ === 0 ? outage() : reply(PRODUCTS)) });
    renderPage();
    await settle();
    expect(screen.getByRole("button", { name: "send payment" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "stock tiles" }));
    await settle();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Products didn't load");
    expect(screen.queryByText(/no products yet/i)).toBeNull();

    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("scone")).toBeInTheDocument();
  });
});
