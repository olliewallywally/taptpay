/**
 * R1-T4 phase D follow-up (owner decision 2026-09-22): once the server confirms
 * this device's session, the device's existing notification subscription is
 * re-registered under the signed-in login. Subscriptions from before migration
 * 0029 gain their login this way, and a device signed back in after "sign out
 * of all devices" resumes. A rejected or unconfirmed session re-registers
 * nothing. Setup as in auth-outage-resilience.test.tsx.
 *
 * R1-T4 phase E: the session is the browser's HttpOnly cookie; the start-up check
 * (GET /api/auth/session) says who it signs in.
 */
jest.mock("@/plugins/TaptPayPlugin", () => ({}));
jest.mock("@/pages/landing-page", () => ({ LandingPage: () => null }));
jest.mock("@/pages/login", () => ({ __esModule: true, default: () => null }));
jest.mock("@/pages/app-login", () => ({ __esModule: true, default: () => null }));
jest.mock("@/pages/merchant-signup", () => ({ __esModule: true, default: () => null }));
const mockResyncThisDevicePush = jest.fn();
const mockStopThisDevicePush = jest.fn();
jest.mock("@/lib/push-device", () => ({
  resyncThisDevicePush: (...args: unknown[]) => mockResyncThisDevicePush(...args),
  stopThisDevicePush: (...args: unknown[]) => mockStopThisDevicePush(...args),
}));

import { act, fireEvent, render, screen } from "@testing-library/react";
import { AUTH_TOTAL_DEADLINE_MS, AuthProvider, ProtectedRoute } from "../App";
import { SIGN_OUT_PENDING_KEY, heldSession, releaseSession } from "@/lib/session";

let store: Record<string, string>;

function renderProtectedApp() {
  return render(
    <AuthProvider>
      <ProtectedRoute>
        <div data-testid="protected-content">merchant dashboard</div>
      </ProtectedRoute>
    </AuthProvider>,
  );
}

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const confirmedSession = {
  signedIn: true,
  csrfToken: "c".repeat(43),
  user: { id: 7, email: "owner@example.test", merchantId: "22", role: "owner", onboardingCompleted: true },
};

async function advancePastTheDeadline() {
  for (let elapsed = 0; elapsed < AUTH_TOTAL_DEADLINE_MS; elapsed += 100) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
  }
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  releaseSession("business");
  store = { authToken: "a-token-stored-before-the-switch" };
  jest.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => store[key] ?? null);
  jest.spyOn(Storage.prototype, "setItem").mockImplementation((key: string, value: string) => {
    store[key] = value;
  });
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation((key: string) => {
    delete store[key];
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("opening the app re-registers this device's notifications", () => {
  it("once the server confirms the session, when the page holds that session", async () => {
    let heldWhenCalled = false;
    mockResyncThisDevicePush.mockImplementation(() => { heldWhenCalled = heldSession("business")?.user.id === 7; });
    global.fetch = jest.fn(async () => jsonResponse(200, confirmedSession)) as any;
    renderProtectedApp();
    await flush();

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(mockResyncThisDevicePush).toHaveBeenCalledTimes(1);
    expect(heldWhenCalled).toBe(true);
    // The first load after the switch removed what the page used to keep in storage.
    expect(store.authToken).toBeUndefined();
  });

  it.each([
    ["no one is signed in", () => jsonResponse(200, { signedIn: false })],
    ["the session is refused", () => jsonResponse(401, { code: "SESSION_ENDED" })],
  ])("not when %s", async (_name, answer) => {
    global.fetch = jest.fn(async () => answer()) as any;
    renderProtectedApp();
    await flush();

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(mockResyncThisDevicePush).not.toHaveBeenCalled();
  });

  it("not while the server cannot confirm the session", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => jsonResponse(503, { code: "AUTH_BACKEND_UNAVAILABLE" })) as any;
    renderProtectedApp();
    await advancePastTheDeadline();

    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
    expect(mockResyncThisDevicePush).not.toHaveBeenCalled();
  });

  it("not while a sign-out begun here is still to be finished: the check that would sign in is not made", async () => {
    store[SIGN_OUT_PENDING_KEY] = "1";
    const fetchSpy = jest.fn(async (url: unknown, _init?: RequestInit) =>
      url === "/api/auth/session" ? jsonResponse(200, confirmedSession) : jsonResponse(204, {}));
    global.fetch = fetchSpy as any;
    renderProtectedApp();
    await flush();
    await flush();

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(mockResyncThisDevicePush).not.toHaveBeenCalled();
    expect(heldSession("business")).toBeNull();
    // The load finished the sign-out instead: the server was asked to end the cookie's session.
    expect(fetchSpy.mock.calls.map(([url, init]) => [url, init?.method ?? "GET"]))
      .toEqual([["/api/auth/session", "GET"], ["/api/auth/logout", "POST"]]);
    expect(store[SIGN_OUT_PENDING_KEY]).toBeUndefined();
  });
});

describe("signing out from the can't-reach-the-server screen", () => {
  it("stops this device's notifications, as Log Out does, and leaves the sign-out to be finished", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => jsonResponse(503, { code: "AUTH_BACKEND_UNAVAILABLE" })) as any;
    renderProtectedApp();
    await advancePastTheDeadline();
    await act(async () => {
      fireEvent.click(screen.getByTestId("auth-unavailable-signout"));
    });
    await flush();

    expect(mockStopThisDevicePush).toHaveBeenCalledTimes(1);
    expect(mockResyncThisDevicePush).not.toHaveBeenCalled();
    // The page cannot delete an HttpOnly cookie: the server must end the session, and could not be reached.
    expect(store[SIGN_OUT_PENDING_KEY]).toBe("1");
    expect(screen.queryByTestId("auth-unavailable")).not.toBeInTheDocument();
  });
});
