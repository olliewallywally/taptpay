/**
 * R1-T4 phase D follow-up (owner decision 2026-09-22): once the server confirms
 * this device's session, the device's existing notification subscription is
 * re-registered under the signed-in login. Subscriptions from before migration
 * 0029 gain their login this way, and a device signed back in after "sign out
 * of all devices" resumes. A rejected or unconfirmed session re-registers
 * nothing. Setup as in auth-outage-resilience.test.tsx.
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
  store = { authToken: "a-stored-session-token" };
  jest.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => store[key] ?? null);
  jest.spyOn(Storage.prototype, "removeItem").mockImplementation((key: string) => {
    delete store[key];
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("opening the app re-registers this device's notifications", () => {
  it("once the server confirms the session, under that session's token", async () => {
    global.fetch = jest.fn(async () => jsonResponse(200, confirmedSession)) as any;
    renderProtectedApp();
    await flush();

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(mockResyncThisDevicePush).toHaveBeenCalledTimes(1);
    expect(mockResyncThisDevicePush).toHaveBeenCalledWith("a-stored-session-token");
  });

  it("not when the session is rejected", async () => {
    global.fetch = jest.fn(async () => jsonResponse(401, { code: "SESSION_ENDED" })) as any;
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

  it("not without a stored session", async () => {
    delete store.authToken;
    global.fetch = jest.fn() as any;
    renderProtectedApp();
    await flush();

    expect(mockResyncThisDevicePush).not.toHaveBeenCalled();
  });
});

describe("signing out from the can't-reach-the-server screen", () => {
  it("stops this device's notifications with the token it had, as Log Out does", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => jsonResponse(503, { code: "AUTH_BACKEND_UNAVAILABLE" })) as any;
    renderProtectedApp();
    await advancePastTheDeadline();
    await act(async () => {
      fireEvent.click(screen.getByTestId("auth-unavailable-signout"));
    });

    expect(mockStopThisDevicePush).toHaveBeenCalledWith("a-stored-session-token");
    expect(store.authToken).toBeUndefined();
    expect(mockResyncThisDevicePush).not.toHaveBeenCalled();
  });
});
