import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiRequest } from "@/lib/queryClient";
import { DesktopSettingsPage } from "./DesktopSettingsPage";

const mockSetPreference = jest.fn();

jest.mock("wouter", () => ({
  useLocation: () => ["/settings", jest.fn()],
}));

jest.mock("@/lib/auth", () => ({
  getCurrentMerchantId: () => 42,
}));

jest.mock("@/lib/queryClient", () => ({
  apiRequest: jest.fn(),
}));

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/hooks/use-push-notifications", () => ({
  usePushNotifications: () => ({
    supported: true,
    available: true,
    enabled: true,
    loading: false,
    preferencesLoading: false,
    preferences: {
      paymentReceived: true,
      dailyPayoutSummary: true,
      failedPaymentAlerts: false,
    },
    toggle: jest.fn(),
    setPreference: mockSetPreference,
  }),
}));

jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: ReactNode }) => children,
}));

const safeOwnerProfile = {
  id: 42,
  name: "Safe Shop",
  businessName: "Safe Shop",
  businessType: "retail",
  email: "receipts@example.test",
  phone: "0210000000",
  address: "1 Safe Street",
  status: "active",
  gstNumber: "GST-42",
  dailyGoal: "500.00",
  paymentUrl: "/pay/42",
  windcaveApiConfigured: true,
};

const jsonResponse = (body: unknown) => ({
  ok: true,
  json: async () => body,
});

describe("desktop settings business-details save contract", () => {
  const fetchMock = global.fetch as jest.Mock;
  const apiRequestMock = apiRequest as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("authToken", "merchant.jwt.token");
    apiRequestMock.mockResolvedValue(
      jsonResponse({ subscription: { status: "active", billingFrequency: "monthly" } }),
    );
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/merchants/42/profile" && !init?.method) {
        return jsonResponse(safeOwnerProfile);
      }
      if (url === "/api/merchants/42" && init?.method === "PUT") {
        return jsonResponse({ ...safeOwnerProfile, businessName: "Safer Shop" });
      }
      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    });
  });

  it("renders no payout fields and sends only the editable business fields", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            if (queryKey[0] === "/api/billing/card") return { ready: false, card: null };
            throw new Error(`Unexpected query: ${String(queryKey[0])}`);
          },
        },
        mutations: { retry: false },
      },
    });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <DesktopSettingsPage deviceClass="desktop" vertical="retail" />
      </QueryClientProvider>,
    );

    const tradingName = await screen.findByRole("textbox", { name: "trading name" });
    await waitFor(() => expect(tradingName).toHaveValue("Safe Shop"));
    expect(screen.queryByText(/payout/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bank account/i)).not.toBeInTheDocument();

    await user.clear(tradingName);
    await user.type(tradingName, "Safer Shop");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/merchants/42",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    const [, request] = fetchMock.mock.calls.find(
      ([url, init]) => url === "/api/merchants/42" && init?.method === "PUT",
    );
    expect(JSON.parse(request.body)).toEqual({
      businessName: "Safer Shop",
      gstNumber: "GST-42",
      email: "receipts@example.test",
    });
    expect(request.headers.Authorization).toBe("Bearer merchant.jwt.token");
  });

  it("renders the three notification preferences and updates the selected event", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            if (queryKey[0] === "/api/billing/card") return { ready: false, card: null };
            throw new Error(`Unexpected query: ${String(queryKey[0])}`);
          },
        },
        mutations: { retry: false },
      },
    });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <DesktopSettingsPage deviceClass="desktop" vertical="retail" />
      </QueryClientProvider>,
    );

    await screen.findByRole("textbox", { name: "trading name" });
    await user.click(screen.getByRole("button", { name: "Transaction Notifications" }));

    expect(screen.getByRole("switch", { name: "payment received" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "daily payout summary" })).toBeChecked();
    const failed = screen.getByRole("switch", { name: "failed payment alerts" });
    expect(failed).not.toBeChecked();
    await user.click(failed);
    expect(mockSetPreference).toHaveBeenCalledWith("failedPaymentAlerts", true);
  });
});
