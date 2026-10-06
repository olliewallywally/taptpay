/*
 * R1-T5d. Sign in with Apple on the login page (owner decision 2026-09-29: it goes live once Apple
 * is set up). The page asks the server whether it is offered and shows "Continue with Apple" only on
 * a yes, directly under Google's button and the same shape. Apple's return lands on
 * /login?apple=complete; the page redeems the one-time code by POST, as Google's handoff does, and
 * stores nothing.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const mockTrack = jest.fn();
jest.mock("@/lib/analytics", () => ({ trackEvent: (...args: unknown[]) => mockTrack(...args) }));
jest.mock("@/components/SEOHead", () => ({ SEOHead: () => null }));
const mockLeave = jest.fn();
jest.mock("@/lib/apple-sign-in", () => ({
  ...jest.requireActual("@/lib/apple-sign-in"),
  leaveToSignInWithApple: () => mockLeave(),
}));

import Login from "./login";
import { SIGN_OUT_PENDING_KEY, beginSignOut, signOutPending } from "@/lib/session";

const fetchMock = global.fetch as jest.Mock;
type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (status: number, body: unknown): Reply => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const SIGNED_IN = { csrfToken: "c".repeat(43), merchantId: 7, newUser: false };

/** The server's answers: whether Apple is offered, and what redeeming Apple's one-time code gives. */
let offered: Reply | Error;
let session: Reply | Error;

function renderAt(address: string) {
  window.history.replaceState({}, "", address);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Login />
    </QueryClientProvider>,
  );
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});
const calls = (url: string) => fetchMock.mock.calls.filter(([asked]) => asked === url);

beforeEach(() => {
  localStorage.clear();
  mockToast.mockReset();
  mockTrack.mockReset();
  mockLeave.mockReset();
  offered = reply(200, { available: true });
  session = reply(200, SIGNED_IN);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const answer = url === "/api/auth/apple/available" ? offered : url === "/api/auth/apple/session" ? session : reply(404, {});
    if (answer instanceof Error) throw answer;
    return answer;
  });
  // jsdom reports the page's move to /dashboard as unimplemented navigation;
  // everything else still reaches jest.setup.js's React-problem guard.
  const guarded = console.error;
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes("Not implemented: navigation")) return;
    guarded(...args);
  });
});
afterEach(() => jest.restoreAllMocks());

