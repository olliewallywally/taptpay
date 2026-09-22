/**
 * R1-T4 phase D on the phone Settings page: "Sign out of all devices" asks first,
 * ends every session of this login on the server, then signs this device out the
 * way Log Out does. Setup as in client/src/__tests__/zz-review-hooks-repro.test.tsx.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("@/hooks/use-push-notifications", () => ({
  usePushNotifications: () => ({
    enabled: false, loading: false, supported: false, available: false, toggle: jest.fn(),
  }),
}));
jest.mock("@/hooks/use-billing-card-return", () => ({
  BILLING_CARD_SESSION_KEY: "k",
  useBillingCardReturn: () => ({ confirmingCard: false }),
}));
jest.mock("@/features/tutorial/tutorial", () => ({
  useTutorial: () => ({
    restartTutorials: jest.fn(), visitedPages: [], pageCount: 0,
    isRestarting: false, canRestart: false,
  }),
}));
const mockStopThisDevicePush = jest.fn();
jest.mock("@/lib/push-device", () => ({
  stopThisDevicePush: (...args: unknown[]) => mockStopThisDevicePush(...args),
}));
const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const mockNavigate = jest.fn();
jest.mock("wouter", () => ({ useLocation: () => ["/settings", mockNavigate] }));
jest.mock("@/lib/queryClient", () => ({
  apiRequest: jest.fn(async () => ({ ok: true, json: async () => ({}) })),
}));

import Settings from "@/pages/settings";

const TOKEN = `h.${Buffer.from(JSON.stringify({ merchantId: 22, role: "owner" })).toString("base64")}.s`;
type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, json: async () => body });

let fetchMock: jest.Mock;
let signOutReply: Reply;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("authToken", TOKEN);
  mockNavigate.mockClear();
  mockToast.mockClear();
  mockStopThisDevicePush.mockClear();
  signOutReply = reply(undefined, 204);
  fetchMock = jest.fn(async (url: unknown) => {
    if (url === "/api/auth/sign-out-everywhere") return signOutReply;
    if (url === "/api/merchants/22/profile") return reply({ id: 22, businessName: "Synthetic Merchant 22", status: "active" });
    return reply({});
  });
  global.fetch = fetchMock as any;
});
afterEach(() => jest.restoreAllMocks());

async function openSettings() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      <Settings />
    </QueryClientProvider>,
  );
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return screen.findByRole("button", { name: "Sign out of all devices" });
}
const signOutCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/auth/sign-out-everywhere");

describe("phone Settings: sign out of all devices", () => {
  it("asks first, then ends every session and signs this device out", async () => {
    const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(await openSettings());

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(signOutCalls()).toHaveLength(1);
    expect(signOutCalls()[0][1]).toEqual({ method: "POST", headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(localStorage.getItem("authToken")).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Signed out of all devices" }));
  });

  it("changes nothing when the confirmation is declined", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(await openSettings());

    expect(signOutCalls()).toHaveLength(0);
    expect(localStorage.getItem("authToken")).toBe(TOKEN);
    expect(mockNavigate).not.toHaveBeenCalledWith("/login");
  });

  it("keeps this device signed in and says so when the server fails", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    signOutReply = reply({ message: "Could not sign out everywhere. Please try again." }, 500);
    await userEvent.click(await openSettings());

    expect(localStorage.getItem("authToken")).toBe(TOKEN);
    expect(mockNavigate).not.toHaveBeenCalledWith("/login");
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't sign out of all devices", variant: "destructive",
    }));
  });

  it("leaves this device's notifications to the server", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(await openSettings());

    expect(mockNavigate).toHaveBeenCalledWith("/login");
    // The server stopped every device of this login; this one resumes if it signs in again.
    expect(mockStopThisDevicePush).not.toHaveBeenCalled();
  });
});

// R1-T4 phase D follow-up (owner decision 2026-09-22): notifications belong to the login.
describe("phone Settings: Log Out", () => {
  it("stops this device's notifications with the token it had, then signs out", async () => {
    await openSettings();
    await userEvent.click(screen.getByTestId("button-logout"));

    expect(mockStopThisDevicePush).toHaveBeenCalledWith(TOKEN);
    expect(localStorage.getItem("authToken")).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });
});
