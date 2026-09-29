/*
 * R1-T4 phase D. "Sign out of all devices" asks the server to end every session
 * of this login; only the server's 204 means that happened. A 401 means this
 * device's own session had already ended, which says nothing about a device
 * that signed in since, so it is reported separately rather than as success.
 */
import { signOutEverywhere } from "../sign-out-everywhere";

const fetchMock = global.fetch as jest.Mock;
const reply = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: body === undefined ? async () => { throw new SyntaxError("no body"); } : async () => body,
});

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
  localStorage.setItem("authToken", "this.device.token");
});

describe("signOutEverywhere", () => {
  it("asks the server to end every session, with this device's token", async () => {
    fetchMock.mockResolvedValue(reply(204));
    await expect(signOutEverywhere()).resolves.toBe("ended");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out-everywhere", {
      method: "POST",
      headers: { Authorization: "Bearer this.device.token" },
    });
  });

  it("reports a session that had already ended, not success", async () => {
    fetchMock.mockResolvedValue(reply(401, { code: "SESSION_ENDED" }));
    await expect(signOutEverywhere()).resolves.toBe("already-signed-out");
  });

  it("does not call the server without a token", async () => {
    localStorage.removeItem("authToken");
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
