/**
 * R1-T4 phase D on the phone Settings page: "Sign out of all devices" asks first,
 * ends every session of this login on the server, then signs this device out the
 * way Log Out does. Setup as in client/src/__tests__/zz-review-hooks-repro.test.tsx.
 *
 * R1-T4 phase E: the sign-in is the session cookie, which the browser sends itself; the page holds who
 * is signed in and the session's CSRF token. Log Out has the server end this session.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
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
import { CSRF_HEADER, heldSession, holdSession, releaseSession } from "@/lib/session";

const CSRF = "page-csrf-token";
const sentWith = (init: RequestInit | undefined) => {
  const headers = new Headers(init?.headers);
  return { method: init?.method, credentials: init?.credentials, csrf: headers.get(CSRF_HEADER), authorization: headers.get("Authorization") };
};
type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, json: async () => body });

let fetchMock: jest.Mock;
let signOutReply: Reply;
beforeEach(() => {
  localStorage.clear();
  releaseSession("business");
  holdSession("business", { id: 7, email: "owner@example.test", merchantId: 22, role: "owner" }, CSRF);
  mockNavigate.mockClear();
  mockToast.mockClear();
  mockStopThisDevicePush.mockClear();
  signOutReply = reply(undefined, 204);
  fetchMock = jest.fn(async (url: unknown) => {
    if (url === "/api/auth/sign-out-everywhere") return signOutReply;
    if (url === "/api/auth/logout") return reply(undefined, 204);
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
    expect(sentWith(signOutCalls()[0][1])).toEqual({ method: "POST", credentials: "same-origin", csrf: CSRF, authorization: null });
    expect(heldSession("business")).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Signed out of all devices" }));
  });

  it("changes nothing when the confirmation is declined", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(await openSettings());

    expect(signOutCalls()).toHaveLength(0);
    expect(heldSession("business")?.csrfToken).toBe(CSRF);
    expect(mockNavigate).not.toHaveBeenCalledWith("/login");
  });

  it("keeps this device signed in and says so when the server fails", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    signOutReply = reply({ message: "Could not sign out everywhere. Please try again." }, 500);
    await userEvent.click(await openSettings());

    expect(heldSession("business")?.csrfToken).toBe(CSRF);
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
  it("stops this device's notifications while its session still stands, then has the server end the session", async () => {
    let signedInWhenStopped = false;
    mockStopThisDevicePush.mockImplementation(async () => { signedInWhenStopped = heldSession("business") !== null; });
    await openSettings();
    await userEvent.click(screen.getByTestId("button-logout"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/login"));
    expect(mockStopThisDevicePush).toHaveBeenCalledTimes(1);
    expect(signedInWhenStopped).toBe(true);
    const logout = fetchMock.mock.calls.find(([url]) => url === "/api/auth/logout")!;
    expect(sentWith(logout[1])).toEqual({ method: "POST", credentials: "same-origin", csrf: CSRF, authorization: null });
    expect(heldSession("business")).toBeNull();
  });
});
