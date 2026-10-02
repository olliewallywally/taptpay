/*
 * R1-T9 — a failed load must never look like nothing owing. Property terminal used
 * to turn a failed requests (invoices) load into "$0" outstanding rent and
 * expenses, "no requests here", "nothing outstanding" and a "nothing due" on every
 * tenant, with both send buttons live; a failed tenants load into "no tenants
 * match"; failed reminder settings into the defaults, shown as the merchant's own
 * and editable; and failed schedules into "no schedules yet".
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import DesktopPropertyTerminal from "./pages/property-terminal";

jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, statusText: status < 400 ? "OK" : "Error", json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const outage = () => reply({ message: "unavailable" }, 500);
const TENANTS = [
  { id: "t1", firstName: "Mia", lastName: "Chen", propertyAddress: "5 Bellbird Rise", status: "active", preferredChannel: "email", email: "mia@example.com" },
];
const INVOICES = [
  { id: "i1", tenantProfileId: "t1", tenantName: "Mia Chen", propertyAddress: "5 Bellbird Rise", amountCents: 80_000, owingCents: 80_000, status: "dispatched", kind: "rent", createdAt: "2026-08-01T00:00:00.000Z", dueAt: "2026-08-08T00:00:00.000Z" },
];
const SCHEDULES = [
  { id: "s1", tenantProfileId: "t1", amountCents: 80_000, frequency: "weekly", status: "active", nextRunDate: "2026-08-22T00:00:00.000Z" },
];
/* Not the page's defaults (on, 3 / 3 / 3), so a test can tell loaded from made up. */
const REMINDERS = { rentReminderEnabled: false, rentReminderDelayDays: 7, rentReminderIntervalDays: 7, rentReminderMaxCount: 5 };

type Answer = () => Response | Promise<Response>;
function serve({
  invoices = () => reply(INVOICES),
  tenants = () => reply(TENANTS),
  schedules = () => reply(SCHEDULES),
  reminders = () => reply(REMINDERS),
}: { invoices?: Answer; tenants?: Answer; schedules?: Answer; reminders?: Answer }) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET") !== "GET") throw new Error(`unexpected ${init?.method} ${url}`);
    if (url === "/api/property/invoices") return invoices();
    if (url === "/api/property/tenants") return tenants();
    if (url === "/api/property/schedules") return schedules();
    if (url === "/api/property/reminder-settings") return reminders();
    throw new Error(`Unhandled test request: ${url}`);
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DesktopPropertyTerminal deviceClass="desktop" />
    </QueryClientProvider>,
  );
  return client;
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});
const sendRequest = () => screen.getByRole("button", { name: "send rent request" });
/* The rail's "send bill" comes first in DOM order, the bill panel's own second. */
const sendBill = () => screen.getAllByRole("button", { name: "send bill" })[1];
const heroes = () => document.querySelectorAll(".pt-hero");

beforeEach(() => {
  fetchMock.mockReset();
  window.history.replaceState({}, "", "/property/terminal");
});

describe("property terminal when requests fail to load (R1-T9)", () => {
  it("says so in the frame, shows no $0 owing and no 'no requests here', and keeps both send buttons off", async () => {
    serve({ invoices: outage });
    renderPage();
    await settle();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Requests didn't load");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(heroes()).toHaveLength(0); // no "$0" outstanding rent or expenses
    expect(screen.queryByText("no requests here")).toBeNull();
    expect(screen.getByText("requests didn't load")).toBeInTheDocument();
    expect(sendRequest()).toBeDisabled();
    expect(sendRequest()).toHaveAttribute("title", "Available once your requests load");

    await userEvent.click(screen.getAllByRole("button", { name: "send bill" })[0]);
    await settle();
    expect(sendBill()).toBeDisabled();
  });

  it("the mark-as-paid list and the tenant cards claim neither 'nothing outstanding' nor 'nothing due'", async () => {
    serve({ invoices: outage });
    renderPage();
    await settle();

    await userEvent.click(screen.getByRole("button", { name: "mark as paid" }));
    await settle();
    expect(screen.queryByText("nothing outstanding")).toBeNull();
    expect(screen.getAllByText("requests didn't load").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "select tenant" }));
    await settle();
    const card = within(document.querySelector(".pt-tenant-cards") as HTMLElement).getByRole("button", { name: /Mia Chen/ });
    expect(card).not.toHaveTextContent("nothing due");
    expect(card).toHaveTextContent("unavailable");
  });

  it("Try again reloads the requests, shows the totals and turns sending back on", async () => {
    let calls = 0;
    serve({ invoices: () => (calls++ === 0 ? outage() : reply(INVOICES)) });
    renderPage();
    await settle();

    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await settle();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(heroes()[0]).toHaveTextContent("$800");
    expect(sendRequest()).toBeEnabled();
  });

  it("a failed background refresh keeps the totals and sending", async () => {
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
    expect(heroes()[0]).toHaveTextContent("$800");
    expect(sendRequest()).toBeEnabled();
  });

  it("while loading shows neither a figure nor a failure", async () => {
    serve({ invoices: () => new Promise<Response>(() => undefined) }); // never answers
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(heroes()[0]).toHaveTextContent("—");
    expect(screen.getByText("loading…")).toBeInTheDocument();
  });

  it("with everything loaded, the totals, the list and sending are as before", async () => {
    serve({});
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(heroes()[0]).toHaveTextContent("$800");
    expect(heroes()[1]).toHaveTextContent("$0");
    expect(sendRequest()).toBeEnabled();
  });
});

