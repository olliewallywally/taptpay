/*
 * R1-T5d: the owner's "Sign in with Apple" row in Settings, as the phone and the tablet/desktop
 * screens share it. It reads the login's own connection, starts a connect or disconnects behind the
 * current password (typed, used once, forgotten), leaves the page only for Apple's own sign-in page,
 * and says how a return from Apple went by one of eight fixed words.
 */
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));
const mockLeave = jest.fn();
jest.mock("@/lib/apple-sign-in", () => ({
  ...jest.requireActual("@/lib/apple-sign-in"),
  leaveForApple: (url: string) => mockLeave(url),
}));

import { useAppleConnection } from "./use-apple-connection";
import { CSRF_HEADER, holdSession, releaseSession } from "@/lib/session";

const CSRF = "page-csrf-token";
const APPLE = "https://appleid.apple.com/auth/authorize?client_id=nz.taptpay.signin&response_mode=form_post&state=s&nonce=n";
const fetchMock = global.fetch as jest.Mock;
type Reply = { ok: boolean; status: number; statusText: string; json: () => Promise<unknown>; text: () => Promise<string> };
const reply = (status: number, body: unknown): Reply => ({
  ok: status >= 200 && status < 300, status, statusText: "", json: async () => body, text: async () => JSON.stringify(body),
});
const NOT_CONNECTED = { available: true, connected: false, email: null, isPrivateEmail: false, connectedAt: null };
const CONNECTED = { available: true, connected: true, email: "owner@privaterelay.appleid.com", isPrivateEmail: true, connectedAt: "2026-10-06T01:02:03.000Z" };

let connection: Reply;
let connectReply: Reply | Promise<Reply>;
let disconnectReply: Reply;

beforeEach(() => {
  localStorage.clear();
  releaseSession("business");
  holdSession("business", { id: 7, email: "owner@example.test", merchantId: 22, role: "owner" }, CSRF);
  window.history.replaceState({}, "", "/settings");
  mockToast.mockReset();
  mockLeave.mockReset();
  connection = reply(200, NOT_CONNECTED);
  connectReply = reply(200, { url: APPLE });
  disconnectReply = reply(200, { connected: false });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/auth/apple/connection") return connection;
    if (url === "/api/auth/apple/connect") return connectReply;
    if (url === "/api/auth/apple/disconnect") return disconnectReply;
    throw new Error(`Unexpected fetch: ${url}`);
  });
});

const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => url === path);
const sent = (call: unknown[]) => {
  const init = call[1] as RequestInit;
  const headers = new Headers(init.headers);
  return { method: init.method, credentials: init.credentials, csrf: headers.get(CSRF_HEADER), body: init.body ? JSON.parse(init.body as string) : undefined };
};

function mount(isOwner = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useAppleConnection(isOwner), { wrapper });
}
/** The hook once the server's answer about the connection has landed. */
async function mounted() {
  const hook = mount();
  await waitFor(() => expect(calls("/api/auth/apple/connection")).toHaveLength(1));
  await act(async () => { await Promise.resolve(); });
  return hook;
}
async function typeAndSubmit(hook: ReturnType<typeof mount>, password: string) {
  act(() => hook.result.current.setPassword(password));
  await act(async () => { hook.result.current.submit(); });
}

