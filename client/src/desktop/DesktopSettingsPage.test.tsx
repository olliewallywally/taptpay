import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiRequest } from "@/lib/queryClient";
import { BILLING_CARD_SESSION_KEY } from "@/hooks/use-billing-card-return";
import { DesktopSettingsPage } from "./DesktopSettingsPage";

const mockSetPreference = jest.fn();
const mockRestartTutorials = jest.fn();
const mockSetLocation = jest.fn();
const mockToast = jest.fn();

jest.mock("wouter", () => ({
  useLocation: () => ["/settings", mockSetLocation],
}));

jest.mock("@/lib/auth", () => ({
  getCurrentMerchantId: () => 42,
}));

jest.mock("@/lib/queryClient", () => ({
  apiRequest: jest.fn(),
}));

jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock("@/features/tutorial/tutorial", () => ({
  useTutorial: () => ({
    restartTutorials: mockRestartTutorials,
    visitedPages: 3,
    pageCount: 20,
    isRestarting: false,
    canRestart: true,
  }),
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

const mockStopThisDevicePush = jest.fn();
const mockResyncThisDevicePush = jest.fn();
jest.mock("@/lib/push-device", () => ({
  stopThisDevicePush: (...args: unknown[]) => mockStopThisDevicePush(...args),
  resyncThisDevicePush: (...args: unknown[]) => mockResyncThisDevicePush(...args),
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
  let authRole: "owner" | "member";
  let planId: "solo" | "team" | "crew";
  let billingHistory: unknown[];
  let subscriptionOverrides: Record<string, unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("authToken", "merchant.jwt.token");
    sessionStorage.clear();
    window.history.replaceState({}, "", "/settings");
    authRole = "owner";
    planId = "solo";
    billingHistory = [];
    subscriptionOverrides = {};
    mockRestartTutorials.mockResolvedValue(undefined);
    apiRequestMock.mockImplementation(async (method: string, path: string) => {
      if (method === "GET" && path === "/api/auth/me") {
        return jsonResponse({ user: { id: 7, email: `${authRole}@example.test`, role: authRole } });
      }
      if (method === "GET" && path === "/api/subscription") {
        const catalogue = {
          solo: { priceCents: 799, seatLimit: 1 },
          team: { priceCents: 899, seatLimit: 5 },
          crew: { priceCents: 1299, seatLimit: 10 },
        }[planId];
        return jsonResponse({
          subscription: {
            status: "active",
            planId,
            ...catalogue,
            seatsInUse: 1,
            ...subscriptionOverrides,
          },
        });
      }
      if (method === "GET" && path === "/api/team") {
        return jsonResponse({ members: [], seatLimit: 5, seatsInUse: 1 });
      }
      if (method === "GET" && path.startsWith("/api/subscription/billing-history")) {
        return jsonResponse({ history: billingHistory });
      }
      if (method === "POST" && path === "/api/billing/card/confirm") {
        return jsonResponse({ success: true });
      }
      if (method === "POST" && path === "/api/billing/card/session") {
        return jsonResponse({});
      }
      throw new Error(`Unexpected apiRequest: ${method} ${path}`);
    });
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

  it("renders stable tutorial anchors and restarts every page walkthrough", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            if (queryKey[0] === "/api/billing/card") return { ready: false, card: null };
            throw new Error(`Unexpected query: ${String(queryKey[0])}`);
          },
        },
      },
    });
    const user = userEvent.setup();
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <QueryClientProvider client={queryClient}>
        <DesktopSettingsPage deviceClass="desktop" vertical="retail" />
      </QueryClientProvider>,
    );

    await screen.findByRole("textbox", { name: "trading name" });
    for (const id of [
      "settings-business",
      "settings-goal",
      "settings-billing",
      "settings-payment-page",
      "settings-tutorial-help",
    ]) {
      expect(document.querySelector(`[data-tutorial-id="${id}"]`)).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "Tutorial & Help" }));
    expect(screen.getByRole("progressbar", { name: "tutorial progress" })).toHaveAttribute("aria-valuenow", "3");
    await user.click(screen.getByRole("button", { name: "Restart Tutorials" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockRestartTutorials).toHaveBeenCalledTimes(1));
    confirmSpy.mockRestore();
  });

  it("hides team management on Solo", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            if (queryKey[0] === "/api/billing/card") return { ready: false, card: null };
            throw new Error(`Unexpected query: ${String(queryKey[0])}`);
          },
        },
      },
    });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <DesktopSettingsPage deviceClass="desktop" vertical="retail" />
      </QueryClientProvider>,
    );

    await screen.findByRole("textbox", { name: "trading name" });
    await user.click(screen.getByRole("button", { name: "Subscription & Billing" }));
    expect(await screen.findByText(/Solo · \$7\.99\/mo/)).toBeInTheDocument();
    expect(screen.queryByText("Team logins")).not.toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalledWith("GET", "/api/team");
  });

  it("keeps merchant-wide and billing controls read-only for members", async () => {
    authRole = "member";
    planId = "team";
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <DesktopSettingsPage deviceClass="desktop" vertical="retail" />
      </QueryClientProvider>,
    );

    const tradingName = await screen.findByRole("textbox", { name: "trading name" });
    await waitFor(() => expect(tradingName).toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Subscription & Billing" }));
    expect(await screen.findByText(/account owner manages plans/i)).toBeInTheDocument();
    expect(screen.queryByText("Change plan")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment method")).not.toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalledWith("GET", "/api/team");
    expect(apiRequestMock.mock.calls.some(([, path]) => String(path).startsWith("/api/subscription/billing-history"))).toBe(false);
  });

  it("renders subscription billing history without rounding the charged amount", async () => {
    billingHistory = [{
      id: 91,
      billingType: "monthly_subscription",
      amount: "8.99",
      status: "succeeded",
      description: "Team plan — August 2026",
      failureReason: null,
      paidAt: "2026-08-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
    }];
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            if (queryKey[0] === "/api/billing/card") return { ready: true, card: null };
            throw new Error(`Unexpected query: ${String(queryKey[0])}`);
          },
        },
      },
    });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <DesktopSettingsPage deviceClass="desktop" vertical="retail" />
      </QueryClientProvider>,
    );

    await screen.findByRole("textbox", { name: "trading name" });
    await user.click(screen.getByRole("button", { name: "Subscription & Billing" }));
    expect(await screen.findByText("Team plan — August 2026")).toBeInTheDocument();
    expect(screen.getByText("$8.99")).toBeInTheDocument();
  });

  it("discloses that a paid-current card replacement has no immediate charge", async () => {
    subscriptionOverrides = {
      status: "active",
      currentPeriodEnd: "2099-09-07T12:00:00.000Z",
      nextBillingDate: "2099-09-07T12:00:00.000Z",
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            if (queryKey[0] === "/api/billing/card") {
              return {
                ready: true,
                card: { brand: "Visa", last4: "4242", expiry: "12/30" },
              };
            }
            throw new Error(`Unexpected query: ${String(queryKey[0])}`);
          },
        },
      },
    });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <DesktopSettingsPage deviceClass="desktop" vertical="retail" />
      </QueryClientProvider>,
    );

    await screen.findByRole("textbox", { name: "trading name" });
    await user.click(screen.getByRole("button", { name: "Subscription & Billing" }));
    expect(await screen.findByTestId("billing-card-charge-disclosure")).toHaveTextContent(
      "You won't be charged today. Your $7.99 monthly renewal stays unchanged.",
    );
    expect(screen.getByTestId("plan-change-billing-disclosure")).toHaveTextContent(
      "Upgrades charge the prorated price difference immediately.",
    );
  });

  it("offers Keep subscription only while cancellation is scheduled", async () => {
    subscriptionOverrides = {
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2099-09-07T12:00:00.000Z",
      cancellationEffectiveDate: "2099-09-07T12:00:00.000Z",
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            if (queryKey[0] === "/api/billing/card") return { ready: true, card: null };
            throw new Error(`Unexpected query: ${String(queryKey[0])}`);
          },
        },
      },
    });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <DesktopSettingsPage deviceClass="desktop" vertical="retail" />
      </QueryClientProvider>,
    );

    await screen.findByRole("textbox", { name: "trading name" });
    await user.click(screen.getByRole("button", { name: "Subscription & Billing" }));
    expect(await screen.findByRole("button", { name: "Keep subscription" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restart subscription" })).not.toBeInTheDocument();
  });

  it("shows an ended subscription and restarts it through hosted card setup", async () => {
    subscriptionOverrides = {
      status: "cancelled",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2099-09-07T12:00:00.000Z",
      cancellationEffectiveDate: "2026-08-01T12:00:00.000Z",
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            if (queryKey[0] === "/api/billing/card") {
              return {
                ready: false,
                card: { brand: "Visa", last4: "4242", expiry: "12/30" },
              };
            }
            throw new Error(`Unexpected query: ${String(queryKey[0])}`);
          },
        },
      },
    });
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <DesktopSettingsPage deviceClass="desktop" vertical="retail" />
      </QueryClientProvider>,
    );

    await screen.findByRole("textbox", { name: "trading name" });
    await user.click(screen.getByRole("button", { name: "Subscription & Billing" }));
    expect(await screen.findByText("Subscription ended")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep subscription" })).not.toBeInTheDocument();
    expect(screen.getByTestId("billing-card-charge-disclosure")).toHaveTextContent(
      "You'll be charged $7.99 today when your card is verified, then monthly. Cancel before renewal.",
    );
    expect(screen.getByTestId("plan-change-billing-disclosure")).toHaveTextContent(
      "Changing your plan selection has no charge today.",
    );

    await user.click(screen.getByRole("button", { name: "Restart subscription" }));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/billing/card/session", {});
    });
  });

  it("confirms a hosted-card return using only the browser-held session", async () => {
    window.history.replaceState({}, "", "/settings?section=billing&card=approved&session=url-session");
    sessionStorage.setItem(BILLING_CARD_SESSION_KEY, "browser-session");
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            if (queryKey[0] === "/api/billing/card") return { ready: true, card: null };
            throw new Error(`Unexpected query: ${String(queryKey[0])}`);
          },
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <DesktopSettingsPage deviceClass="desktop" vertical="retail" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        "POST",
        "/api/billing/card/confirm",
        { sessionId: "browser-session" },
      );
    });
    expect(sessionStorage.getItem(BILLING_CARD_SESSION_KEY)).toBeNull();
    expect(window.location.search).toBe("?section=billing");
  });
});

