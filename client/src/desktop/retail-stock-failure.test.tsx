/*
 * R1-T9 — a failed load must never look like an empty shop. Retail stock used to
 * turn a failed products request into "0 products in inventory" and "no products
 * yet — add your first", and a failed sales request into "no sales this week" on
 * every product and "no sales recorded yet this week" for the best seller.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import DesktopRetailStock from "./pages/retail-stock";

jest.mock("@/lib/auth", () => ({ getCurrentMerchantId: () => 77 }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const outage = () => reply({ message: "unavailable" }, 500);
const PRODUCTS = [
  { id: 1, name: "flat white", cost: "5.50", description: "", emoji: "", variations: [] },
  { id: 2, name: "latte", cost: "6.00", description: "", emoji: "", variations: [] },
];
const SALES = [
  { id: 1, itemName: "latte", price: "6.00", status: "completed", createdAt: new Date().toISOString() },
  { id: 2, itemName: "latte", price: "6.00", status: "completed", createdAt: new Date().toISOString() },
];

/** Answers the products and sales requests as given; anything else with an empty list. */
function serve(products: () => Response | Promise<Response>, sales: () => Response | Promise<Response> = () => reply(SALES)) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/merchants/77/stock-items") return products();
    if (url === "/api/merchants/77/transactions") return sales();
    return reply([]);
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DesktopRetailStock deviceClass="desktop" />
    </QueryClientProvider>,
  );
  return client;
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe("retail stock when products fail to load (R1-T9)", () => {
  it("says so in the frame, and shows no count, no 'no products yet' and no 'no sales'", async () => {
    serve(outage);
    renderPage();
    await settle();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Products didn't load");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(document.querySelector(".rs-count")).toBeNull(); // no "0 products in inventory"
    expect(screen.queryByText(/no products yet/i)).toBeNull();
    expect(screen.queryByText(/no sales/i)).toBeNull();
    expect(screen.getByText("inventory didn't load")).toBeInTheDocument();
  });

  it("Try again reloads the products and shows them", async () => {
    let calls = 0;
    serve(() => (calls++ === 0 ? outage() : reply(PRODUCTS)));
    renderPage();
    await settle();

    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await settle();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".rs-count")).toHaveTextContent("2");
    expect(screen.getByText("flat white")).toBeInTheDocument();
  });

  it("a failed background refresh keeps the products already shown", async () => {
    let calls = 0;
    serve(() => (calls++ === 0 ? reply(PRODUCTS) : outage()));
    const client = renderPage();
    await settle();

    await act(async () => {
      await client.refetchQueries({ queryKey: ["/api/merchants", 77, "stock-items"] });
    });
    await settle();

    expect(calls).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".rs-count")).toHaveTextContent("2");
    expect(screen.getByText("flat white")).toBeInTheDocument();
  });

  it("while loading shows neither a count nor a failure", async () => {
    serve(() => new Promise<Response>(() => undefined)); // never answers
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".rs-count")).toHaveTextContent("—");
    expect(screen.getByText("loading inventory…")).toBeInTheDocument();
  });
});

describe("retail stock when only this week's sales fail to load (R1-T9)", () => {
  it("shows the products, and says the sales are unavailable instead of 'no sales'", async () => {
    serve(() => reply(PRODUCTS), outage);
    renderPage();
    await settle();

    expect(screen.getByText("flat white")).toBeInTheDocument();
    expect(screen.queryByText(/no sales/i)).toBeNull();
    expect(screen.getAllByText("sales unavailable")).toHaveLength(2);
    expect(screen.getByText("this week's sales didn't load")).toBeInTheDocument();
  });
});

describe("retail stock with everything loaded", () => {
  it("shows the count, the products and the week's sales exactly as before", async () => {
    serve(() => reply(PRODUCTS));
    renderPage();
    await settle();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".rs-count")).toHaveTextContent("2");
    expect(screen.getByText("2 sold this week")).toBeInTheDocument();
    expect(screen.getByText("no sales this week")).toBeInTheDocument();
    expect(screen.getByText("2 sold")).toBeInTheDocument(); // best seller pill
  });
});
