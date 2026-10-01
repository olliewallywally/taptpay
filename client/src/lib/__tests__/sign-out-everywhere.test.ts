/*
 * R1-T4 phase D. "Sign out of all devices" asks the server to end every session
 * of this login; only the server's 204 means that happened. A 401 means this
 * device's own session had already ended, which says nothing about a device
 * that signed in since, so it is reported separately rather than as success.
 */
import { signOutEverywhere } from "../sign-out-everywhere";
import { CSRF_HEADER, holdSession, releaseSession } from "../session";

const fetchMock = global.fetch as jest.Mock;
const reply = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: body === undefined ? async () => { throw new SyntaxError("no body"); } : async () => body,
  clone() { return this; },
});

// R1-T4 phase E: this device's sign-in is its session cookie, which the browser sends itself; the page
// holds who is signed in and the session's CSRF token.
beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
  holdSession("business", { id: 5, email: "owner@example.test", merchantId: 77, role: "owner" }, "this-page-csrf-token");
});

describe("signOutEverywhere", () => {
  it("asks the server to end every session, with this device's session cookie and the page's CSRF token", async () => {
    fetchMock.mockResolvedValue(reply(204));
    await expect(signOutEverywhere()).resolves.toBe("ended");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect({ url, method: init.method, credentials: init.credentials, csrf: headers.get(CSRF_HEADER), authorization: headers.get("Authorization") })
      .toEqual({ url: "/api/auth/sign-out-everywhere", method: "POST", credentials: "same-origin", csrf: "this-page-csrf-token", authorization: null });
  });

  it("reports a session that had already ended, not success", async () => {
    fetchMock.mockResolvedValue(reply(401, { code: "SESSION_ENDED" }));
    await expect(signOutEverywhere()).resolves.toBe("already-signed-out");
  });

  it("does not call the server when no one is signed in on this page", async () => {
    releaseSession("business");
    await expect(signOutEverywhere()).resolves.toBe("already-signed-out");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails with the server's message, or a plain one", async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { message: "Could not sign out everywhere. Please try again." }));
    await expect(signOutEverywhere()).rejects.toThrow("Could not sign out everywhere. Please try again.");
    fetchMock.mockResolvedValueOnce(reply(502));
    await expect(signOutEverywhere()).rejects.toThrow("Couldn't sign out of all devices. Please try again.");
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(signOutEverywhere()).rejects.toThrow("Couldn't sign out of all devices. Please try again.");
  });
});
