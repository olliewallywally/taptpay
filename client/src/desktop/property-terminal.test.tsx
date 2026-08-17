import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import DesktopPropertyTerminal from "./pages/property-terminal";

const mockToast = jest.fn();

jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: React.ReactNode }) => children,
}));

const fetchMock = global.fetch as jest.Mock;

const TENANTS = [
  {
    id: "t1",
    firstName: "Mia",
    lastName: "Chen",
    propertyAddress: "5 Bellbird Rise",
    status: "active",
    preferredChannel: "email",
    email: "mia@example.com",
    phone: "0222222222",
  },
  {
    id: "t2",
    firstName: "Tane",
    lastName: "Walker",
    propertyAddress: "88 Harbour View",
    status: "active",
    preferredChannel: "email",
    email: "tane@example.com",
    phone: "0223333333",
  },
];

const INVOICES = [
  {
    id: "i1",
    tenantProfileId: "t1",
    tenantName: "Mia Chen",
    amountCents: 80_000,
    owingCents: 80_000,
    status: "dispatched",
    kind: "rent",
    createdAt: "2026-08-01T00:00:00.000Z",
    dueAt: "2026-08-08T00:00:00.000Z",
  },
  {
    id: "i2",
    tenantProfileId: "t2",
    tenantName: "Tane Walker",
    amountCents: 24_000,
    owingCents: 24_000,
    status: "dispatched",
    kind: "charge",
    chargeType: "utilities",
    description: "Water / utilities",
    createdAt: "2026-08-02T00:00:00.000Z",
    dueAt: "2026-08-09T00:00:00.000Z",
  },
  {
    id: "i4",
    tenantProfileId: "t2",
    tenantName: "Tane Walker",
    amountCents: 52_000,
    owingCents: 52_000,
    status: "overdue",
    kind: "rent",
    createdAt: "2026-07-25T00:00:00.000Z",
    dueAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "i5",
    tenantProfileId: "t3",
    tenantName: "Ruby Nolan",
    amountCents: 60_000,
    owingCents: 30_000,
    splitEnabled: true,
    splitCount: 4,
    splitPaidCount: 2,
    status: "dispatched",
    kind: "rent",
    createdAt: "2026-07-28T00:00:00.000Z",
    dueAt: "2026-08-04T00:00:00.000Z",
  },
  {
    id: "i3",
    tenantProfileId: "t2",
    tenantName: "Tane Walker",
    amountCents: 30_000,
    owingCents: 0,
    status: "paid",
    kind: "rent",
    createdAt: "2026-07-20T00:00:00.000Z",
    dueAt: "2026-07-27T00:00:00.000Z",
  },
];

let invoicePosts: Record<string, unknown>[];
let rowActionCalls: string[];
let docUploads: string[];
let docUploadHandler: (file: File) => Response;
let schedules: Record<string, unknown>[];
let scheduleCalls: string[];
let reminderSettings: Record<string, unknown>;
let reminderPuts: Record<string, unknown>[];

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

