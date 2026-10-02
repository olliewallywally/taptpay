/*
 * R1-T9 — a failed load must never look like a quiet week. The desktop trades
 * terminal used to turn a failed invoices request into "$0" revenue and
 * outstanding, "no jobs match", "nothing outstanding" and "$0 paid up" on every
 * client, with send invoice live; a failed clients request into "no clients
 * match"; a failed quotes request into "create a quote first" and a $0.00
 * balance; failed schedules into "no recurring invoices"; failed reminder
 * settings into reminders shown as on and switchable; and failed business
 * details into quote totals without GST, with create quote live.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import DesktopTradesTerminal from "./pages/trades-terminal";
import { BILLING_CARD_REQUIRED_EVENT } from "@/lib/queryClient";

jest.mock("@/lib/auth", () => ({ getCurrentMerchantId: () => 77 }));
const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const outage = () => reply({ message: "unavailable" }, 500);
const now = new Date().toISOString();
const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString();

const CLIENTS = [
  { id: "c1", firstName: "Aroha", lastName: "Ngata", siteAddress: "14 Rimu Street", status: "active", preferredChannel: "email", email: "aroha@example.invalid" },
];
const INVOICES = [
  { id: "j1", clientProfileId: "c1", kind: "full", amountCents: 150_000, status: "paid", createdAt: now, paidAt: now, dueAt: now, quoteId: null },
  { id: "j2", clientProfileId: "c1", kind: "full", amountCents: 42_000, status: "dispatched", createdAt: now, paidAt: null, dueAt: inAWeek, quoteId: null },
  { id: "d1", clientProfileId: "c1", kind: "deposit", amountCents: 30_000, status: "paid", createdAt: now, paidAt: now, dueAt: now, quoteId: "q2" },
];
const QUOTES = [
  { id: "q1", clientProfileId: "c1", totalCents: 99_000, status: "sent", createdAt: now },
  { id: "q2", clientProfileId: "c1", totalCents: 100_000, status: "accepted", createdAt: now },
];
const SCHEDULES = [
  { id: "s1", clientProfileId: "c1", amountCents: 20_000, frequency: "monthly", deliveryChannel: "email", status: "active" },
];
const REMINDERS = { tradeRemindersEnabled: false };
const PROFILE = { id: 77, businessName: "Test Trades", gstRegistered: true, tradeGstMode: "exclusive" };

type Answer = () => Response | Promise<Response>;
type Answers = { invoices?: Answer; clients?: Answer; quotes?: Answer; schedules?: Answer; reminders?: Answer; profile?: Answer; billingBlocked?: boolean };
const BILLING_402 = {
  code: "BILLING_CARD_REQUIRED",
  message: "Your subscription needs attention before you can send payments. Open Billing in Settings.",
};
const BILLING_GATED = ["/api/trades/invoices", "/api/trades/quotes", "/api/trades/schedules"];
/** Answers the terminal's reads as given; the rest as a working day would. */
function serve({
  invoices = () => reply(INVOICES),
  clients = () => reply(CLIENTS),
  quotes = () => reply(QUOTES),
  schedules = () => reply(SCHEDULES),
  reminders = () => reply(REMINDERS),
  profile = () => reply(PROFILE),
  billingBlocked = false,
}: Answers) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET") !== "GET") {
      return billingBlocked && BILLING_GATED.includes(url) ? reply(BILLING_402, 402) : reply({});
    }
    if (url === "/api/trades/invoices") return invoices();
    if (url === "/api/trades/clients") return clients();
    if (url === "/api/trades/quotes") return quotes();
    if (url === "/api/trades/schedules") return schedules();
    if (url === "/api/trades/reminder-settings") return reminders();
    if (url === "/api/merchants/77/profile") return profile();
    return reply([]);
  });
}

function renderPage(path = "/trades/terminal") {
  window.history.pushState({}, "", path);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DesktopTradesTerminal deviceClass="desktop" />
    </QueryClientProvider>,
  );
  return client;
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});
const rail = (name: string) => userEvent.click(screen.getByRole("button", { name }));
const sendButton = () => screen.getByRole("button", { name: "send invoice" });
async function chooseAroha() {
  await rail("choose client");
  await userEvent.click(screen.getByRole("button", { name: "choose Aroha Ngata" }));
}
async function keyInAmount(keys: string[]) {
  await userEvent.click(screen.getByRole("button", { name: "edit>" }));
  for (const key of keys) await userEvent.click(screen.getByRole("button", { name: key }));
  await userEvent.click(screen.getByRole("button", { name: "confirm amount" }));
}

