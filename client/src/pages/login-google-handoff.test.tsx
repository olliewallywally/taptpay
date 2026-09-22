/*
 * R1-T4 phase A. Google sign-in used to land on /login?token=<account JWT>; the
 * page stored whatever token the address carried. Now the server sets a one-time
 * code in an HttpOnly cookie and redirects to /login?google=complete; the page
 * redeems it by POST and never takes a token from the address.
 */
import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock("@/lib/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));

import Login from "./login";

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
  it("redeems the one-time code by POST and stores the token it returns", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: "issued.jwt.token", merchantId: 7, newUser: false }) });
    renderAt("/login?google=complete");
    await settle();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/google/session", expect.objectContaining({
      method: "POST", credentials: "same-origin",
    }));
    expect(localStorage.getItem("authToken")).toBe("issued.jwt.token");
    expect(localStorage.getItem("merchantId")).toBe("7");
    expect(window.location.search).toBe("");
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