function installFetchMock() {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/property/tenants") return jsonResponse(TENANTS);
    if (method === "GET" && url === "/api/property/invoices") return jsonResponse(INVOICES);
    if (method === "GET" && url === "/api/property/schedules") return jsonResponse(schedules);
    if (method === "GET" && url === "/api/property/reminder-settings") {
      return jsonResponse(reminderSettings);
    }
    if (method === "PUT" && url === "/api/property/reminder-settings") {
      const patch = JSON.parse(String(init?.body ?? "{}"));
      reminderPuts.push(patch);
      /* Persist, as the server does — the component writes the response back
         into the cache, so a non-persisting mock would mask a working save. */
      reminderSettings = { ...reminderSettings, ...patch };
      return jsonResponse(reminderSettings);
    }
    const scheduleRoute = url.match(/^\/api\/property\/schedules\/([\w-]+)$/);
    if (scheduleRoute && (method === "PUT" || method === "DELETE")) {
      const body = method === "PUT" ? JSON.parse(String(init?.body ?? "{}")) : {};
      scheduleCalls.push(
        method === "PUT"
          ? `status:${scheduleRoute[1]}:${body.status}`
          : `delete:${scheduleRoute[1]}`,
      );
      return jsonResponse({ id: scheduleRoute[1] });
    }
    if (method === "POST" && url === "/api/property/invoices") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      invoicePosts.push(body);
      return jsonResponse({ id: `new-${invoicePosts.length}` });
    }
    if (method === "POST" && url === "/api/property/invoices/document") {
      const body = init?.body as FormData;
      const file = body.get("document") as File;
      docUploads.push(file.name);
      return docUploadHandler(file);
    }
    const rowAction = url.match(
      /^\/api\/property\/invoices\/([\w-]+)\/(resend|void|mark-paid-external)$/,
    );
    if (method === "POST" && rowAction) {
      rowActionCalls.push(`${rowAction[2]}:${rowAction[1]}`);
      return jsonResponse({ id: rowAction[1] });
    }
    throw new Error(`Unhandled test request: ${method} ${url}`);
  });
}

function renderTerminal() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const user = userEvent.setup();
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <DesktopPropertyTerminal deviceClass="desktop" />
    </QueryClientProvider>,
  );
  return { ...rendered, queryClient, user };
}

/* Picking a tenant seeds the amount from their next unpaid invoice, which is
   what every send path below starts from. */
async function pickTenant(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "select tenant" }));
  /* Scoped to the picker: the request list carries the same tenant's name. */
  const cards = document.querySelector(".pt-tenant-cards") as HTMLElement;
  await user.click(await within(cards).findByRole("button", { name: /Mia Chen/ }));
}

/* The rail button and the panel's own send button share an accessible name;
   the rail comes first in DOM order. */
const railButton = (name: string) => screen.getAllByRole("button", { name })[0];
const panelSendButton = (name: string) => screen.getAllByRole("button", { name })[1];

/* The amount also appears on the request row in the left column, so assert on
   the panel's own hero figure rather than on the page text. */
const panelAmount = () => document.querySelector(".pt-amt")?.textContent;

/* The page reads its deep link from window.location at mount, the same way
   property-clients and trades-terminal do. */
function enterWith(query: string) {
  window.history.replaceState({}, "", `/property/terminal${query}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  invoicePosts = [];
  rowActionCalls = [];
  docUploads = [];
  schedules = [
    {
      id: "s1",
      tenantProfileId: "t1",
      amountCents: 80_000,
      frequency: "weekly",
      status: "active",
      nextRunDate: "2026-08-22T00:00:00.000Z",
    },
    {
      id: "s2",
      tenantProfileId: "t2",
      amountCents: 52_000,
      frequency: "monthly",
      status: "paused",
      nextRunDate: "2026-09-01T00:00:00.000Z",
    },
  ];
  scheduleCalls = [];
  reminderSettings = {
    rentReminderEnabled: true,
    rentReminderDelayDays: 3,
    rentReminderIntervalDays: 3,
    rentReminderMaxCount: 3,
  };
  reminderPuts = [];
  docUploadHandler = (file) =>
    jsonResponse({ documentUrl: `https://docs.example/${file.name}`, documentName: file.name });
  enterWith("");
  installFetchMock();
});

describe("desktop property terminal — keypad", () => {
  it("refuses to confirm an empty keypad instead of setting the amount to zero", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);
    expect(panelAmount()).toBe("$800.00");

    await user.click(screen.getByRole("button", { name: "keypad" }));
    const confirm = screen.getByRole("button", { name: "confirm amount" });
    expect(confirm).toHaveAttribute("aria-disabled", "true");

    await user.click(confirm);
    /* Still on the keypad — the seeded amount was not destroyed. */
    expect(screen.getByRole("button", { name: "confirm amount" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "cancel keypad" }));
    expect(panelAmount()).toBe("$800.00");
  });

  it("confirms a real amount", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);
    await user.click(screen.getByRole("button", { name: "keypad" }));
    for (const key of ["7", "5", "0"]) {
      await user.click(screen.getByRole("button", { name: key }));
    }
    const confirm = screen.getByRole("button", { name: "confirm amount" });
    expect(confirm).toHaveAttribute("aria-disabled", "false");

    await user.click(confirm);
    expect(panelAmount()).toBe("$750.00");
  });
});