beforeEach(() => {
  fetchMock.mockReset();
  mockToast.mockReset();
});
afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("trades terminal when invoices fail to load (R1-T9)", () => {
  it("says so in the frame, shows no $0 figures and no 'no jobs match', and keeps send invoice off", async () => {
    serve({ invoices: outage });
    renderPage();
    await settle();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Invoices didn't load");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(document.querySelector(".tt-hero")).toBeNull(); // no "$0" revenue this week
    expect(document.querySelector(".tt-hero-2")).toBeNull(); // no "$0" outstanding
    expect(screen.queryByText("no jobs match")).toBeNull();
    expect(screen.getByText("jobs didn't load")).toBeInTheDocument();

    await chooseAroha();
    await keyInAmount(["1", "2", "0"]);
    expect(sendButton()).toBeDisabled();
    expect(sendButton()).toHaveAttribute("title", "Available once your invoices load");
  });

  it("the mark-received list and the client cards claim neither 'nothing outstanding' nor '$0 paid up'", async () => {
    serve({ invoices: outage });
    renderPage();
    await settle();

    await rail("mark received");
    expect(screen.queryByText("nothing outstanding")).toBeNull();
    expect(screen.getByText("invoices didn't load")).toBeInTheDocument();

    await rail("choose client");
    const card = screen.getByRole("button", { name: "choose Aroha Ngata" });
    expect(within(card).queryByText("paid up")).toBeNull();
    expect(within(card).getByText("unavailable")).toBeInTheDocument();
    expect(within(card).queryByText("$0")).toBeNull();
  });

  it("Try again reloads the invoices, shows the figures and lets an invoice be sent", async () => {
    let calls = 0;
    serve({ invoices: () => (calls++ === 0 ? outage() : reply(INVOICES)) });
    renderPage();
    await settle();

    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await settle();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".tt-hero")).toHaveTextContent("$1,800");
    await chooseAroha();
    await keyInAmount(["1", "2", "0"]);
    expect(sendButton()).toBeEnabled();
  });

  it("a failed background refresh keeps the figures and sending", async () => {
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
    expect(document.querySelector(".tt-hero")).toHaveTextContent("$1,800");
    await chooseAroha();
    await keyInAmount(["1", "2", "0"]);
    expect(sendButton()).toBeEnabled();
  });

  it("while loading shows neither a figure nor a failure", async () => {
    serve({ invoices: () => new Promise<Response>(() => undefined) }); // never answers
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".tt-hero")).toHaveTextContent("—");
    expect(screen.getByText("loading jobs…")).toBeInTheDocument();
  });

  it("with everything loaded, the figures, the jobs and sending are as before", async () => {
    serve({});
    renderPage();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".tt-hero")).toHaveTextContent("$1,800");
    expect(document.querySelector(".tt-hero-2")).toHaveTextContent("$420");
    expect(screen.getByRole("button", { name: "select Aroha Ngata" })).toBeInTheDocument();
    await chooseAroha();
    await keyInAmount(["1", "2", "0"]);
    expect(sendButton()).toBeEnabled();
    expect(sendButton()).not.toHaveAttribute("title");
  });
});

describe("trades terminal when clients fail to load (R1-T9)", () => {
  it("the invoice panel and the client picker say so with a Try again, not 'no clients match'", async () => {
    serve({ clients: outage });
    renderPage();
    await settle();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Clients didn't load");
    expect(screen.queryByText("pick one from the client rail")).toBeNull();
    expect(screen.queryByText("no jobs match")).toBeNull();
    expect(screen.getByText("jobs didn't load")).toBeInTheDocument();
    expect(sendButton()).toHaveAttribute("title", "Available once your clients load");

    await rail("choose client");
    expect(screen.queryByText("no clients match")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Clients didn't load");
  });

  it("Try again reloads the clients", async () => {
    let calls = 0;
    serve({ clients: () => (calls++ === 0 ? outage() : reply(CLIENTS)) });
    renderPage();
    await settle();

    await userEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "select Aroha Ngata" })).toBeInTheDocument();
  });
});

