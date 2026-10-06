/**
 * R1-T5d on the tablet and desktop Settings page: the owner's "Sign in with Apple" row, in the
 * Account section under the password row. The same shared piece as the phone's
 * (hooks/use-apple-connection.ts); this holds the row to this screen. Setup as in
 * DesktopSettingsPage.test.tsx.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiRequest } from "@/lib/queryClient";
import { DesktopSettingsPage } from "./DesktopSettingsPage";
import { holdSession, releaseSession } from "@/lib/session";

const mockSetLocation = jest.fn();
const mockToast = jest.fn();
jest.mock("wouter", () => ({ useLocation: () => ["/settings", mockSetLocation] }));
jest.mock("@/lib/auth", () => ({ getCurrentMerchantId: () => 42 }));
jest.mock("@/lib/queryClient", () => ({ apiRequest: jest.fn() }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@/features/tutorial/tutorial", () => ({
  useTutorial: () => ({ restartTutorials: jest.fn(), visitedPages: 3, pageCount: 20, isRestarting: false, canRestart: true }),
}));
jest.mock("@/hooks/use-push-notifications", () => ({
  usePushNotifications: () => ({
    supported: true, available: true, enabled: true, loading: false, preferencesLoading: false,
    preferences: { paymentReceived: true, dailyPayoutSummary: true, failedPaymentAlerts: false },
    toggle: jest.fn(), setPreference: jest.fn(),
  }),
}));
jest.mock("@/lib/push-device", () => ({ stopThisDevicePush: jest.fn(), resyncThisDevicePush: jest.fn() }));
jest.mock("./DesktopPageScaffold", () => ({
  DesktopPageScaffold: ({ children }: { children: ReactNode }) => children,
}));
const mockLeave = jest.fn();
jest.mock("@/lib/apple-sign-in", () => ({
  ...jest.requireActual("@/lib/apple-sign-in"),
  leaveForApple: (url: string) => mockLeave(url),
}));

const APPLE = "https://appleid.apple.com/auth/authorize?client_id=nz.taptpay.signin&state=s&nonce=n";
const NOT_CONNECTED = { available: true, connected: false, email: null, isPrivateEmail: false, connectedAt: null };
const CONNECTED = { available: true, connected: true, email: "owner@example.test", isPrivateEmail: false, connectedAt: "2026-10-06T01:02:03.000Z" };
const profile = {
  id: 42, name: "Safe Shop", businessName: "Safe Shop", businessType: "retail", email: "receipts@example.test",
  phone: "0210000000", address: "1 Safe Street", status: "active", gstNumber: "GST-42", dailyGoal: "500.00",
};
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

const fetchMock = global.fetch as jest.Mock;
const apiRequestMock = apiRequest as jest.Mock;
let role: "owner" | "member";
let connection: unknown;
let connectAnswer: () => Promise<unknown>;
let disconnectAnswer: () => Promise<unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  releaseSession("business");
  holdSession("business", { id: 7, email: "owner@example.test", merchantId: 42, role: "owner" }, "page-csrf-token");
  window.history.replaceState({}, "", "/settings");
  role = "owner";
  connection = NOT_CONNECTED;
  connectAnswer = async () => ok({ url: APPLE });
  disconnectAnswer = async () => ok({ connected: false });
  apiRequestMock.mockImplementation(async (method: string, path: string) => {
    if (method === "GET" && path === "/api/auth/me") return ok({ user: { id: 7, email: `${role}@example.test`, role } });
    if (method === "GET" && path === "/api/subscription") {
      return ok({ subscription: { status: "active", planId: "solo", priceCents: 799, seatLimit: 1, seatsInUse: 1 } });
    }
    if (method === "GET" && path.startsWith("/api/subscription/billing-history")) return ok({ history: [] });
    if (method === "GET" && path === "/api/team") return ok({ members: [], seatLimit: 1, seatsInUse: 1 });
    if (method === "GET" && path === "/api/auth/apple/connection") return ok(connection);
    if (method === "POST" && path === "/api/auth/apple/connect") return connectAnswer();
    if (method === "POST" && path === "/api/auth/apple/disconnect") return disconnectAnswer();
    throw new Error(`Unexpected apiRequest: ${method} ${path}`);
  });
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/merchants/42/profile" && !init?.method) return ok(profile);
    throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
  });
});
afterEach(() => jest.restoreAllMocks());

const posts = (path: string) => apiRequestMock.mock.calls.filter(([method, asked]) => method === "POST" && asked === path);
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});
function renderPage(deviceClass: "tablet" | "desktop" = "desktop") {
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
  return render(
    <QueryClientProvider client={queryClient}>
      <DesktopSettingsPage deviceClass={deviceClass} vertical="retail" />
    </QueryClientProvider>,
  );
}
async function openAccount(deviceClass: "tablet" | "desktop" = "desktop") {
  renderPage(deviceClass);
  await userEvent.click(await screen.findByRole("button", { name: "Account" }));
  await settle();
}

describe.each(["desktop", "tablet"] as const)("%s Settings: Sign in with Apple", (deviceClass) => {
  it("is the last row of the Account section, under the password row, for the owner", async () => {
    await openAccount(deviceClass);
    const row = await screen.findByTestId("apple-connection");
    expect(row).toHaveTextContent("Sign in with Apple");
    expect(row).toHaveTextContent("Not connected");
    // The password row stays, and comes first.
    const change = screen.getByRole("button", { name: "Change password" });
    expect(change.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const password = screen.getByLabelText("Current password for Apple") as HTMLInputElement;
    expect(password.type).toBe("password");
    expect(password.autocomplete).toBe("current-password");
    expect(screen.getByTestId("button-apple-connection")).toHaveTextContent("Connect Apple");
    await userEvent.click(screen.getByTestId("link-apple-set-password"));
    expect(mockSetLocation).toHaveBeenCalledWith("/forgot-password");
  });

  it("connects with the password typed, then leaves for Apple; the password row's fields are not sent", async () => {
    await openAccount(deviceClass);
    await userEvent.type(screen.getByLabelText("current password"), "typed-in-the-other-row");
    const button = await screen.findByTestId("button-apple-connection");
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Current password for Apple"), "Current-password-1");
    await userEvent.click(button);
    await settle();
    expect(posts("/api/auth/apple/connect")).toEqual([["POST", "/api/auth/apple/connect", { currentPassword: "Current-password-1" }]]);
    expect(mockLeave).toHaveBeenCalledWith(APPLE);
    expect((screen.getByLabelText("Current password for Apple") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("current password") as HTMLInputElement).value).toBe("typed-in-the-other-row");
  });

  it("says what the server says for a wrong password, and stays", async () => {
    connectAnswer = async () => { throw new Error('400: {"message":"Current password is incorrect"}'); };
    await openAccount(deviceClass);
    await userEvent.type(await screen.findByLabelText("Current password for Apple"), "Wrong-password-1");
    await userEvent.click(screen.getByTestId("button-apple-connection"));
    await settle();
    expect(mockToast).toHaveBeenCalledWith({ title: "Current password is incorrect", variant: "destructive" });
    expect(mockLeave).not.toHaveBeenCalled();
  });

  it("shows who is connected and disconnects behind the password", async () => {
    connection = CONNECTED;
    await openAccount(deviceClass);
    const row = await screen.findByTestId("apple-connection");
    expect(row).toHaveTextContent("Connected");
    expect(row).toHaveTextContent("owner@example.test");
    expect(row).not.toHaveTextContent("Hide My Email");
    expect(screen.queryByTestId("link-apple-set-password")).toBeNull();
    const button = screen.getByTestId("button-apple-connection");
    expect(button).toHaveTextContent("Disconnect Apple");

    connection = NOT_CONNECTED;
    await userEvent.type(screen.getByLabelText("Current password for Apple"), "Current-password-1");
    await userEvent.click(button);
    await settle();
    expect(posts("/api/auth/apple/disconnect")).toEqual([["POST", "/api/auth/apple/disconnect", { currentPassword: "Current-password-1" }]]);
    expect(mockToast).toHaveBeenCalledWith({ title: "Apple disconnected", description: "Apple no longer signs this login in." });
    await waitFor(() => expect(screen.getByTestId("apple-connection")).toHaveTextContent("Not connected"));
  });

  it("says when the address Apple gave is a relay address", async () => {
    connection = { ...CONNECTED, email: "x1y2z3@privaterelay.appleid.com", isPrivateEmail: true };
    await openAccount(deviceClass);
    const row = await screen.findByTestId("apple-connection");
    expect(row).toHaveTextContent("Connected · x1y2z3@privaterelay.appleid.com (Hide My Email)");
  });

  it("is not drawn for a teammate, and nothing is asked about Apple", async () => {
    role = "member";
    await openAccount(deviceClass);
    expect(screen.queryByTestId("apple-connection")).toBeNull();
    expect(apiRequestMock.mock.calls.filter(([, path]) => String(path).includes("/apple/"))).toEqual([]);
    // The password row is still theirs.
    expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
  });

  it("is not drawn where Apple is not set up and nothing is connected", async () => {
    connection = { ...NOT_CONNECTED, available: false };
    await openAccount(deviceClass);
    expect(screen.queryByTestId("apple-connection")).toBeNull();
  });

  it("coming back from Apple opens the Account section, says it is connected and cleans the address", async () => {
    connection = CONNECTED;
    window.history.replaceState({}, "", "/settings?apple=connected");
    renderPage(deviceClass);
    expect(await screen.findByTestId("apple-connection")).toHaveTextContent("Connected");
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ title: "Apple connected", description: "You can now sign in with Apple." }));
    expect(window.location.search).toBe("");
  });

  it("coming back refused says why", async () => {
    window.history.replaceState({}, "", "/settings?apple=has-another");
    renderPage(deviceClass);
    expect(await screen.findByTestId("apple-connection")).toHaveTextContent("Not connected");
    expect(mockToast).toHaveBeenCalledWith({
      title: "Apple was not connected", description: "This login already has a different Apple account connected. Disconnect it first.", variant: "destructive",
    });
  });
});
