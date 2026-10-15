/**
 * R1-T4 phase E. The admin area's sign-in is a session cookie of its own, which the page cannot read:
 * the area always asks the server (GET /api/admin/auth/me), holds who it is and the admin session's
 * CSRF token in memory only, and its changes carry that token. Setup as in
 * auth-outage-resilience.test.tsx.
 */
jest.mock("@/plugins/TaptPayPlugin", () => ({}));
jest.mock("@/pages/landing-page", () => ({ LandingPage: () => null }));
jest.mock("@/pages/login", () => ({ __esModule: true, default: () => null }));
jest.mock("@/pages/app-login", () => ({ __esModule: true, default: () => null }));
jest.mock("@/pages/merchant-signup", () => ({ __esModule: true, default: () => null }));

import { act, fireEvent, render, screen } from "@testing-library/react";
import { AUTH_MAX_ATTEMPTS, AUTH_TOTAL_DEADLINE_MS, AdminProtectedRoute } from "../App";
import { CSRF_HEADER, csrfHeaders, heldSession, holdSession, releaseSession } from "@/lib/session";

const ADMIN_ME = { user: { id: 1, email: "admin@example.test", merchantId: 0, role: "admin" }, csrfToken: "a".repeat(43) };
const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, clone() { return this; } }) as unknown as Response;

function renderAdminArea() {
  return render(
    <AdminProtectedRoute>
      <div data-testid="admin-content">the admin area</div>
    </AdminProtectedRoute>,
  );
}
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}
async function advance(totalMs: number, stepMs = 100) {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      jest.advanceTimersByTime(stepMs);
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  releaseSession("admin");
  releaseSession("business");
  // jsdom reports the move to /login as unimplemented navigation; anything else still fails the test.
  const guarded = console.error;
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes("Not implemented: navigation")) return;
    guarded(...args);
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("the admin area's start-up check", () => {
  it("asks by the admin's cookie, shows the area, and holds the admin session's token for its changes", async () => {
    const fetchSpy = jest.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, ADMIN_ME));
    global.fetch = fetchSpy as any;
    renderAdminArea();
    await flush();

    expect(screen.getByTestId("admin-content")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/admin/auth/me");
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ credentials: "same-origin" });
    expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get("Authorization")).toBeNull();
    expect(heldSession("admin")).toEqual({ user: ADMIN_ME.user, csrfToken: ADMIN_ME.csrfToken });
    expect(heldSession("business")).toBeNull();
    expect(csrfHeaders("/api/admin/merchants/22/resend-verification", "POST")).toEqual({ [CSRF_HEADER]: ADMIN_ME.csrfToken });
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it.each([401, 403])("a refusal (%s) shows nothing and holds no admin session", async (status) => {
    holdSession("admin", ADMIN_ME.user, "a-token-from-an-earlier-check");
    global.fetch = jest.fn(async () => jsonResponse(status, { message: "Invalid admin session" })) as any;
    renderAdminArea();
    await flush();

    expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
    expect(heldSession("admin")).toBeNull();
  });

  it("a reply that names the admin but carries no CSRF token is not a sign-in", async () => {
    jest.useFakeTimers();
    const fetchSpy = jest.fn(async () => jsonResponse(200, { user: ADMIN_ME.user }));
    global.fetch = fetchSpy as any;
    renderAdminArea();
    await advance(AUTH_TOTAL_DEADLINE_MS);

    expect(fetchSpy).toHaveBeenCalledTimes(AUTH_MAX_ATTEMPTS);
    expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();
    expect(heldSession("admin")).toBeNull();
  });

  it("an outage keeps the admin where they are, and signing out from it asks the server to end the session when it can", async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async () => jsonResponse(503, { code: "AUTH_BACKEND_UNAVAILABLE" })) as any;
    renderAdminArea();
    await advance(AUTH_TOTAL_DEADLINE_MS);
    expect(screen.getByTestId("auth-unavailable")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("auth-unavailable-signout"));
    });
    await flush();

    expect(screen.queryByTestId("auth-unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
    expect(heldSession("admin")).toBeNull();
  });
});