describe("trades terminal when quotes fail to load (R1-T9)", () => {
  it("deposit and balance wait for the quotes instead of 'create one first' or a $0.00 balance", async () => {
    serve({ quotes: outage });
    renderPage();
    await settle();
    await chooseAroha();

    const deposit = screen.getByRole("button", { name: "deposit" });
    expect(deposit).toBeDisabled();
    expect(deposit).toHaveAttribute("title", "Available once your quotes load");
    const balance = screen.getByRole("button", { name: "balance" });
    expect(balance).toBeDisabled();
    expect(balance).toHaveAttribute("title", "Available once your quotes load");
    await userEvent.click(balance);
    expect(screen.queryByText(/balance is calculated from the quote total/)).toBeNull(); // no "$0.00" balance
  });

  it("with the quotes loaded, the balance is worked out from the quote as before", async () => {
    serve({});
    renderPage();
    await settle();
    await chooseAroha();
    await userEvent.click(screen.getByRole("button", { name: "balance" }));
    expect(screen.getByText(/the balance is calculated from the quote total — \$700\.00/)).toBeInTheDocument();
  });
});

describe("trades terminal's recurring invoices when their data fails to load (R1-T9)", () => {
  it("schedules: 'recurring invoices didn't load' with try again, not 'no recurring invoices'", async () => {
    let calls = 0;
    serve({ schedules: () => (calls++ === 0 ? outage() : reply(SCHEDULES)) });
    renderPage("/trades/recurring");
    await settle();

    expect(screen.queryByText("no recurring invoices")).toBeNull();
    expect(screen.getByText("recurring invoices didn't load")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "try again" }));
    await settle();
    expect(screen.getByText("monthly · email · active")).toBeInTheDocument();
  });

  it("reminder settings: say they didn't load, cannot be switched from a made-up state, and try again brings the real one", async () => {
    let calls = 0;
    serve({ reminders: () => (calls++ === 0 ? outage() : reply(REMINDERS)) });
    renderPage("/trades/recurring");
    await settle();

    expect(screen.queryByRole("switch", { name: "toggle trades reminders" })).toBeNull();
    expect(screen.getByText("settings didn't load")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "try again" }));
    await settle();
    expect(screen.getByRole("switch", { name: "toggle trades reminders" })).toHaveAttribute("aria-checked", "false");
  });

  it("clients: a recurring invoice cannot be set up without them", async () => {
    serve({ clients: outage });
    renderPage("/trades/recurring");
    await settle();

    const create = screen.getByRole("button", { name: "create recurring invoice" });
    expect(create).toBeDisabled();
    expect(create).toHaveAttribute("title", "Available once your clients load");
  });

  it("with everything loaded, the schedules and the merchant's own reminder setting show as before", async () => {
    serve({});
    renderPage("/trades/recurring");
    await settle();
    expect(screen.getByText("monthly · email · active")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "toggle trades reminders" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "create recurring invoice" })).toBeEnabled();
  });
});

describe("trades terminal's quote builder when the business details fail to load (R1-T9)", () => {
  async function draftQuote() {
    await chooseAroha();
    await rail("quote builder");
    await userEvent.type(screen.getByRole("textbox", { name: "line 1 description" }), "Rewire kitchen");
    await userEvent.type(screen.getByRole("textbox", { name: "line 1 unit price" }), "1000");
  }

  it("shows no totals worked out without GST, create quote waits for them, and try again brings them", async () => {
    let calls = 0;
    serve({ profile: () => (calls++ === 0 ? outage() : reply(PROFILE)) });
    const client = renderPage();
    await settle();
    await draftQuote();

    expect(screen.getByText("totals unavailable")).toBeInTheDocument();
    expect(screen.queryByText("$1,000.00", { selector: ".tt-q-grand" })).toBeNull(); // no GST-less total
    const create = screen.getByRole("button", { name: "create quote" });
    expect(create).toBeDisabled();
    expect(create).toHaveAttribute("title", "Available once your business details load");
    expect(client.getQueryState(["/api/merchants", 77, "profile"])?.status).toBe("error");

    await userEvent.click(screen.getByRole("button", { name: "try again" }));
    await settle();
    expect(screen.getByText("$1,150.00", { selector: ".tt-q-grand" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "create quote" })).toBeEnabled();
  });

  it("with them loaded, the totals include GST in the business's mode as before", async () => {
    serve({});
    renderPage();
    await settle();
    await draftQuote();

    expect(screen.getByText("GST (15%)")).toBeInTheDocument();
    expect(screen.getByText("$1,150.00", { selector: ".tt-q-grand" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "create quote" })).toBeEnabled();
  });
});