// R1-T4 phase D: "Sign out of all devices" ends every session of this login.
describe("desktop settings: sign out of all devices", () => {
  const fetchMock = global.fetch as jest.Mock;
  const apiRequestMock = apiRequest as jest.Mock;
  let signOutReply: { ok: boolean; status: number; json: () => Promise<unknown> };

  const renderPage = () => {
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
    render(
      <QueryClientProvider client={queryClient}>
        <DesktopSettingsPage deviceClass="desktop" vertical="retail" />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("authToken", "merchant.jwt.token");
    signOutReply = { ok: true, status: 204, json: async () => ({}) };
    apiRequestMock.mockImplementation(async (method: string, path: string) => {
      if (method === "GET" && path === "/api/auth/me") {
        return jsonResponse({ user: { id: 7, email: "owner@example.test", role: "owner" } });
      }
      if (method === "GET" && path === "/api/subscription") {
        return jsonResponse({ subscription: { status: "active", planId: "solo", priceCents: 799, seatLimit: 1, seatsInUse: 1 } });
      }
      if (method === "GET" && path.startsWith("/api/subscription/billing-history")) {
        return jsonResponse({ history: [] });
      }
      if (method === "PUT" && path === "/api/merchants/42/change-password") {
        return jsonResponse({ message: "Password updated successfully", token: "fresh.jwt.token" });
      }
      throw new Error(`Unexpected apiRequest: ${method} ${path}`);
    });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/merchants/42/profile" && !init?.method) return jsonResponse(safeOwnerProfile);
      if (url === "/api/auth/sign-out-everywhere" && init?.method === "POST") return signOutReply;
      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const signOutCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/auth/sign-out-everywhere");

  it("asks first, then ends every session and signs this device out", async () => {
    const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out of all devices" }));

    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith("/login"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(signOutCalls()).toHaveLength(1);
    expect(signOutCalls()[0][1]).toEqual({ method: "POST", headers: { Authorization: "Bearer merchant.jwt.token" } });
    expect(localStorage.getItem("authToken")).toBeNull();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Signed out of all devices" }));
  });

  it("changes nothing when the confirmation is declined", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out of all devices" }));

    expect(signOutCalls()).toHaveLength(0);
    expect(localStorage.getItem("authToken")).toBe("merchant.jwt.token");
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it("keeps this device signed in and says so when the server fails", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    signOutReply = { ok: false, status: 500, json: async () => ({ message: "Could not sign out everywhere. Please try again." }) };
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out of all devices" }));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't sign out of all devices",
      description: "Could not sign out everywhere. Please try again.",
      variant: "destructive",
    })));
    expect(localStorage.getItem("authToken")).toBe("merchant.jwt.token");
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it("keeps this device signed in under the fresh token after a password change", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Account" }));
    await userEvent.type(screen.getByLabelText("current password"), "old-password");
    await userEvent.type(screen.getByLabelText("new password"), "new-password");
    await userEvent.type(screen.getByLabelText("confirm password"), "new-password");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(localStorage.getItem("authToken")).toBe("fresh.jwt.token"));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Password changed",
      description: "Your other devices have been signed out.",
    }));
    expect(mockSetLocation).not.toHaveBeenCalledWith("/login");
  });

  // R1-T4 phase D follow-up (owner decision 2026-09-22): notifications belong to the login.
  it("Log Out stops this device's notifications with the token it had", async () => {
    renderPage();
    await userEvent.click(await screen.findByTestId("button-logout"));

    expect(mockStopThisDevicePush).toHaveBeenCalledWith("merchant.jwt.token");
    expect(localStorage.getItem("authToken")).toBeNull();
    expect(mockSetLocation).toHaveBeenCalledWith("/login");
  });

  it("re-registers this device's notifications under the fresh token after a password change", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Account" }));
    await userEvent.type(screen.getByLabelText("current password"), "old-password");
    await userEvent.type(screen.getByLabelText("new password"), "new-password");
    await userEvent.type(screen.getByLabelText("confirm password"), "new-password");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(mockResyncThisDevicePush).toHaveBeenCalledWith("fresh.jwt.token"));
    expect(mockStopThisDevicePush).not.toHaveBeenCalled();
  });

  it("leaves this device's notifications to the server when signing out of all devices", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out of all devices" }));

    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith("/login"));
    // The server stopped every device of this login; this one resumes if it signs in again.
    expect(mockStopThisDevicePush).not.toHaveBeenCalled();
  });

  it("signs this device out, without claiming success, when its session had already ended", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    signOutReply = { ok: false, status: 401, json: async () => ({ code: "SESSION_ENDED" }) };
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out of all devices" }));

    await waitFor(() => expect(mockSetLocation).toHaveBeenCalledWith("/login"));
    expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Signed out of all devices" }));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Already signed out" }));
  });
});
