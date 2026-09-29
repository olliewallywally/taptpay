/*
 * R1-T9: a billing 402 states the required action once, in the banner the fetch
 * layer raises (lib/queryClient.ts). The phone property terminal's actions add
 * no message of their own, and what was typed stays to send again.
 *
 * PropertyTerminalView is stubbed with buttons that call the page's real
 * callbacks, and it shows the page's own toast and banner lines, so the page's
 * handling is what is tested. The last block: any other failed action says so.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { BILLING_CARD_REQUIRED_EVENT } from "@/lib/queryClient";
import PropertyTerminal from "./property-terminal";

jest.mock("@/features/terminal/property/PropertyTerminalView", () => {
  const React = require("react");
  const tenant = { id: "tenant-mia", firstName: "Mia", lastName: "Hart", preferredChannel: "email", email: "mia@example.test" };
  return {
    __esModule: true,
    PropertyTerminalView: function PropertyTerminalViewStub(props: any) {
      const button = (label: string, onClick: () => void) => React.createElement("button", { onClick }, label);
      return React.createElement(
        "div",
        {
          "data-testid": "view",
          "data-screen": props.screen,
          "data-tenant": props.selectedTenant?.id ?? "",
          "data-amount": String(props.amount),
          "data-charge": props.chargeType ?? "",
          "data-invoices": String(props.invoices.length),
        },
        button("start rent", () => props.onTenantSelect(tenant, 80000)),
        button("send rent", () => props.onSendRent()),
        button("start bill", () => {
          props.onTenantSelect(tenant, 0);
          props.onChargeTypeChange("cleaning");
          props.onAmountCommit(80000, "bill");
        }),
        button("send bill", () => props.onSendBill()),
        button("remind", () => props.onRemind("inv-1")),
        button("open batch", () => props.onNavigate("batch")),
        button("resend all", () => props.onBatchSend(["tenant-mia"])),
        button("resend both", () => props.onBatchSend(["tenant-mia", "tenant-leo"])),
        button("mark received", () => props.onMarkExternal("inv-1", "ANZ 4471")),
        React.createElement("output", { "data-testid": "toast" }, props.toastMessage ?? ""),
        React.createElement("output", { "data-testid": "page-banner" }, props.banner ?? ""),
      );
    },
  };
});

const fetchMock = global.fetch as jest.Mock;
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const BILLING_402 = {
  code: "BILLING_CARD_REQUIRED",
  message: "Your subscription needs attention before you can send payments. Open Billing in Settings.",
};
const TENANT = { id: "tenant-mia", firstName: "Mia", lastName: "Hart", preferredChannel: "email", email: "mia@example.test" };
const LIVE_INVOICE = { id: "inv-1", tenantProfileId: "tenant-mia", status: "dispatched", amountCents: 80000, createdAt: "2026-09-01T00:00:00Z" };
const OTHER_INVOICE = { id: "inv-2", tenantProfileId: "tenant-leo", status: "overdue", amountCents: 65000, createdAt: "2026-09-02T00:00:00Z" };

let writes: string[];
let banners: number;
const countBanner = () => { banners += 1; };

beforeEach(() => {
  writes = [];
  banners = 0;
  window.addEventListener(BILLING_CARD_REQUIRED_EVENT, countBanner);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "GET" && url === "/api/property/tenants") return reply([TENANT]);
    if (method === "GET" && url === "/api/property/invoices") return reply([LIVE_INVOICE, OTHER_INVOICE]);
    if (method === "GET" && url === "/api/property/schedules") return reply([]);
    if (method === "GET" && url === "/api/property/reminder-settings") return reply({});
    writes.push(`${method} ${url}`);
    if (method === "POST" && (url === "/api/property/invoices" || url === "/api/property/invoices/inv-1/resend")) {
      return reply(BILLING_402, 402);
    }
    if (method === "POST" && url === "/api/property/invoices/inv-2/resend") return reply({});
    if (method === "POST" && url === "/api/property/invoices/inv-1/mark-paid-external") return reply({ message: "nope" }, 500);
    throw new Error(`Unhandled test request: ${method} ${url}`);
  });
});
afterEach(() => window.removeEventListener(BILLING_CARD_REQUIRED_EVENT, countBanner));

function renderTerminal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PropertyTerminal />
    </QueryClientProvider>,
  );
  return { view: screen.getByTestId("view"), queryClient };
}

/* The action has finished: its mutation is marked done only after the page's own
   onError/onSuccess has run; the short wait then lets React draw what it set. */