describe("desktop property terminal — send flow", () => {
  it("clears the amount after a send so a second click cannot issue a second invoice", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);

    await user.click(screen.getByRole("button", { name: "send rent request" }));
    await waitFor(() => expect(invoicePosts).toHaveLength(1));
    expect(invoicePosts[0]).toMatchObject({ tenantProfileId: "t1", amountCents: 80_000 });

    await user.click(screen.getByRole("button", { name: "send rent request" }));
    expect(invoicePosts).toHaveLength(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Enter an amount first" }),
    );
  });

  it("resets the bill's charge type and description after a send", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);
    await user.click(railButton("send bill"));
    await user.click(screen.getByRole("button", { name: "late fee" }));

    await user.click(panelSendButton("send bill"));
    await waitFor(() => expect(invoicePosts).toHaveLength(1));
    expect(invoicePosts[0]).toMatchObject({
      kind: "charge",
      chargeType: "late_fee",
      description: "Late fee",
    });

    expect(await screen.findByRole("textbox", { name: "bill description" })).toHaveValue(
      "Water / utilities",
    );
  });
});

describe("desktop property terminal — row actions", () => {
  /* The row's accessible name carries its status, so two invoices for the same
     tenant stay distinguishable. */
  const openRowMenu = async (user: ReturnType<typeof userEvent.setup>, label: string) =>
    user.click(await screen.findByRole("button", { name: `actions for ${label}` }));

  it("resends a charge's link", async () => {
    const { user } = renderTerminal();
    await openRowMenu(user, "Tane Walker, sent · utilities");
    await user.click(screen.getByRole("menuitem", { name: "resend link" }));

    await waitFor(() => expect(rowActionCalls).toEqual(["resend:i2"]));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("preloads the request panel for a rent row instead of resending blind", async () => {
    const { user } = renderTerminal();
    await openRowMenu(user, "Mia Chen, sent");
    await user.click(screen.getByRole("menuitem", { name: "edit amount & resend" }));

    expect(rowActionCalls).toEqual([]);
    expect(panelAmount()).toBe("$800.00");
    expect(screen.getByText("5 Bellbird Rise")).toBeInTheDocument();
  });

  it("marks a row received from the popover", async () => {
    const { user } = renderTerminal();
    await openRowMenu(user, "Mia Chen, sent");
    await user.click(screen.getByRole("menuitem", { name: "mark received" }));

    await waitFor(() => expect(rowActionCalls).toEqual(["mark-paid-external:i1"]));
  });

  it("cancels in two steps, in-surface", async () => {
    const { user } = renderTerminal();
    await openRowMenu(user, "Mia Chen, sent");
    await user.click(screen.getByRole("menuitem", { name: "cancel invoice" }));

    /* The first click only asks — nothing has been sent yet. */
    expect(rowActionCalls).toEqual([]);
    expect(screen.getByText(/can't be undone/)).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "back" }));
    expect(screen.getByRole("menuitem", { name: "cancel invoice" })).toBeInTheDocument();
    expect(rowActionCalls).toEqual([]);

    await user.click(screen.getByRole("menuitem", { name: "cancel invoice" }));
    await user.click(screen.getByRole("menuitem", { name: "yes, cancel it" }));
    await waitFor(() => expect(rowActionCalls).toEqual(["void:i1"]));
  });

  it("offers no actions on a settled invoice", async () => {
    const { user } = renderTerminal();
    await openRowMenu(user, "Tane Walker, paid");

    expect(screen.getByText("this invoice is already settled")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "cancel invoice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "mark received" })).not.toBeInTheDocument();
  });

  it("closes when the same row is clicked again", async () => {
    const { user } = renderTerminal();
    await openRowMenu(user, "Mia Chen, sent");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await openRowMenu(user, "Mia Chen, sent");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("desktop property terminal — bill due date and attachment", () => {
  const daysFromNow = (iso: string) =>
    Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000) || 0;

  it("defaults to due in 7 days and honours the chosen chip", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);
    await user.click(railButton("send bill"));

    await user.click(panelSendButton("send bill"));
    await waitFor(() => expect(invoicePosts).toHaveLength(1));
    expect(daysFromNow(invoicePosts[0].dueAt as string)).toBe(7);

    await user.click(screen.getByRole("button", { name: "on receipt" }));
    await user.click(screen.getByRole("button", { name: "keypad" }));
    for (const key of ["5", "0"]) await user.click(screen.getByRole("button", { name: key }));
    await user.click(screen.getByRole("button", { name: "confirm amount" }));
    await user.click(railButton("send bill"));
    /* A send resets the choice, so it has to be re-picked. */
    await user.click(screen.getByRole("button", { name: "on receipt" }));
    await user.click(panelSendButton("send bill"));

    await waitFor(() => expect(invoicePosts).toHaveLength(2));
    expect(daysFromNow(invoicePosts[1].dueAt as string)).toBe(0);
  });

  it("uploads an attachment on pick and sends it with the bill", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);
    await user.click(railButton("send bill"));

    const file = new File(["%PDF-1.4"], "power-bill.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("attach invoice"), file);

    await waitFor(() => expect(docUploads).toEqual(["power-bill.pdf"]));
    expect(await screen.findByText("power-bill.pdf")).toBeInTheDocument();

    await user.click(panelSendButton("send bill"));
    await waitFor(() => expect(invoicePosts).toHaveLength(1));
    expect(invoicePosts[0]).toMatchObject({
      documentUrl: "https://docs.example/power-bill.pdf",
      documentName: "power-bill.pdf",
    });
  });

  it("drops the attachment when it is removed, and after a send", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);
    await user.click(railButton("send bill"));

    const file = new File(["%PDF-1.4"], "water.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("attach invoice"), file);
    await screen.findByText("water.pdf");

    await user.click(screen.getByRole("button", { name: "remove" }));
    expect(screen.getByLabelText("attach invoice")).toBeInTheDocument();

    await user.click(panelSendButton("send bill"));
    await waitFor(() => expect(invoicePosts).toHaveLength(1));
    expect(invoicePosts[0]).not.toHaveProperty("documentUrl");
  });

  it("refuses a file over 20MB without calling the server", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);
    await user.click(railButton("send bill"));

    const big = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 });
    await user.upload(screen.getByLabelText("attach invoice"), big);

    expect(docUploads).toEqual([]);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "File must be under 20MB" }),
    );
  });

  it("surfaces an upload failure and keeps the attach row", async () => {
    docUploadHandler = () => jsonResponse({ message: "Unsupported file type" }, 415);
    const { user } = renderTerminal();
    await pickTenant(user);
    await user.click(railButton("send bill"));

    const file = new File(["x"], "notes.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("attach invoice"), file);

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Unsupported file type" }),
      ),
    );
    expect(screen.getByLabelText("attach invoice")).toBeInTheDocument();
  });
});

