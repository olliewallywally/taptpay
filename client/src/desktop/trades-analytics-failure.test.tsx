/*
 * R1-T9 — a failed load must never look like a quiet period. Trades analytics
 * used to turn a failed invoices request into "$0.00 total revenue", "$0.00
 * outstanding invoices", a flat chart and "no payments in this period", with
 * Reports and Export live. Reports and exports are also built from the clients
 * and the quotes, so they wait for those too, and are made only from loaded
 * data: one asked for while a request is still loading waits for it, and one
 * asked for before a failure is not offered on the failed data. Without the
 * clients, the history keeps its payments and says their names did not load.
 * An export also waits for the business details (its header, and whether to show GST).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import DesktopTradesAnalytics from "./pages/trades-analytics";

jest.mock("@/lib/auth", () => ({ getCurrentMerchantId: () => 77 }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const outage = () => reply({ message: "unavailable" }, 500);
const now = new Date().toISOString();
const CLIENTS = [
  { id: "c1", firstName: "Aroha", lastName: "Ngata", siteAddress: "14 Rimu Street", status: "active" },
];
const INVOICES = [
  { id: "j1", clientProfileId: "c1", amountCents: 150_000, status: "paid", createdAt: now, paidAt: now },
  { id: "j2", clientProfileId: "c1", amountCents: 42_000, status: "dispatched", createdAt: now, paidAt: null },
];
const QUOTES = [{ id: "q1", clientProfileId: "c1", totalCents: 99_000, status: "sent", createdAt: now }];

type Answer = () => Response | Promise<Response>;
const PROFILE = { id: 77, businessName: "Test Trades", tradeGstMode: "exclusive" };
/** Answers the three trades requests and the business details as given; the rest as a working day would. */
function serve({
  invoices = () => reply(INVOICES),
  clients = () => reply(CLIENTS),
  quotes = () => reply(QUOTES),
  profile = () => reply(PROFILE),
}: { invoices?: Answer; clients?: Answer; quotes?: Answer; profile?: Answer }) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/trades/invoices") return invoices();
    if (url === "/api/trades/clients") return clients();
    if (url === "/api/trades/quotes") return quotes();
    if (url === "/api/merchants/77/profile") return profile();
    return reply([]);
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DesktopTradesAnalytics deviceClass="desktop" />
    </QueryClientProvider>,
  );
  return client;
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});
const reports = () => screen.getByRole("button", { name: "Reports" });
const exportButton = () => screen.getByRole("button", { name: "Export" });

beforeEach(() => {
  fetchMock.mockReset();
});

describe("trades analytics when invoices fail to load (R1-T9)", () => {
  it("says so in the frame, and shows no total, no outstanding, no chart and no 'no payments'", async () => {
    serve({ invoices: outage });
    renderPage();
    await settle();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Payments didn't load");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(document.querySelector(".ta-hero")).toBeNull(); // no "$0.00 total revenue"
    expect(document.querySelector(".ta-hero-out")).toBeNull(); // no "$0.00 outstanding"
    expect(document.querySelector(".ta-chart")).toBeNull(); // no flat line
    expect(screen.queryByText(/no payments in this period/i)).toBeNull();
    expect(screen.getByText("Payment history didn't load.")).toBeInTheDocument();
    expect(reports()).toBeDisabled();
    expect(exportButton()).toBeDisabled();
    expect(reports()).toHaveAttribute("title", "Available once your payments load");
  });

  it("Try again reloads the invoices and shows the totals", async () => {
    let calls = 0;
    serve({ invoices: () => (calls++ === 0 ? outage() : reply(INVOICES)) });
    renderPage();
    await settle();

    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await settle();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".ta-hero")).toHaveTextContent("$1,500.00");
    expect(reports()).toBeEnabled();
  });

  it("a failed background refresh keeps the totals already shown", async () => {
    let calls = 0;
    serve({ invoices: () => (calls++ === 0 ? reply(INVOICES) : outage()) });
    const client = renderPage();
    await settle();

    await act(async () => {
      await client.refetchQueries({ queryKey: ["/api/trades/invoices"] });
    });
    await settle();

    expect(calls).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".ta-hero")).toHaveTextContent("$1,500.00");
    expect(reports()).toBeEnabled();
  });

  it("a report opened while invoices were loading cannot be generated once they fail", async () => {
    let fail: (answer: Response) => void = () => undefined;
    serve({ invoices: () => new Promise<Response>((resolve) => { fail = resolve; }) });
    renderPage();
    await settle();

    await userEvent.click(reports());
    await userEvent.click(document.querySelector(".ta-tile") as HTMLElement);
    await act(async () => { fail(outage()); });
    await settle();

    expect(screen.getByRole("button", { name: "Generate Report" })).toBeDisabled();
  });

  it("an export opened while invoices were loading is not offered once they fail, nor after Try again", async () => {
    let calls = 0;
    let fail: (answer: Response) => void = () => undefined;
    serve({
      invoices: () =>
        calls++ === 0 ? new Promise<Response>((resolve) => { fail = resolve; }) : reply(INVOICES),
    });
    renderPage();
    await settle();

    await userEvent.click(exportButton());
    await act(async () => { fail(outage()); });
    await settle();

    expect(screen.queryByText("Trades Reports")).toBeNull(); // no export from payments that failed
    expect(exportButton()).toBeDisabled();

    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await settle();
    expect(document.querySelector(".ta-hero")).toHaveTextContent("$1,500.00");
    expect(screen.queryByText("Trades Reports")).toBeNull(); // the abandoned export does not pop up
  });

  it("while loading, a report cannot be generated and an export waits for the data", async () => {
    let answer: (response: Response) => void = () => undefined;
    serve({ invoices: () => new Promise<Response>((resolve) => { answer = resolve; }) });
    renderPage();
    await settle();

    await userEvent.click(reports());
    await userEvent.click(document.querySelector(".ta-tile") as HTMLElement);
    expect(screen.getByRole("button", { name: "Generate Report" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "All Reports" }));
    await userEvent.click(screen.getByRole("button", { name: "Payment History" }));
    await userEvent.click(exportButton());
    expect(screen.queryByText("Trades Reports")).toBeNull(); // not built from payments still loading

    await act(async () => { answer(reply(INVOICES)); });
    await settle();
    expect(screen.getByText("Trades Reports")).toBeInTheDocument(); // the click was not lost
  });

  it.each([
    ["clients", { clients: () => new Promise<Response>(() => undefined) }],
    ["quotes", { quotes: () => new Promise<Response>(() => undefined) }],
  ])("while the %s are still loading, a report cannot be generated", async (_source, pending) => {
    serve(pending);
    renderPage();
    await settle();

    await userEvent.click(reports());
    await userEvent.click(document.querySelector(".ta-tile") as HTMLElement);
    expect(screen.getByRole("button", { name: "Generate Report" })).toBeDisabled();
  });

  it("while loading shows neither a figure nor a failure", async () => {
    serve({ invoices: () => new Promise<Response>(() => undefined) }); // never answers
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("$0.00")).toBeNull();
    expect(screen.getByText("loading payments…")).toBeInTheDocument();
  });

  it("with everything loaded, shows the totals, the chart and the history exactly as before", async () => {
    serve({});
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".ta-hero")).toHaveTextContent("$1,500.00");
    expect(document.querySelector(".ta-hero-out")).toHaveTextContent("$420.00");
    expect(document.querySelector(".ta-chart")).not.toBeNull();
    expect(screen.getAllByText("Aroha Ngata").length).toBeGreaterThan(0);
    expect(screen.queryByText("client names didn't load")).toBeNull();
    expect(reports()).toBeEnabled();
    expect(exportButton()).toBeEnabled();
  });
});

