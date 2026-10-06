/**
 * R1-T5d on the phone Settings page: the owner's "Sign in with Apple" row, in the Account section.
 * It is drawn for the owner only, and only where Apple can be connected or already is; connecting
 * and disconnecting ask for the current password; coming back from Apple opens the Account section
 * and says how it went. Setup as in settings-sign-out-everywhere.test.tsx.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("@/hooks/use-push-notifications", () => ({
  usePushNotifications: () => ({ enabled: false, loading: false, supported: false, available: false, toggle: jest.fn() }),
}));
jest.mock("@/hooks/use-billing-card-return", () => ({
  BILLING_CARD_SESSION_KEY: "k",
  useBillingCardReturn: () => ({ confirmingCard: false }),
}));
jest.mock("@/features/tutorial/tutorial", () => ({
  useTutorial: () => ({ restartTutorials: jest.fn(), visitedPages: [], pageCount: 0, isRestarting: false, canRestart: false }),
}));
jest.mock("@/lib/push-device", () => ({ stopThisDevicePush: jest.fn() }));
const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const mockNavigate = jest.fn();
jest.mock("wouter", () => ({ useLocation: () => ["/settings", mockNavigate] }));
const mockApi = jest.fn();
jest.mock("@/lib/queryClient", () => ({ apiRequest: (...args: unknown[]) => mockApi(...args) }));
const mockLeave = jest.fn();
jest.mock("@/lib/apple-sign-in", () => ({
  ...jest.requireActual("@/lib/apple-sign-in"),
  leaveForApple: (url: string) => mockLeave(url),
}));

import Settings from "@/pages/settings";
import { holdSession, releaseSession } from "@/lib/session";

const APPLE = "https://appleid.apple.com/auth/authorize?client_id=nz.taptpay.signin&state=s&nonce=n";
const NOT_CONNECTED = { available: true, connected: false, email: null, isPrivateEmail: false, connectedAt: null };
const CONNECTED = { available: true, connected: true, email: "owner@privaterelay.appleid.com", isPrivateEmail: true, connectedAt: "2026-10-06T01:02:03.000Z" };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

let role: "owner" | "member";
let connection: unknown;
let connectAnswer: () => Promise<unknown>;
let disconnectAnswer: () => Promise<unknown>;

beforeEach(() => {
  localStorage.clear();
  releaseSession("business");
  role = "owner";
  connection = NOT_CONNECTED;
  connectAnswer = async () => ok({ url: APPLE });
  disconnectAnswer = async () => ok({ connected: false });
  holdSession("business", { id: 7, email: "owner@example.test", merchantId: 22, role: "owner" }, "page-csrf-token");
  window.history.replaceState({}, "", "/settings");
  mockToast.mockReset();
  mockNavigate.mockReset();
  mockLeave.mockReset();
  mockApi.mockReset();
  mockApi.mockImplementation(async (method: string, path: string) => {
    if (method === "GET" && path === "/api/auth/me") return ok({ user: { id: 7, email: `${role}@example.test`, role } });
    if (method === "GET" && path === "/api/auth/apple/connection") return ok(connection);
    if (method === "POST" && path === "/api/auth/apple/connect") return connectAnswer();
    if (method === "POST" && path === "/api/auth/apple/disconnect") return disconnectAnswer();
    return ok({});
  });
  global.fetch = jest.fn(async (url: unknown) => (
    url === "/api/merchants/22/profile" ? ok({ id: 22, businessName: "Synthetic Merchant 22", status: "active" }) : ok({})
  )) as any;
});
afterEach(() => jest.restoreAllMocks());

const posts = (path: string) => mockApi.mock.calls.filter(([method, asked]) => method === "POST" && asked === path);
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});
async function openSettings() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <Settings />
    </QueryClientProvider>,
  );
  await settle();
}
async function openAccount() {
  await openSettings();
  await userEvent.click(await screen.findByTestId("settings-row-account"));
  await settle();
}

describe("phone Settings: Sign in with Apple", () => {
  it("is in the Account section for the owner: not connected, a password field and one button", async () => {
    await openAccount();
    const row = await screen.findByTestId("apple-connection");
    expect(row).toHaveTextContent("Sign in with Apple");
    expect(row).toHaveTextContent("Not connected");
    const password = screen.getByLabelText("Current password for Apple") as HTMLInputElement;
    expect(password.type).toBe("password");
    expect(password.autocomplete).toBe("current-password");
    expect(screen.getByTestId("button-apple-connection")).toHaveTextContent("Connect Apple");
    // No password they know (a login that has only ever used Google): the way to set one.
    await userEvent.click(screen.getByTestId("link-apple-set-password"));
    expect(mockNavigate).toHaveBeenCalledWith("/forgot-password");
  });

  it("connects with the password typed: sent once, then the page leaves for Apple", async () => {
    await openAccount();
    await userEvent.type(await screen.findByLabelText("Current password for Apple"), "Current-password-1");
    await userEvent.click(screen.getByTestId("button-apple-connection"));
    await settle();
    expect(posts("/api/auth/apple/connect")).toEqual([["POST", "/api/auth/apple/connect", { currentPassword: "Current-password-1" }]]);
    expect(mockLeave).toHaveBeenCalledWith(APPLE);
    expect((screen.getByLabelText("Current password for Apple") as HTMLInputElement).value).toBe("");
  });

  it("does nothing until a password is typed", async () => {
    await openAccount();
    const button = await screen.findByTestId("button-apple-connection");
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(posts("/api/auth/apple/connect")).toHaveLength(0);
  });

  it("says what the server says for a wrong password, and stays", async () => {
    connectAnswer = async () => { throw new Error('400: {"message":"Current password is incorrect"}'); };
    await openAccount();
    await userEvent.type(await screen.findByLabelText("Current password for Apple"), "Wrong-password-1");
    await userEvent.click(screen.getByTestId("button-apple-connection"));
    await settle();
    expect(mockToast).toHaveBeenCalledWith({ title: "Current password is incorrect", variant: "destructive" });
    expect(mockLeave).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Current password for Apple") as HTMLInputElement).value).toBe("");
  });

  it("shows who is connected and disconnects behind the password", async () => {
    connection = CONNECTED;
    await openAccount();
    const row = await screen.findByTestId("apple-connection");
    expect(row).toHaveTextContent("Connected");
    expect(row).toHaveTextContent("owner@privaterelay.appleid.com");
    expect(row).toHaveTextContent("Hide My Email");
    const button = screen.getByTestId("button-apple-connection");
    expect(button).toHaveTextContent("Disconnect Apple");
    expect(screen.queryByTestId("link-apple-set-password")).toBeNull();

    connection = NOT_CONNECTED;
    await userEvent.type(screen.getByLabelText("Current password for Apple"), "Current-password-1");
    await userEvent.click(button);
    await settle();
    expect(posts("/api/auth/apple/disconnect")).toEqual([["POST", "/api/auth/apple/disconnect", { currentPassword: "Current-password-1" }]]);
    expect(posts("/api/auth/apple/connect")).toHaveLength(0);
    expect(mockToast).toHaveBeenCalledWith({ title: "Apple disconnected", description: "Apple no longer signs this login in." });
    await waitFor(() => expect(screen.getByTestId("apple-connection")).toHaveTextContent("Not connected"));
  });

  it("is not drawn for a teammate, and nothing is asked about Apple", async () => {
    role = "member";
    await openAccount();
    expect(screen.queryByTestId("apple-connection")).toBeNull();
    expect(mockApi.mock.calls.filter(([, path]) => String(path).includes("/apple/"))).toEqual([]);
  });

  it("is not drawn where Apple is not set up and nothing is connected", async () => {
    connection = { ...NOT_CONNECTED, available: false };
    await openAccount();
    expect(screen.queryByTestId("apple-connection")).toBeNull();
  });

  it("where Apple is no longer set up, a connection made earlier can still be removed", async () => {
    connection = { ...CONNECTED, available: false };
    await openAccount();
    expect(await screen.findByTestId("button-apple-connection")).toHaveTextContent("Disconnect Apple");
  });

  it("coming back from Apple opens the Account section, says it is connected and cleans the address", async () => {
    connection = CONNECTED;
    window.history.replaceState({}, "", "/settings?apple=connected");
    await openSettings();
    // Straight to the section the owner left from: no tap needed.
    expect(await screen.findByTestId("apple-connection")).toHaveTextContent("Connected");
    expect(mockToast).toHaveBeenCalledWith({ title: "Apple connected", description: "You can now sign in with Apple." });
    expect(window.location.search).toBe("");
  });

  it("coming back refused says why, in the server's fixed words only", async () => {
    window.history.replaceState({}, "", "/settings?apple=taken");
    await openSettings();
    expect(await screen.findByTestId("apple-connection")).toHaveTextContent("Not connected");
    expect(mockToast).toHaveBeenCalledWith({
      title: "Apple was not connected", description: "That Apple account is already connected to another TaptPay login.", variant: "destructive",
    });
    expect(window.location.search).toBe("");
  });
});
