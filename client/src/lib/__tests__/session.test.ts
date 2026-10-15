/*
 * R1-T4 phase E. The sign-in is an HttpOnly cookie the page cannot read; the page keeps who is signed in
 * and the session's CSRF token in memory only, and sends the token with every change. The admin area has
 * its own sign-in and token.
 */
import {
  CSRF_HEADER,
  LEGACY_SESSION_KEYS,
  SIGN_OUT_PENDING_KEY,
  beginSignOut,
  clearSignOutPending,
  csrfHeaders,
  finishPendingSignOut,
  forgetLegacyStoredSession,
  heldSession,
  holdSession,
  logOutAdmin,
  logOutThisDevice,
  readAdminSession,
  readBusinessSession,
  realmOf,
  releaseSession,
  sessionFetch,
  signOutPending,
} from "../session";

const fetchMock = global.fetch as jest.Mock;
const reply = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone() {
      return this;
    },
  }) as unknown as Response;
const OWNER = { id: 7, email: "owner@example.test", merchantId: 22, role: "owner" };
const headersOf = (call: unknown[]) => new Headers((call[1] as RequestInit).headers);

beforeEach(() => {
  fetchMock.mockReset();
  releaseSession("business");
  releaseSession("admin");
  localStorage.clear();
});

describe("the page's knowledge of its sign-in", () => {
  it("is held in memory only: nothing is written to storage", async () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem");
    fetchMock.mockResolvedValueOnce(reply(200, { signedIn: true, user: OWNER, csrfToken: "t".repeat(43) }));

    await expect(readBusinessSession()).resolves.toEqual({ kind: "signed-in", user: OWNER, csrfToken: "t".repeat(43) });
    expect(heldSession("business")).toEqual({ user: OWNER, csrfToken: "t".repeat(43) });
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("a visitor who is not signed in is signed out, and what was held is released", async () => {
    holdSession("business", OWNER, "old-token");
    fetchMock.mockResolvedValueOnce(reply(200, { signedIn: false }));
    await expect(readBusinessSession()).resolves.toEqual({ kind: "signed-out" });
    expect(heldSession("business")).toBeNull();
  });

  it("an outage is neither signed in nor signed out, and keeps what is held", async () => {
    holdSession("business", OWNER, "kept-token");
    fetchMock.mockResolvedValueOnce(reply(503, { code: "AUTH_BACKEND_UNAVAILABLE" }));
    await expect(readBusinessSession()).resolves.toEqual({ kind: "unavailable", status: 503 });
    expect(heldSession("business")?.csrfToken).toBe("kept-token");
  });

  it("an incomplete reply is not a sign-in", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { signedIn: true, user: OWNER }));
    await expect(readBusinessSession()).rejects.toThrow(/incomplete/);
    expect(heldSession("business")).toBeNull();
  });

  it("the admin area's check holds the admin's own token", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { user: { id: 1, email: "admin@example.test", merchantId: 0, role: "admin" }, csrfToken: "a".repeat(43) }));
    await expect(readAdminSession()).resolves.toMatchObject({ kind: "signed-in", csrfToken: "a".repeat(43) });
    expect(heldSession("admin")?.csrfToken).toBe("a".repeat(43));
    expect(heldSession("business")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/auth/me", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("the first load after the switch removes the old stored sign-in", () => {
    for (const key of LEGACY_SESSION_KEYS) localStorage.setItem(key, "old");
    localStorage.setItem("unrelated", "kept");
    forgetLegacyStoredSession();
    for (const key of LEGACY_SESSION_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("kept");
  });
});

