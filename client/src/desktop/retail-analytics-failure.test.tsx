/*
 * R1-T9 — a failed load must never look like a quiet day. Retail analytics used
 * to turn a failed sales request into "$0.00 total revenue", "0 transactions"
 * and "no sales yet — take your first payment from the Terminal".
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import DesktopRetailAnalytics from "./pages/retail-analytics";

jest.mock("@/lib/auth", () => ({ getCurrentMerchantId: () => 77 }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const SALES = [
  { id: 1, itemName: "flat white", price: "5.50", status: "completed", paymentMethod: "qr_code", createdAt: new Date().toISOString() },
  { id: 2, itemName: "latte", price: "6.00", status: "completed", paymentMethod: "qr_code", createdAt: new Date().toISOString() },
];

/** Answers every request the page makes; the sales request as `sales` says. */
function serve(sales: () => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/merchants/77/transactions") return sales();
    if (url === "/api/merchants/77/profile") return reply({ id: 77, businessName: "Test Shop" });
    return reply([]);
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DesktopRetailAnalytics deviceClass="desktop" />
    </QueryClientProvider>,
  );
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});
const outage = () => reply({ message: "unavailable" }, 500);

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.setItem("authToken", "h.e30.s");
});

describe("retail analytics when sales fail to load (R1-T9)", () => {
  it("says so in the frame, and shows no figure, no chart and no 'no sales yet'", async () => {
    serve(outage);
    renderPage();
    await settle();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Sales didn't load");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(screen.queryByText("$0.00")).toBeNull();
    expect(screen.queryByText(/no sales yet/i)).toBeNull();
    expect(document.querySelector(".ra-hero")).toBeNull(); // no revenue figure at all
    expect(document.querySelector(".ra-hero-tx")).toBeNull(); // no transaction count
    expect(document.querySelector(".ra-chart")).toBeNull();
    expect(screen.getByText("Payment history didn't load.")).toBeInTheDocument();
  });

  it("keeps Reports and Export unavailable until the sales load", async () => {
    serve(outage);
    renderPage();
    await settle();
    expect(screen.getByRole("button", { name: "Reports" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("Try again reloads the sales and shows them", async () => {
    let calls = 0;
    serve(() => (calls++ === 0 ? outage() : reply(SALES)));
    renderPage();
    await settle();

    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await settle();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("$11.50")).toBeInTheDocument();
    expect(screen.getByText("latte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reports" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("while loading shows neither a figure nor a failure", async () => {
    serve(() => new Promise<Response>(() => undefined)); // never answers
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("$0.00")).toBeNull();
    expect(screen.getByText("loading sales…")).toBeInTheDocument();
  });

  it("with sales loaded, shows them exactly as before", async () => {
    serve(() => reply(SALES));
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("$11.50")).toBeInTheDocument();
    expect(screen.getByText("flat white")).toBeInTheDocument();
  });
});
