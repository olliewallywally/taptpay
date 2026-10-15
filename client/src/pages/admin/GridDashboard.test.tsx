/*
 * The admin area's home page (owner decision 2026-09-30, answer 2: "Show the real totals from the admin's
 * own data, and say so plainly if they don't load (never a fake $0)"). It asked for a list the server does
 * not serve (GET /api/transactions), so it showed $0.00 revenue, 0 sales and 0 pending whatever the platform
 * held; a business list that failed to load read as "0 active merchants"; and an active business was
 * labelled Pending.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { getQueryFn } from "@/lib/queryClient";
import { GridDashboard } from "./GridDashboard";

jest.mock("wouter", () => ({ useLocation: () => ["/", jest.fn()] }));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, statusText: status < 400 ? "OK" : "Error", json: async () => body, text: async () => JSON.stringify(body), clone() { return this; } }) as unknown as Response;
const outage = () => reply({ message: "Failed to get admin analytics" }, 500);

const TOTALS = { totalMerchants: 3, totalRevenue: 1234.5, totalTransactions: 42, completedTransactions: 30, pendingTransactions: 3, businessesNotLoaded: 0 };
const BUSINESSES = [
  { id: 1, businessName: "Active Bakery", email: "a@example.test", status: "active" },
  { id: 2, businessName: "Verified Barber", email: "b@example.test", status: "verified" },
  { id: 3, businessName: "Pending Plumber", email: "c@example.test", status: "pending" },
];

type Answer = () => Response | Promise<Response>;
function serve({ totals = () => reply(TOTALS), businesses = () => reply(BUSINESSES) }: { totals?: Answer; businesses?: Answer }) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/admin/analytics") return totals();
    if (url === "/api/admin/merchants") return businesses();
    throw new Error(`Unhandled test request: ${url}`);
  });
}
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } } });
  render(
    <QueryClientProvider client={client}>
      <GridDashboard />
    </QueryClientProvider>,
  );
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});
const card = (title: string) => screen.getByText(title).closest("[data-testid^='stat-']") as HTMLElement;
const asked = () => fetchMock.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  fetchMock.mockReset();
});

describe("the admin home page's totals", () => {
  it("are the platform's real figures, from the admin's own data", async () => {
    serve({});
    renderPage();
    await settle();

    expect(card("Total Revenue")).toHaveTextContent("$1234.50");
    expect(card("Total Transactions")).toHaveTextContent("42");
    expect(card("Pending Transactions")).toHaveTextContent("3");
    expect(screen.queryByRole("alert")).toBeNull();
    // Never the list the server does not serve.
    expect(asked().sort()).toEqual(["/api/admin/analytics", "/api/admin/merchants"]);
  });

  it("a real zero is shown as zero", async () => {
    serve({ totals: () => reply({ ...TOTALS, totalRevenue: 0, totalTransactions: 0, pendingTransactions: 0 }) });
    renderPage();
    await settle();

    expect(card("Total Revenue")).toHaveTextContent("$0.00");
    expect(card("Total Transactions")).toHaveTextContent("0");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["the server fails", outage],
    ["the reply says OK and is not the figures", () => reply(null)],
    ["a figure is missing", () => reply({ ...TOTALS, pendingTransactions: undefined })],
    ["a figure is not a number", () => reply({ ...TOTALS, totalRevenue: "1234.50" })],
  ])("when %s: they say they didn't load, with Try again, and show no $0.00 and no 0", async (_name, answer) => {
    serve({ totals: answer });
    renderPage();
    await settle();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The platform's totals didn't load");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeEnabled();
    for (const title of ["Total Revenue", "Total Transactions", "Pending Transactions"]) {
      expect(card(title)).toHaveTextContent("didn't load");
      expect(card(title)).not.toHaveTextContent(/\$0\.00|^\s*0\s*$/);
      expect(card(title).textContent).not.toMatch(/\d/);
    }
    // The businesses loaded, and still show.
    expect(card("Active Merchants")).toHaveTextContent("2");
  });

  it("Try again loads them", async () => {
    let calls = 0;
    serve({ totals: () => (calls++ === 0 ? outage() : reply(TOTALS)) });
    renderPage();
    await settle();

    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await settle();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(card("Total Revenue")).toHaveTextContent("$1234.50");
  });

  it("while loading show neither a figure nor a failure", async () => {
    serve({ totals: () => new Promise<Response>(() => undefined), businesses: () => new Promise<Response>(() => undefined) });
    renderPage();
    await settle();

    expect(screen.queryByRole("alert")).toBeNull();
    for (const title of ["Total Revenue", "Total Transactions", "Active Merchants", "Pending Transactions"]) {
      expect(card(title).textContent).not.toMatch(/\d|didn't load/);
    }
  });

  it("say so when some businesses' figures could not be counted", async () => {
    serve({ totals: () => reply({ ...TOTALS, businessesNotLoaded: 2 }) });
    renderPage();
    await settle();

    expect(card("Total Revenue")).toHaveTextContent("$1234.50");
    expect(screen.getByRole("status")).toHaveTextContent("Not counting 2 businesses whose figures didn't load");
  });
});

describe("the admin home page's businesses", () => {
  it("counts the verified and active ones, and labels them so", async () => {
    serve({});
    renderPage();
    await settle();

    expect(card("Active Merchants")).toHaveTextContent("2");
    expect(within(screen.getByTestId("merchant-item-1")).getByText("✓ Verified")).toBeInTheDocument();
    expect(within(screen.getByTestId("merchant-item-2")).getByText("✓ Verified")).toBeInTheDocument();
    expect(within(screen.getByTestId("merchant-item-3")).getByText("Pending")).toBeInTheDocument();
  });

  it("when they fail to load: says so with Try again, not '0'; the totals still show", async () => {
    let calls = 0;
    serve({ businesses: () => (calls++ === 0 ? outage() : reply(BUSINESSES)) });
    renderPage();
    await settle();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The businesses didn't load");
    expect(card("Active Merchants")).toHaveTextContent("didn't load");
    expect(card("Active Merchants").textContent).not.toMatch(/\d/);
    expect(card("Total Revenue")).toHaveTextContent("$1234.50");

    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(card("Active Merchants")).toHaveTextContent("2");
  });

  it("a reply that says OK and is not a list reads as a failed load", async () => {
    serve({ businesses: () => reply({ merchants: BUSINESSES }) });
    renderPage();
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent("The businesses didn't load");
    expect(card("Active Merchants").textContent).not.toMatch(/\d/);
  });
});