describe("the CSRF token goes with every change, and never with a read", () => {
  beforeEach(() => {
    holdSession("business", OWNER, "business-token");
    holdSession("admin", { id: 1, email: "admin@example.test", merchantId: 0, role: "admin" }, "admin-token");
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "post"])("%s carries the business's token", (method) => {
    expect(csrfHeaders("/api/merchants/22/theme", method)).toEqual({ [CSRF_HEADER]: "business-token" });
  });

  it.each(["GET", "HEAD", undefined])("%s carries none", (method) => {
    expect(csrfHeaders("/api/merchants/22", method)).toEqual({});
  });

  it("the admin area's changes carry the admin's token; a look-alike path is the business's", () => {
    expect(csrfHeaders("/api/admin/auth/logout", "POST")).toEqual({ [CSRF_HEADER]: "admin-token" });
    expect(realmOf("/api/admin")).toBe("admin");
    expect(realmOf("/api/admin/merchants?x=1")).toBe("admin");
    expect(realmOf("/api/administrator")).toBe("business");
    expect(realmOf("/api/merchants/22")).toBe("business");
  });

  it("the token never goes to another site", () => {
    expect(csrfHeaders("https://sec.windcave.com/api/v1/sessions", "POST")).toEqual({});
    expect(csrfHeaders("//evil.test/api/merchants/22", "POST")).toEqual({});
    expect(csrfHeaders(`${window.location.origin}/api/merchants/22`, "POST")).toEqual({ [CSRF_HEADER]: "business-token" });
  });

  it("with no sign-in held, a change carries nothing (the server refuses it)", () => {
    releaseSession("business");
    releaseSession("admin");
    expect(csrfHeaders("/api/auth/logout", "POST")).toEqual({});
    expect(csrfHeaders("/api/admin/auth/logout", "POST")).toEqual({});
  });

  it("with only the admin signed in, a business route's change carries the admin's token, as the server reads the admin's cookie there", () => {
    releaseSession("business");
    expect(csrfHeaders("/api/merchants/22/test-payment-link", "POST")).toEqual({ [CSRF_HEADER]: "admin-token" });
    // The admin area never answers to a business sign-in.
    releaseSession("admin");
    holdSession("business", OWNER, "business-token");
    expect(csrfHeaders("/api/admin/merchants/22", "PUT")).toEqual({});
  });

  it("sessionFetch sends the cookie (same origin), the token on a change, and never an Authorization header", async () => {
    fetchMock.mockResolvedValue(reply(200, {}));
    await sessionFetch("/api/merchants/22/theme", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" });
    await sessionFetch("/api/merchants/22");
    const [change, read] = fetchMock.mock.calls;
    expect(change[0]).toBe("/api/merchants/22/theme");
    expect((change[1] as RequestInit).credentials).toBe("same-origin");
    expect(headersOf(change).get(CSRF_HEADER)).toBe("business-token");
    expect(headersOf(change).get("Content-Type")).toBe("application/json");
    expect(headersOf(change).get("Authorization")).toBeNull();
    expect(headersOf(read).get(CSRF_HEADER)).toBeNull();
    expect(headersOf(read).get("Authorization")).toBeNull();
  });

  it("a refused token is fetched again once from the start-up check, and the change retried with it", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(403, { code: "CSRF_REJECTED" }))
      .mockResolvedValueOnce(reply(200, { signedIn: true, user: OWNER, csrfToken: "fresh-token" }))
      .mockResolvedValueOnce(reply(200, { ok: true }));

    const res = await sessionFetch("/api/tutorial/restart", { method: "POST" });

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/tutorial/restart", "/api/auth/session", "/api/tutorial/restart"]);
    expect(headersOf(fetchMock.mock.calls[2]).get(CSRF_HEADER)).toBe("fresh-token");
  });

  it("the retry happens once at most, and not when the token did not change", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(403, { code: "CSRF_REJECTED" }))
      .mockResolvedValueOnce(reply(200, { signedIn: true, user: OWNER, csrfToken: "business-token" }));

    const res = await sessionFetch("/api/tutorial/restart", { method: "POST" });

    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("any other 403 is returned as it is", async () => {
    fetchMock.mockResolvedValueOnce(reply(403, { message: "Only the account owner can change logins" }));
    const res = await sessionFetch("/api/team/5/status", { method: "PUT" });
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Log Out", () => {
  it("asks the server to end this session, with the token, then forgets it", async () => {
    holdSession("business", OWNER, "business-token");
    localStorage.setItem("authToken", "old-stored-token");
    fetchMock.mockResolvedValueOnce(reply(204));

    await logOutThisDevice();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/logout");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(headersOf(fetchMock.mock.calls[0]).get(CSRF_HEADER)).toBe("business-token");
    expect(heldSession("business")).toBeNull();
    expect(localStorage.getItem("authToken")).toBeNull();
    expect(signOutPending()).toBe(false);
  });

  it("is marked as begun before the server is asked, with a mark that holds no credential", async () => {
    holdSession("business", OWNER, "business-token");
    let markedWhenAsked: string | null = null;
    fetchMock.mockImplementationOnce(async () => {
      markedWhenAsked = localStorage.getItem(SIGN_OUT_PENDING_KEY);
      return reply(204);
    });

    await logOutThisDevice();

    expect(markedWhenAsked).toBe("1");
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("signs the page out even when the server cannot be reached, and leaves the sign-out to be finished", async () => {
    holdSession("business", OWNER, "business-token");
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(logOutThisDevice()).resolves.toBeUndefined();
    expect(heldSession("business")).toBeNull();
    expect(signOutPending()).toBe(true);
  });

  it.each([
    [401, false, "the session had already ended"],
    [500, true, "the server could not do it"],
    [503, true, "the server could not check the session"],
  ])("a %s leaves the sign-out pending: %s (%s)", async (status, pending) => {
    holdSession("business", OWNER, "business-token");
    fetchMock.mockResolvedValueOnce(reply(status, {}));
    await logOutThisDevice();
    expect(heldSession("business")).toBeNull();
    expect(signOutPending()).toBe(pending);
  });

  it("with no session learned (the start-up check never answered), has the server end whichever the cookie is, holding nothing", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { signedIn: true, user: OWNER, csrfToken: "cookie-session-token" }))
      .mockResolvedValueOnce(reply(204));

    await logOutThisDevice();

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/auth/session", "/api/auth/logout"]);
    expect(headersOf(fetchMock.mock.calls[1]).get(CSRF_HEADER)).toBe("cookie-session-token");
    expect(heldSession("business")).toBeNull();
    expect(signOutPending()).toBe(false);
  });

  it("the admin area's Log Out ends the admin session with the admin's token", async () => {
    holdSession("admin", { id: 1, email: "admin@example.test", merchantId: 0, role: "admin" }, "admin-token");
    holdSession("business", OWNER, "business-token");
    fetchMock.mockResolvedValueOnce(reply(204));

    await logOutAdmin();

    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/auth/logout");
    expect(headersOf(fetchMock.mock.calls[0]).get(CSRF_HEADER)).toBe("admin-token");
    expect(heldSession("admin")).toBeNull();
    expect(heldSession("business")).not.toBeNull();
    expect(signOutPending()).toBe(false);
  });
});

