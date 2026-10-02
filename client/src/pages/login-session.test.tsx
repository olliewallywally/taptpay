/*
 * R1-T4 phase E. A password sign-in starts a session whose cookie the server sets; no script can read
 * it. The page stores nothing (it used to keep the account token and the user in localStorage), a
 * sign-out it still owed is no longer owed, and a full page load then reads the new session.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/lib/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));

import Login from "./login";
import { SIGN_OUT_PENDING_KEY, beginSignOut, signOutPending } from "@/lib/session";

const fetchMock = global.fetch as jest.Mock;
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300, status, statusText: "", text: async () => JSON.stringify(body), json: async () => body,
});

async function signIn(password = "Correct-password-1") {
  window.history.replaceState({}, "", "/login");
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Login />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByTestId("input-email"), { target: { value: "owner@example.test" } });
  fireEvent.change(screen.getByTestId("input-password"), { target: { value: password } });
  await act(async () => {
    fireEvent.click(screen.getByTestId("button-login"));
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  // jsdom reports the page's move to /dashboard as unimplemented navigation;
  // everything else still reaches jest.setup.js's React-problem guard.
  const guarded = console.error;
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes("Not implemented: navigation")) return;
    guarded(...args);
  });
});
afterEach(() => jest.restoreAllMocks());

describe("a password sign-in on the login page", () => {
  it("stores nothing: the sign-in is the cookie the server sets", async () => {
    fetchMock.mockResolvedValue(reply(200, {
      csrfToken: "c".repeat(43),
      user: { id: 7, email: "owner@example.test", merchantId: 22, role: "owner" },
    }));
    await signIn();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect({ url, method: init.method, credentials: init.credentials }).toEqual({ url: "/api/auth/login", method: "POST", credentials: "same-origin" });
    expect(new Headers(init.headers).get("Authorization")).toBeNull();
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("clears a sign-out that was still owed; a refused sign-in leaves it owed", async () => {
    beginSignOut();
    fetchMock.mockResolvedValue(reply(401, { message: "Invalid email or password" }));
    await signIn("not-the-password");
    expect(signOutPending()).toBe(true);

    fetchMock.mockResolvedValue(reply(200, { csrfToken: "c".repeat(43), user: { id: 7, email: "owner@example.test", merchantId: 22, role: "owner" } }));
    await act(async () => {
      fireEvent.change(screen.getByTestId("input-password"), { target: { value: "Correct-password-1" } });
      fireEvent.click(screen.getByTestId("button-login"));
      for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(localStorage.getItem(SIGN_OUT_PENDING_KEY)).toBeNull();
  });
});
