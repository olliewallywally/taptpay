/*
 * R1-T4 phase D, then E. The merchant stream is signed in by the session cookie, which the browser
 * sends by itself (phase E): no token is read or sent. A password change ends every session of the
 * login and this device's stream with them, and starts a new session for this device, whose cookie the
 * browser now holds: the stream reconnects with it. A refusal means this device's session has ended.
 */
import { SSEClient } from "../sse-client";

const ended = () => ({ ok: true, status: 200, body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) } });
const refused = () => ({ ok: false, status: 401, body: null });
const initOf = (call: unknown[]) => call[1] as RequestInit;

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

describe("merchant stream", () => {
  it("is signed in by the session cookie: same-origin, and no Authorization header", async () => {
    localStorage.setItem("authToken", "a.stored.token");
    fetchMock.mockReturnValue(new Promise(() => {}));
    const client = new SSEClient();
    client.connectMerchant(7);
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/merchants/7/events");
    expect(initOf(fetchMock.mock.calls[0]).credentials).toBe("same-origin");
    expect(initOf(fetchMock.mock.calls[0]).headers).toEqual({ Accept: "text/event-stream" });
    client.disconnect?.();
  });

  it("reconnects after the stream ends (a password change ended it), with whatever cookie the browser holds", async () => {
    fetchMock.mockResolvedValueOnce(ended()).mockReturnValue(new Promise(() => {}));
    const client = new SSEClient();
    client.connectMerchant(7);
    await flush();
    await flush(1_500);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/merchants/7/events");
    client.disconnect?.();
  });

  it("stops on a refusal: this device's session has ended", async () => {
    fetchMock.mockResolvedValue(refused());
    const client = new SSEClient();
    client.connectMerchant(7);
    await flush(10_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