describe("a sign-out the last page could not finish", () => {
  const signedIn = () => reply(200, { signedIn: true, user: OWNER, csrfToken: "cookie-session-token" });

  it("is finished by having the server end the cookie's session, and never signs the page in", async () => {
    beginSignOut();
    fetchMock.mockResolvedValueOnce(signedIn()).mockResolvedValueOnce(reply(204));

    await finishPendingSignOut();

    expect(fetchMock.mock.calls.map((call) => [call[0], (call[1] as RequestInit).method ?? "GET"]))
      .toEqual([["/api/auth/session", "GET"], ["/api/auth/logout", "POST"]]);
    expect(headersOf(fetchMock.mock.calls[1]).get(CSRF_HEADER)).toBe("cookie-session-token");
    expect((fetchMock.mock.calls[1][1] as RequestInit).credentials).toBe("same-origin");
    expect(heldSession("business")).toBeNull();
    expect(signOutPending()).toBe(false);
  });

  it("has nothing to end when no one is signed in", async () => {
    beginSignOut();
    fetchMock.mockResolvedValueOnce(reply(200, { signedIn: false }));
    await finishPendingSignOut();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(signOutPending()).toBe(false);
  });

  it.each([
    ["the server cannot be reached", () => fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))],
    ["the server cannot check the session", () => fetchMock.mockResolvedValueOnce(reply(503, { code: "AUTH_BACKEND_UNAVAILABLE" }))],
    ["the reply is not a session reply", () => fetchMock.mockResolvedValueOnce(reply(200, { signedIn: true }))],
    ["the session is read but ending it fails", () => fetchMock.mockResolvedValueOnce(signedIn()).mockResolvedValueOnce(reply(500, {}))],
    ["the session is read but the server drops off", () => fetchMock.mockResolvedValueOnce(signedIn()).mockRejectedValueOnce(new TypeError("Failed to fetch"))],
  ])("stays pending when %s", async (_name, arrange) => {
    beginSignOut();
    arrange();
    await expect(finishPendingSignOut()).resolves.toBeUndefined();
    expect(signOutPending()).toBe(true);
    expect(heldSession("business")).toBeNull();
  });

  it("does not end a sign-in made since: a refused token is not retried with a fresh one", async () => {
    beginSignOut();
    fetchMock.mockResolvedValueOnce(signedIn()).mockResolvedValueOnce(reply(403, { code: "CSRF_REJECTED" }));

    await finishPendingSignOut();

    // The cookie is no longer the session that was read: someone has signed in since.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signOutPending()).toBe(false);
  });

  it("a new sign-in clears the mark", () => {
    beginSignOut();
    expect(signOutPending()).toBe(true);
    clearSignOutPending();
    expect(signOutPending()).toBe(false);
    expect(localStorage.getItem(SIGN_OUT_PENDING_KEY)).toBeNull();
  });
});
