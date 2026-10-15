/*
 * R1-T9 — a failed load must never look like a quiet period. Property analytics
 * used to turn a failed payments request into "$0.00 total revenue", "$0.00
 * outstanding payments", a flat chart and "no payments in this period", with
 * Reports and Export live. Reports and exports are also built from the tenants
 * and the rent schedules, so they wait for those too, and are made only from
 * loaded data: one asked for while a request is still loading waits for it, and
 * one asked for before a failure is not offered on the failed data. An export
 * also waits for the business details (its header and GST line).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import DesktopPropertyAnalytics from "./pages/property-analytics";

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
const TENANTS = [
  { id: "t1", firstName: "Mia", lastName: "Chen", propertyAddress: "5 Bellbird Rise", status: "active" },
];
const INVOICES = [
  { id: "i1", tenantProfileId: "t1", tenantName: "Mia Chen", propertyAddress: "5 Bellbird Rise", amountCents: 80_000, owingCents: 0, status: "paid", kind: "rent", createdAt: now, paidAt: now },
  { id: "i2", tenantProfileId: "t1", tenantName: "Mia Chen", propertyAddress: "5 Bellbird Rise", amountCents: 24_000, owingCents: 24_000, status: "dispatched", kind: "charge", createdAt: now },
];
const SCHEDULES = [{ id: "s1", tenantProfileId: "t1", amountCents: 80_000, frequency: "monthly", status: "active" }];

type Answer = () => Response | Promise<Response>;
const PROFILE = { id: 77, businessName: "Test Rentals", gstRegistered: true };
/** Answers the three property requests and the business details as given; the rest as a working day would. */
function serve({
  invoices = () => reply(INVOICES),
  tenants = () => reply(TENANTS),
  schedules = () => reply(SCHEDULES),
  profile = () => reply(PROFILE),
}: { invoices?: Answer; tenants?: Answer; schedules?: Answer; profile?: Answer }) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/property/invoices") return invoices();
    if (url === "/api/property/tenants") return tenants();
    if (url === "/api/property/schedules") return schedules();
    if (url === "/api/merchants/77/profile") return profile();
    return reply([]);
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DesktopPropertyAnalytics deviceClass="desktop" />
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

