/*
 * R1-T9 — a failed load must never look like a quiet day. Retail analytics used
 * to turn a failed sales request into "$0.00 total revenue", "0 transactions"
 * and "no sales yet — take your first payment from the Terminal".
 *
 * Reports and exports are made only from loaded data. Every one needs the sales;
 * Stock Performance also needs the products, Revenue by Board the boards, and
 * the GST & Tax Summary the business details (whether the business is GST
 * registered), so only those wait for them. An export prints the business name
 * and GST number, so it waits for the business details as well.
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

type Answer = () => Response | Promise<Response>;
const PROFILE = { id: 77, businessName: "Test Shop", gstRegistered: true };
/** Answers every request the page makes: the sales as `sales` says, and the
    products, boards and business details as `others` says. */
function serve(sales: Answer, others: { stock?: Answer; boards?: Answer; profile?: Answer } = {}) {
  const { stock = () => reply([]), boards = () => reply([]), profile = () => reply(PROFILE) } = others;
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/merchants/77/transactions") return sales();
    if (url === "/api/merchants/77/stock-items") return stock();
    if (url === "/api/merchants/77/tapt-stones") return boards();
    if (url === "/api/merchants/77/profile") return profile();
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
  return client;
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});
const outage = () => reply({ message: "unavailable" }, 500);
const pending = () => new Promise<Response>(() => undefined); // never answers
const reportsButton = () => screen.getByRole("button", { name: "Reports" });
const exportButton = () => screen.getByRole("button", { name: "Export" });
const tile = (title: string) => screen.getByRole("button", { name: new RegExp(`^${title}`) });
const generateButton = () => screen.getByRole("button", { name: "Generate Report" });

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

describe("retail analytics reports and exports use only loaded data (R1-T9)", () => {
  it("a report picked while the sales were loading cannot be generated until they load", async () => {
    let answer: (response: Response) => void = () => undefined;
    serve(() => new Promise<Response>((resolve) => { answer = resolve; }));
    renderPage();
    await settle();

    await userEvent.click(reportsButton());
    await userEvent.click(tile("Best Sellers"));
    expect(generateButton()).toBeDisabled();

    await act(async () => { answer(reply(SALES)); });
    await settle();
    expect(generateButton()).toBeEnabled();
  });

  it("an export opened while the sales were loading is not offered once they fail, nor after Try again", async () => {
    let calls = 0;
    let fail: (answer: Response) => void = () => undefined;
    serve(() => (calls++ === 0 ? new Promise<Response>((resolve) => { fail = resolve; }) : reply(SALES)));
    renderPage();
    await settle();

    await userEvent.click(exportButton());
    await act(async () => { fail(outage()); });
    await settle();
    expect(screen.queryByText("Sales Reports")).toBeNull(); // no export from sales that failed
    expect(exportButton()).toBeDisabled();

    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.getByText("$11.50")).toBeInTheDocument();
    expect(screen.queryByText("Sales Reports")).toBeNull(); // the abandoned export does not pop up
  });

  it("an export asked for while the sales were loading opens once they have loaded", async () => {
    let answer: (response: Response) => void = () => undefined;
    serve(() => new Promise<Response>((resolve) => { answer = resolve; }));
    renderPage();
    await settle();

    await userEvent.click(exportButton());
    expect(screen.queryByText("Sales Reports")).toBeNull(); // not built from sales still loading
    await act(async () => { answer(reply(SALES)); });
    await settle();
    expect(screen.getByText("Sales Reports")).toBeInTheDocument(); // the click was not lost
  });

  it("products: Stock Performance waits for them; the other reports do not", async () => {
    serve(() => reply(SALES), { stock: outage });
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(exportButton()).toBeEnabled();

    await userEvent.click(reportsButton());
    expect(tile("Stock Performance")).toBeDisabled();
    expect(tile("Stock Performance")).toHaveAttribute("title", "Available once your products load");
    expect(tile("Best Sellers")).toBeEnabled();
    expect(tile("Revenue by Board")).toBeEnabled();
  });

  it("boards: Revenue by Board waits for them; the other reports do not", async () => {
    serve(() => reply(SALES), { boards: outage });
    renderPage();
    await settle();

    await userEvent.click(reportsButton());
    expect(tile("Revenue by Board")).toBeDisabled();
    expect(tile("Revenue by Board")).toHaveAttribute("title", "Available once your boards load");
    expect(tile("Best Sellers")).toBeEnabled();
  });

  it("business details: the GST & Tax Summary and Export wait for them; the other reports do not", async () => {
    serve(() => reply(SALES), { profile: outage });
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(exportButton()).toBeDisabled();
    expect(exportButton()).toHaveAttribute("title", "Available once your business details load");

    await userEvent.click(reportsButton());
    expect(tile("GST & Tax Summary")).toBeDisabled();
    expect(tile("GST & Tax Summary")).toHaveAttribute("title", "Available once your business details load");
    expect(tile("Best Sellers")).toBeEnabled();
  });

  it.each([
    ["Stock Performance", "products", { stock: pending }],
    ["Revenue by Board", "boards", { boards: pending }],
    ["GST & Tax Summary", "business details", { profile: pending }],
  ])("%s picked while its %s were loading cannot be generated", async (title, _source, others) => {
    serve(() => reply(SALES), others);
    renderPage();
    await settle();

    await userEvent.click(reportsButton());
    await userEvent.click(tile(title));
    expect(generateButton()).toBeDisabled();
  });

  it("a report picked while the boards were loading cannot be generated once they fail", async () => {
    let fail: (answer: Response) => void = () => undefined;
    serve(() => reply(SALES), { boards: () => new Promise<Response>((resolve) => { fail = resolve; }) });
    renderPage();
    await settle();

    await userEvent.click(reportsButton());
    await userEvent.click(tile("Revenue by Board"));
    await act(async () => { fail(outage()); });
    await settle();
    expect(generateButton()).toBeDisabled();
    expect(generateButton()).toHaveAttribute("title", "Available once your boards load");
  });

  it("an export asked for while the business details were loading is not offered if they fail, and does not pop up once they load", async () => {
    let calls = 0;
    let answer: (response: Response) => void = () => undefined;
    serve(() => reply(SALES), {
      profile: () => (calls++ === 0 ? new Promise<Response>((resolve) => { answer = resolve; }) : reply(PROFILE)),
    });
    const client = renderPage();
    await settle();

    await userEvent.click(exportButton());
    expect(screen.queryByText("Sales Reports")).toBeNull();
    await act(async () => { answer(outage()); });
    await settle();
    expect(screen.queryByText("Sales Reports")).toBeNull();
    expect(exportButton()).toBeDisabled();

    await act(async () => {
      await client.refetchQueries({ queryKey: ["/api/merchants", 77, "profile"] });
    });
    await settle();
    expect(exportButton()).toBeEnabled();
    expect(screen.queryByText("Sales Reports")).toBeNull(); // the abandoned export does not pop up
  });
});
