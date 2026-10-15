/**
 * R1-T8 — Settings, the page the original review reproduced the hook-order crash
 * on. This file used to be a temporary artifact asserting the crash ("Rendered
 * fewer hooks than expected" once the auth token disappeared while Settings was
 * mounted); plan R1-T8 converts it to assert the opposite, across the
 * transitions the plan names: loading → authenticated, loading →
 * unauthenticated, error → retry, a change of merchant, and unmount. The real
 * auth module is used: who is signed in is what the page holds from the start-up
 * check, as in the app (R1-T4 phase E; it was a token read from localStorage).
 */
import { act, render, screen } from "@testing-library/react";
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
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
const mockNavigate = jest.fn();
jest.mock("wouter", () => ({ useLocation: () => ["/settings", mockNavigate] }));
jest.mock("@/lib/queryClient", () => ({
  apiRequest: jest.fn(async () => ({ ok: true, json: async () => ({}) })),
}));

import Settings from "@/pages/settings";
import { holdSession, releaseSession } from "@/lib/session";

/** The page's sign-in, as the start-up check hands it over: this merchant's owner. */
const signInAs = (merchantId: number) =>
  holdSession("business", { id: 7, email: "owner@example.test", merchantId, role: "owner" }, "c".repeat(43));
/** What Log Out does to the page, and what a refused session does: the sign-in is no longer held. */
const signOut = () => releaseSession("business");

type Reply = { ok: boolean; status: number; json: () => Promise<unknown> };
const reply = (body: unknown, status = 200): Reply => ({ ok: status < 400, status, json: async () => body });
const merchant = (id: number) => ({ id, businessName: `Synthetic Merchant ${id}`, status: "active" });

let fetchMock: jest.Mock;
let consoleErrors: unknown[][];
let client: QueryClient;
beforeEach(() => {
  localStorage.clear();
  signOut();
  mockNavigate.mockClear();
  consoleErrors = [];
  jest.spyOn(console, "error").mockImplementation((...args) => { consoleErrors.push(args); });
  fetchMock = jest.fn(async (url: unknown) => {
    const found = /^\/api\/merchants\/(\d+)\/profile$/.exec(String(url));
    return reply(found ? merchant(Number(found[1])) : {});
  });
  global.fetch = fetchMock as any;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => jest.restoreAllMocks());

function mount() {
  const ui = () => (
    <QueryClientProvider client={client}>
      <Settings />
    </QueryClientProvider>
  );
  const view = render(ui());
  return { rerender: () => view.rerender(ui()), unmount: view.unmount };
}
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});
/** Profile requests are held until released, to observe the loading state. */
function holdProfile() {
  const held: Array<() => void> = [];
  fetchMock.mockImplementation((url: unknown) => {
    const found = /^\/api\/merchants\/(\d+)\/profile$/.exec(String(url));
    if (!found) return Promise.resolve(reply({}));
    return new Promise<Reply>((resolve) => held.push(() => resolve(reply(merchant(Number(found[1]))))));
  });
  return { release: () => held.splice(0).forEach((resume) => resume()) };
}

describe("Settings keeps its hooks in order (R1-T8)", () => {
  it("does not crash on re-render once the sign-in is gone, and leaves for /login", async () => {
    signInAs(22);
    const view = mount();
    await settle();

    // Exactly what Log Out does, and what a refused session does: the sign-in
    // disappears while the page is mounted.
    signOut();

    expect(() => view.rerender()).not.toThrow();
    await settle();
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/login");
    expect(consoleErrors).toEqual([]);
  });

  it("loading → authenticated: renders the merchant once the profile arrives", async () => {
    signInAs(22);
    const profile = holdProfile();
    mount();
    await settle();
    expect(screen.queryByText("Synthetic Merchant 22")).toBeNull();

    profile.release();
    await settle();
    expect(screen.getByText("Synthetic Merchant 22")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(consoleErrors).toEqual([]);
  });

  it("loading → unauthenticated: the session ending mid-load neither crashes nor renders the page", async () => {
    signInAs(22);
    const profile = holdProfile();
    const view = mount();
    await settle();

    signOut();
    expect(() => view.rerender()).not.toThrow();
    profile.release();
    await settle();
    expect(screen.queryByText("Synthetic Merchant 22")).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
    expect(consoleErrors).toEqual([]);
  });

  it("error → retry: a failed profile load, then a successful retry", async () => {
    signInAs(22);
    fetchMock.mockImplementationOnce(async () => reply({ message: "unavailable" }, 503));
    mount();
    await settle();
    expect(screen.queryByText("Synthetic Merchant 22")).toBeNull();

    await act(async () => { await client.refetchQueries(); });
    await settle();
    expect(screen.getByText("Synthetic Merchant 22")).toBeInTheDocument();
    expect(consoleErrors).toEqual([]);
  });

  it("a change of merchant loads the new merchant, with no crash and no state carried over", async () => {
    signInAs(22);
    const view = mount();
    await settle();
    expect(screen.getByText("Synthetic Merchant 22")).toBeInTheDocument();

    signInAs(23);
    expect(() => view.rerender()).not.toThrow();
    await settle();
    expect(screen.getByText("Synthetic Merchant 23")).toBeInTheDocument();
    expect(screen.queryByText("Synthetic Merchant 22")).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(consoleErrors).toEqual([]);
  });

  it("unmounts cleanly", async () => {
    signInAs(22);
    const view = mount();
    await settle();
    view.unmount();
    await settle();
    expect(consoleErrors).toEqual([]);
  });
});
