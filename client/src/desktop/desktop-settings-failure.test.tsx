/*
 * R1-T9 — desktop settings when its data did not load. The business details
 * failing showed "Your Business" as PENDING, a blank form whose Save would send
 * blanks over the real details, and "pending — contact support" as the account
 * status. Access failing told the owner that the owner manages everything. The
 * plan failing showed the default plan as theirs, with plan changes, card set-up
 * and cancellation live under charge disclosures worked out from no plan. The
 * payment method failing read as "no saved card": "Add payment method".
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { apiRequest } from "@/lib/queryClient";
import { DesktopSettingsPage } from "./DesktopSettingsPage";

jest.mock("wouter", () => ({ useLocation: () => ["/settings", jest.fn()] }));
jest.mock("@/lib/auth", () => ({ getCurrentMerchantId: () => 42 }));
jest.mock("@/lib/queryClient", () => ({ apiRequest: jest.fn() }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/features/tutorial/tutorial", () => ({
  useTutorial: () => ({ restartTutorials: jest.fn(), visitedPages: 3, pageCount: 20, isRestarting: false, canRestart: true }),
}));
jest.mock("@/hooks/use-push-notifications", () => ({
  usePushNotifications: () => ({
    supported: true,
    available: true,
    enabled: true,
    loading: false,
    preferencesLoading: false,
    preferences: { paymentReceived: true, dailyPayoutSummary: true, failedPaymentAlerts: false },
    toggle: jest.fn(),
    setPreference: jest.fn(),
  }),
}));
jest.mock("@/lib/push-device", () => ({ stopThisDevicePush: jest.fn(), resyncThisDevicePush: jest.fn() }));
jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: ReactNode }) => children,
}));

const fetchMock = global.fetch as jest.Mock;
const apiRequestMock = apiRequest as jest.Mock;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const outage = () => ({ ok: false, status: 500, json: async () => ({ message: "unavailable" }) });
const inAMonth = new Date(Date.now() + 30 * 86_400_000).toISOString();

const PROFILE = {
  id: 42,
  businessName: "Safe Shop",
  email: "receipts@example.test",
  phone: "0210000000",
  status: "active",
  gstNumber: "GST-42",
  dailyGoal: "500.00",
};
const SUBSCRIPTION = {
  subscription: {
    status: "active",
    planId: "team",
    priceCents: 899,
    seatLimit: 5,
    seatsInUse: 1,
    currentPeriodEnd: inAMonth,
    nextBillingDate: inAMonth,
  },
};
const CARD = { ready: true, card: { brand: "Visa", last4: "4242", expiry: "12/30" } };

type Answer = () => unknown;
type Answers = { profile?: Answer; access?: Answer; subscription?: Answer; card?: Answer };
function serve({
  profile = () => ok(PROFILE),
  access = () => ok({ user: { id: 7, email: "owner@example.test", role: "owner" } }),
  subscription = () => ok(SUBSCRIPTION),
  card = () => CARD,
}: Answers) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/merchants/42/profile" && !init?.method) return profile();
    throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
  });
  apiRequestMock.mockImplementation(async (method: string, path: string) => {
    if (method === "GET" && path === "/api/auth/me") return access();
    if (method === "GET" && path === "/api/subscription") return subscription();
    if (method === "GET" && path === "/api/team") return ok({ members: [], seatLimit: 5, seatsInUse: 1 });
    if (method === "GET" && path.startsWith("/api/subscription/billing-history")) return ok({ history: [] });
    throw new Error(`Unexpected apiRequest: ${method} ${path}`);
  });
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          if (queryKey[0] === "/api/billing/card") {
            const answer = card();
            if (answer instanceof Error) throw answer;
            return answer;
          }
          throw new Error(`Unexpected query: ${String(queryKey[0])}`);
        },
      },
      mutations: { retry: false },
    },
  });
}

function renderPage(client: QueryClient) {
  render(
    <QueryClientProvider client={client}>
      <DesktopSettingsPage deviceClass="desktop" vertical="retail" />
    </QueryClientProvider>,
  );
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});
const openSection = (title: string) => userEvent.click(screen.getByRole("button", { name: title }));
const alertSaying = (text: string) =>
  screen.getAllByRole("alert").find((alert) => alert.textContent?.includes(text));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("authToken", "merchant.jwt.token");
  sessionStorage.clear();
  window.history.replaceState({}, "", "/settings");
});

describe("desktop settings when the business details fail to load (R1-T9)", () => {
  it("says so once, with Try again, instead of 'Your Business', a pending status and a blank form", async () => {
    renderPage(serve({ profile: outage }));
    await settle();

    expect(screen.getAllByRole("alert").filter((a) => a.textContent?.includes("Business details didn't load"))).toHaveLength(1);
    expect(screen.queryByText("Your Business")).toBeNull();
    expect(screen.queryByText("PENDING")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "trading name" })).toBeNull(); // no blank form to save over the real one
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("Try again loads them", async () => {
    let calls = 0;
    renderPage(serve({ profile: () => (calls++ === 0 ? outage() : ok(PROFILE)) }));
    await settle();

    await userEvent.click(within(alertSaying("Business details didn't load")!).getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.getByRole("textbox", { name: "trading name" })).toHaveValue("Safe Shop");
    expect(screen.getAllByText("Safe Shop").length).toBeGreaterThan(0);
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("the daily goal and the account status and phone say they didn't load", async () => {
    renderPage(serve({ profile: outage }));
    await settle();

    await openSection("Dashboard Preferences");
    expect(screen.queryByRole("textbox", { name: "daily revenue goal" })).toBeNull();
    expect(screen.getByText("goal didn't load")).toBeInTheDocument();

    await openSection("Account");
    expect(screen.queryByText(/contact support/)).toBeNull();
    expect(screen.getAllByText("unavailable")).toHaveLength(2); // phone, account status
  });
});

describe("desktop settings when access fails to load (R1-T9)", () => {
  it("does not tell the owner that the owner manages everything; nothing is editable until it loads", async () => {
    renderPage(serve({ access: outage }));
    await settle();

    expect(screen.queryByText("Business details are managed by the account owner.")).toBeNull();
    expect(alertSaying("Your access didn't load")).toBeDefined();
    expect(screen.getByRole("textbox", { name: "trading name" })).toBeDisabled();

    await openSection("Subscription & Billing");
    expect(screen.queryByText(/The account owner manages plans/)).toBeNull();
    expect(alertSaying("Your access didn't load")).toBeDefined();
  });

  it("Try again loads it", async () => {
    let calls = 0;
    renderPage(serve({
      access: () => (calls++ === 0 ? outage() : ok({ user: { id: 7, email: "owner@example.test", role: "owner" } })),
    }));
    await settle();

    await userEvent.click(within(alertSaying("Your access didn't load")!).getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("textbox", { name: "trading name" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });
});

describe("desktop settings when the plan fails to load (R1-T9)", () => {
  it("shows no default plan and no charge disclosures, and no plan, card or cancel action", async () => {
    renderPage(serve({ subscription: outage }));
    await settle();
    await openSection("Subscription & Billing");

    expect(alertSaying("Your plan didn't load")).toBeDefined();
    expect(screen.queryByText(/\/mo/)).toBeNull(); // no "Solo · $7.99/mo" from the default plan
    expect(screen.queryByTestId("plan-change-billing-disclosure")).toBeNull();
    expect(screen.queryByTestId("billing-card-charge-disclosure")).toBeNull();
    for (const name of ["solo · $7.99", "team · $8.99", "crew · $12.99"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
      expect(screen.getByRole("button", { name })).toHaveAttribute("title", "Available once your plan loads");
    }
    expect(screen.getByRole("button", { name: "replace" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Cancel/ })).toBeNull();
  });

  it("with no card saved, Add payment method waits for the plan too", async () => {
    renderPage(serve({ subscription: outage, card: () => ({ ready: false, card: null }) }));
    await settle();
    await openSection("Subscription & Billing");

    const add = screen.getByRole("button", { name: "Add payment method" });
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute("title", "Available once your plan loads");
  });

  it("Try again loads the plan", async () => {
    let calls = 0;
    renderPage(serve({ subscription: () => (calls++ === 0 ? outage() : ok(SUBSCRIPTION)) }));
    await settle();
    await openSection("Subscription & Billing");

    await userEvent.click(within(alertSaying("Your plan didn't load")!).getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.getByText(/Team · \$8\.99\/mo/)).toBeInTheDocument();
    expect(screen.getByTestId("billing-card-charge-disclosure")).toHaveTextContent("You won't be charged today");
    expect(screen.getByRole("button", { name: "replace" })).toBeEnabled();
  });

  it("a failed background refresh keeps the plan shown", async () => {
    let calls = 0;
    const client = serve({ subscription: () => (calls++ === 0 ? ok(SUBSCRIPTION) : outage()) });
    renderPage(client);
    await settle();
    await openSection("Subscription & Billing");

    await act(async () => {
      await client.refetchQueries({ queryKey: ["/api/subscription"] });
    });
    await settle();
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/Team · \$8\.99\/mo/)).toBeInTheDocument();
  });
});

describe("desktop settings when the payment method fails to load (R1-T9)", () => {
  it("says so with Try again, not 'Add payment method'", async () => {
    let calls = 0;
    renderPage(serve({ card: () => (calls++ === 0 ? new Error("card") : CARD) }));
    await settle();
    await openSection("Subscription & Billing");

    expect(screen.queryByRole("button", { name: "Add payment method" })).toBeNull();
    await userEvent.click(within(alertSaying("Payment method didn't load")!).getByRole("button", { name: "Try again" }));
    await settle();
    expect(screen.getByText(/Visa ···· 4242/)).toBeInTheDocument();
  });
});

describe("desktop settings with everything loaded (R1-T9 guard)", () => {
  it("shows the details, the plan, the card and the actions as before", async () => {
    renderPage(serve({}));
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("textbox", { name: "trading name" })).toHaveValue("Safe Shop");
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();

    await openSection("Subscription & Billing");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/Team · \$8\.99\/mo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "solo · $7.99" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "team · $8.99" })).toBeDisabled(); // the current plan
    expect(screen.getByRole("button", { name: "Cancel at period end" })).toBeEnabled();
  });
});
