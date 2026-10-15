/*
 * R1-T4 phase A. Google sign-in used to land on /login?token=<account JWT>; the
 * page stored whatever token the address carried. Now the server sets a one-time
 * code in an HttpOnly cookie and redirects to /login?google=complete; the page
 * redeems it by POST and never takes a token from the address.
 *
 * R1-T4 phase E: redeeming the code starts a session whose cookie the server sets; the page stores
 * nothing, and a sign-out it had not finished is no longer owed.
 */
import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@/lib/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));

import Login from "./login";
import { SIGN_OUT_PENDING_KEY, beginSignOut, signOutPending } from "@/lib/session";

const fetchMock = global.fetch as jest.Mock;

function renderAt(address: string) {
  window.history.replaceState({}, "", address);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Login />
    </QueryClientProvider>,
  );
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  mockToast.mockReset();
  // jsdom reports the page's move to /dashboard as unimplemented navigation;
  // everything else still reaches jest.setup.js's React-problem guard.
  const guarded = console.error;
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes("Not implemented: navigation")) return;
    guarded(...args);
  });
});
afterEach(() => jest.restoreAllMocks());

describe("finishing Google sign-in on the login page", () => {
  it("redeems the one-time code by POST; the sign-in is the cookie the server sets, and nothing is stored", async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ token: "issued.jwt.token", csrfToken: "c".repeat(43), merchantId: 7, newUser: false }),
    });
    renderAt("/login?google=complete");
    await settle();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/google/session", expect.objectContaining({
      method: "POST", credentials: "same-origin",
    }));
    expect(Object.keys(localStorage)).toEqual([]);
    expect(window.location.search).toBe("");
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Welcome back!" }));
  });

  it("a reply without the session's CSRF token is not a sign-in", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "issued.jwt.token", merchantId: 7 }) });
    renderAt("/login?google=complete");
    await settle();

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Sign in failed", variant: "destructive" }));
  });

  it("a new sign-in clears a sign-out that was still owed; a failed one leaves it owed", async () => {
    beginSignOut();
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: "Google sign in expired. Please try again." }) });
    renderAt("/login?google=complete");
    await settle();
    expect(signOutPending()).toBe(true);

    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ csrfToken: "c".repeat(43), merchantId: 7, newUser: false }) });
    renderAt("/login?google=complete");
    await settle();
    expect(localStorage.getItem(SIGN_OUT_PENDING_KEY)).toBeNull();
  });

  it("never takes a token from the address, and removes it", async () => {
    renderAt("/login?token=attacker.supplied.jwt&merchantId=9");
    await settle();

    expect(localStorage.getItem("authToken")).toBeNull();
    expect(localStorage.getItem("merchantId")).toBeNull();
    expect(window.location.search).toBe("");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/auth/google/session", expect.anything());
  });

  it("says so when the connection fails, and stores nothing", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAt("/login?google=complete");
    await settle();

    expect(localStorage.getItem("authToken")).toBeNull();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Sign in failed", description: "Google sign in failed. Please try again.", variant: "destructive",
    }));
  });

  it("removes only the sign-in results from the address, keeping returnTo for the password form", async () => {
    renderAt("/login?error=Google+sign+in+was+cancelled&returnTo=%2Fsettings");
    await settle();

    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe("/settings");
    expect(new URLSearchParams(window.location.search).has("error")).toBe(false);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Sign in failed", description: "Google sign in was cancelled", variant: "destructive",
    }));
  });

  it("says so when the code cannot be redeemed, and stores nothing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: "Google sign in expired. Please try again." }) });
    renderAt("/login?google=complete");
    await settle();

    expect(localStorage.getItem("authToken")).toBeNull();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Sign in failed", description: "Google sign in expired. Please try again.", variant: "destructive",
    }));
  });
});