async function settled(queryClient: QueryClient) {
  await waitFor(() =>
    expect(queryClient.getMutationCache().getAll().map((m) => m.state.status)).toEqual([
      expect.stringMatching(/^(error|success)$/),
    ]),
  );
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
}

describe("a billing 402 on the phone property terminal (R1-T9)", () => {
  it("a rent request: the banner alone says so; the tenant and amount stay to send again", async () => {
    const { view, queryClient } = renderTerminal();
    fireEvent.click(screen.getByText("start rent"));
    fireEvent.click(screen.getByText("send rent"));

    await settled(queryClient);
    expect(writes).toEqual(["POST /api/property/invoices"]);
    expect(banners).toBe(1);
    expect(screen.getByTestId("toast")).toBeEmptyDOMElement();
    expect(view).toHaveAttribute("data-screen", "send");
    expect(view).toHaveAttribute("data-tenant", "tenant-mia");
    expect(view).toHaveAttribute("data-amount", "80000");
  });

  it("a bill: the banner alone says so; the tenant, amount and charge stay to send again", async () => {
    const { view, queryClient } = renderTerminal();
    fireEvent.click(screen.getByText("start bill"));
    expect(view).toHaveAttribute("data-screen", "bill");
    fireEvent.click(screen.getByText("send bill"));

    await settled(queryClient);
    expect(writes).toEqual(["POST /api/property/invoices"]);
    expect(banners).toBe(1);
    expect(screen.getByTestId("toast")).toBeEmptyDOMElement();
    expect(view).toHaveAttribute("data-screen", "bill");
    expect(view).toHaveAttribute("data-tenant", "tenant-mia");
    expect(view).toHaveAttribute("data-amount", "80000");
    expect(view).toHaveAttribute("data-charge", "cleaning");
  });

  it("resending a link: the banner says why it was not resent, and nothing else does", async () => {
    const { queryClient } = renderTerminal();
    fireEvent.click(screen.getByText("remind"));

    await settled(queryClient);
    expect(writes).toEqual(["POST /api/property/invoices/inv-1/resend"]);
    expect(banners).toBe(1);
    expect(screen.getByTestId("toast")).toBeEmptyDOMElement();
    expect(screen.getByTestId("page-banner")).toBeEmptyDOMElement();
  });

  it("resending to a batch: the banner says why none was resent, with no \"failed\" count; the batch stays open", async () => {
    const { view, queryClient } = renderTerminal();
    // The batch resends each tenant's live invoice, so the invoices must have loaded.
    await waitFor(() => expect(view).toHaveAttribute("data-invoices", "2"));
    fireEvent.click(screen.getByText("open batch"));
    fireEvent.click(screen.getByText("resend all"));

    await settled(queryClient);
    expect(writes).toEqual(["POST /api/property/invoices/inv-1/resend"]);
    expect(banners).toBe(1);
    expect(screen.getByTestId("page-banner")).toBeEmptyDOMElement();
    expect(screen.getByTestId("toast")).toBeEmptyDOMElement();
    expect(view).toHaveAttribute("data-screen", "batch");
  });

  it("a batch where one link did go out: that resend is still reported, the refused one counts as failed, and the banner says why", async () => {
    // Mixed answers are unlikely (the gate is per business), but a resend that
    // happened must not be hidden behind the billing banner.
    const { view, queryClient } = renderTerminal();
    await waitFor(() => expect(view).toHaveAttribute("data-invoices", "2"));
    fireEvent.click(screen.getByText("open batch"));
    fireEvent.click(screen.getByText("resend both"));

    await settled(queryClient);
    expect([...writes].sort()).toEqual(["POST /api/property/invoices/inv-1/resend", "POST /api/property/invoices/inv-2/resend"]);
    expect(banners).toBe(1);
    expect(screen.getByTestId("page-banner")).toHaveTextContent("Resent 1 · 1 failed");
    expect(screen.getByTestId("toast")).toBeEmptyDOMElement();
  });
});

/* R1-T9: a failed action says so. Marking a payment received showed nothing when it
   failed; the merchant could not tell it had not been recorded. */
describe("a failed action on the phone property terminal says so (R1-T9)", () => {
  it("marking a payment received: a failure is reported", async () => {
    const { queryClient } = renderTerminal();
    fireEvent.click(screen.getByText("mark received"));

    await settled(queryClient);
    expect(writes).toEqual(["POST /api/property/invoices/inv-1/mark-paid-external"]);
    expect(screen.getByTestId("toast")).toHaveTextContent("Could not mark as received");
    expect(banners).toBe(0);
  });
});