describe("whether the row is drawn", () => {
  it("asks for the login's own connection, and draws the row when Apple can be connected here", async () => {
    const hook = await mounted();
    await waitFor(() => expect(hook.result.current.visible).toBe(true));
    expect(sent(calls("/api/auth/apple/connection")[0])).toMatchObject({ credentials: "same-origin" });
    expect(hook.result.current).toMatchObject({ connected: false, available: true, email: null, isPrivateEmail: false, connectedAt: null });
  });

  it("says who is connected, as the server gave it", async () => {
    connection = reply(200, CONNECTED);
    const hook = await mounted();
    await waitFor(() => expect(hook.result.current.connected).toBe(true));
    expect(hook.result.current).toMatchObject({ visible: true, email: CONNECTED.email, isPrivateEmail: true, connectedAt: CONNECTED.connectedAt });
  });

  it("draws a connection made earlier even where Apple is no longer set up, so it can be removed", async () => {
    connection = reply(200, { ...CONNECTED, available: false });
    const hook = await mounted();
    await waitFor(() => expect(hook.result.current.visible).toBe(true));
    expect(hook.result.current).toMatchObject({ connected: true, available: false });
  });

  it.each([
    ["Apple is not set up and nothing is connected", () => reply(200, { ...NOT_CONNECTED, available: false })],
    ["the server cannot say", () => reply(500, { message: "Could not read the Apple connection. Please try again." })],
    ["the answer is not the connection", () => reply(200, {})],
  ])("draws nothing when %s", async (_what, answer) => {
    connection = answer();
    const hook = await mounted();
    expect(hook.result.current.visible).toBe(false);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("asks nothing and draws nothing for a teammate", async () => {
    const hook = mount(false);
    await act(async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hook.result.current.visible).toBe(false);
  });
});

describe("connecting", () => {
  it("sends the password once, with the page's CSRF token, and leaves for Apple's own page", async () => {
    const hook = await mounted();
    await typeAndSubmit(hook, "Current-password-1");

    expect(calls("/api/auth/apple/connect")).toHaveLength(1);
    expect(sent(calls("/api/auth/apple/connect")[0])).toEqual({ method: "POST", credentials: "same-origin", csrf: CSRF, body: { currentPassword: "Current-password-1" } });
    expect(mockLeave).toHaveBeenCalledTimes(1);
    expect(mockLeave).toHaveBeenCalledWith(APPLE);
    // Typed, used once and forgotten; nothing is stored.
    expect(hook.result.current.password).toBe("");
    expect(Object.keys(localStorage)).toEqual([]);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it.each([
    ["another site", "https://appleid.apple.com.evil.example/auth/authorize?state=s"],
    ["this site", "/settings?apple=connected"],
    ["no address at all", undefined],
  ])("never leaves for %s, whatever the answer says", async (_what, url) => {
    connectReply = reply(200, { url });
    const hook = await mounted();
    await typeAndSubmit(hook, "Current-password-1");
    expect(mockLeave).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({ title: "Could not start connecting Apple. Please try again.", variant: "destructive" });
    expect(hook.result.current.password).toBe("");
  });

  it.each([
    [400, { message: "Current password is incorrect" }, "Current password is incorrect"],
    [429, { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please try again in 30 seconds." }, "Too many attempts. Please try again in 30 seconds."],
    [409, { code: "APPLE_ALREADY_CONNECTED", message: "Apple is already connected to this login." }, "Apple is already connected to this login."],
    [503, { code: "APPLE_NOT_AVAILABLE", message: "Sign in with Apple is not available." }, "Sign in with Apple is not available."],
  ])("says what the server says for a %s, stays on the page and forgets the password", async (status, body, said) => {
    connectReply = reply(status, body);
    const hook = await mounted();
    await typeAndSubmit(hook, "Wrong-password-1");
    expect(mockLeave).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({ title: said, variant: "destructive" });
    expect(hook.result.current.password).toBe("");
  });

  it.each([
    ["an answer with no words of the server's", () => reply(500, {})],
    ["an answer that is not the server's own (a proxy's page)", () => ({ ...reply(502, null), text: async () => "<html><body>Bad Gateway {}</body></html>" })],
    ["no answer at all", () => { throw new TypeError("Failed to fetch"); }],
  ])("says only that it could not start for %s: never a raw body or the browser's own error", async (_what, answer) => {
    fetchMock.mockImplementation(async (url: string) => (url === "/api/auth/apple/connection" ? connection : answer()));
    const hook = await mounted();
    await typeAndSubmit(hook, "Current-password-1");
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith({ title: "Could not start connecting Apple. Please try again.", variant: "destructive" });
    expect(mockLeave).not.toHaveBeenCalled();
    expect(hook.result.current.password).toBe("");
  });

  it("sends nothing without a password", async () => {
    const hook = await mounted();
    await act(async () => { hook.result.current.submit(); });
    expect(calls("/api/auth/apple/connect")).toHaveLength(0);
    expect(mockLeave).not.toHaveBeenCalled();
  });

  it("sends once while the first is still being answered", async () => {
    let answer!: (value: Reply) => void;
    connectReply = new Promise<Reply>((resolve) => { answer = resolve; });
    const hook = await mounted();
    await typeAndSubmit(hook, "Current-password-1");
    await waitFor(() => expect(hook.result.current.busy).toBe(true));
    await act(async () => { hook.result.current.submit(); });
    expect(calls("/api/auth/apple/connect")).toHaveLength(1);
    await act(async () => { answer(reply(200, { url: APPLE })); });
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(mockLeave).toHaveBeenCalledTimes(1);
  });
});

describe("disconnecting", () => {
  it("sends the password, then reads the connection again and says it is disconnected", async () => {
    connection = reply(200, CONNECTED);
    const hook = await mounted();
    await waitFor(() => expect(hook.result.current.connected).toBe(true));
    connection = reply(200, NOT_CONNECTED);
    await typeAndSubmit(hook, "Current-password-1");

    expect(calls("/api/auth/apple/connect")).toHaveLength(0);
    expect(sent(calls("/api/auth/apple/disconnect")[0])).toEqual({ method: "POST", credentials: "same-origin", csrf: CSRF, body: { currentPassword: "Current-password-1" } });
    await waitFor(() => expect(hook.result.current.connected).toBe(false));
    expect(calls("/api/auth/apple/connection")).toHaveLength(2);
    expect(mockToast).toHaveBeenCalledWith({ title: "Apple disconnected", description: "Apple no longer signs this login in." });
    expect(hook.result.current.password).toBe("");
    expect(mockLeave).not.toHaveBeenCalled();
  });

  it("says only that it could not disconnect when the server has no words for it", async () => {
    connection = reply(200, CONNECTED);
    disconnectReply = reply(500, {});
    const hook = await mounted();
    await waitFor(() => expect(hook.result.current.connected).toBe(true));
    await typeAndSubmit(hook, "Current-password-1");
    expect(mockToast).toHaveBeenCalledWith({ title: "Could not disconnect Apple. Please try again.", variant: "destructive" });
    expect(hook.result.current.connected).toBe(true);
  });

  it("says what the server says when it refuses, and changes nothing on the page", async () => {
    connection = reply(200, CONNECTED);
    disconnectReply = reply(400, { message: "Current password is incorrect" });
    const hook = await mounted();
    await waitFor(() => expect(hook.result.current.connected).toBe(true));
    await typeAndSubmit(hook, "Wrong-password-1");
    expect(mockToast).toHaveBeenCalledWith({ title: "Current password is incorrect", variant: "destructive" });
    expect(hook.result.current.connected).toBe(true);
    expect(calls("/api/auth/apple/connection")).toHaveLength(1);
    expect(hook.result.current.password).toBe("");
  });
});

describe("coming back from Apple", () => {
  it("says it is connected, once, when the server says so too, and takes the word out of the address", async () => {
    connection = reply(200, CONNECTED);
    window.history.replaceState({}, "", "/settings?apple=connected");
    const hook = mount();
    // The word leaves the address at once; the page says nothing until the server has answered.
    expect(window.location.search).toBe("");
    expect(mockToast).not.toHaveBeenCalled();
    await waitFor(() => expect(hook.result.current.connected).toBe(true));
    expect(hook.result.current.returnedFromApple).toBe(true);
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({ title: "Apple connected", description: "You can now sign in with Apple." });
    hook.rerender();
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it("does not say connected on an address's word alone: the server's answer is what counts", async () => {
    // A link anyone can write: /settings?apple=connected. Nothing is connected, so nothing is said.
    window.history.replaceState({}, "", "/settings?apple=connected");
    const hook = await mounted();
    await waitFor(() => expect(hook.result.current.visible).toBe(true));
    expect(hook.result.current.connected).toBe(false);
    expect(mockToast).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it.each(["connected", "taken", "cancelled"])("says nothing to a teammate for %s, whose page asks the server nothing", async (word) => {
    window.history.replaceState({}, "", `/settings?apple=${word}`);
    mount(false);
    await act(async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(mockToast).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it.each(["cancelled", "expired", "taken", "has-another", "unavailable", "failed", "try-later"])("says why not for %s", async (word) => {
    window.history.replaceState({}, "", `/settings?apple=${word}`);
    await mounted();
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast.mock.calls[0][0]).toMatchObject({ title: "Apple was not connected", variant: "destructive" });
    expect(String(mockToast.mock.calls[0][0].description).length).toBeGreaterThan(10);
    expect(window.location.search).toBe("");
  });

  it("keeps the rest of the address", async () => {
    window.history.replaceState({}, "", "/settings?section=billing&apple=taken#card");
    await mounted();
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/settings?section=billing#card");
  });

  it.each(["complete", "", "<script>alert(1)</script>", "constructor"])("says nothing for a word that is not one of the eight (%p), and still removes it", async (word) => {
    window.history.replaceState({}, "", `/settings?apple=${encodeURIComponent(word)}`);
    const hook = await mounted();
    expect(mockToast).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    expect(hook.result.current.returnedFromApple).toBe(true);
  });

  it("says nothing when the page was simply opened", async () => {
    const hook = await mounted();
    expect(hook.result.current.returnedFromApple).toBe(false);
    expect(mockToast).not.toHaveBeenCalled();
  });
});
