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
    if (method === "POST" && url === "/api/property/invoices") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      invoicePosts.push(body);
      return jsonResponse({ id: `new-${invoicePosts.length}` });
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

beforeEach(() => {
  jest.clearAllMocks();
  invoicePosts = [];
  rowActionCalls = [];
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