describe("trades analytics when clients or quotes fail to load (R1-T9)", () => {
  it("clients: the totals still show; Reports and Export wait for the clients", async () => {
    serve({ clients: outage });
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".ta-hero")).toHaveTextContent("$1,500.00");
    expect(reports()).toBeDisabled();
    expect(exportButton()).toBeDisabled();
    expect(exportButton()).toHaveAttribute("title", "Available once your clients load");
  });

  it("clients: the history keeps its payments and says the client names didn't load; try again brings them back", async () => {
    let calls = 0;
    serve({ clients: () => (calls++ === 0 ? outage() : reply(CLIENTS)) });
    renderPage();
    await settle();

    expect(screen.getByText("client names didn't load")).toBeInTheDocument();
    expect(document.querySelectorAll(".ta-tx-row")).toHaveLength(2); // the payments themselves loaded
    expect(screen.queryByText("Aroha Ngata")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "try again" }));
    await settle();
    expect(screen.queryByText("client names didn't load")).toBeNull();
    expect(screen.getAllByText("Aroha Ngata").length).toBeGreaterThan(0);
    expect(reports()).toBeEnabled();
  });

  it("quotes: the totals still show; Reports and Export wait for the quotes", async () => {
    serve({ quotes: outage });
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".ta-hero")).toHaveTextContent("$1,500.00");
    expect(reports()).toBeDisabled();
    expect(exportButton()).toBeDisabled();
    expect(reports()).toHaveAttribute("title", "Available once your quotes load");
  });
});

/* An export prints the business name and GST number, and shows GST only for a
   GST-registered business, all from the business details. Without them it would
   print "TaptPay" and guess at GST. The on-screen reports use neither. */
describe("trades analytics when the business details fail to load (R1-T9)", () => {
  it("the totals and Reports still work; Export waits for the business details", async () => {
    serve({ profile: outage });
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".ta-hero")).toHaveTextContent("$1,500.00");
    expect(reports()).toBeEnabled();
    expect(exportButton()).toBeDisabled();
    expect(exportButton()).toHaveAttribute("title", "Available once your business details load");
  });

  it("an export asked for while they were loading waits for them, is not offered if they fail, and does not pop up once they load", async () => {
    let calls = 0;
    let answer: (response: Response) => void = () => undefined;
    serve({
      profile: () =>
        calls++ === 0 ? new Promise<Response>((resolve) => { answer = resolve; }) : reply(PROFILE),
    });
    const client = renderPage();
    await settle();

    await userEvent.click(exportButton());
    expect(screen.queryByText("Trades Reports")).toBeNull();
    await act(async () => { answer(outage()); });
    await settle();
    expect(screen.queryByText("Trades Reports")).toBeNull();
    expect(exportButton()).toBeDisabled();

    await act(async () => {
      await client.refetchQueries({ queryKey: ["/api/merchants", 77, "profile"] });
    });
    await settle();
    expect(exportButton()).toBeEnabled();
    expect(screen.queryByText("Trades Reports")).toBeNull(); // the abandoned export does not pop up
  });
});