describe("property terminal when tenants fail to load (R1-T9)", () => {
  it("the tenant picker says so with a Try again, not 'no tenants match'; sending waits for the tenants", async () => {
    let calls = 0;
    serve({ tenants: () => (calls++ === 0 ? outage() : reply(TENANTS)) });
    renderPage();
    await settle();

    expect(heroes()[0]).toHaveTextContent("$800"); // the totals need only the requests
    expect(sendRequest()).toBeDisabled();
    expect(sendRequest()).toHaveAttribute("title", "Available once your tenants load");

    await userEvent.click(screen.getByRole("button", { name: "select tenant" }));
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Tenants didn't load");
    expect(screen.queryByText("no tenants match")).toBeNull();

    await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(within(document.querySelector(".pt-tenant-cards") as HTMLElement).getByRole("button", { name: /Mia Chen/ })).toBeInTheDocument();
  });
});

describe("property terminal when reminder settings or schedules fail to load (R1-T9)", () => {
  it("reminders say their settings didn't load instead of showing the defaults, and cannot be changed until they do", async () => {
    let calls = 0;
    serve({ reminders: () => (calls++ === 0 ? outage() : reply(REMINDERS)) });
    renderPage();
    await settle();

    const toggle = screen.getByRole("button", { name: "automation" });
    expect(toggle).toHaveTextContent("reminders unavailable");
    await userEvent.click(toggle);
    await settle();

    expect(screen.queryByRole("switch", { name: "overdue reminders" })).toBeNull();
    expect(screen.queryByRole("group", { name: "remind after" })).toBeNull();
    const block = screen.getByText("settings didn't load").closest(".pt-auto-block") as HTMLElement;
    await userEvent.click(within(block).getByRole("button", { name: "try again" }));
    await settle();

    // The merchant's own settings, not the defaults.
    expect(screen.getByRole("switch", { name: "overdue reminders" })).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveTextContent("reminders off");
  });

  it("recurring rent says it didn't load, not 'no schedules yet'", async () => {
    let calls = 0;
    serve({ schedules: () => (calls++ === 0 ? outage() : reply(SCHEDULES)) });
    renderPage();
    await settle();

    await userEvent.click(screen.getByRole("button", { name: "automation" }));
    await settle();
    expect(screen.queryByText(/no schedules yet/)).toBeNull();
    const failed = screen.getByText("recurring rent didn't load");

    await userEvent.click(within(failed.parentElement as HTMLElement).getByRole("button", { name: "try again" }));
    await settle();
    expect(screen.queryByText("recurring rent didn't load")).toBeNull();
    expect(screen.getAllByText("Mia Chen").length).toBeGreaterThan(0);
  });
});

describe("property terminal when a reply says OK and is not the data (external review 2026-09-29)", () => {
  it.each([
    ["null", null],
    ["an object", {}],
    ["a row that is null", [null]],
    ["a row with no id", [{ tenantName: "Mia Chen", amountCents: 80_000 }]],
  ])("requests answered %s: 'Requests didn't load', no $0 owing, sending off", async (_name, body) => {
    serve({ invoices: () => reply(body) });
    renderPage();
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent("Requests didn't load");
    expect(heroes()).toHaveLength(0);
    expect(screen.queryByText("no requests here")).toBeNull();
    expect(sendRequest()).toBeDisabled();
  });

  it.each([
    ["null", null],
    ["a list", []],
  ])("reminder settings answered %s: 'reminders unavailable', not the defaults", async (_name, body) => {
    serve({ reminders: () => reply(body) });
    renderPage();
    await settle();

    const toggle = screen.getByRole("button", { name: "automation" });
    expect(toggle).toHaveTextContent("reminders unavailable");
    await userEvent.click(toggle);
    await settle();
    expect(screen.queryByRole("switch", { name: "overdue reminders" })).toBeNull();
    expect(screen.getByText("settings didn't load")).toBeInTheDocument();
  });

  it("recurring rent answered with a row that is null: 'recurring rent didn't load', not 'no schedules yet'", async () => {
    serve({ schedules: () => reply([null]) });
    renderPage();
    await settle();

    await userEvent.click(screen.getByRole("button", { name: "automation" }));
    await settle();
    expect(screen.queryByText(/no schedules yet/)).toBeNull();
    expect(screen.getByText("recurring rent didn't load")).toBeInTheDocument();
  });
});
