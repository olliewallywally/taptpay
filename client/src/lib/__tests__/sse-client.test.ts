/*
 * R1-T4 phase D. The merchant stream used to reconnect with the token it was
 * opened with. A password change ends every session of the login, this
 * device's stream included, and hands this device a fresh token; reconnecting
 * with the old one was refused and the stream stopped for good. It now
 * reconnects with the token the device holds, and retries a refusal once when
 * a newer token has arrived since.
 */
import { SSEClient } from "../sse-client";

const ended = () => ({ ok: true, status: 200, body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) } });
const refused = () => ({ ok: false, status: 401, body: null });
const authOf = (call: unknown[]) => ((call[1] as RequestInit).headers as Record<string, string>).Authorization;

let fetchMock: jest.Mock;
beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  fetchMock = jest.fn();
  global.fetch = fetchMock as any;
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const flush = async (ms = 0) => { await jest.advanceTimersByTimeAsync(ms); };

describe("merchant stream reconnection", () => {
  it("reconnects with the token the device now holds", async () => {
    localStorage.setItem("authToken", "old.token");
    fetchMock.mockResolvedValueOnce(ended()).mockReturnValue(new Promise(() => {}));
    const client = new SSEClient();
    client.connectMerchant(7, "old.token");
    await flush();
    localStorage.setItem("authToken", "fresh.token");
    await flush(1_500);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock.mock.calls[0])).toBe("Bearer old.token");
    expect(authOf(fetchMock.mock.calls[1])).toBe("Bearer fresh.token");
    client.disconnect?.();
  });

  it("retries a refusal once when a newer token has arrived", async () => {
    localStorage.setItem("authToken", "old.token");
    fetchMock.mockImplementationOnce(async () => {
      localStorage.setItem("authToken", "fresh.token"); // the password change landed meanwhile
      return refused();
    }).mockReturnValue(new Promise(() => {}));
    const client = new SSEClient();
    client.connectMerchant(7, "old.token");
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authOf(fetchMock.mock.calls[1])).toBe("Bearer fresh.token");
    client.disconnect?.();
  });

  it("stops on a refusal when no newer token is held", async () => {
    localStorage.setItem("authToken", "old.token");
    fetchMock.mockResolvedValue(refused());
    const client = new SSEClient();
    client.connectMerchant(7, "old.token");
    await flush(10_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