describe("the Continue with Apple button", () => {
  it("is shown only once the server says Sign in with Apple is offered", async () => {
    renderAt("/login");
    // Not before the answer: until then the page is exactly as it was.
    expect(screen.queryByTestId("button-apple-login")).toBeNull();
    expect(screen.getByTestId("button-google-login")).toBeInTheDocument();
    await settle();
    expect(screen.getByTestId("button-apple-login")).toHaveTextContent("Continue with Apple");
    expect(calls("/api/auth/apple/available")).toHaveLength(1);
  });

  it.each([
    ["the server says it is not", () => reply(200, { available: false })],
    ["the server cannot say", () => reply(503, { message: "unavailable" })],
    ["the server cannot be reached", () => new TypeError("Failed to fetch")],
  ])("is not shown when %s, and Google's stays", async (_what, answer) => {
    offered = answer();
    renderAt("/login");
    await settle();
    expect(screen.queryByTestId("button-apple-login")).toBeNull();
    expect(screen.getByTestId("button-google-login")).toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("sits directly under Google's, the same shape and size, in Apple's black with its mark", async () => {
    renderAt("/login");
    await settle();
    const google = screen.getByTestId("button-google-login");
    const apple = screen.getByTestId("button-apple-login");
    expect(google.nextElementSibling).toBe(apple);
    // The same weight as Google's: every class that sizes and shapes the button.
    const shape = (button: HTMLElement) => button.className.split(/\s+/)
      .filter((name) => /^(w-|rounded-|py-|md:py-|flex$|items-|justify-|gap-|font-|text-center$)/.test(name)).sort();
    expect(shape(apple)).toEqual(shape(google));
    expect(shape(apple)).toEqual(expect.arrayContaining(["w-full", "rounded-full", "py-3", "md:py-4"]));
    expect(apple.className).toMatch(/\bbg-black\b/);
    expect(apple.className).toMatch(/\btext-white\b/);
    // Apple's mark, the size of Google's, and not read out twice.
    const mark = apple.querySelector("svg")!;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.getAttribute("class")).toBe(google.querySelector("svg")!.getAttribute("class"));
    expect((apple as HTMLButtonElement).type).toBe("button");
  });

  it("starts at the server, and says so to analytics with no identifier", async () => {
    renderAt("/login");
    await settle();
    fireEvent.click(screen.getByTestId("button-apple-login"));
    expect(mockLeave).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith("login_attempted", { auth_method: "apple", login_type: "merchant" });
    // The click itself asks the server nothing more and redeems nothing.
    expect(calls("/api/auth/apple/session")).toHaveLength(0);
  });
});

describe("finishing Sign in with Apple on the login page", () => {
  it("redeems the one-time code by POST; the sign-in is the cookie the server sets, and nothing is stored", async () => {
    renderAt("/login?apple=complete");
    await settle();

    expect(calls("/api/auth/apple/session")).toEqual([["/api/auth/apple/session", expect.objectContaining({ method: "POST", credentials: "same-origin" })]]);
    expect(Object.keys(localStorage)).toEqual([]);
    expect(window.location.search).toBe("");
    expect(mockToast).toHaveBeenCalledWith({ title: "Welcome back!", description: "Signed in with Apple." });
    expect(mockTrack).toHaveBeenCalledWith("login_succeeded", { auth_method: "apple", login_type: "merchant", new_user: false });
  });

  it("welcomes a business Apple's sign-in has just made", async () => {
    session = reply(200, { ...SIGNED_IN, newUser: true });
    renderAt("/login?apple=complete");
    await settle();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Welcome to TaptPay!" }));
    expect(mockTrack).toHaveBeenCalledWith("login_succeeded", { auth_method: "apple", login_type: "merchant", new_user: true });
  });

  it("a reply without the session's CSRF token is not a sign-in", async () => {
    session = reply(200, { merchantId: 7 });
    renderAt("/login?apple=complete");
    await settle();
    expect(mockToast).toHaveBeenCalledWith({ title: "Sign in failed", description: "Apple sign in failed. Please try again.", variant: "destructive" });
    expect(mockTrack).toHaveBeenCalledWith("login_failed", { auth_method: "apple", login_type: "merchant" });
  });

  it("says what the server says when the code cannot be redeemed, and leaves a sign-out that was owed still owed", async () => {
    beginSignOut();
    session = reply(401, { code: "APPLE_SIGN_IN_EXPIRED", message: "Apple sign in expired. Please try again." });
    renderAt("/login?apple=complete");
    await settle();
    expect(mockToast).toHaveBeenCalledWith({ title: "Sign in failed", description: "Apple sign in expired. Please try again.", variant: "destructive" });
    expect(signOutPending()).toBe(true);
  });

  it("a sign-in clears a sign-out that was still owed", async () => {
    beginSignOut();
    renderAt("/login?apple=complete");
    await settle();
    expect(localStorage.getItem(SIGN_OUT_PENDING_KEY)).toBeNull();
  });

  it("says so when the connection fails, and stores nothing", async () => {
    session = new TypeError("Failed to fetch");
    renderAt("/login?apple=complete");
    await settle();
    expect(Object.keys(localStorage)).toEqual([]);
    expect(mockToast).toHaveBeenCalledWith({ title: "Sign in failed", description: "Apple sign in failed. Please try again.", variant: "destructive" });
  });

  it("redeems only for the word complete, and removes Apple's word from the address either way", async () => {
    renderAt("/login?apple=connected&returnTo=%2Fsettings");
    await settle();
    expect(calls("/api/auth/apple/session")).toHaveLength(0);
    expect(new URLSearchParams(window.location.search).has("apple")).toBe(false);
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe("/settings");
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("shows Apple's refusal as the server worded it, and counts it as Apple's", async () => {
    const message = "That email already has a TaptPay login. Sign in, then connect Apple in Settings.";
    renderAt(`/login?error=${encodeURIComponent(message)}`);
    await settle();
    expect(mockToast).toHaveBeenCalledWith({ title: "Sign in failed", description: message, variant: "destructive" });
    expect(mockTrack).toHaveBeenCalledWith("login_failed", { auth_method: "apple", login_type: "merchant" });
    expect(window.location.search).toBe("");
    expect(calls("/api/auth/apple/session")).toHaveLength(0);
  });

  it("leaves Google's handoff and Google's refusals as they were", async () => {
    renderAt("/login?error=Google+sign+in+was+cancelled");
    await settle();
    expect(mockTrack).toHaveBeenCalledWith("login_failed", { auth_method: "google", login_type: "merchant" });
    mockTrack.mockReset();

    fetchMock.mockImplementation(async (url: string) => (url === "/api/auth/google/session" ? reply(200, SIGNED_IN) : reply(200, { available: true })));
    renderAt("/login?google=complete");
    await settle();
    expect(calls("/api/auth/google/session")).toHaveLength(1);
    expect(calls("/api/auth/apple/session")).toHaveLength(0);
    expect(mockToast).toHaveBeenCalledWith({ title: "Welcome back!", description: "Signed in with Google." });
    expect(mockTrack).toHaveBeenCalledWith("login_succeeded", { auth_method: "google", login_type: "merchant", new_user: false });
  });
});