describe("desktop property terminal — split", () => {
  it("sends splitEnabled from the rent request and resets it afterwards", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);

    const toggle = screen.getByRole("switch", { name: "split this bill" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: "send rent request" }));
    await waitFor(() => expect(invoicePosts).toHaveLength(1));
    expect(invoicePosts[0]).toMatchObject({ splitEnabled: true });
    expect(screen.getByRole("switch", { name: "split this bill" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("sends splitEnabled from the bill", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);
    await user.click(railButton("send bill"));
    await user.click(screen.getByRole("switch", { name: "split this bill" }));

    await user.click(panelSendButton("send bill"));
    await waitFor(() => expect(invoicePosts).toHaveLength(1));
    expect(invoicePosts[0]).toMatchObject({ kind: "charge", splitEnabled: true });
  });

  it("defaults to off, so an untouched send is not split", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);
    await user.click(screen.getByRole("button", { name: "send rent request" }));

    await waitFor(() => expect(invoicePosts).toHaveLength(1));
    expect(invoicePosts[0]).toMatchObject({ splitEnabled: false });
  });

  it("shows split progress and what is left on a part-paid row", async () => {
    renderTerminal();
    expect(await screen.findByText("2/4 split")).toBeInTheDocument();
    expect(screen.getByText("left of $600.00")).toBeInTheDocument();
    /* The row's own figure is what is still owed, not the full value. */
    expect(
      screen.getByRole("button", { name: "actions for Ruby Nolan, sent" }),
    ).toHaveTextContent("$300.00");
  });
});