describe("property analytics when payments fail to load (R1-T9)", () => {
  it("says so in the frame, and shows no total, no outstanding, no chart and no 'no payments'", async () => {
    serve({ invoices: outage });
    renderPage();
    await settle();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Payments didn't load");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(document.querySelector(".pa-hero")).toBeNull(); // no "$0.00 total revenue"
    expect(document.querySelector(".pa-hero-out")).toBeNull(); // no "$0.00 outstanding"
    expect(document.querySelector(".pa-chart")).toBeNull(); // no flat line
    expect(screen.queryByText(/no payments in this period/i)).toBeNull();
    expect(screen.getByText("Payment history didn't load.")).toBeInTheDocument();
    expect(reports()).toBeDisabled();
    expect(exportButton()).toBeDisabled();
    expect(reports()).toHaveAttribute("title", "Available once your payments load");
  });

  it("Try again reloads the payments and shows the totals", async () => {
    let calls = 0;
    serve({ invoices: () => (calls++ === 0 ? outage() : reply(INVOICES)) });
    renderPage();
    await settle();

    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await settle();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".pa-hero")).toHaveTextContent("$800.00");
    expect(reports()).toBeEnabled();
  });

  it("a failed background refresh keeps the totals already shown", async () => {
    let calls = 0;
    serve({ invoices: () => (calls++ === 0 ? reply(INVOICES) : outage()) });
    const client = renderPage();
    await settle();

    await act(async () => {
      await client.refetchQueries({ queryKey: ["/api/property/invoices"] });
    });
    await settle();

    expect(calls).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".pa-hero")).toHaveTextContent("$800.00");
    expect(reports()).toBeEnabled();
  });

  it("a report opened while payments were loading cannot be generated once they fail", async () => {
    let fail: (answer: Response) => void = () => undefined;
    serve({ invoices: () => new Promise<Response>((resolve) => { fail = resolve; }) });
    renderPage();
    await settle();

    await userEvent.click(reports());
    await userEvent.click(document.querySelector(".pa-tile") as HTMLElement);
    await act(async () => { fail(outage()); });
    await settle();

    expect(screen.getByRole("button", { name: "Generate Report" })).toBeDisabled();
  });

  it("an export opened while payments were loading is not offered once they fail, nor after Try again", async () => {
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

    expect(screen.queryByText("Property Reports")).toBeNull(); // no export from payments that failed
    expect(exportButton()).toBeDisabled();

    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await settle();
    expect(document.querySelector(".pa-hero")).toHaveTextContent("$800.00");
    expect(screen.queryByText("Property Reports")).toBeNull(); // the abandoned export does not pop up
  });

  it("while loading, a report cannot be generated and an export waits for the data", async () => {
    let answer: (response: Response) => void = () => undefined;
    serve({ invoices: () => new Promise<Response>((resolve) => { answer = resolve; }) });
    renderPage();
    await settle();

    await userEvent.click(reports());
    await userEvent.click(document.querySelector(".pa-tile") as HTMLElement);
    expect(screen.getByRole("button", { name: "Generate Report" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "All Reports" }));
    await userEvent.click(screen.getByRole("button", { name: "Payment History" }));
    await userEvent.click(exportButton());
    expect(screen.queryByText("Property Reports")).toBeNull(); // not built from payments still loading

    await act(async () => { answer(reply(INVOICES)); });
    await settle();
    expect(screen.getByText("Property Reports")).toBeInTheDocument(); // the click was not lost
  });

  it.each([
    ["tenants", { tenants: () => new Promise<Response>(() => undefined) }],
    ["rent schedules", { schedules: () => new Promise<Response>(() => undefined) }],
  ])("while the %s are still loading, a report cannot be generated", async (_source, pending) => {
    serve(pending);
    renderPage();
    await settle();

    await userEvent.click(reports());
    await userEvent.click(document.querySelector(".pa-tile") as HTMLElement);
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
    expect(document.querySelector(".pa-hero")).toHaveTextContent("$800.00");
    expect(document.querySelector(".pa-hero-out")).toHaveTextContent("$240.00");
    expect(document.querySelector(".pa-chart")).not.toBeNull();
    expect(screen.getAllByText("Mia Chen").length).toBeGreaterThan(0);
    expect(reports()).toBeEnabled();
    expect(exportButton()).toBeEnabled();
  });
});

describe("property analytics when tenants or rent schedules fail to load (R1-T9)", () => {
  it("tenants: the totals and history still show; Reports and Export wait for the tenants", async () => {
    serve({ tenants: outage });
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".pa-hero")).toHaveTextContent("$800.00");
    expect(screen.getAllByText("Mia Chen").length).toBeGreaterThan(0);
    expect(reports()).toBeDisabled();
    expect(exportButton()).toBeDisabled();
    expect(exportButton()).toHaveAttribute("title", "Available once your tenants load");
  });

  it("rent schedules: the totals still show; Reports and Export wait for the schedules", async () => {
    serve({ schedules: outage });
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".pa-hero")).toHaveTextContent("$800.00");
    expect(reports()).toBeDisabled();
    expect(exportButton()).toBeDisabled();
    expect(reports()).toHaveAttribute("title", "Available once your rent schedules load");
  });
});

/* An export prints the business name and, for the annual income statement, a GST
   line only when the business is GST-registered: both from the business details.
   The on-screen reports use neither. */
describe("property analytics when the business details fail to load (R1-T9)", () => {
  it("the totals and Reports still work; Export waits for the business details", async () => {
    serve({ profile: outage });
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".pa-hero")).toHaveTextContent("$800.00");
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
    expect(screen.queryByText("Property Reports")).toBeNull();
    await act(async () => { answer(outage()); });
    await settle();
    expect(screen.queryByText("Property Reports")).toBeNull();
    expect(exportButton()).toBeDisabled();

    await act(async () => {
      await client.refetchQueries({ queryKey: ["/api/merchants", 77, "profile"] });
    });
    await settle();
    expect(exportButton()).toBeEnabled();
    expect(screen.queryByText("Property Reports")).toBeNull(); // the abandoned export does not pop up
  });
});
