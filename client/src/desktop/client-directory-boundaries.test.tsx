import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import * as propertyData from "@/lib/property-data";
import DesktopPropertyClients from "./pages/property-clients";
import { ClientRow } from "./pages/trades-clients";
import type { TradesClientRow } from "./data/trades-data";

jest.mock("wouter", () => ({
  useLocation: () => ["/property/tenants", jest.fn()],
}));

jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/lib/property-data", () => ({
  PROPERTY_KEYS: { tenants: ["/api/property/tenants"] },
  usePropertyTenants: jest.fn(),
  usePropertyInvoices: jest.fn(),
}));

jest.mock("@/lib/property-api", () => ({
  propHeaders: () => ({}),
}));

const usePropertyTenantsMock = propertyData.usePropertyTenants as jest.Mock;
const usePropertyInvoicesMock = propertyData.usePropertyInvoices as jest.Mock;

function renderPropertyClients() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DesktopPropertyClients deviceClass="desktop" />
    </QueryClientProvider>,
  );
}

describe("desktop client-directory boundary behavior", () => {
  beforeEach(() => {
    usePropertyTenantsMock.mockReturnValue({
      data: [
        {
          id: "active-north",
          firstName: "Alpha",
          lastName: "North",
          propertyAddress: "1 Active Road",
          status: "active",
        },
        {
          id: "active-south",
          firstName: "Beta",
          lastName: "South",
          propertyAddress: "2 Current Lane",
          status: "active",
        },
        {
          id: "archived-only",
          firstName: "Archive",
          lastName: "Only",
          propertyAddress: "99 Archived Place",
          status: "archived",
        },
      ],
      isLoading: false,
      error: null,
    });
    usePropertyInvoicesMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("builds property choices from active tenants and keeps search out of the live scoped count", async () => {
    const user = userEvent.setup();
    const { container } = renderPropertyClients();

    const liveCount = screen.getByRole("status", { name: "2 active tenants" });
    expect(liveCount).toHaveAttribute("aria-live", "polite");
    expect(liveCount).toHaveAttribute("aria-atomic", "true");
    expect(container.querySelectorAll(".pc-row")).toHaveLength(2);
    expect(screen.queryByText("Archive Only")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "all properties scope" }));
    expect(screen.getByRole("option", { name: "1 Active Road" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2 Current Lane" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "99 Archived Place" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "all properties" }));

    await user.type(screen.getByRole("textbox", { name: "search tenants" }), "alpha");
    expect(screen.getByRole("status", { name: "2 active tenants" })).toBe(liveCount);
    expect(container.querySelectorAll(".pc-row")).toHaveLength(1);
    expect(screen.getByText("Alpha North")).toBeInTheDocument();

    await user.clear(screen.getByRole("textbox", { name: "search tenants" }));
    await user.click(screen.getByRole("button", { name: "all properties scope" }));
    await user.click(screen.getByRole("option", { name: "1 Active Road" }));
    expect(screen.getByRole("status", { name: "1 active tenant" })).toBeInTheDocument();
    expect(container.querySelectorAll(".pc-row")).toHaveLength(1);
    expect(screen.getByText("Alpha North")).toBeInTheDocument();
    expect(screen.queryByText("Beta South")).not.toBeInTheDocument();
  });

  it("uses the full visible trades name and visible row details as its accessibility contract", async () => {
    const firstName = "A".repeat(80);
    const lastName = "B".repeat(80);
    const name = `${firstName} ${lastName}`;
    const siteAddress = `9 ${"Z".repeat(198)}`;
    const onOpen = jest.fn();
    const row = {
      id: "long-client",
      name,
      initials: "AB",
      siteAddress,
      status: "overdue",
      amountCents: 123_456,
    } as TradesClientRow;

    const user = userEvent.setup();
    const { container } = render(<ClientRow row={row} onOpen={onOpen} />);
    const button = screen.getByRole("button", { name });

    expect(firstName).toHaveLength(80);
    expect(lastName).toHaveLength(80);
    expect(siteAddress).toHaveLength(200);
    expect(button).not.toHaveAttribute("aria-label");
    expect(button).toHaveAccessibleDescription(`${siteAddress} overdue $1,234.56`);
    expect(screen.getByText(name)).toHaveAttribute("id", button.getAttribute("aria-labelledby"));
    expect(container.querySelector(".tc-avatar")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".tc-row-dot")).toHaveAttribute("aria-hidden", "true");

    button.focus();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledWith("/trades/clients/long-client");

    onOpen.mockClear();
    button.focus();
    await user.keyboard(" ");
    expect(onOpen).toHaveBeenCalledWith("/trades/clients/long-client");
  });
});