describe("desktop property terminal — automation", () => {
  const openAutomation = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: "automation" }));

  /* Scoped to the schedules list: the request list carries the same names, and
     "cancel" is also a row-popover item. */
  const scheduleList = () => within(document.querySelector(".pt-auto-list") as HTMLElement);

  it("lists live schedules with their state and next run", async () => {
    const { user } = renderTerminal();
    await openAutomation(user);

    const list = scheduleList();
    expect(await list.findByText("Mia Chen")).toBeInTheDocument();
    expect(list.getByText(/\$800\.00 · weekly · next 22 Aug/)).toBeInTheDocument();
    expect(list.getByText("active")).toBeInTheDocument();
    expect(list.getByText("paused")).toBeInTheDocument();
  });

  it("hides terminated schedules and shows the empty state when there are none", async () => {
    schedules = [{ ...schedules[0], status: "terminated" }];
    const { user } = renderTerminal();
    await openAutomation(user);

    expect(await screen.findByText(/no schedules yet/)).toBeInTheDocument();
  });

  it("pauses and resumes a schedule", async () => {
    const { user } = renderTerminal();
    await openAutomation(user);
    const list = scheduleList();
    await list.findByText("Mia Chen");

    await user.click(list.getByRole("button", { name: "pause" }));
    await waitFor(() => expect(scheduleCalls).toEqual(["status:s1:paused"]));

    await user.click(list.getByRole("button", { name: "resume" }));
    await waitFor(() =>
      expect(scheduleCalls).toEqual(["status:s1:paused", "status:s2:active"]),
    );
  });

  it("cancels a schedule in two steps, in-surface", async () => {
    const { user } = renderTerminal();
    await openAutomation(user);
    const list = scheduleList();
    await list.findByText("Mia Chen");

    await user.click(list.getAllByRole("button", { name: "cancel" })[0]);
    expect(scheduleCalls).toEqual([]);

    await user.click(list.getByRole("button", { name: "back" }));
    expect(scheduleCalls).toEqual([]);

    await user.click(list.getAllByRole("button", { name: "cancel" })[0]);
    await user.click(list.getByRole("button", { name: "confirm" }));
    await waitFor(() => expect(scheduleCalls).toEqual(["delete:s1"]));
  });

  it("saves the reminder cadence and reflects it immediately", async () => {
    const { user } = renderTerminal();
    await openAutomation(user);

    const remindAfter = await screen.findByRole("group", { name: "remind after" });
    expect(within(remindAfter).getByRole("button", { name: "3d" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(within(remindAfter).getByRole("button", { name: "7d" }));
    expect(within(remindAfter).getByRole("button", { name: "7d" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => expect(reminderPuts).toEqual([{ rentReminderDelayDays: 7 }]));
    expect(screen.getByText(/after 7 days, then every 3 days/)).toBeInTheDocument();
  });

  it("reads an uncapped max as ∞ in the summary", async () => {
    const { user } = renderTerminal();
    await openAutomation(user);

    const maxRow = await screen.findByRole("group", { name: "max reminders" });
    await user.click(within(maxRow).getByRole("button", { name: "∞" }));

    await waitFor(() => expect(reminderPuts).toEqual([{ rentReminderMaxCount: 0 }]));
    expect(screen.getByText(/then every 3 days\.$/)).toBeInTheDocument();
  });

  it("collapses the cadence when reminders are switched off", async () => {
    const { user } = renderTerminal();
    await openAutomation(user);

    const toggle = await screen.findByRole("switch", { name: "overdue reminders" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);
    await waitFor(() => expect(reminderPuts).toEqual([{ rentReminderEnabled: false }]));
    expect(screen.queryByRole("group", { name: "remind after" })).not.toBeInTheDocument();
  });

  it("rolls the toggle back when the save fails", async () => {
    const { user } = renderTerminal();
    await openAutomation(user);
    const toggle = await screen.findByRole("switch", { name: "overdue reminders" });

    fetchMock.mockImplementationOnce(async () => jsonResponse({ message: "nope" }, 500));
    await user.click(toggle);

    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "overdue reminders" })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Could not save reminders" }),
    );
  });
});

describe("desktop property terminal — deep links", () => {
  it("opens the bill panel for ?mode=expense", async () => {
    enterWith("?mode=expense");
    renderTerminal();
    expect(
      await screen.findByRole("textbox", { name: "bill description" }),
    ).toBeInTheDocument();
  });

  it("filters to overdue and reveals remind for ?mode=reminder", async () => {
    enterWith("?mode=reminder");
    const { user } = renderTerminal();

    const remind = await screen.findByRole("button", { name: "remind Tane Walker" });
    /* Only the overdue row gets one, and the list is filtered to overdue. */
    expect(screen.getAllByRole("button", { name: /^remind / })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /actions for Mia Chen/ })).not.toBeInTheDocument();

    await user.click(remind);
    await waitFor(() => expect(rowActionCalls).toEqual(["resend:i4"]));
  });

  it("applies ?stack= to the request list without revealing remind", async () => {
    enterWith("?stack=paid");
    renderTerminal();

    expect(
      await screen.findByRole("button", { name: "actions for Tane Walker, paid" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /actions for Mia Chen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^remind / })).not.toBeInTheDocument();
  });

  it("preselects a tenant from ?client=", async () => {
    enterWith("?client=t2");
    renderTerminal();
    expect(await screen.findByText("88 Harbour View")).toBeInTheDocument();
  });

  it("ignores an unknown stack value", async () => {
    enterWith("?stack=nonsense");
    renderTerminal();
    expect(
      await screen.findByRole("button", { name: "actions for Mia Chen, sent" }),
    ).toBeInTheDocument();
  });
});

describe("desktop property terminal — bill description", () => {
  it("keeps a typed description when the charge type changes", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);
    await user.click(railButton("send bill"));

    const field = screen.getByRole("textbox", { name: "bill description" });
    await user.clear(field);
    await user.type(field, "Broken window, unit 4");
    await user.click(screen.getByRole("button", { name: "damages" }));

    expect(screen.getByRole("textbox", { name: "bill description" })).toHaveValue(
      "Broken window, unit 4",
    );
  });

  it("replaces a preset description when the charge type changes", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);
    await user.click(railButton("send bill"));

    await user.click(screen.getByRole("button", { name: "cleaning" }));
    expect(screen.getByRole("textbox", { name: "bill description" })).toHaveValue("Cleaning");
  });

  it("fills an emptied description from the next charge type", async () => {
    const { user } = renderTerminal();
    await pickTenant(user);
    await user.click(railButton("send bill"));

    await user.clear(screen.getByRole("textbox", { name: "bill description" }));
    await user.click(screen.getByRole("button", { name: "damages" }));
    expect(screen.getByRole("textbox", { name: "bill description" })).toHaveValue("Damages");
  });
});