/* R1-T9: a billing 402 is stated once, by the app's billing banner, with the way
   to Billing. The action adds no message of its own, and what was typed stays
   for when billing is sorted. */
describe("trades terminal on a billing 402 (R1-T9)", () => {
  let banners: number;
  const countBanner = () => { banners += 1; };
  beforeEach(() => {
    banners = 0;
    window.addEventListener(BILLING_CARD_REQUIRED_EVENT, countBanner);
  });
  afterEach(() => window.removeEventListener(BILLING_CARD_REQUIRED_EVENT, countBanner));

  it("send invoice: the banner says it, no toast of its own, and the amount stays", async () => {
    serve({ billingBlocked: true });
    renderPage();
    await settle();
    await chooseAroha();
    await keyInAmount(["1", "2", "0"]);
    await userEvent.click(sendButton());
    await settle();

    expect(banners).toBe(1);
    expect(mockToast).not.toHaveBeenCalled();
    expect(document.querySelector(".tt-inv-amt")).toHaveTextContent("$120.00");
  });

  it("create quote: the banner says it, no toast of its own, and the lines stay", async () => {
    serve({ billingBlocked: true });
    renderPage();
    await settle();
    await chooseAroha();
    await rail("quote builder");
    await userEvent.type(screen.getByRole("textbox", { name: "line 1 description" }), "Rewire kitchen");
    await userEvent.type(screen.getByRole("textbox", { name: "line 1 unit price" }), "1000");
    await userEvent.click(screen.getByRole("button", { name: "create quote" }));
    await settle();

    expect(banners).toBe(1);
    expect(mockToast).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "line 1 description" })).toHaveValue("Rewire kitchen");
  });

  it("create recurring invoice: the banner says it, no failure line of its own, and the form stays", async () => {
    serve({ billingBlocked: true });
    renderPage("/trades/recurring");
    await settle();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "recurring client" }), "c1");
    await userEvent.type(screen.getByRole("textbox", { name: "recurring amount" }), "200");
    await userEvent.click(screen.getByRole("button", { name: "create recurring invoice" }));
    await settle();

    expect(banners).toBe(1);
    expect(document.querySelector(".tt-rec-error")).toBeNull();
    expect(screen.getByRole("textbox", { name: "recurring amount" })).toHaveValue("200");
  });
});

describe("trades terminal when a reply says OK and is not the data (external review 2026-09-29)", () => {
  it.each([
    ["an object", {}],
    ["a row that is null", [null]],
    ["a row with no id", [{ clientName: "Aroha Ngata", totalCents: 180_000 }]],
  ])("invoices answered %s: 'Invoices didn't load', no $0 figures, send invoice off", async (_name, body) => {
    serve({ invoices: () => reply(body) });
    renderPage();
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent("Invoices didn't load");
    expect(document.querySelector(".tt-hero")).toBeNull();
    expect(sendButton()).toBeDisabled();
  });

  it.each([
    ["an object", {}],
    ["a row that is null", [null]],
  ])("recurring invoices answered %s: 'recurring invoices didn't load', not 'no recurring invoices'", async (_name, body) => {
    serve({ schedules: () => reply(body) });
    renderPage("/trades/recurring");
    await settle();

    expect(screen.queryByText("no recurring invoices")).toBeNull();
    expect(screen.getByText("recurring invoices didn't load")).toBeInTheDocument();
  });

  it.each([
    ["null", null],
    ["a list", []],
  ])("reminder settings answered %s: 'settings didn't load', and no switch to set from a made-up state", async (_name, body) => {
    serve({ reminders: () => reply(body) });
    renderPage("/trades/recurring");
    await settle();

    expect(screen.queryByRole("switch", { name: "toggle trades reminders" })).toBeNull();
    expect(screen.getByText("settings didn't load")).toBeInTheDocument();
  });
});
